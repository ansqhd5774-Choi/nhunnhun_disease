import {renderDirectArticle} from './direct-design.mjs';
import {parseDocument} from 'htmlparser2';

// Match the actual common renderer, including legacy section-position cards.
// This still detects missing public cards: the expected count comes from
// rendered source while the actual count comes from the anonymous public DOM.
function findTags(node,predicate){
  const found=[];
  const walk=current=>{
    if(predicate(current))found.push(current);
    for(const child of current?.children??[])walk(child);
  };
  walk(node);
  return found;
}
function expectedPairCards(renderedHtml){
  return findTags(parseDocument(renderedHtml),node=>node?.name==='div' &&
    String(node.attribs?.class??'').split(/\s+/u).includes('pairs'))
    .flatMap(group=>(group.children??[]).filter(child=>child?.name==='article'));
}
export function directPublicExpectations(sourceHtml) {
  const html=renderDirectArticle(sourceHtml);
  const count=re=>(html.match(re)||[]).length;
  const cards=expectedPairCards(html);
  const markedCards=cards.filter(card=>findTags(card,node=>node?.name==='mark' &&
    findTags(node,child=>child?.name==='strong').length>0).length>0);
  return {roots:1,h2:count(/<h2\b/g),numbers:count(/<small>/g),h3:count(/<h3>/g),
    tables:count(/<table>/g),tableWraps:count(/class="table-scroll"/g),images:count(/<img\b/g),
    marks:count(/<mark\b[^>]*>/g),boldMarks:count(/<mark\b[^>]*>(?:<u>)?<strong>/g),underlinedMarks:count(/<mark\b[^>]*><u><strong>/g),
    badges:count(/class="badge"/g),pairsArticles:cards.length,pairsMarkedArticles:markedCards.length};
}
export function assertDirectPublicSnapshot(actual,sourceHtml) {
  const expected=directPublicExpectations(sourceHtml);
  for(const [key,value] of Object.entries(expected)) {
    if(actual[key]!==value)throw Error('E_DIRECT_PUBLIC_'+key.toUpperCase());
  }
  if(actual.stylesVisible!==true)throw Error('E_DIRECT_PUBLIC_STYLE');
}
