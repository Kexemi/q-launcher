import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fsp from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import assert from 'node:assert/strict';

const repo=process.cwd();
const mime={'.html':'text/html','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{let rel=decodeURIComponent((req.url||'/').split('?')[0]);if(rel.endsWith('/'))rel+='index.html';const file=normalize(join(repo,rel.replace(/^\//,'')));if(!file.startsWith(normalize(repo)))throw Error('scope');const body=await fsp.readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(body)}catch{res.writeHead(404);res.end('not found')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port,origin=`http://127.0.0.1:${port}`;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:390,height:665}});
 await page.goto(origin+'/frontier/?legacy=1',{waitUntil:'domcontentloaded'});
 await page.waitForURL(origin+'/app/#world');
 assert.equal(page.url(),origin+'/app/#world');
 assert.equal(await page.title(),'AI-OS');
 assert.equal(await page.locator('[data-view="world"]').count(),1);
 assert.equal(new URL(page.url()).origin,origin);
 console.log(JSON.stringify({pass:true,legacy_entry:'/frontier/',target:'/app/#world',same_origin:true,real_app:true}));
}finally{await browser.close();await new Promise(r=>server.close(r))}
