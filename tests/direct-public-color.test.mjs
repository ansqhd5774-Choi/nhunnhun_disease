import test from 'node:test';
import assert from 'node:assert/strict';
import {directPublicExpectations,assertDirectPublicSnapshot} from '../publishing/direct-public-contract.mjs';
import {renderDirectArticle} from '../publishing/direct-design.mjs';

// Regression: semantic data-tone attributes must not change public emphasis counts.
test('direct public expectations count semantic mark attributes',()=>{
  const html='<h2>소개</h2><p><mark data-tone="positive"><strong>장점</strong></mark> <mark data-tone="info"><u><strong>기준</strong></u></mark> <mark data-tone="caution"><strong>주의</strong></mark> <mark data-tone="negative"><strong>위험</strong></mark></p>';
  const expected=directPublicExpectations(html);
  assert.equal(expected.marks,4);
  assert.equal(expected.boldMarks,4);
  assert.equal(expected.underlinedMarks,1);
  assert.doesNotThrow(()=>assertDirectPublicSnapshot({...expected,stylesVisible:true},html));
});

test('direct renderer converts only semantic tones and preserves legacy bare marks',()=>{
  const html='<h2>소개</h2><p><mark><strong>기존 강조</strong></mark> <mark data-tone="positive"><strong>새 강조</strong></mark></p>';
  const out=renderDirectArticle(html);
  assert.ok(out.includes('<mark><strong>기존 강조</strong></mark>'));
  assert.ok(out.includes('<mark><strong><span style="background:linear-gradient(transparent 45%,#dff3df 45%);padding:0 .06em;">새 강조</span></strong></mark>'));
  assert.ok(!out.includes('data-tone="positive"'));
});
