import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNativeReflowOutbound,extractSubmittedHtml,isTistoryWriterPost,installNativeReflowSubmitGuard,safeOutboundShape} from '../publishing/native-reflow-submit-guard.mjs';

const expected='<section><h2>충치</h2><figure class="imageblock"><img src="https://blog.kakaocdn.net/dna/photo.jpg"></figure></section>';

test('outbound guard accepts exact JSON and form data HTML only',()=>{
  assert.equal(extractSubmittedHtml(JSON.stringify({content:expected}),'application/json'),expected);
  assert.equal(extractSubmittedHtml(new URLSearchParams({content:expected}).toString(),'application/x-www-form-urlencoded'),expected);
  assert.equal(assertNativeReflowOutbound(JSON.stringify({content:expected}),'application/json',expected),true);
  assert.throws(()=>assertNativeReflowOutbound(JSON.stringify({content:'<p>old</p>'}),'application/json',expected),/E_NATIVE_REFLOW_OUTBOUND_CONTENT_MISMATCH/);
  assert.throws(()=>assertNativeReflowOutbound(JSON.stringify({title:'충치'}),'application/json',expected),/E_NATIVE_REFLOW_OUTBOUND_CONTENT_UNREADABLE/);
});

test('outbound guard recognizes only Tistory writer posts, excluding image attachment',()=>{
  assert.equal(isTistoryWriterPost('https://nhunnhun.tistory.com/manage/post.json','POST'),true);
  assert.equal(isTistoryWriterPost('https://www.tistory.com/manage/post.json','POST'),true);
  assert.equal(isTistoryWriterPost('https://nhunnhun.tistory.com/manage/post/469.json','PUT'),true);
  assert.equal(isTistoryWriterPost('https://nhunnhun.tistory.com/manage/post/469.json','PATCH'),true);
  assert.equal(isTistoryWriterPost('https://nhunnhun.tistory.com/manage/post/attach.json','POST'),false);
  assert.equal(isTistoryWriterPost('https://nhunnhun.tistory.com/manage/analytics.json','POST'),false);
  assert.equal(isTistoryWriterPost('https://nhunnhun.tistory.com/manage/post/autosave.json','POST'),false);
  assert.equal(isTistoryWriterPost('https://nhunnhun.tistory.com/manage/post.json','GET'),false);
  assert.equal(isTistoryWriterPost('https://unrelated.example/manage/post.json','POST'),false);
});


test('guard diagnostics show request shape without content or signed image URLs',()=>{
  const secret='private-data-and-signed-image';
  const summary=safeOutboundShape(JSON.stringify({title:'충치',csrfToken:secret,post:{bodyHtml:secret}}),
    'application/json;charset=UTF-8','https://nhunnhun.tistory.com/manage/post.json','POST');
  assert.deepEqual(summary.keys,['title','csrfToken','post']);
  assert.deepEqual(summary.postKeys,['bodyHtml']);
  assert.equal(summary.path,'/manage/post.json');
  assert.ok(!JSON.stringify(summary).includes(secret));
});

test('outbound guard blocks mismatched payload before it can be sent',async()=>{
  let handler;
  let continued=0,aborted=0;
  const page={route:async(_pattern,routeHandler)=>{handler=routeHandler;}};
  const guard=await installNativeReflowSubmitGuard(page,expected);
  await handler({request:()=>({url:()=> 'https://nhunnhun.tistory.com/manage/post.json',method:()=> 'POST',postData:()=> JSON.stringify({content:'<p>old</p>'}),headers:()=>({'content-type':'application/json'})}),continue:async()=>{continued++;},abort:async()=>{aborted++;}});
  await assert.rejects(()=>guard.assertObserved(),/E_NATIVE_REFLOW_OUTBOUND_CONTENT_MISMATCH/);
  assert.equal(continued,0);
  assert.equal(aborted,1);
});

test('outbound guard permits only an exact submission',async()=>{
  let handler;
  let continued=0;
  const page={route:async(_pattern,routeHandler)=>{handler=routeHandler;}};
  const guard=await installNativeReflowSubmitGuard(page,expected);
  await handler({request:()=>({url:()=> 'https://nhunnhun.tistory.com/manage/post.json',method:()=> 'POST',postData:()=> JSON.stringify({content:expected}),headers:()=>({'content-type':'application/json'})}),continue:async()=>{continued++;},abort:async()=>{throw Error('should not abort');}});
  assert.equal(await guard.assertObserved(),true);
  assert.equal(continued,1);
});
