import {RUNNER_LABELS} from '../publishing/runner-gate.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import YAML from 'yaml';
import {REPOSITORY_SCOPE,assertRepositorySource,assertSelectedSource} from '../publishing/repository-scope.mjs';
import {acquireWriterLock,releaseWriterLock,assertWriterHost} from '../publishing/writer-lock.mjs';
const source={id:'direct-test-identity',category:REPOSITORY_SCOPE.category,contentStandard:'SP1'};
test('only local category, repository and direct source accepted',()=>{
  assert.equal(assertRepositorySource(source,{GITHUB_REPOSITORY:REPOSITORY_SCOPE.repository}),source);
  assert.throws(()=>assertRepositorySource(source,{GITHUB_REPOSITORY:'wrong/repo'}),/E_REPOSITORY_SCOPE/);
  assert.throws(()=>assertRepositorySource({...source,category:'wrong'},{}),/E_CATEGORY_SCOPE/);
  assert.throws(()=>assertRepositorySource({...source,contentStandard:'R1'},{}),/E_DIRECT_SCOPE/);
  assert.throws(()=>assertSelectedSource('posts',''),/E_SELECTED_SOURCE_REQUIRED/);
});
test('all active local technical module imports resolve inside this checkout',()=>{
  for(const dir of ['publishing','authoring'])for(const name of readdirSync(dir).filter(n=>n.endsWith('.mjs'))){
    const p=join(dir,name),s=readFileSync(p,'utf8');
    for(const m of s.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+\.mjs)\1/g)){
      assert.ok(existsSync(new URL('../'+dir+'/'+m[2],import.meta.url)),`${p}: ${m[2]}`);
    }
  }
});
test('workflow entry points use host-locked package scripts and self repository',()=>{
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  for(const [name,job,command] of [['publish-posts.yml','publish','publish'],['update-posts.yml','update','update']]){
    const workflow=YAML.parse(readFileSync('.github/workflows/'+name,'utf8'));
    const actualLabels=workflow.jobs[job]['runs-on'].map(s=>s.toLowerCase());
    for(const label of RUNNER_LABELS)assert.ok(actualLabels.includes(label.toLowerCase()));
    const step=workflow.jobs[job].steps.find(s=>s.run==='pnpm run '+command);
    assert.ok(step,command);
    assert.equal(step.env.TISTORY_WRITER_HOST,'${{ vars.TISTORY_WRITER_HOST }}');
    assert.equal(pkg.scripts[command],'node publishing/writer-session.mjs '+command);
    for(const step of workflow.jobs[job].steps)if(step.env?.GITHUB_REPOSITORY)assert.equal(step.env.GITHUB_REPOSITORY,REPOSITORY_SCOPE.repository);
  }
  for(const name of ['publish','update']){
    const s=readFileSync('publishing/'+name+'.mjs','utf8');
    assert.ok(s.indexOf('await assertWriterLease();')<s.indexOf('await localBrowserConfig()'));
    assert.ok(s.includes('assertSelectedSource('));
  }
});
test('host configuration fails closed',()=>{
  assert.throws(()=>assertWriterHost({},'publisher'),/E_WRITER_HOST_NOT_CONFIGURED/);
  assert.throws(()=>assertWriterHost({TISTORY_WRITER_HOST:'other'},'publisher'),/E_WRITER_HOST_NOT_CONFIGURED/);
  assertWriterHost({TISTORY_WRITER_HOST:'PUBLISHER'},'publisher');
});
test('independent repositories cannot acquire the same host lock simultaneously',async()=>{
  const root=await mkdtemp(join(tmpdir(),'nhunnhun-isolation-')); const path=join(root,'writer.lock');
  try {
    const first=await acquireWriterLock(path,{repository:'repo-a',sourceId:'a'});
    await assert.rejects(acquireWriterLock(path,{repository:'repo-b',sourceId:'b'},{timeoutMs:0}),/E_WRITER_BUSY/);
    await assert.rejects(releaseWriterLock({...first,token:'wrong'}),/E_WRITER_LEASE_MISMATCH/);
    assert.equal(JSON.parse(await readFile(join(path,'owner.json'),'utf8')).repository,'repo-a');
    await releaseWriterLock(first);
    const second=await acquireWriterLock(path,{repository:'repo-b',sourceId:'b'});
    await releaseWriterLock(second);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('parallel runner package managers never share a home installation directory',()=>{
  const action=YAML.parse(readFileSync('.github/actions/setup-node-pnpm/action.yml','utf8'));
  const setup=action.runs.steps.find(s=>s.uses==='pnpm/action-setup@v4');
  assert.match(setup.with.dest,/runner\.temp/);
  assert.match(setup.with.dest,/github\.run_id/);
  assert.match(setup.with.dest,/github\.job/);
  assert.match(setup.with.dest,/github\.run_attempt/);
});

test('manual new-post validation never scans unrelated manuscripts',()=>{
 const w=YAML.parse(readFileSync('.github/workflows/publish-posts.yml','utf8'));
 const selected=w.jobs.validate.steps.find(s=>s.run==='node publishing/validate-selected-content.mjs posts');
 assert.ok(selected);
 assert.equal(selected.env.PUBLISH_SOURCE_ID,'${{ steps.mutation-gate.outputs.source_id }}');
 assert.equal(w.jobs.validate.steps.some(s=>s.run==='pnpm run validate:content'),false);
 const cli=readFileSync('publishing/validate-selected-content.mjs','utf8');
 assert.match(cli,/assertSelectedSource\(kind,id\)/);
 assert.match(cli,/runContentCli\(\['--check'/);
});
