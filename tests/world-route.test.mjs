import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert(source);
async function route(pane){const store=new Map([['aios_token','TESTTOKEN'],['aios_pane',pane]]),location={hash:'',pathname:'/q-launcher/',href:'https://kexemi.github.io/q-launcher/',replaced:null,replace(url){this.replaced=url}},elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{style:{},innerHTML:'',textContent:''});return elements.get(id)};const context={console,URL,URLSearchParams,Uint8Array,Date,document:{getElementById:el},history:{replaceState(){}},location,navigator:{clipboard:{writeText(){}}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},crypto:{randomUUID:()=> 'device-route',getRandomValues:a=>a.fill(1)},fetch(url){if(String(url).includes('url.json'))return Promise.resolve({json:async()=>({url:'https://console.example'})});throw new Error(`unexpected fetch ${url}`)},setInterval(){return 1},clearInterval(){},setTimeout};vm.runInNewContext(source,context);await new Promise(r=>setTimeout(r,20));return location.replaced}
assert.equal(await route('world'),'https://console.example/t/TESTTOKEN/world');
assert.equal(await route('hermes'),'https://console.example/t/TESTTOKEN/#hermes');
assert.equal(await route('frontier'),'https://kexemi.github.io/q-launcher/frontier/');
console.log('LAUNCHER_WORLD_ROUTE_PASS world=dedicated hermes=preserved frontier=stable-shell');
