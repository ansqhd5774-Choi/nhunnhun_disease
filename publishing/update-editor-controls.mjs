import {BLOG} from './core.mjs';

export async function selectEditorMode(page,mode){
  const selector=mode==='html'
    ? '#editor-mode-html:visible, #editor-mode-html-text:visible, #editor-mode-html-tistory:visible'
    : '#editor-mode-kakao:visible, #editor-mode-kakao-text:visible, #editor-mode-kakao-tistory:visible';
  const visibleEditors=await page.locator('.CodeMirror:visible').count();
  if(mode==='html'&&visibleEditors){
    // A visible CodeMirror can linger while Tistory is still in basic mode
    // after image uploads. Only trust a usable visible editor code surface.
    const htmlReady=await page.evaluate(()=>{
      return [...document.querySelectorAll('.CodeMirror')].some(el=>
        el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'
        &&typeof el.CodeMirror?.getValue==='function'
        &&!!el.querySelector('.CodeMirror-code')?.getClientRects().length
      );
    });
    if(htmlReady)return;
    console.log('UPDATE_HTML_MODE_STALE_CODEMIRROR '+JSON.stringify({visibleEditors}));
  }
  if(mode==='basic'&&!visibleEditors)return;
  const option=page.locator(selector).first();
  const diagnostic=async()=>{
    const snapshot=await page.evaluate(()=>{
      const ids=['editor-mode-layer-btn-open','editor-mode-html','editor-mode-html-text','editor-mode-html-tistory','editor-mode-kakao','editor-mode-kakao-text','editor-mode-kakao-tistory'];
      return {path:location.pathname,controls:ids.map(id=>{
        const el=document.getElementById(id);
        return {id,found:!!el,visible:!!el?.getClientRects().length};
      }),codeMirror:document.querySelectorAll('.CodeMirror').length};
    }).catch(()=>({path:'unavailable'}));
    console.log('UPDATE_MODE_DOM '+JSON.stringify({mode,...snapshot}));
  };
  if(!await option.isVisible()){
    // The publishing path uses this stable ID; the former .mce-txt selector
    // can miss a mode menu even when the correct button is available.
    const menu=page.locator('#editor-mode-layer-btn-open:visible').first();
    const menuReady=await menu.waitFor({state:'visible',timeout:10000}).then(()=>true,()=>false);
    if(!menuReady){
      await diagnostic();
      if(mode==='html'){
        // On some edit sessions the HTML option exists but the whole toolbar
        // is hidden. Use only the known editor mode controls and require a
        // live, visible CodeMirror API before returning. No submit is involved.
        const used=await page.evaluate(()=>{
          for(const id of ['editor-mode-html','editor-mode-html-text','editor-mode-html-tistory']){
            const control=document.getElementById(id);
            if(!control)continue;
            control.click();
            return id;
          }
          return null;
        }).catch(()=>null);
        if(used){
          await page.waitForFunction(()=>
            [...document.querySelectorAll('.CodeMirror')].some(el=>
              el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'
              &&typeof el.CodeMirror?.getValue==='function'
              &&!!el.querySelector('.CodeMirror-code')?.getClientRects().length
            ),null,{timeout:10000,polling:100}).catch(error=>{
              throw Object.assign(Error('E_UPDATE_EDITOR_MODE_TRANSITION'),{cause:error});
            });
          console.log('UPDATE_HTML_MODE_DOM_TRANSITION_VERIFIED '+used);
          return;
        }
      }
      if(mode==='basic'){
        // DOM evidence: the basic-mode control exists but its toolbar is hidden
        // after HTML inspection. Invoke only the known mode control, and require
        // CodeMirror to disappear before continuing to any image operation.
        const used=await page.evaluate(()=>{
          for(const id of ['editor-mode-kakao','editor-mode-kakao-text','editor-mode-kakao-tistory']){
            const control=document.getElementById(id);
            if(!control)continue;
            control.click();
            return id;
          }
          return null;
        }).catch(()=>null);
        if(used){
          await page.waitForFunction(()=>
            [...document.querySelectorAll('.CodeMirror')].every(el=>
              !el.getClientRects().length||getComputedStyle(el).visibility==='hidden'
            ),null,{timeout:10000,polling:100}).catch(error=>{
              throw Object.assign(Error('E_UPDATE_EDITOR_MODE_TRANSITION'),{cause:error});
            });
          console.log('UPDATE_BASIC_MODE_DOM_TRANSITION_VERIFIED '+used);
          return;
        }
      }
      throw Error('E_UPDATE_EDITOR_MODE_MENU');
    }
    let domOptionTransitionVerified=false;
    await menu.click({timeout:10000}).catch(async error=>{
      // A visible mode toggle can be blocked by an overlay even though the
      // exact Tistory mode control exists. Recover only via those known IDs,
      // then prove the editor mode transition before any content mutation.
      const used=await page.evaluate(targetMode=>{
        const ids=targetMode==='html'
          ? ['editor-mode-html','editor-mode-html-text','editor-mode-html-tistory']
          : ['editor-mode-kakao','editor-mode-kakao-text','editor-mode-kakao-tistory'];
        for(const id of ids){
          const control=document.getElementById(id);
          if(!control)continue;
          control.click();
          return id;
        }
        return null;
      },mode).catch(()=>null);
      if(!used){
        await diagnostic();
        throw Object.assign(Error('E_UPDATE_EDITOR_MODE_MENU'),{cause:error});
      }
      await page.waitForFunction(expected=>{
        const editors=[...document.querySelectorAll('.CodeMirror')].filter(el=>
          el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
        return expected==='html'
          ? editors.some(el=>typeof el.CodeMirror?.getValue==='function'
              &&!!el.querySelector('.CodeMirror-code')?.getClientRects().length)
          : editors.length===0;
      },mode,{timeout:10000,polling:100}).catch(cause=>{
        throw Object.assign(Error('E_UPDATE_EDITOR_MODE_TRANSITION'),{cause});
      });
      domOptionTransitionVerified=true;
      console.log('UPDATE_EDITOR_MENU_DOM_OPTION_FALLBACK '+JSON.stringify({mode,id:used}));
    });
    if(domOptionTransitionVerified)return;
  }
  await option.waitFor({state:'visible',timeout:10000}).catch(async error=>{
    await diagnostic();
    throw Object.assign(Error('E_UPDATE_EDITOR_MODE_OPTION'),{cause:error});
  });
  await option.click({timeout:10000}).catch(async error=>{
    // Tistory can leave the mode option visibly rendered but temporarily
    // unclickable after image uploads. Fall back only to the known mode IDs,
    // then keep the existing CodeMirror transition check as the hard gate.
    const ids=mode==='html'
      ? ['editor-mode-html','editor-mode-html-text','editor-mode-html-tistory']
      : ['editor-mode-kakao','editor-mode-kakao-text','editor-mode-kakao-tistory'];
    const used=await page.evaluate(ids=>{
      for(const id of ids){
        const control=document.getElementById(id);
        if(!control)continue;
        control.click();
        return id;
      }
      return null;
    },ids).catch(()=>null);
    if(!used){
      await diagnostic();
      throw Object.assign(Error('E_UPDATE_EDITOR_MODE_CLICK'),{cause:error});
    }
    console.log('UPDATE_EDITOR_MODE_DOM_CLICK_FALLBACK '+JSON.stringify({mode,id:used}));
  });
  await page.waitForFunction(expected=>{
    const visibleEditors=[...document.querySelectorAll('.CodeMirror')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
    return expected==='html'
      ? visibleEditors.some(el=>typeof el.CodeMirror?.getValue==='function'
          &&!!el.querySelector('.CodeMirror-code')?.getClientRects().length)
      : visibleEditors.length===0;
  },mode,{timeout:10000,polling:100}).catch(error=>{throw Object.assign(Error('E_UPDATE_EDITOR_MODE_TRANSITION'),{cause:error});});
}

export async function probeManagedPost(page,update){
  try{
    const currentUrl=new URL(page.url());
    if(currentUrl.origin!==BLOG||!currentUrl.pathname.startsWith('/manage'))
      await page.goto(`${BLOG}/manage/posts`,{waitUntil:'domcontentloaded',timeout:30000});
    const managedUrl=new URL(page.url());
    if(managedUrl.origin!==BLOG||!managedUrl.pathname.startsWith('/manage')) throw new Error('E_LOGIN_REQUIRED');
    const result=await page.evaluate(async ({id,title})=>{
      try {
      async function getPage(page,searchKeyword=''){
        const params=new URLSearchParams({
          category:'-3',page:String(page),searchKeyword,searchType:'title',visibility:'all'
        });
        const response=await fetch('/manage/posts.json?'+params.toString(),{
          credentials:'include',
          headers:{Accept:'application/json'}
        });
        let data=null;
        try{data=await response.json();}catch{throw Error('E_UPDATE_TARGET_RESPONSE_JSON');}
        const items=Array.isArray(data?.items)?data.items:Array.isArray(data?.data?.items)?data.data.items:null;
        if(!items)throw Error('E_UPDATE_TARGET_RESPONSE_SCHEMA');
        return {status:response.status,items};
      }
      let first=await getPage(1,title);
      let item=first.items.find(x=>String(x?.id)===String(id))||null;
      let status=first.status;
      if(!item && status===200){
        for(let page=1;page<=100 && !item;page++){
          const scan=await getPage(page,'');
          status=scan.status;
          if(status!==200||scan.items.length===0) break;
          if(page===100)throw Error('E_UPDATE_TARGET_SCAN_LIMIT');
          item=scan.items.find(x=>String(x?.id)===String(id))||null;
        }
      }
      return {
        status,
        found:!!item,
        id:item?String(item.id):null,
        visibility:item?.visibility||null,
        title:item?.title||null
      };
      }catch(error){return {errorCode:/^E_UPDATE_[A-Z0-9_]+$/.test(error.message)?error.message:'E_UPDATE_TARGET_FETCH',exceptionType:error.name};}
    },{id:update.articleId,title:update.expectedCurrentTitle});
    if(result.errorCode)throw Object.assign(Error(result.errorCode),{details:{exceptionType:result.exceptionType}});
    console.log('UPDATE_TARGET_PROBE '+JSON.stringify({
      articleId:update.articleId,
      status:result.status,
      found:result.found,
      visibility:result.visibility
    }));
    if(result.status!==200) throw new Error('E_UPDATE_TARGET_PROBE');
    if(!result.found) throw new Error('E_UPDATE_TARGET_NOT_FOUND');
    if((result.title||'').trim()===update.title&&update.title!==update.expectedCurrentTitle) throw new Error('E_UPDATE_TARGET_ALREADY_CHANGED');
    if((result.title||'').trim()!==update.expectedCurrentTitle) {
      // Public title of the exact numeric article, returned by the authenticated read-only probe.
      // Preserve the mismatch gate and expose only this non-secret field for source correction.
      console.log('UPDATE_CURRENT_TITLE_EVIDENCE '+JSON.stringify({articleId:String(update.articleId),currentTitle:String(result.title||'').trim().slice(0,150)}));
      throw new Error('E_UPDATE_CURRENT_TITLE_MISMATCH');
    }
    return result;
  }catch(error){
    if(error?.message==='E_LOGIN_REQUIRED'||/^E_UPDATE_/.test(String(error?.message||''))) throw error;
    console.error('UPDATE_TARGET_EXCEPTION '+JSON.stringify({type:error?.name??'Error',timeout:/timeout/i.test(error?.message??''),navigation:/navigation|interrupted|closed/i.test(error?.message??'')}));
    throw new Error('E_UPDATE_TARGET_PROBE');
  }
}
