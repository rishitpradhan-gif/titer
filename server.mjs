import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {analyze,parseCSV,MAX_BYTES} from './public/core.mjs';
import {verifyKey,keyDirectory} from './lib/keys.mjs';
const root=fileURLToPath(new URL('./public/',import.meta.url));
export function createServer({keys=keyDirectory(),rateLimit=60}={}) {
 const buckets=new Map();
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 return http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/v1/analyze'){
   if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'Use POST'});}
   const bearer=req.headers.authorization;
   const auth=typeof bearer==='string'&&bearer.startsWith('Bearer ')?verifyKey(keys,bearer.slice(7)):null;
   if(!auth)return send(res,401,{error:'Valid Bearer API key required'});
   const now=Date.now();for(const [id,b]of buckets)if(b.until<=now)buckets.delete(id);
   if(buckets.size>=10000&&!buckets.has(auth.id))return send(res,503,{error:'Rate limiter capacity reached'});
   const bucket=buckets.get(auth.id)||{count:0,until:now+60000};buckets.set(auth.id,bucket);
   if(++bucket.count>rateLimit){res.setHeader('Retry-After',Math.ceil((bucket.until-now)/1000));return send(res,429,{error:'Per-key rate limit exceeded'});}
   if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'Use application/json'});
   try{
    let bytes=0;const chunks=[];
    for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BYTES){send(res,413,{error:'Maximum request size is 512 KiB'});return;}chunks.push(chunk);}
    const raw=Buffer.concat(chunks),body=JSON.parse(raw.toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body)||(('csv'in body)===('records'in body)))throw Error('Provide exactly one of csv or records');
    const records='csv'in body?parseCSV(body.csv):body.records;
    const report=analyze(records,body.reference_index??0);
    return send(res,200,{...report,provenance:{input_sha256:createHash('sha256').update(raw).digest('hex'),hash_scope:'Exact HTTP JSON body bytes',generated_at:new Date().toISOString()}});
   }catch(e){if(!res.headersSent)send(res,400,{error:e instanceof SyntaxError?'Malformed JSON':e.message});return;}
  }
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return send(res,405,{error:'Method not allowed'});}
  try{
   const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!path.startsWith(resolve(root)+'/'))throw Error();
   const data=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.mjs':'text/javascript','.csv':'text/csv','.json':'application/json','.zip':'application/zip'})[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:data);
  }catch{send(res,404,{error:'Not found'});}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createServer();server.requestTimeout=15000;server.headersTimeout=10000;
 server.listen(Number(process.env.PORT||4458),'127.0.0.1',()=>console.log(`Titer: http://127.0.0.1:${server.address().port} (local-only API)`));
}
