import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyze,parseCSV,toCSV,FIELDS} from '../public/core.mjs';
const demo=()=>parseCSV(readFileSync(new URL('../public/example.csv',import.meta.url),'utf8'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-12,`${a} != ${b}`);
test('synthetic fixture preserves mismatches, missingness and invalid values',()=>{
 const r=analyze(demo());assert.deepEqual(r.summary,{records:9,valid:8,invalid:1,matched:5,different:2,incomplete:1,censored:1});
 assert.equal(r.rows[4].fold_vs_reference,null);assert.ok(r.rows[4].differences.includes('substrate_nM'));
 assert.equal(r.rows[8].valid,false);assert.ok(r.rows[8].errors.some(x=>x.includes('mw_g_mol')));
});
test('unit conversions are invariant across five molar scales',()=>{
 const r=demo()[0];for(const [value,unit]of [[.000001,'M'],[.001,'mM'],[1,'uM'],[1,'µM'],[1,'μM'],[1000,'nM'],[1e6,'pM']]){
 const row=analyze([{...r,value,unit}]).rows[0];near(row.molar,1e-6);near(row.p,6);near(row.nM,1000);}
});
test('mass concentrations use measured species molecular weight',()=>{
 const r=demo()[0];for(const [value,unit]of [[.0005,'g/L'],[.0005,'mg/mL'],[.5,'ug/mL'],[.5,'mg/L'],[500,'ng/mL']]){
 near(analyze([{...r,value,unit,mw_g_mol:500}]).rows[0].molar,1e-6);}
 assert.equal(analyze([{...r,unit:'ug/mL',mw_g_mol:''}]).rows[0].valid,false);
});
test('negative log transformation reverses every bound',()=>{
 for(const [relation,expected]of [['<','>'],['<=','>='],['>','<'],['>=','<=']]){
 const row=analyze([{...demo()[0],value:10,unit:'uM',relation}]).rows[0];assert.equal(row.p_relation,expected);near(row.p,5);assert.equal(row.fold_vs_reference,null);}
});
test('zero, nonfinite, malformed, unsupported and prototype relation reject',()=>{
 for(const patch of [{value:0},{value:-1},{value:'NaN'},{value:'Infinity'},{value:'0x10'},{value:'1e999'},{unit:'NM'},{unit:'%'},{relation:'toString'},{endpoint:'activity'},{temperature_C:-274}]){
 assert.equal(analyze([{...demo()[0],...patch}]).rows[0].valid,false,JSON.stringify(patch));}
});
test('context gate checks every field and never treats unknowns as matching',()=>{
 const source=demo()[0];for(const key of ['target','organism','system','protocol','temperature_C','pH','incubation_min','substrate_nM','enzyme_nM']){
 const out=analyze([source,{...source,id:'other',[key]:''}]);assert.equal(out.rows[1].comparison,'incomplete');assert.equal(out.rows[1].fold_vs_reference,null);}
 const r=analyze([source,{...source,id:'other',endpoint:'Ki'}]);assert.equal(r.rows[1].comparison,'different');assert.equal(r.rows[1].fold_vs_reference,null);
});
test('numeric declarations canonicalize; NA is an explicit distinct declaration',()=>{
 const source=demo()[0];assert.equal(analyze([source,{...source,id:'x',temperature_C:'25.0'}]).rows[1].comparison,'matched');
 assert.equal(analyze([source,{...source,id:'x',substrate_nM:'NA'}]).rows[1].comparison,'different');
 assert.equal(analyze([{...source,substrate_nM:'NA'},{...source,id:'x',substrate_nM:'NA'}]).rows[1].comparison,'matched');
});
test('duplicate IDs invalidate all occurrences and suppress reference ratios',()=>{
 const s=demo()[0],out=analyze([s,{...s,value:'100'}]);assert.equal(out.summary.invalid,2);assert.equal(out.rows[0].p,null);assert.equal(out.rows[1].fold_vs_reference,null);
});
test('CSV quoted commas, multiline text, BOM and CRLF round trip',()=>{
 const r={...demo()[0],source:'A, B\n"quoted"'};const parsed=parseCSV('\uFEFF'+toCSV([r]));assert.equal(parsed[0].source,r.source);assert.equal(parsed[0].relation,'=');
});
test('CSV rejects malformed, duplicate headers, field mismatch and limits',()=>{
 for(const s of ['id,id,compound,value,unit,endpoint\na,b,c,1,nM,IC50','id,compound,endpoint,value,unit\na,b,IC50,1','id,compound,endpoint,value,unit\na,b,IC50,"1,nM','id,compound,endpoint,value,unit\na,b,IC50,"1"bad,nM'])assert.throws(()=>parseCSV(s));
 assert.throws(()=>parseCSV('x'.repeat(524289)));assert.throws(()=>analyze(Array(501).fill(demo()[0])));assert.throws(()=>analyze([],0));assert.throws(()=>analyze(demo(),-1));
});
test('reference changes recompute ratios without modifying source values',()=>{
 const records=demo(),original=JSON.stringify(records);const a=analyze(records),b=analyze(records,1);near(a.rows[1].fold_vs_reference,120/45);near(b.rows[0].fold_vs_reference,45/120);assert.equal(JSON.stringify(records),original);
});
test('regression sweep preserves scale and reciprocal ratios',()=>{
 let cases=0;for(let exp=-12;exp<=0;exp++)for(const factor of [1,2,5,9]){
 const v=factor*10**exp,base=demo()[0],a={...base,value:v,unit:'M'},b={...base,id:'B',value:v*1e9,unit:'nM'};
 const report=analyze([a,b]);near(report.rows[1].fold_vs_reference,1);near(report.rows[0].p,report.rows[1].p);cases++;
 }assert.equal(cases,52);
});
test('CSV neutralizes formula-bearing source text',()=>{const r={...demo()[0],source:'=HYPERLINK("https://invalid")'};assert.ok(toCSV([r]).includes("'=HYPERLINK"));});
test('500-record batch retains row identity and does not pool replicates',()=>{
 const base=demo()[0],rows=Array.from({length:500},(_,i)=>({...base,id:`record-${i}`,value:String(i+1)}));
 const report=analyze(rows);assert.equal(report.summary.records,500);assert.equal(report.summary.matched,500);assert.equal(report.rows[499].original.id,'record-499');near(report.rows[499].fold_vs_reference,500);
});
test('ratio underflow does not silently become an exact zero',()=>{
 const base=demo()[0],report=analyze([{...base,value:'1e298',unit:'M'},{...base,id:'small',value:'5e-324',unit:'M'}]);
 assert.ok(report.rows[1].valid);assert.equal(report.rows[1].fold_vs_reference,null);assert.ok(report.rows[1].warnings.includes('Ratio exceeds numeric range'));
});
