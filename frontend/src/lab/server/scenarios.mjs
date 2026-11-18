import {randomUUID} from "node:crypto";
import {draftSchema,compile} from "../model.ts";
import {granted,hash} from "./access.mjs";
import {limit,Problem,transaction} from "./db.mjs";
import {target} from "./targets.mjs";
import {mask,bodyTrace,headerTrace} from "./traces.mjs";

function dehydrate(row) {
  if (!row) throw new Problem(404,"Simulation introuvable.");
  return {...row,draft:JSON.parse(row.draft)};
}
export function scenario(db,user,id) {
  const row=dehydrate(db.prepare("SELECT * FROM sims WHERE id=?").get(id));
  granted(user,row.project);
  return row;
}
export function library(db,user) {
  return db.prepare("SELECT sims.* FROM sims JOIN grants ON sims.project=grants.project WHERE login=? ORDER BY updated DESC,sims.rowid DESC")
    .all(user.name).map(dehydrate);
}
export function save(db,user,input,id,revision,publish=false,entries) {
  const draft=draftSchema.parse(input);
  granted(user,draft.project);
  if (publish) {
    compile(draft);
    if (draft.webhook) target(draft.destination,draft.project,null,entries);
  }
  return transaction(db,()=>{
    const previous=id ? scenario(db,user,id) : null;
    if (previous?.archived) throw new Problem(409,"Cette simulation est archivée.");
    if (previous && (previous.revision!==revision || previous.project!==draft.project))
      throw new Problem(409,"Le brouillon a changé ou le projet ne correspond plus. Rouvrez la simulation.");
    const sim=id || randomUUID(), now=Date.now(), config=JSON.stringify(draft);
    const version=(previous?.active || 0)+(publish?1:0);
    if (previous) db.prepare("UPDATE sims SET draft=?,active=?,revision=revision+1,updated=? WHERE id=?").run(config,version,now,sim);
    else db.prepare("INSERT INTO sims(id,project,draft,active,updated) VALUES(?,?,?,?,?)").run(sim,draft.project,config,version,now);
    if (publish) db.prepare("INSERT INTO versions VALUES(?,?,?,?)").run(sim,version,config,now);
    return scenario(db,user,sim);
  });
}
export function archive(db,user,id) {
  scenario(db,user,id);
  db.prepare("UPDATE sims SET archived=1,updated=?,revision=revision+1 WHERE id=?").run(Date.now(),id);
}
export function activeConfig(db,id) {
  const row=db.prepare(`SELECT s.project,s.active,p.key_hash,v.config FROM sims s JOIN projects p ON p.name=s.project
    JOIN versions v ON v.sim=s.id AND v.number=s.active WHERE s.id=? AND archived=0`).get(id);
  if (!row) throw new Problem(404,"Aucune simulation active à cette adresse.");
  return {...row,config:JSON.parse(row.config)};
}
/** The returned HTTP response is materialized only after both the run and outbox are durable. */
export function trigger(db,{id,path,method,key,user,raw="",headers={},sha=""},entries,now=Date.now()) {
  return transaction(db,()=>{
    const row=activeConfig(db,id), d=row.config;
    if (user) granted(user,row.project);
    else if (hash(key || "")!==row.key_hash) throw new Problem(403,"Clé d’environnement requise.");
    if (method!==d.method || path!==d.path) throw new Problem(404,"Aucune correspondance pour cette méthode et ce chemin.");
    limit(db,'run:'+row.project,120,now);
    let input={};
    if (raw) { try { input=JSON.parse(raw) ?? {}; } catch { throw new Problem(400,"Le corps entrant doit être du JSON."); } }
    const result=compile(d,input), run=randomUUID();
    const responseHeaders={...result.headers,...(d.noBody?{}:{"content-type":d.contentType}),"x-correlation-id":run};
    let notification;
    if (result.hook) {
      const dest=target(d.destination,row.project,null,entries);
      const {n}=db.prepare("SELECT COUNT(*) n FROM jobs WHERE state IN ('pending','sending','retry')").get();
      if(n>=1000) throw new Problem(503,"File de notifications pleine.");
      notification={dest:dest.id,url:dest.url,id:randomUUID(),planned:now+1000*d.delay};
    }
    const sensitiveValues=d.variables.filter(v=>v.mode==="input" && Object.hasOwn(input,v.source) &&
      JSON.stringify(mask({[v.source]:input[v.source]}))!==JSON.stringify({[v.source]:input[v.source]})).map(v=>result.variables[v.name]);
    const scrub=v=>sensitiveValues.some(s=>s!==null && v===s)?"[masqué]":Array.isArray(v)?v.map(scrub):
      v && typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,scrub(x)])):v;
    const trace=scrub({name:d.name,project:d.project,method,path,status:d.status,variables:mask(result.variables),
      incoming:bodyTrace(raw),requestHeaders:headerTrace(headers),response:bodyTrace(result.body),responseHeaders:headerTrace(responseHeaders),
      webhook:result.hook?bodyTrace(result.hook.body):null,hookHeaders:result.hook?headerTrace(result.hook.headers):{},
      expected:d.expected,sha:/^[a-f0-9]{7,64}$/i.test(sha)?sha:d.sha});
    db.prepare("INSERT INTO runs VALUES(?,?,?,?,?)").run(run,id,row.active,now,JSON.stringify(trace));
    if(notification) db.prepare("INSERT INTO jobs(id,run,dest,url,payload,headers,planned,due,state) VALUES(?,?,?,?,?,?,?,?,'pending')")
      .run(notification.id,run,notification.dest,notification.url,result.hook.body,JSON.stringify(result.hook.headers),notification.planned,notification.planned);
    return {status:d.status,body:result.body,headers:responseHeaders,id:run};
  });
}
export function runs(db,user) {
  return db.prepare(`SELECT r.id,r.sim,r.version,r.received,json_extract(r.trace,'$.name') name,
    json_extract(r.trace,'$.status') status,s.project,j.state FROM runs r JOIN sims s ON s.id=r.sim JOIN grants g ON g.project=s.project
    LEFT JOIN jobs j ON j.run=r.id WHERE g.login=? ORDER BY r.received DESC LIMIT 250`).all(user.name);
}
export function execution(db,user,id) {
  const row=db.prepare("SELECT * FROM runs WHERE id=?").get(id);
  if(!row) throw new Problem(404,"Exécution introuvable.");
  const trace=JSON.parse(row.trace); granted(user,trace.project);
  const job=db.prepare("SELECT id,dest,planned,due,state,count FROM jobs WHERE run=?").get(id) || null;
  const attempts=job?db.prepare("SELECT number,started,finished,code,outcome FROM attempts WHERE job=? ORDER BY number").all(job.id):[];
  return {...row,trace,job,attempts};
}
