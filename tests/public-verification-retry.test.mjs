import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPublicWithRetry,isTransientPublicVerificationError} from '../publishing/public-verification-retry.mjs';

test('known public propagation failures are retryable but contract failures are not',()=>{
  assert.equal(isTransientPublicVerificationError(Error('E_BODY_UNVERIFIED')),true);
  assert.equal(isTransientPublicVerificationError(Error('E_IMAGE_UNVERIFIED')),true);
  assert.equal(isTransientPublicVerificationError(Error('E_EDITORIAL_PUBLIC_CONTRACT')),false);
});

test('read-only verification retries the same public target and succeeds without a submit callback',async()=>{
  let navigations=0,verifications=0,sleeps=0;
  const result=await verifyPublicWithRetry({attempts:4,delays:[1,1,1],
    navigate:async()=>{navigations++;},
    verify:async()=>{verifications++;if(verifications<3)throw Error('E_BODY_UNVERIFIED');return 'ok';},
    sleep:async()=>{sleeps++;},log:()=>{}});
  assert.equal(result,'ok');
  assert.equal(navigations,3);
  assert.equal(verifications,3);
  assert.equal(sleeps,2);
});

test('permanent public verification errors fail immediately',async()=>{
  let navigations=0,verifications=0;
  await assert.rejects(()=>verifyPublicWithRetry({attempts:5,navigate:async()=>{navigations++;},verify:async()=>{verifications++;throw Error('E_EDITORIAL_PUBLIC_CONTRACT');},sleep:async()=>{},log:()=>{}}),/E_EDITORIAL_PUBLIC_CONTRACT/);
  assert.equal(navigations,1);
  assert.equal(verifications,1);
});

test('transient mismatch remains failed after bounded retries',async()=>{
  let calls=0;
  await assert.rejects(()=>verifyPublicWithRetry({attempts:3,delays:[0,0],navigate:async()=>{},verify:async()=>{calls++;throw Error('E_BODY_UNVERIFIED');},sleep:async()=>{},log:()=>{}}),/E_BODY_UNVERIFIED/);
  assert.equal(calls,3);
});
