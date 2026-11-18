import {mkdirSync, existsSync, chmodSync, writeFileSync,readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {openDatabase,transaction} from "../src/lab/server/db.mjs";
import {createAccount,createProject} from "../src/lab/server/access.mjs";
import {save} from "../src/lab/server/scenarios.mjs";
import {pilotUrl,target} from "../src/lab/server/targets.mjs";
import {referenceScenarios} from "../src/lab/fixtures.ts";
const dir=resolve(process.env.RELAIS_HOME || "../data"),file=process.env.RELAIS_DB || resolve(dir,"relais.sqlite");
process.umask(0o077);
mkdirSync(dir,{recursive:true,mode:0o700});
const db=openDatabase(file), config=process.env.RELAIS_DESTINATIONS || resolve(dir,"destinations.json");
const [command="init",name,...args]=process.argv.slice(2);
const valid=s=>typeof s==="string" && /^[\p{L}\p{N} _.-]{1,80}$/u.test(s);
const write=(file,data)=>writeFileSync(file,JSON.stringify(data,null,2)+"\n",{mode:0o600,flag:"wx"});
try {
  if(command==="init") {
    const credentials=resolve(dir,"acces-pilote.json");
    if(!existsSync(credentials)) {
      const keys=transaction(db,()=>{
        const projects={};for(const p of ["Atlas","Studio"]) projects[p]=createProject(db,p);
        // This transaction also owns the access-file creation. An existing pilot is never reset.
        const key=createSimpleAccount("Pilote",Object.keys(projects));
        write(credentials,{compte:"Pilote",cle_interface:key,cles_declenchement:projects});
        return projects;
      });
      console.log("Projets initialisés :",Object.keys(keys).join(", "));
    }
    if(!existsSync(config)) write(config,[{id:"pilot-receiver",label:"Récepteur de recette",projects:["Atlas","Studio"],url:pilotUrl,pilot:true}]);
    const user={name:"Pilote",projects:["Atlas","Studio"]};
    const entries=JSON.parse(readFileSync(config,"utf8"));
    db.exec("CREATE TABLE IF NOT EXISTS pilot_fixtures(name TEXT PRIMARY KEY)");
    for(const d of referenceScenarios()) if(!db.prepare("SELECT 1 FROM pilot_fixtures WHERE name=?").get(d.name)) {
      const existing=db.prepare("SELECT id FROM sims WHERE project=? AND json_extract(draft,'$.name')=?").get(d.project,d.name);
      if(!existing) save(db,user,d,null,null,true,entries);
      db.prepare("INSERT INTO pilot_fixtures VALUES(?)").run(d.name);
    }
    console.log("Accès locaux :",credentials);
  } else if(command==="project" && valid(name)) {
    write(resolve(dir,"projet-"+name+".json"),{projet:name,cle_declenchement:createProject(db,name)});
  } else if(command==="account" && valid(name) && args.length && args.every(valid)) {
    write(resolve(dir,"compte-"+name+".json"),{compte:name,cle_interface:createAccount(db,name,args)});
  } else if(command==="grant" || command==="revoke") {
    if(!valid(name)||!valid(args[0])) throw Error("Compte et projet requis.");
    db.prepare(command==="grant"?"INSERT OR IGNORE INTO grants VALUES(?,?)":"DELETE FROM grants WHERE login=? AND project=?").run(name,args[0]);
  } else if(command==="verify-destinations") {
    for(const entry of JSON.parse(readFileSync(config,"utf8"))) for(const p of entry.projects) target(entry.id,p,null,[entry]);
    console.log("Destinations validées.");
  } else throw Error("Commandes : init, project NOM, account NOM PROJET..., grant COMPTE PROJET, revoke COMPTE PROJET, verify-destinations.");
  chmodSync(file,0o600);
} finally {db.close();}
// Use the caller's transaction during the initial bootstrap.
function createSimpleAccount(name,projects) {
  const key=randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO accounts VALUES(?,?)").run(name,hash(key));
  for (const p of projects) db.prepare("INSERT INTO grants VALUES(?,?)").run(name,p);
  return key;
}
import {randomBytes} from "node:crypto";
import {hash} from "../src/lab/server/access.mjs";
