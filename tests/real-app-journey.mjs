import { chromium } from 'playwright';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import assert from 'node:assert/strict';

const repo=process.cwd();
const vault='C:/Users/receg/AI-OS/Obsidian Vault';
const token=fs.readFileSync('C:/Users/receg/AI-OS/System/console-token.txt','utf8').replace(/^\uFEFF/,'').trim();
const out=vault+'/System/Automation/Logs/Owner-App-Recovery';
const mime={'.html':'text/html','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const staticServer=createServer(async(req,res)=>{try{let rel=decodeURIComponent((req.url||'/').split('?')[0]);if(rel.endsWith('/'))rel+='index.html';const file=normalize(join(repo,rel.replace(/^\//,'')));if(!file.startsWith(normalize(repo)))throw Error('scope');const body=await fsp.readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(body)}catch{res.writeHead(404);res.end('not found')}});
await new Promise(r=>staticServer.listen(0,'127.0.0.1',r));
const staticPort=staticServer.address().port;
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const apiPort=probe.address().port;await new Promise(r=>probe.close(r));
const backend=spawn('uv',['run','python','System/Automation/Scripts/aios_console_server.py'],{cwd:vault,env:{...process.env,AIOS_CONSOLE_PORT:String(apiPort)},stdio:'ignore'});
let cleaned=false;function cleanup(){if(cleaned)return;cleaned=true;try{staticServer.close()}catch{}if(backend.pid)spawnSync('taskkill.exe',['/PID',String(backend.pid),'/T','/F'],{stdio:'ignore'})}process.on('exit',cleanup);
const apiBase=`http://127.0.0.1:${apiPort}`;
for(let i=0;i<80;i++){try{const r=await fetch(apiBase+'/api/app-state',{headers:{'X-AIOS-Token':token,'Origin':`http://127.0.0.1:${staticPort}`}});if(r.ok)break}catch{}await new Promise(r=>setTimeout(r,100));if(i===79)throw Error('owned candidate backend did not become ready')}
const direct=await fetch(apiBase+'/api/app-state',{headers:{'X-AIOS-Token':token,'Origin':`http://127.0.0.1:${staticPort}`}}).then(r=>r.json());
assert.equal(direct.primary_region.epistemic_state,'contradicted');
assert.equal(direct.primary_region.proof.find(x=>x.label==='Decision state').state,'verified');
assert.equal(direct.primary_region.proof.find(x=>x.label==='Campaign runtime').state,'contradicted');
assert.ok((direct.proof_sources||[]).length>=1);

const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext({viewport:{width:390,height:665},deviceScaleFactor:2});
 await context.addInitScript(t=>localStorage.setItem('aios_token',t),token);
 const page=await context.newPage();let failApi=false,rotateEndpoint=false,rotationLookups=0,expectedRotationFailures=0;const errors=[];
 page.on('pageerror',e=>errors.push('page:'+String(e)));page.on('requestfailed',r=>{if(rotateEndpoint&&r.url().includes('127.0.0.1:8999'))expectedRotationFailures+=1;else if(!failApi)errors.push('request:'+r.url())});
 await page.route('**/url.json*',r=>{rotationLookups+=1;const url=rotateEndpoint&&rotationLookups===1?'http://127.0.0.1:8999':apiBase;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url})})});
 await page.route('**/api/**',r=>failApi?r.abort('failed'):r.continue());
 const appOrigin=`http://127.0.0.1:${staticPort}`;
 await page.goto(appOrigin+'/app/#world',{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('#world-progress')?.textContent==='11/11');
 assert.equal(new URL(page.url()).origin,appOrigin);assert.equal(await page.locator('#connection').textContent(),'connected');assert.match(await page.locator('#world-state').textContent(),/runtime mismatch/i);await page.screenshot({path:out+'/real-app-world-phone.png'});
 for(let i=0;i<10;i++)for(const view of ['decisions','focus','world'])await page.locator(`nav button[data-go="${view}"]`).click();
 assert.equal(new URL(page.url()).origin,appOrigin);await page.locator('nav button[data-go="decisions"]').click();await page.waitForFunction(()=>document.querySelector('#decision-stage')?.textContent.includes('11/11 complete'));
 await page.locator('nav button[data-go="focus"]').click();await page.goBack();assert.match(page.url(),/#decisions$/);await page.goForward();assert.match(page.url(),/#focus$/);await page.locator('nav button[data-go="world"]').click();await page.locator('#primary-region').click();assert.match(page.url(),/#focus$/);
 assert.match(await page.locator('#focus-stage').textContent(),/record mismatch/i);assert.match(await page.locator('#focus-stage').textContent(),/Campaign runtime\s*contradicted/i);assert.match(await page.locator('#focus-stage').textContent(),/External outcome\s*not_yet_verified/i);assert.ok(await page.locator('details.source').count()>=1);await page.locator('details.source').first().click();assert.ok((await page.locator('details.source small').first().textContent()).includes(' · '));await page.evaluate(()=>document.querySelector('#focus-stage').scrollTo(0,0));await page.screenshot({path:out+'/real-app-focus-phone.png'});
 failApi=true;await page.locator('nav button[data-go="decisions"]').click();await page.waitForFunction(()=>document.querySelector('#decision-stage')?.textContent.includes('Still reconnecting'),null,{timeout:20000});assert.equal(new URL(page.url()).origin,appOrigin);assert.match(page.url(),/#decisions$/);failApi=false;await page.locator('#dec-retry').click();await page.waitForFunction(()=>document.querySelector('#decision-stage')?.textContent.includes('11/11 complete'));
 rotateEndpoint=true;rotationLookups=0;await page.evaluate(()=>{S.base=''});await page.locator('nav button[data-go="world"]').click();await page.locator('nav button[data-go="decisions"]').click();await page.waitForFunction(()=>document.querySelector('#decision-stage')?.textContent.includes('11/11 complete'),null,{timeout:20000});assert.ok(rotationLookups>=2);assert.ok(expectedRotationFailures>=1);assert.equal(new URL(page.url()).origin,appOrigin);await page.screenshot({path:out+'/real-app-decisions-phone.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({pass:true,owned_backend:true,api_port:apiPort,origin:appOrigin,progress:await page.locator('#world-progress').textContent(),truth_split:'decision_verified_runtime_contradicted',proof_sources:direct.proof_sources.length,disconnect_recovered:true,tunnel_rotation_recovered:true,rotation_lookups:rotationLookups,expected_rotation_failures:expectedRotationFailures,rapid_taps:30,history:true,overflow:false,errors},null,2));
}finally{await browser.close();cleanup()}
