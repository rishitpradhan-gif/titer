import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer} from '../server.mjs';
import {issueKey,verifyKey,revokeKey,listKeys} from '../lib/keys.mjs';
const csv=readFileSync(new URL('../public/example.csv',import.meta.url),'utf8');
test('keys are hashed, expiring, revocable and path-safe',()=>{
 const dir=mkdtempSync(join(tmpdir(),'titer-key-test-'));try{
 const key=issueKey(dir,'test',1);assert.ok(verifyKey(dir,key.token));assert.equal(verifyKey(dir,key.token,Date.now()+2*86400000),null);
 assert.ok(!readFileSync(join(dir,key.id+'.json'),'utf8').includes(key.token));assert.equal(listKeys(dir)[0].hash,undefined);
 assert.equal(verifyKey(dir,key.token.slice(0,-1)+'!'),null);assert.equal(verifyKey(dir,'../../secret'),null);assert.throws(()=>issueKey(dir,'test',0));
 revokeKey(dir,key.id);assert.equal(verifyKey(dir,key.token),null);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('HTTP auth, schema, rate limit, revocation and client-engine parity',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'titer-api-test-')),key=issueKey(dir,'test'),server=createServer({keys:dir,rateLimit:5});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}/api/v1/analyze`,headers={'Content-Type':'application/json',Authorization:'Bearer '+key.token};
 try{
 assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);
 assert.equal((await fetch(url)).status,405);
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Authorization:key.token},body:'{}'})).status,401);
 const body=JSON.stringify({csv}),response=await fetch(url,{method:'POST',headers,body}),report=await response.json();assert.equal(response.status,200);assert.equal(report.summary.valid,8);assert.match(report.provenance.input_sha256,/^[a-f0-9]{64}$/);
 const {analyze,parseCSV}=await import('../public/core.mjs');assert.deepEqual(report.rows,analyze(parseCSV(csv)).rows);
 assert.equal((await fetch(url,{method:'POST',headers,body:'{'})).status,400);
 assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({csv,records:[]})})).status,400);
 assert.equal((await fetch(url,{method:'POST',headers:{Authorization:headers.Authorization},body:'{}'})).status,415);
 assert.equal((await fetch(url,{method:'POST',headers,body})).status,200);
 assert.equal((await fetch(url,{method:'POST',headers,body})).status,429);
 revokeKey(dir,key.id);assert.equal((await fetch(url,{method:'POST',headers,body})).status,401);
 const secretPath=await fetch(url.replace('/api/v1/analyze','/.titer/keys/'+key.id+'.json'));assert.equal(secretPath.status,404);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
test('HTTP rejects oversized input without analyzing it',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'titer-size-test-')),key=issueKey(dir,'size'),server=createServer({keys:dir});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/analyze`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key.token},body:'x'.repeat(524289)});assert.equal(res.status,413);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
