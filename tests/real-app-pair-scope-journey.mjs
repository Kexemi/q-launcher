import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url))),mime={'.html':'text/html','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{let rel=(req.url||'/').split('?')[0];if(rel.endsWith('/'))rel+='index.html';const p=join(root,rel.replace(/^\//,'')),body=await readFile(p);res.writeHead(200,{'Content-Type':mime[extname(p)]||'text/plain'});res.end(body)}catch{res.writeHead(404);res.end('not found')}});
await new Promise(r=>server.listen(8767,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:665}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/url.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'https://mock.console'})}));
await page.route('**/api/pair/request',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
let approved=false,statusChecks=0,releaseFirstStatus,firstStatusStartedResolve;
const firstStatusStarted=new Promise(resolve=>{firstStatusStartedResolve=resolve});
await page.route('**/api/pair/status*',async r=>{
 statusChecks+=1;
 if(statusChecks===1){firstStatusStartedResolve();await new Promise(resolve=>{releaseFirstStatus=resolve});return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"approved":false,"pending":true}'})}
 return r.fulfill({status:200,contentType:'application/json',body:approved?'{"ok":true,"approved":true,"token":"TESTTOKEN","pane":"app"}':'{"ok":true,"approved":false,"pending":true}'})
});
await page.goto('http://127.0.0.1:8767/app/#world');await page.getByText('Reconnect this phone').waitFor();await page.getByRole('link',{name:'Open pairing'}).click();await page.getByText('pair this phone once').waitFor();
assert.equal(new URL(page.url()).origin,'http://127.0.0.1:8767');assert.equal(new URL(page.url()).pathname,'/');
await firstStatusStarted;
approved=true;
const resumedAt=Date.now();
await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
releaseFirstStatus();
await page.waitForFunction(()=>localStorage.getItem('aios_token')==='TESTTOKEN',null,{timeout:1000});
await page.waitForURL(u=>u.pathname==='/app/');
const resumeMs=Date.now()-resumedAt;
assert.ok(statusChecks>=2,'foreground resume must queue a fresh status check behind any stale in-flight poll');assert.ok(resumeMs<1000,'resume hook must beat the 2.5s polling interval');assert.deepEqual(errors,[]);
console.log(JSON.stringify({pass:true,pairing_origin_preserved:true,scope:'../',auto_resume_after_telegram:true,inflight_poll_race_recovered:true,status_checks:statusChecks,resume_ms:resumeMs,manual_retry_clicks:0,errors}));await browser.close();await new Promise(r=>server.close(r));
