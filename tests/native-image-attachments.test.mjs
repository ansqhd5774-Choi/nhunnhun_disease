import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreNativeImageFigures} from './publishing/native-image-attachments.mjs';

test('replaces seven bare image tags with their unique Tistory attachment figures',()=>{
  const sources=Array.from({length:7},(_,i)=>`https://upload.wikimedia.org/${i}.jpg`);
  const urls=Array.from({length:7},(_,i)=>`https://blog.kakaocdn.net/dna/test-${i}/tfile.bin?credential=secret&expires=1`);
  const html=sources.map((src,i)=>`<img src="${src}" alt="설명 ${i}"><p>사진 ${i} 설명</p>`).join('');
  const editor=urls.map((src,i)=>`<figure class="imageblock alignCenter" data-origin-width="900" data-origin-height="600"><span data-url="${src.replace('&','&amp;')}"><img src="${src}" alt=""></span></figure>`).join('');
  const out=restoreNativeImageFigures(html,new Map(sources.map((src,i)=>[src,urls[i]])),sources[0],editor);
  assert.equal((out.match(/<figure /g)||[]).length,7);
  assert.equal((out.match(/object-fit:contain !important/g)||[]).length,7);
  assert.equal((out.match(/loading="eager"/g)||[]).length,1);
  assert.equal((out.match(/loading="lazy"/g)||[]).length,6);
  assert.ok(out.includes('alt="설명 6"'));
  assert.ok(out.includes('data-origin-width="900"'));
  assert.equal((out.match(/<p>사진/g)||[]).length,7);
});

test('fails closed when a native attachment figure is missing',()=>{
  const source='https://upload.wikimedia.org/a.jpg';
  assert.throws(()=>restoreNativeImageFigures(`<img src="${source}" alt="사진">`,new Map([[source,'https://blog.kakaocdn.net/dna/a/tfile.bin']]),source,''),/E_UPDATE_IMAGE_NATIVE_FIGURE/);
});

test('rejects replacement with a plain image figure lacking Tistory metadata',()=>{
  const source='https://upload.wikimedia.org/a.jpg';
  const url='https://blog.kakaocdn.net/dna/a/tfile.bin';
  assert.throws(()=>restoreNativeImageFigures(`<img src="${source}" alt="사진">`,new Map([[source,url]]),source,`<figure><img src="${url}"></figure>`),/E_UPDATE_IMAGE_NATIVE_METADATA/);
});
