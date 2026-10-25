// Explicit opt-in for the two articles authorized for citation-layout repair.
export function renderArticleCitations(html,post){
  if(!['264','237'].includes(String(post?.articleId)) || !/-citation-layout-20261010$/.test(post?.id||''))return html;
  const split=html.search(/<h2\b[^>]*>자료 출처<\/h2>/);
  if(split<0)throw Error('E_CITATION_SOURCES');
  const refs=new Map();
  let body=html.slice(0,split).replace(/<a href="([^"]+)" title="근거 \[(\d+)\]">\[\2\]<\/a>/g,(_m,url,number)=>{
    if(refs.has(number)&&refs.get(number)!==url)throw Error('E_CITATION_NUMBER');
    refs.set(number,url);
    return `<a href="#nh-ref-${number}" title="출처 ${number} 보기" style="font-size:12px!important;line-height:1;vertical-align:super;white-space:nowrap;margin-left:3px;padding:0!important;background:none!important;text-decoration:none;">[${number}]</a>`;
  });
  let footer=html.slice(split);
  for(const [number,url] of refs){
    const needle=`<li><a href="${url}">`;
    if(!footer.includes(needle))throw Error('E_CITATION_TARGET');
    footer=footer.replace(needle,`<li id="nh-ref-${number}" style="font-size:13px;line-height:1.7;margin:6px 0;scroll-margin-top:100px;">[${number}] <a href="${url}">`);
  }
  return body+footer;
}
