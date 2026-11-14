import {analyze,parseCSV,FIELDS,CONTEXT,MAX_BYTES,VERSION} from './core.mjs';
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=n=>n==null?'—':Math.abs(n)>=1e5||Math.abs(n)<.001?Number(n).toExponential(2):Number(n).toLocaleString('en-US',{maximumSignificantDigits:4});
const label={matched:'Matching fields',different:'Different fields',incomplete:'Missing context',invalid:'Invalid record'};
let records=[],report,reference=0,selected=0,filter='all',fileName='Synthetic example',sourceHash='',edited=false;
let timer;
function toast(message){$('#toast').textContent=message;clearTimeout(timer);timer=setTimeout(()=>$('#toast').textContent='',5000);}
async function sha(text){const bytes=typeof text==='string'?new TextEncoder().encode(text):text;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function visible(){const q=$('#search').value.trim().toLowerCase();return report.rows.filter(r=>(filter==='all'||(filter==='matched'?r.comparison==='matched':r.comparison!=='matched'))&&(!q||(r.id+' '+r.compound).toLowerCase().includes(q)));}
function showPlot(rows){
 const valid=rows.filter(r=>r.valid),width=740,left=110,right=55,top=33,rowH=34,height=Math.max(190,top+valid.length*rowH+65);
 if(!valid.length){$('#plot').innerHTML='<p class="plot-note">No valid concentrations in this view. Invalid records remain in the table.</p>';return;}
 const ps=valid.map(r=>r.p),ref=report.rows[reference];if(ref.valid)ps.push(ref.p);
 let lo=Math.floor(Math.min(...ps))-.3,hi=Math.ceil(Math.max(...ps))+.3;if(hi-lo<2){lo-=.5;hi+=.5;}
 const x=p=>left+(p-lo)/(hi-lo)*(width-left-right),bottom=height-44;
 let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Normalized assay endpoints. Exact values are points; arrows show censored bounds. All values also appear in the records table.">`;
 for(let i=0;i<=5;i++){const p=lo+(hi-lo)*i/5,xx=x(p);svg+=`<line x1="${xx}" y1="15" x2="${xx}" y2="${bottom}" stroke="#2a3c43" stroke-dasharray="2 5"/><text class="axis" x="${xx}" y="${bottom+20}" text-anchor="middle">${p.toFixed(1)}</text>`;}
 if(ref.valid)svg+=`<line x1="${x(ref.p)}" y1="12" x2="${x(ref.p)}" y2="${bottom}" stroke="#a8efcc" stroke-opacity=".45" stroke-dasharray="5 5"/><text x="${x(ref.p)}" y="10" text-anchor="middle" class="axis">reference${ref.relation==='='?'':' bound'}</text>`;
 valid.forEach((r,i)=>{const y=top+i*rowH,xx=x(r.p),color=r.comparison==='matched'?'#a8efcc':r.comparison==='incomplete'?'#efc082':'#7a949f';
  if(r.index===selected)svg+=`<rect x="6" y="${y-14}" width="${width-12}" height="28" rx="3" fill="#263c43"/>`;
  svg+=`<text class="plot-id" x="12" y="${y+4}">${escape(r.id.slice(0,13))}</text><line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#22343b"/>`;
  if(r.relation==='=')svg+=`<circle cx="${xx}" cy="${y}" r="4.5" fill="${color}"/>`;
  else{const direction=r.p_relation.startsWith('>')?1:-1,end=xx+direction*24;svg+=`<circle cx="${xx}" cy="${y}" r="4" fill="${r.relation.includes('=')?color:'#152126'}" stroke="${color}" stroke-width="1.5"/><path d="M${xx+direction*5} ${y}H${end}M${end-direction*5} ${y-4}L${end} ${y}L${end-direction*5} ${y+4}" fill="none" stroke="${color}" stroke-width="1.5"/>`;}
  svg+=`<text x="${width-10}" y="${y+4}" text-anchor="end">${escape(r.p_relation==='='?'':r.p_relation)}${r.p.toFixed(2)}</text>`;
 });svg+='</svg>';$('#plot').innerHTML=svg;
}
function inspect(){const r=report.rows[selected],ref=report.rows[reference];
 const findings=[...r.errors,...r.warnings];
 if(r.differences.length)findings.push('Different: '+r.differences.join(', '));
 if(r.unknown.length)findings.push('Unknown in selected record or reference: '+r.unknown.join(', '));
 if(!ref.valid)findings.push('The reference is invalid. Choose a valid reference to compare.');
 const ratio=r.fold_vs_reference===null?'Fold comparison withheld':`${format(r.fold_vs_reference)}× reference concentration`;
 $('#inspector').innerHTML=`<div class="inspector-intro"><div class="record-top"><span>${escape(r.id)}${selected===reference?' / REFERENCE':''}</span><span class="status ${r.comparison}">${label[r.comparison]}</span></div><h3 class="record-name">${escape(r.compound)}</h3><div class="measurements"><strong>${r.valid?escape(r.relation==='='?'':r.relation)+format(r.nM):'—'}</strong><span>nM · ${escape(r.endpoint)}</span></div><div class="conversion-line">Reported ${escape(r.relation)} ${escape(r.value)} ${escape(r.unit)}<br>${escape(r.conversion.method)}</div><div class="finding ${r.comparison==='matched'?'ok':''}">${escape(ratio)}<br>${r.comparison==='matched'?'Declared fields match. This does not establish experimental equivalence.':'Resolve the declared context before interpreting differences.'}</div>${findings.length?'<div class="source-note">'+findings.map(f=>'• '+escape(f)).join('<br>')+'</div>':''}<p class="source-note"><b>Source</b><br>${escape(r.source||'Not provided')}</p></div><div class="inspector-context"><div class="context-heading"><span>DECLARED CONTEXT</span><span>SELECTED / REFERENCE</span></div><table class="context-table"><tbody>${['endpoint',...CONTEXT].map(k=>`<tr><th>${escape(k)}</th><td class="${r.differences.includes(k)||r.unknown.includes(k)?'diff':''}">${escape(r[k]||'unknown')}</td><td>${escape(ref[k]||'unknown')}</td></tr>`).join('')}</tbody></table></div>`;
}
function render(){report=analyze(records,reference);const s=report.summary;
 $('#count').textContent=s.records;$('#matched').textContent=s.matched;$('#review').textContent=s.different+s.incomplete;$('#other').textContent=s.censored+' / '+s.invalid;
 $('#reference').innerHTML=report.rows.map(r=>`<option value="${r.index}" ${r.index===reference?'selected':''}>${escape(r.id)} · ${escape(r.compound)}</option>`).join('');
 $('#dataset-type').textContent=fileName==='Synthetic example'?'SYNTHETIC EXAMPLE':'IMPORTED DATA';
 $('#dataset-name').textContent=fileName==='Synthetic example'?'Endpoint review':fileName;
 $('#dataset-caption').textContent=fileName==='Synthetic example'?(edited?'Edited synthetic example. Export to keep your changes.':'Nine illustrative records. Mixed units, censored results, and deliberately different conditions.'):`${s.records} records · ${edited?'edited in this session':'original values retained'} · no data uploaded`;
 const rows=visible();if(rows.length&&!rows.some(r=>r.index===selected))selected=rows[0].index;$('#visible-count').textContent=`/ ${rows.length}`;$('#empty').hidden=rows.length>0;
 $('#records').innerHTML=rows.map(r=>`<tr class="${r.index===selected?'selected':''}"><td><button class="record-button" data-record="${r.index}">${escape(r.id)}${r.index===reference?' ◇':''}<small>${escape(r.compound)}</small></button></td><td>${escape(r.endpoint)}</td><td>${escape(r.relation)} ${escape(r.value)} ${escape(r.unit)}</td><td>${r.valid?escape(r.relation)+' '+format(r.nM)+' nM':'—'}</td><td><span class="status ${r.comparison}">${label[r.comparison]}</span></td><td>${r.fold_vs_reference===null?'withheld':format(r.fold_vs_reference)+'×'}</td></tr>`).join('');
 document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));showPlot(rows);inspect();
}
async function loadExample(){const response=await fetch('/example.csv');if(!response.ok)throw Error('Could not load the example');const csv=await response.text();records=parseCSV(csv);sourceHash=await sha(csv);reference=selected=0;fileName='Synthetic example';edited=false;filter='all';$('#search').value='';render();}
$('#records').addEventListener('click',e=>{const b=e.target.closest('[data-record]');if(b){selected=+b.dataset.record;render();}});
$('#reference').onchange=e=>{reference=+e.target.value;render();};$('#search').oninput=()=>render();
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;render();};
$('#example').onclick=async()=>{if(!confirm('Replace the current workspace with the synthetic example? Export first to keep your work.'))return;try{await loadExample();}catch(e){toast(e.message);}};
$('#import').onclick=()=>{$('#import-error').textContent='';$('#import-dialog').showModal();};
$('#load').onclick=async()=>{
 try{const file=$('#file').files[0];if(file&&file.size>8*1024*1024)throw Error('Maximum report file size is 8 MiB.');const bytes=file?await file.arrayBuffer():null;const raw=bytes?new TextDecoder('utf-8',{fatal:true}).decode(bytes):$('#paste').value;
 if(new TextEncoder().encode(raw).length>8*1024*1024)throw Error('Maximum report size is 8 MiB.');
 let next,ref=0;
 if(raw.trim().startsWith('{')||raw.trim().startsWith('[')){const obj=JSON.parse(raw);next=Array.isArray(obj)?obj:obj.input_records;ref=Array.isArray(obj)?0:obj.reference_index??0;}
 else next=parseCSV(raw);
 if(new TextEncoder().encode(JSON.stringify(next)).length>MAX_BYTES)throw Error('Working records must be at most 512 KiB.');
 analyze(next,ref);const hash=await sha(bytes||raw);records=next;reference=ref;selected=ref;sourceHash=hash;fileName=file?.name||'Pasted dataset';edited=false;filter='all';$('#search').value='';render();$('#import-dialog').close();toast('Dataset opened. Nothing was uploaded.');
 }catch(e){$('#import-error').textContent=e.message;}
};
$('#edit').onclick=()=>{const r=records[selected];$('#edit-fields').innerHTML=FIELDS.map(f=>`<label>${escape(f)}<input name="${f}" value="${escape(r[f]??'')}" maxlength="2000"></label>`).join('');$('#edit-dialog').showModal();};
$('#edit-close').onclick=()=>$('#edit-dialog').close();
$('#edit-form').onsubmit=e=>{e.preventDefault();const next={...records[selected],...Object.fromEntries(new FormData(e.target))};const updated=records.map((r,i)=>i===selected?next:r);if(new TextEncoder().encode(JSON.stringify(updated)).length>MAX_BYTES){toast('Edit exceeds the 512 KiB working-data limit.');return;}records=updated;edited=true;render();$('#edit-dialog').close();};
$('#export').onclick=async()=>{try{
 const snapshot=structuredClone(records),snapshotReport=analyze(snapshot,reference);
 const metadata={engine:VERSION,source_file_sha256:sourceHash,source_name:fileName,edited,generated_at:new Date().toISOString()};
 const output={...snapshotReport,input_records:snapshot,provenance:{...metadata,working_records_sha256:await sha(JSON.stringify(snapshot)),working_hash_scope:'UTF-8 JSON.stringify(input_records), in stored key order'}};
 download(JSON.stringify(output,null,2),'titer-report.json','application/json');toast('Report saved with inputs, flags, conversion factors, and hashes.');
 }catch(e){toast(e.message);}};
const methods=`<h3>What is compared</h3><p>Titer supports positive IC50, EC50, Ki and Kd concentration endpoints. It converts M, mM, uM / µM / μM, nM and pM to mol/L. Mass units g/L, mg/mL, ug/mL, mg/L and ng/mL require the measured species’ molecular weight in g/mol. Identity, salts and solvates are not verified.</p><h3>Conditions are part of the result</h3><p>Fold ratios require exact endpoints, exact declarations for every context field, and uncensored values. Numeric context is parsed so 25.0 equals 25; text is trimmed but not synonym-resolved. Blank values are unknown. Explicit NA means you assert a field does not apply. Matching declarations are a screening condition, not evidence that experiments are equivalent.</p><h3>Censoring stays visible</h3><p>p = −log₁₀(molar concentration). A result &gt;10 µM becomes p &lt;5, not an exact 10 µM result. Arrow direction shows the permitted side of a bound; open circles indicate strict &lt; or &gt;, filled circles indicate ≤ or ≥. There is no pooling, uncertainty estimation, IC50-to-Ki conversion, efficacy ranking or significance claim.</p><h3>Provenance and limits</h3><p>Exports retain original inputs, normalized values, flags, conversion factors, engine version and SHA-256 hashes. Hashes detect byte changes; they do not authenticate a source. Source text and protocol declarations are not verified. The example is synthetic. The workspace is in memory: export before closing.</p><h3>Scientific references</h3><p><a href="https://www.ncbi.nlm.nih.gov/books/NBK91995/" target="_blank" rel="noreferrer">Assay Guidance Manual — effects of assay conditions on apparent potency</a><br><a href="https://chembl.gitbook.io/chembl-interface-documentation/frequently-asked-questions/chembl-data-questions" target="_blank" rel="noreferrer">ChEMBL — negative-log molar activity and exact-value eligibility</a></p><p>Titer’s strict context gate is a project policy, not a validated scientific comparability classifier. It does not reproduce ChEMBL curation or calculate an official pChEMBL value.</p>`;
const api=`<p>The public website runs analysis entirely in your browser. API keys belong to your own downloaded Node service; this website does not issue hosted-service credentials.</p><h3>1 / Start your private instance</h3><p><a href="/titer-source.zip">Download the source ZIP</a>, unzip it, then use Node 22 or later. No packages or paid services are required.</p><pre>cd titer
npm start
# http://127.0.0.1:4458</pre><h3>2 / Create a real API key</h3><pre>npm run key -- create notebook 30
npm run key -- list
npm run key -- revoke KEY_ID</pre><p>The create command prints the secret once. Keys have 256-bit random secrets, expire after the selected number of days, and are stored only as SHA-256 hashes. Revocation takes effect on the next request. Keep the secret out of notebooks you publish.</p><h3>3 / Analyze from Python</h3><pre>import json, os, urllib.request
with open("public/example.csv") as f:
    body = json.dumps({"csv": f.read(),
                       "reference_index": 0}).encode()
req = urllib.request.Request(
    "http://127.0.0.1:4458/api/v1/analyze",
    data=body,
    headers={"Content-Type": "application/json",
             "Authorization": "Bearer " +
                 os.environ["TITER_API_KEY"]})
report = json.load(urllib.request.urlopen(req))
print(report["summary"])</pre><p>POST JSON containing either <code>csv</code> or <code>records</code>, plus an optional zero-based <code>reference_index</code>. Limit: 500 records, 512 KiB, 60 requests/minute per key per process. <a href="/openapi.json" target="_blank">OpenAPI specification ↗</a></p><p>The service binds to loopback. Shared hosting, HTTPS termination, account management and distributed rate limits are not included. Your instance retains key metadata, not assay request bodies. The browser demo and API use the same engine.</p>`;
function docs(kind){$('#docs-title').textContent=kind==='api'?'Private API':'Analysis methods';$('#docs-body').innerHTML=kind==='api'?api:methods;$('#docs-dialog').showModal();}
$('#api').onclick=()=>docs('api');$('#methods').onclick=$('#rail-help').onclick=()=>docs('methods');
loadExample().catch(e=>toast(e.message));
