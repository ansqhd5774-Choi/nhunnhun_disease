import {parseDocument} from 'htmlparser2';

const MAX_CHARS=32;
const SENTENCE_END_PATTERN=/(?:습니다|합니다|됩니다|입니다|아닙니다|있습니다|없습니다|좋습니다|쉽습니다|어렵습니다|됩니다|해요|이에요|예요)$/u;
const TERMINAL_PUNCTUATION_PATTERN=/[.!?。]$/u;
const EXISTING_LIMITATION_PATTERN=/(?:근거|자료|증거)(?:가|는|를|도)?\s*(?:부족|충분하지|제한적)|(?:확인|입증|검증)(?:하지\s*못|되지\s*않)|단정(?:하기|할\s*수)?\s*어렵|(?:효과|변화|이득|개선)(?:가|은|는|을|를)?[^.!?]{0,30}(?:나타나지\s*않|없었|없습니다|확인하지\s*못|관찰되지\s*않)/u;
const nodeText=node=>node?.type==='text'?(node.data??''):(node?.children??[]).map(nodeText).join('');
const cleanText=value=>String(value??'').replace(/\s+/gu,' ').trim();

function collectMarkTextsFromNode(node,texts=[]){
  if(node?.name==='mark'){
    const text=cleanText(nodeText(node));
    if(text)texts.push(text);
  }
  for(const child of node?.children??[])collectMarkTextsFromNode(child,texts);
  return texts;
}

function collectMarkTexts(html){
  return collectMarkTextsFromNode(parseDocument(html??''));
}

function foodAnchor(title){
  return cleanText(title).split(/[\s｜|·(（]/u)[0]??'';
}

function isNarrative(text){
  return Array.from(text).length>MAX_CHARS||SENTENCE_END_PATTERN.test(text)||TERMINAL_PUNCTUATION_PATTERN.test(text);
}

export function assertFoodHighlightPhrases(source){
  if(source?.category!=='음식'||source?.contentStandard!=='SP1'||!source?.id?.startsWith('direct-'))return;
  const marks=collectMarkTexts(source.bodyHtml);
  if(!marks.length)return;
  if(marks.some(text=>!EXISTING_LIMITATION_PATTERN.test(text)&&isNarrative(text)))throw Error('E_DIRECT_FOOD_HIGHLIGHT_NARRATIVE');

  const anchor=foodAnchor(source.title);
  if(anchor&&marks.length>=6){
    const escaped=anchor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const repeated=new RegExp(`^${escaped}(?:\\s|[·+→:-])`,'u');
    const repeatedCount=marks.filter(text=>repeated.test(text)).length;
    if(repeatedCount>=4&&repeatedCount>=Math.ceil(marks.length/2))throw Error('E_DIRECT_FOOD_HIGHLIGHT_SUBJECT_REPEAT');
  }

  // Food R8.1: editorially meaningful highlights are author-selected.
  // Legacy numeric floors, compulsory definition/season highlights and per-block
  // coverage are no longer submission gates. Keep short-phrase and repeat guards.
}
