import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {localBrowserConfig,openPublicBrowser} from './local-browser.mjs';
import {renderEditorialPost} from './editorial.mjs';
import {publicBodiesMatch} from './public-body.mjs';

const normalize=value=>String(value??'').replace(/\s+/g,' ').trim();
function firstDiff(a,b){
  const left=normalize(a),right=normalize(b),limit=Math.min(left.length,right.length);
  let index=0;while(index<limit&&left[index]===right[index])index++;
  if(index===left.length&&index===right.length)return null;
  const from=Math.max(0,index-80),to=Math.min(Math.max(left.length,right.length),index+160);
  return {index,actualLength:left.length,expectedLength:right.length,actual:left.slice(from,to),expected:right.slice(from,to)};
}

const sourceId=process.env.UPDATE_SOURCE_ID;
if(!/^direct-[a-z0-9-]{2,70}$/.test(sourceId??''))throw Error('E_RECOVERY_SOURCE_ID');
const source=JSON.parse(await readFile(resolve('updates',sourceId+'.json'),'utf8'));
const rendered=renderEditorialPost(source);
let browser;
try{
  browser=await openPublicBrowser(await localBrowserConfig());
  const page=await browser.newPage();
  const response=await page.goto(source.targetUrl,{waitUntil:'domcontentloaded',timeout:45000});
  const root=page.locator('.contents_style:has(.nh-direct-v2)');
  if(!response?.ok()||await root.count()!==1)throw Error('E_RECOVERY_DIAG_ACCESS');
  const expectedBody=await page.evaluate(html=>{const host=document.createElement('div');host.style.cssText='position:fixed;left:-100000px;top:0;width:800px;opacity:0;pointer-events:none';host.innerHTML=html;document.body.appendChild(host);const out={text:host.innerText||host.textContent||'',headings:[...host.querySelectorAll('h2')].map(h=>h.innerText||h.textContent||'')};host.remove();return out;},rendered);
  const actualBody=await root.evaluate(el=>({text:el.innerText||el.textContent||'',headings:[...el.querySelectorAll('h2')].map(h=>h.innerText||h.textContent||'')}));
  console.log('RECOVERY_BODY_DIAG '+JSON.stringify({sourceId,url:source.targetUrl,matches:publicBodiesMatch(actualBody,expectedBody),actualHeadings:actualBody.headings,expectedHeadings:expectedBody.headings,diff:firstDiff(actualBody.text,expectedBody.text)}));
}finally{await browser?.close();}
