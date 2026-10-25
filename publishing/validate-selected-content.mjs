import {assertSelectedSource} from './repository-scope.mjs';
import {runContentCli} from './validate-content.mjs';
try{
 const kind=process.argv[2];
 const id=kind==='posts'?process.env.PUBLISH_SOURCE_ID:process.env.UPDATE_SOURCE_ID;
 assertSelectedSource(kind,id);
 runContentCli(['--check',kind+'/'+id+'.json']);
}catch(error){console.error(/^E_[A-Z0-9_]+$/.test(error.message)?error.message:'E_SELECTED_CONTENT');process.exitCode=1;}
