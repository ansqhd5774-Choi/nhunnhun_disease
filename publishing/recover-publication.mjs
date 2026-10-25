import {loadPosts,fingerprint,assertArticleUrl} from './core.mjs';
import {Ledger} from './ledger.mjs';
import {renderEditorialPost,editorialExpectations,editorialVersionFor} from './editorial.mjs';
import {localBrowserConfig,openPublicBrowser} from './local-browser.mjs';
import {verificationContext} from './verification-context.mjs';
import {verifyPublishedPublic} from './verify-published-public.mjs';
import {verifyPublicWithRetry} from './public-verification-retry.mjs';

let browser;
try {
  const id=process.env.PUBLISH_SOURCE_ID;
  if(!id) throw Error('E_RECOVERY_SOURCE_REQUIRED');
  const [post]=await loadPosts('posts',id);
  const ledger=new Ledger(), state=await ledger.read(id);
  if(state?.phase!=='submitting'||state.fingerprint!==fingerprint(post)) throw Error('E_RECOVERY_STATE_CONFLICT');
  const url=assertArticleUrl(process.env.RECOVERY_PUBLIC_URL||state.url);
  if(state.url&&state.url!==url) throw Error('E_RECOVERY_URL_CONFLICT');
  browser=await openPublicBrowser(await localBrowserConfig());
  const context=await verificationContext(browser,{viewport:{width:1440,height:900}});
  const publicPage=await context.newPage();
  const bodyHtml=renderEditorialPost(post);
  const sources=[...new Set([...bodyHtml.matchAll(/<img\b[^>]*\bsrc=["'](.*?)["']/gi)].map(m=>m[1]))];
  await verifyPublicWithRetry({
    navigate:()=>publicPage.goto(url,{waitUntil:'domcontentloaded'}),
    verify:()=>verifyPublishedPublic({publicPage,publicBrowser:browser,post,bodyHtml,sources,
      representativeSource:post.representativeImageUrl||sources[0],
      editorialExpected:editorialExpectations(post.bodyHtml,{version:editorialVersionFor(post)}),url})
  });
  const latest=await ledger.read(id);
  if(latest.sha!==state.sha) throw Error('E_LEDGER_CONFLICT');
  const {sha,...record}=state;
  await ledger.write(id,{...record,phase:'published',url,timestamp:new Date().toISOString(),
    recoveryRunUrl:`https://github.com/ansqhd5774-Choi/nhunnhun_disease/actions/runs/${process.env.GITHUB_RUN_ID}`,
    publicResult:{status:'PUBLIC_VERIFIED',url,checkedAt:new Date().toISOString(),
      checks:['title','body','images','representative','emphasis','desktop','mobile'],semanticVerification:'not-performed'}},sha);
  console.log('PUBLIC_VERIFIED '+id+' '+url);
} catch(error) {
  console.error(/^E_[A-Z0-9_]+$/.test(error.message)?error.message:'E_RECOVERY_RUNTIME');process.exitCode=1;
} finally {await browser?.close();}
