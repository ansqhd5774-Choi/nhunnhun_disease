import {isNativeTextMaintenance,checkNativeTextSource} from './native-text-contract.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertContentStandard, contentDigest, todayInSeoul, DOMAIN_RULES } from './content-standards.mjs';
import { EXTENSIONS, REVIEW_CHECKS, DOMAINS, SITE_CATEGORIES } from './standards/common.mjs';
import { checkPost, fingerprint } from './core.mjs';
import { checkUpdateSource } from './update-core.mjs';
import {isAltMaintenance} from './alt-maintenance-source.mjs';
import { renderEditorialPost } from './editorial.mjs';

const sourcePath = value => /^(posts|updates)\/[a-z0-9][a-z0-9-]{2,79}\.json$/.test(value);

// A provider's product-address correction is not a new health manuscript.
// Preserve the published legacy source exactly; arbitrary URL or body changes still require R1.
export function isPublishedProductLinkRepair(source, root = process.cwd()) {
  if (source.contentStandard !== undefined || !/^repair-source-\d+-\d{8}$/.test(source.id ?? '') ||
      source.id.split('-')[2] !== source.articleId) return false;
  const directory = resolve(root,'posts');
  if (!existsSync(directory)) return false;
  for (const name of readdirSync(directory).filter(n=>/^[a-z0-9-]+\.json$/.test(n))) {
    const original=JSON.parse(readFileSync(resolve(directory,name),'utf8'));
    if (original.contentStandard !== undefined || original.title !== source.title ||
        source.expectedCurrentTitle !== original.title || source.category !== original.category ||
        source.representativeImageUrl !== original.representativeImageUrl ||
        JSON.stringify(source.imageReview) !== JSON.stringify(original.imageReview)) continue;
    const ledgerPath=resolve(root,'publishing','state',`${original.id}.json`);
    if (!existsSync(ledgerPath)) continue;
    const ledger=JSON.parse(readFileSync(ledgerPath,'utf8'));
    if (ledger.phase !== 'published' || ledger.url !== source.targetUrl || ledger.fingerprint !== fingerprint(original)) continue;
    let replacements=0;
    const corrected=original.bodyHtml.replace(/(\bhref=(["']))https:\/\/www\.health\.kr\/drug\/([A-Za-z0-9]+)\2/g,
      (_,prefix,quote,productId)=>{replacements++;return `${prefix}https://www.health.kr/searchDrug/result_drug.asp?drug_cd=${productId}${quote}`;});
    if (replacements > 0 && corrected === source.bodyHtml) return true;
  }
  return false;
}
export function targetsFromChanged(paths) {
  const out = new Set();
  for (const value of paths) {
    if (sourcePath(value)) out.add(value);
    const match = value.match(/^content-reviews\/(posts|updates)\/([a-z0-9][a-z0-9-]{2,79})\.json$/);
    if (match) out.add(`${match[1]}/${match[2]}.json`);
  }
  return [...out].sort();
}
export function changedSourcePaths(base, head, root = process.cwd()) {
  if (!/^[a-f0-9]{40}$/i.test(base ?? '') || !/^[a-f0-9]{40}$/i.test(head ?? '') || /^0+$/.test(head)) throw new Error('E_CONTENT_GIT_RANGE');
  const args = /^0+$/.test(base)
    ? ['diff-tree','--root','--no-commit-id','--name-only','--diff-filter=ACMRT','-r','-z',head]
    : ['diff','--name-only','--diff-filter=ACMRT','-z',base,head];
  return targetsFromChanged(execFileSync('git', args, { cwd: root, encoding:'utf8', maxBuffer:16*1024*1024 }).split('\0').filter(Boolean));
}
export function reviewScaffold(source) {
  const domain = DOMAINS.find(d => SITE_CATEGORIES[d].includes(source.category)) ?? 'unresolved';
  return {
    version:'R1', domain,
    classification:{ rawInput:'', topic:'', meaning:'', entityId:'', status:'unresolved', reason:'' },
    sourceDigest:contentDigest(source),
    intent:{ primaryQuestion:'', readerSituation:'', nextActions:[] },
    extensions:Object.fromEntries(Object.keys(EXTENSIONS).map(key => [key,{applies:false,reason:''}])),
    coverage:(DOMAIN_RULES[domain]?.core ?? []).map(module => ({module,heading:'',answerQuote:'',sourceIds:[]})),
    connections:Object.fromEntries(DOMAINS.filter(d => d !== domain).map(d => [d,{status:'not-applicable',reason:''}])),
    sources:[], glossary:[], comparisons:[], combinations:[], selectionCriteria:[],
    review:{ status:'pending', checkedAt:todayInSeoul(), reviewer:{name:'',kind:'ai',independence:'same-author'},
      checks:Object.fromEntries(REVIEW_CHECKS.map(key => [key,{status:'pending',note:''}])), warningResolutions:[] }
  };
}
export function runContentCli(args = process.argv.slice(2), env = process.env) {
  if (['--hash','--scaffold','--check'].includes(args[0])) {
    if (args.length !== 2 || !sourcePath(args[1])) throw new Error('E_CONTENT_SOURCE_PATH');
    const source = JSON.parse(readFileSync(args[1], 'utf8'));
    if (args[0] === '--hash') { console.log(contentDigest(source)); return; }
    if (args[0] === '--scaffold') { console.log(JSON.stringify(reviewScaffold(source), null, 2)); return; }
  }
  let targets;
  if (args[0] === '--check') targets = [args[1]];
  else if (args[0] === '--changed') targets = changedSourcePaths(env.CONTENT_BASE_SHA, env.CONTENT_HEAD_SHA);
  else if (args.length === 0 || (args.length === 1 && args[0] === '--all')) {
    targets = ['posts','updates'].flatMap(kind => existsSync(kind) ? readdirSync(kind).filter(n => n.endsWith('.json')).map(n => `${kind}/${n}`) : []);
  } else throw new Error('E_CONTENT_CLI_ARGUMENT');
  let checked = 0, legacy = 0, drafts = 0, failed = 0;
  for (const path of targets) {
    try {
      if (!sourcePath(path) || !existsSync(path)) throw new Error('E_CONTENT_SOURCE_PATH');
      const source = JSON.parse(readFileSync(path, 'utf8'));
      const kind = path.split('/')[0];
      if (kind === 'posts') checkPost(source, basename(path)); else checkUpdateSource(source, basename(path));
      if(kind==='updates'&&isNativeTextMaintenance(source)){checkNativeTextSource(source,source.id+'.json');console.log('PASS_NATIVE_TEXT_SOURCE: '+source.id);checked++;continue;}
      if(kind==='updates'&&isAltMaintenance(source)){
        console.log('MAINTENANCE_CONTRACT_PASS '+JSON.stringify({path,scope:'image-alt-only',semanticVerification:'existing-content-not-recertified',runtimePreconditions:'required-before-submission'}));
        checked++;
        continue;
      }
      if(source.contentStandard==='SP1'){
        console.log('CONTENT_VALIDATION_SKIPPED '+JSON.stringify({path,reason:'ollama-user-policy',semanticVerification:'not-performed'}));
        continue;
      }
      if (args[0] !== '--check' && kind === 'posts' && source.status === 'draft' && !source.approved) { drafts++; continue; }
      if ((args.length === 0 || args[0] === '--all') && source.contentStandard === undefined) { legacy++; continue; }
      if (kind === 'updates' && isPublishedProductLinkRepair(source)) {
        renderEditorialPost(source);
        console.log('CONTENT_CONTRACT_PASS '+JSON.stringify({path,scope:'published-product-address-only',semanticVerification:'unchanged-manuscript-not-recertified'}));
        checked++;
        continue;
      }
      const report = assertContentStandard(source, {kind, enforceScanDensity: args[0] !== '--all'});
      renderEditorialPost(source);
      console.log('CONTENT_CONTRACT_PASS ' + JSON.stringify({path,domain:report.domain,semanticVerification:report.semanticVerification,warnings:report.warnings}));
      checked++;
    } catch(error) {
      failed++;
      console.error('CONTENT_CONTRACT_FAIL '+JSON.stringify({path,code:/^E_[A-Z0-9_]+$/.test(error?.message ?? '')?error.message:'E_CONTENT_RUNTIME',details:error.details ?? []}));
    }
  }
  console.log('CONTENT_CONTRACT_SUMMARY '+JSON.stringify({checked,legacyUnchanged:legacy,drafts,failed}));
  if (failed) throw new Error('E_CONTENT_VALIDATION_FAILED');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { runContentCli(); } catch(error) { console.error(/^E_[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'E_CONTENT_RUNTIME'); process.exitCode = 1; }
}
