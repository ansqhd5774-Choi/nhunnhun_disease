import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDirectArticle} from '../publishing/direct-design.mjs';

test('effect list uses approved desktop tablet mobile responsive layout',()=>{
  const html='<h2>2. 한 달 복용 후 기대되는 신체 변화는 무엇인가?</h2><ul><li><strong>포화지방 섭취가 많은 사람</strong>버터·라드 일부를 식물성 기름으로 바꿉니다.</li><li><strong>지방 섭취를 지나치게 제한하는 사람</strong>식물성 기름·견과류·씨앗류를 식사에 포함합니다.</li></ul>';
  const out=renderDirectArticle(html);
  assert.match(out,/class="effects"/);
  assert.match(out,/grid-template-columns:170px minmax\(0,1fr\)/);
  assert.match(out,/@media\(max-width:900px\)/);
  assert.match(out,/grid-template-columns:150px minmax\(0,1fr\)/);
  assert.match(out,/@media\(max-width:600px\)/);
  assert.match(out,/border-left:4px solid #6c92b7/);
  assert.match(out,/border:0!important;border-radius:0!important;background:transparent!important/);
  assert.match(out,/font-size:17px!important/);
  assert.match(out,/font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif!important/);
  assert.match(out,/color:#355f86!important/);
  assert.match(out,/article:nth-child\(4n\+2\) h3\{color:#9a5f1d!important\}/);
  assert.match(out,/>포화지방 섭취가 많은 사람<\/h3>/);
});

test('pair list shares approved readable responsive list system without rewriting text',()=>{
  const html='<h2>5. 함께 섭취하면 좋은 영양소와 주의할 상호작용은 무엇인가?</h2><ul><li><strong>비타민 C</strong>같은 식사에 곁들입니다.</li><li><strong>비타민 K</strong>섭취량 변화에 주의합니다.</li></ul>';
  const out=renderDirectArticle(html);
  assert.match(out,/class="pairs"/);
  assert.match(out,/>비타민 C<\/h3><p>같은 식사에 곁들입니다.<\/p>/);
  assert.match(out,/>비타민 K<\/h3><p>섭취량 변화에 주의합니다.<\/p>/);
});

test('nutrient R12 source keeps quick summary cards, section cards, tables and highlights together',()=>{
  const html=[
    '<blockquote><strong>핵심만 먼저:</strong> <strong>효능</strong> 핵심 효능<br><strong>누가</strong> 권장 대상<br><strong>복용</strong> 하루 섭취량<br><strong>기간</strong> 확인 기간<br><strong>조합</strong> 함께 먹기<br><strong>주의</strong> 주의사항</blockquote>',
    '<h2>1. 정의와 주요 성분 및 작용은 무엇인가?</h2><p><mark data-tone="info"><u><strong>정의 핵심</strong></u></mark></p>',
    '<h2>2. 한 달 복용 후 기대되는 신체 변화는 무엇인가?</h2><ul><li><strong>변화 A:</strong> <mark data-tone="positive"><strong>변화 핵심</strong></mark></li><li><strong>조건 B:</strong> 대상별 조건 설명</li></ul>',
    '<h2>3. 일일 권장 섭취량과 효과적인 섭취법은 무엇인가?</h2><ul><li><strong>하루량:</strong> 1회량 설명</li><li><strong>먹는 시간:</strong> 시간 설명</li></ul>',
    '<h2>4. 풍부한 식품 TOP7과 각 식품의 평균 함유량은 얼마인가?</h2><table><thead><tr><th>순위</th><th>식품</th><th>함유량</th></tr></thead><tbody><tr><td>1</td><td>식품 A</td><td>10</td></tr></tbody></table>',
    '<h2>5. 함께 섭취하면 좋은 영양소와 주의할 상호작용은 무엇인가?</h2><ul><li><strong>조합 A:</strong> 같이 먹는 법</li><li><strong>상호작용 B:</strong> 행동 기준</li></ul>',
    '<h2>6. 결핍 및 과다 복용의 위험, 예방 가능한 질병과 추천 제품은 무엇인가?</h2><ul><li><strong>결핍:</strong> 결핍 설명</li><li><strong>과다:</strong> 과다 설명</li><li><strong>제품:</strong> 선택 설명</li></ul><table><tbody><tr><td>제품 A</td><td>10mg</td></tr></tbody></table>'
  ].join('');
  const out=renderDirectArticle(html);
  assert.match(out,/class="quick-summary"/);
  assert.match(out,/class="effects"/);
  assert.match(out,/class="storage"/);
  assert.match(out,/class="pairs"/);
  assert.match(out,/class="cautions"/);
  assert.equal((out.match(/<h3>/g)||[]).length,9);
  assert.equal((out.match(/class="table-scroll"/g)||[]).length,2);
  assert.equal((out.match(/<table>/g)||[]).length,2);
  assert.match(out,/정의 핵심/);
  assert.match(out,/변화 핵심/);
});
