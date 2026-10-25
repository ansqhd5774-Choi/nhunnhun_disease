// Observation only for editor operations: no retry, cancellation, page close or kill.
export async function observeUpdateStage(stage,action,{log=console.log,slowMs=15000,timeoutMs=0,safeReadOnly=false}={}){
  if(!/^[a-z][a-z0-9-]{1,59}$/.test(stage)||typeof action!=='function'||!Number.isFinite(slowMs)||slowMs<1||timeoutMs&&!safeReadOnly)throw Error('E_UPDATE_OBSERVATION_CONTRACT');
  const started=Date.now(),emit=state=>log('UPDATE_STAGE '+JSON.stringify({stage,state,elapsedMs:Date.now()-started}));emit('start');
  const slow=setTimeout(()=>emit('OBSERVATION_PENDING'),slowMs);let bound;
  try{
    const pending=Promise.resolve().then(action);
    const result=timeoutMs?await Promise.race([pending,new Promise((_,reject)=>{bound=setTimeout(()=>reject(Error('E_UPDATE_READ_ONLY_OBSERVATION_TIMEOUT')),timeoutMs);})]):await pending;
    emit('done');return result;
  }catch(error){emit('error');throw error;}finally{clearTimeout(slow);if(bound)clearTimeout(bound);}
}
