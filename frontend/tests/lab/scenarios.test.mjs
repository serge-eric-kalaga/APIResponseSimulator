import test from "node:test";
import assert from "node:assert/strict";
import {openDatabase} from "../../src/lab/server/db.mjs";
import {createAccount,createProject,signIn,identity} from "../../src/lab/server/access.mjs";
import {archive,execution,library,runs,save,trigger} from "../../src/lab/server/scenarios.mjs";
import {blank,newVariable} from "../../src/lab/model.ts";
import {pilotUrl,target} from "../../src/lab/server/targets.mjs";
export const entries=[{id:"reader",pilot:true,url:pilotUrl,projects:["QA"]}];
function setup() {
  const db=openDatabase(":memory:"), key=createProject(db,"QA");
  createProject(db,"Beta");
  const user=identity(db,signIn(db,createAccount(db,"alice",["QA"])));
  const other=identity(db,signIn(db,createAccount(db,"bob",["Beta"])));
  const d={...blank("QA"),name:"Validation",status:400,variables:[newVariable()],body:'{"ref":"{{reference}}"}',
    headers:'{"X-Test":"yes"}',webhook:true,hookBody:'{"id":"{{reference}}"}',destination:"reader"};
  const sim=save(db,user,d,null,null,true,entries);
  const call={id:sim.id,key,path:d.path,method:d.method,raw:'{"password":"never-store"}',headers:{Authorization:"private"}};
  return {db,key,user,other,d,sim,call};
}
test("durable run, immutable version, delayed snapshot and redaction",()=>{
  const {db,user,d,sim,call}=setup();
  const r=trigger(db,call,entries,10000);
  assert.equal(r.status,400); assert.equal(r.headers["X-Test"],"yes");
  const job=db.prepare("SELECT * FROM jobs").get(); assert.equal(job.planned,130000);
  assert.equal(JSON.parse(job.payload).id,JSON.parse(r.body).ref);
  save(db,user,{...d,webhook:false,status:200},sim.id,1,true,entries);
  const again=trigger(db,call,entries,14000);assert.equal(again.status,200);
  assert.equal(db.prepare("SELECT count(*) n FROM jobs").get().n,1);
  const e=execution(db,user,r.id);assert.equal(e.version,1);assert.equal(e.trace.incoming.password,"[masqué]");
  assert.equal(e.trace.requestHeaders.Authorization,"[masqué]");assert.equal(e.job.dest,"reader");
  db.close();
});
test("draft, duplication, exact match, access controls and archive",()=>{
  const {db,user,other,d,sim,call}=setup();
  const draft=save(db,user,{...d,body:"{"},sim.id,1);
  assert.equal(draft.active,1);assert.throws(()=>save(db,user,d,sim.id,1));
  const copy=save(db,user,{...d,name:"Copie"},null,null);
  assert.notEqual(copy.id,sim.id);assert.equal(copy.active,0);
  assert.equal(library(db,other).length,0);
  for(const patch of [{path:"/else"},{method:"GET"},{key:"bad"},{user:other}]) assert.throws(()=>trigger(db,{...call,...patch},entries));
  assert.equal(runs(db,user).length,0);
  const r=trigger(db,call,entries);assert.throws(()=>execution(db,other,r.id));
  archive(db,user,sim.id);assert.throws(()=>trigger(db,call,entries));
  assert.equal(execution(db,user,r.id).trace.name,d.name);
  db.close();
});
test("delivery policy rejects unlisted, mismatched, internal and unapproved targets",()=>{
  for(const entry of [{},{ip:"127.0.0.1"},{ip:"10.0.0.5"},{environment:"prod"},{url:"http://test.example.com/qa"}])
    assert.throws(()=>target("t","QA",null,[{id:"t",projects:["QA"],url:"https://test.example.com/hook",ip:"1.1.1.1",...entry,...(!Object.keys(entry).length?{environment:""}:{})}]));
  assert.throws(()=>target("reader","QA","http://other",entries));
});
