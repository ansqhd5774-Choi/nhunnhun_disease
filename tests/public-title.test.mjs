import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPublicTitle} from '../publishing/public-title.mjs';
import {readFileSync} from 'node:fs';
import {publicFailureState} from '../publishing/finalize-update.mjs';
test('shared title failures remain mismatch rather than access unavailable',()=>{
  for(const code of ['E_PUBLIC_TITLE_MISMATCH','E_PUBLIC_TITLE_METADATA_MISMATCH']) {
    assert.deepEqual(publicFailureState(Error(code)),{status:'PUBLIC_VERIFICATION_MISMATCH',code});
  }
});
test('new publication and existing update both use shared title contract',()=>{
  for(const file of ['verify-published-public.mjs','verify-updated-public.mjs']) {
    const source=readFileSync(new URL('../publishing/'+file,import.meta.url),'utf8');
    assert.match(source,/import.*assertPublicTitle.*public-title\.mjs/);
    assert.match(source,/assertPublicTitle\(await .*evaluate/);
    assert.doesNotMatch(source,/includes\((?:post|update)\.title\)/);
  }
});
test('split heading preserves exact title identity',()=>assert.doesNotThrow(()=>assertPublicTitle({heading:'템페 효능\n먹는 법',og:'템페 효능｜먹는 법'},'템페 효능｜먹는 법')));
test('wrong heading cannot pass using sidebar title',()=>assert.throws(()=>assertPublicTitle({heading:'두부',og:'템페'},'템페'),/E_PUBLIC_TITLE_MISMATCH/));
test('wrong metadata fails',()=>assert.throws(()=>assertPublicTitle({heading:'템페',og:'두부'},'템페'),/E_PUBLIC_TITLE_METADATA_MISMATCH/));
