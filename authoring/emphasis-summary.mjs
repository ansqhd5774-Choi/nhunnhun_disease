import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseDocument} from 'htmlparser2';

// Local observation only: no gate, network request, rewrite or retry.
export function summarizeEmphasis(html) {
  const count=pattern=>(html.match(pattern)??[]).length;
  return {
    bold:count(/<(?:strong|b)\b[^>]*>/gi),
    highlight:count(/<mark\b[^>]*>/gi),
    underline:count(/<u\b[^>]*>/gi),
    level2:count(/<mark\b[^>]*>\s*<strong\b[^>]*>/gi),
    level3:count(/<mark\b[^>]*>\s*<u\b[^>]*>\s*<strong\b[^>]*>/gi)
  };
}

function foodHighlightDensity(totals,sections,category){
  if(category!=='음식')return null;
  const coreSections=sections.slice(1).filter(section=>!/^자료\s*출처$/u.test(String(section.heading??'').trim()));
  const coreH2=coreSections.length;
  if(!coreH2)return {status:'NOT_APPLICABLE',advisoryOnly:true,coreH2:0};
  const recommendedMin=12;
  const recommendedMax=Math.max(12,coreH2*2);
  return {
    status:totals.highlight<recommendedMin?'LOW_HIGHLIGHT_DENSITY':'OK',
    advisoryOnly:true,
    coreH2,
    current:totals.highlight,
    recommendedRange:[recommendedMin,recommendedMax],
    note:'작성 품질 참고값이며 발행 차단·색상 할당량·자동 재작성 기준이 아니다.'
  };
}

// Section observations identify omissions without deciding meaning or blocking publication.
export function observeEmphasis(html,{category}={}) {
  const sections=[];
  let section={heading:'도입',bold:0,highlight:0,underline:0,level2:0,level3:0,standaloneHighlights:[]};
  sections.push(section);
  const text=node=>node.type==='text'?node.data:(node.children??[]).map(text).join('');
  const contains=(node,name)=>(node.children??[]).some(child=>child.name===name||contains(child,name));
  const visit=node=>{
    if(node.name==='h2') {
      section={heading:text(node),bold:0,highlight:0,underline:0,level2:0,level3:0,standaloneHighlights:[]};
      sections.push(section);
    }
    if(['strong','b'].includes(node.name))section.bold++;
    if(node.name==='u')section.underline++;
    if(node.name==='mark') {
      section.highlight++;
      const bold=contains(node,'strong')||contains(node,'b');
      if(bold&&contains(node,'u'))section.level3++;
      else if(bold)section.level2++;
      else section.standaloneHighlights.push(text(node));
    }
    for(const child of node.children??[])visit(child);
  };
  visit(parseDocument(html));
  const totals=summarizeEmphasis(html);
  return {totals,sections,highlightDensity:foodHighlightDensity(totals,sections,category)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const source=JSON.parse(readFileSync(process.argv[2],'utf8'));
  console.log(JSON.stringify({sourceId:source.id,...observeEmphasis(source.bodyHtml??'',{category:source.category})},null,2));
}
