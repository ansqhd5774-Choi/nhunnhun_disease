import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sourceDigest} from './source-confirmation.mjs';
import {prepareDirectSource} from './prepare-direct-source.mjs';

// Call before any remote write. Complete JSON is retained even if preflight fails.
export function preservedSourceBundle(source){
  const prepared=prepareDirectSource(source);
  return {version:'direct-handoff-20261012',source,
    receipt:{sourceId:source.id,articleId:source.articleId??null,title:source.title,sourceDigest:sourceDigest(source),
      authorState:'AUTHOR_COMPLETE',githubState:'NOT_CONFIRMED',preflight:prepared.report.preflight,
      ...(prepared.report.foodAxisReview?{foodAxisReview:prepared.report.foodAxisReview}:{}),
      workflowState:'NOT_STARTED',finalSubmitCount:0}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const source=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const bundle=preservedSourceBundle(source);
  const dir=resolve('evidence','authoring-handoffs',source.id,sourceDigest(source));mkdirSync(dir,{recursive:true});
  // Exclusive writes preserve previous evidence instead of overwriting it.
  for(const [name,value] of [['source.json',source],['receipt.json',bundle.receipt]]){
    try{writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
    catch(error){if(error.code!=='EEXIST')throw error;}
  }
  console.log(JSON.stringify({directory:dir,...bundle.receipt}));
}
