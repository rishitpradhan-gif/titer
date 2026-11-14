const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
 const base=process.env.TITER_URL||'http://127.0.0.1:4458';
 await page.goto(base);await page.waitForFunction(()=>document.querySelector('#count').textContent==='9');
 assert.equal(await page.locator('#matched').textContent(),'5');assert.equal(await page.locator('#other').textContent(),'1 / 1');
 await page.screenshot({path:'/private/tmp/titer-desktop.png',fullPage:true});
 await page.locator('[data-record="3"]').click();assert.match(await page.locator('#inspector').innerText(),/Censored bound/);assert.match(await page.locator('#inspector').innerText(),/withheld/);
 await page.locator('[data-record="4"]').click();assert.match(await page.locator('#inspector').innerText(),/Different: substrate_nM/);
 await page.locator('[data-filter="matched"]').click();assert.equal(await page.locator('#records tr').count(),5);
 await page.locator('[data-filter="review"]').click();assert.equal(await page.locator('#records tr').count(),4);
 await page.locator('[data-filter="all"]').click();await page.locator('#search').fill('Compound G');assert.equal(await page.locator('#records tr').count(),1);
 await page.locator('#search').fill('');await page.locator('[data-record="8"]').click();assert.match(await page.locator('#inspector').innerText(),/Mass concentration requires/);
 await page.locator('#edit').click();await page.locator('[name="mw_g_mol"]').fill('400');await page.locator('[name="source"]').fill('<img src=x onerror=alert(1)>');await page.locator('#edit-form .primary').click();
 assert.equal(await page.locator('#matched').textContent(),'6');assert.equal(await page.locator('#other').textContent(),'1 / 0');assert.match(await page.locator('#inspector').innerText(),/<img src=x/);assert.equal(await page.locator('#inspector img').count(),0);
 await page.locator('#reference').selectOption('1');await page.locator('[data-record="0"]').click();assert.match(await page.locator('#inspector').innerText(),/0.375×/);
 const dlPromise=page.waitForEvent('download');await page.locator('#export').click();const dl=await dlPromise;await dl.saveAs('/private/tmp/titer-report-test.json');
 const report=JSON.parse(await fs.readFile('/private/tmp/titer-report-test.json','utf8'));
 assert.equal(report.provenance.edited,true);assert.equal(report.reference_index,1);assert.equal(report.provenance.working_records_sha256,createHash('sha256').update(JSON.stringify(report.input_records)).digest('hex'));
 await page.locator('#import').click();await page.locator('#file').setInputFiles('/private/tmp/titer-report-test.json');await page.locator('#load').click();await page.waitForFunction(()=>!document.querySelector('#import-dialog').open);assert.equal(await page.locator('#count').textContent(),'9');assert.equal(await page.locator('#matched').textContent(),'6');
 await page.locator('#import').click();await page.locator('#file').setInputFiles([]);await page.locator('#paste').fill('id,compound,endpoint,value,unit\na,A,IC50,"broken');await page.locator('#load').click();assert.match(await page.locator('#import-error').innerText(),/Unclosed/);await page.keyboard.press('Escape');assert.equal(await page.locator('#count').textContent(),'9');
 await page.locator('#api').click();assert.match(await page.locator('#docs-body').innerText(),/does not issue hosted-service credentials/);await page.keyboard.press('Escape');
 page.on('dialog',d=>d.accept());await page.locator('#example').click();await page.waitForFunction(()=>document.querySelector('#other').textContent==='1 / 1');
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('#toast').textContent==='');await page.screenshot({path:'/private/tmp/titer-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#import').click();assert.equal(await page.locator('#import-dialog').isVisible(),true);await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===new URL(base).origin));
 console.log('PASS: filters, censoring, context flags, editing, XSS escaping, reference ratios, exported hash, JSON reimport, malformed input preservation, API docs, mobile width, no external/upload requests.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
