import test from 'node:test';
import assert from 'node:assert/strict';
import {reflowExistingNative,validateNativeReflow,assertLegacyRepairBaseline} from '../publishing/reflow-existing-native.mjs';

const spec={originalCount:4,keepIndices:[0,1,3]};
const image=(n)=>`<img src="https://upload.wikimedia.org/wiki/photo${n}.jpg" alt="Photo ${n}">`;
const figure=(n)=>`<figure class="imageblock" data-origin-width="300"><span data-url="https://blog.kakaocdn.net/dna/photo${n}/img.jpg?expires=100"><img src="https://blog.kakaocdn.net/dna/photo${n}/img.jpg?expires=100"></span></figure>`;
const original='<div>'+Array.from({length:4},(_,i)=>image(i)).join('')+'</div>'+Array.from({length:4},(_,i)=>figure(i)).join('');
const desired='<section>'+image(0)+'<p>본문</p>'+image(1)+image(3)+'</section>';

test('reuses exactly the surviving native photos at their authored positions',()=>{
  const out=reflowExistingNative(desired,original,spec,'https://upload.wikimedia.org/wiki/photo0.jpg');
  assert.equal((out.match(/<figure\b/g)||[]).length,3);
  assert.equal((out.match(/<img\b/g)||[]).length,3);
  assert.ok(!out.includes('/dna/photo2/'));
  assert.ok(out.includes('Photo 0'));
  assert.ok(out.includes('Photo 3'));
  assert.ok(out.includes('object-fit:contain !important'));
});

test('rejects uncertain counts and censored native placeholders',()=>{
  assert.throws(()=>reflowExistingNative(desired,original+'<img src="extra">',spec,'https://upload.wikimedia.org/wiki/photo0.jpg'),/E_NATIVE_REFLOW_ORIGINAL_COUNTS/);
  assert.throws(()=>reflowExistingNative(desired,original.replace('photo3/img.jpg','pc-image-censoring-v1.gif'),spec,'https://upload.wikimedia.org/wiki/photo0.jpg'),/E_NATIVE_REFLOW_ATTACHMENT_URL/);
  assert.throws(()=>validateNativeReflow({originalCount:4,keepIndices:[1,0,3]}),/E_NATIVE_REFLOW_SCHEMA/);
});

test('validates the real reopening shape: old bare images but no native figures',()=>{
  const plain='<div>'+Array.from({length:4},(_,i)=>image(i)).join('')+'</div>';
  assert.equal(assertLegacyRepairBaseline(plain,spec,[{alt:'Photo 0'},{alt:'Photo 1'},{alt:'Photo 3'}]),true);
  assert.throws(()=>assertLegacyRepairBaseline(original,spec,[{alt:'Photo 0'},{alt:'Photo 1'},{alt:'Photo 3'}]),/E_NATIVE_REFLOW_ORIGINAL_COUNTS/);
  assert.throws(()=>assertLegacyRepairBaseline(plain,spec,[{alt:'Photo 0'},{alt:'wrong'},{alt:'Photo 3'}]),/E_NATIVE_REFLOW_ALT_MISMATCH/);
  const encoded=plain.replace('alt="Photo 0"','alt="Photo&nbsp;0"');
  assert.equal(assertLegacyRepairBaseline(encoded,spec,[{alt:'Photo 0'},{alt:'Photo 1'},{alt:'Photo 3'}]),true);
  const middot=plain.replace('alt="Photo 0"','alt="Photo&middot;0"');
  assert.equal(assertLegacyRepairBaseline(middot,spec,[{alt:'Photo·0'},{alt:'Photo 1'},{alt:'Photo 3'}]),true);
});
