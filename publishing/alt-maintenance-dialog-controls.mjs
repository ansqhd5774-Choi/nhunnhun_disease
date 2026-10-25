// Observed Tistory DOM: footer buttons are siblings of .publish_editor.
// Exact role/name and visible IDs prevent clicking unrelated controls.
export async function altDialogControl(page,kind,{observe=async(_,action)=>action()}={}){
  if(await observe('cancel-panel-count',()=>page.locator('.publish_editor:visible').count(),{safeReadOnly:true,timeoutMs:15000})!==1)throw Error('E_ALT_DIALOG_CONTROL');
  const cancel=kind==='cancel';
  const control=page.getByRole('button',{name:cancel?'취소':'공개 발행',exact:true})
    .and(page.locator(cancel?'#unpublish-btn:visible':'#publish-btn:visible'));
  if(await observe('cancel-control-count',()=>control.count(),{safeReadOnly:true,timeoutMs:15000})!==1||!await observe('cancel-control-enabled',()=>control.isEnabled(),{safeReadOnly:true,timeoutMs:15000}))throw Error(cancel?'E_ALT_CANCEL_CONTROL':'E_ALT_SUBMIT_CONTROL');
  return control;
}
export async function cancelAltDialog(page,{observe=async(_,action)=>action()}={}){
  const control=await altDialogControl(page,'cancel',{observe});
  await observe('cancel-open-click',()=>control.click({timeout:25000}));
  await observe('cancel-hidden-wait',()=>page.locator('.publish_editor').waitFor({state:'hidden',timeout:10000}),{safeReadOnly:true,timeoutMs:15000});
}
