import test from 'node:test';
import assert from 'node:assert/strict';
import {assertImageReview} from '../publishing/image-review.mjs';

function fixture() {
  const review = [
    {src:'https://wwwn.cdc.gov/phil/PHIL_Images/24355/24355_lores.jpg',
      alt:'여드름 면포와 붉은 염증 병변을 보여 주는 CDC 임상사진',
      role:'hero',composition:'closeup',
      sourcePage:'https://wwwn.cdc.gov/phil/Details.aspx?pid=24355',
      author:'CDC / Dr. Hudson',license:'Public Domain'},
    {src:'https://medical.example.org/photos/a.jpg',
      alt:'얼굴의 구진 형태를 보여 주는 공개 사용 사진',
      role:'detail',composition:'closeup',
      sourcePage:'https://medical.example.org/source/a',
      author:'Clinical image fixture',license:'CC BY 4.0'},
    {src:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Test.jpg',
      alt:'다른 병변 형태를 보여 주는 진단 예시 사진',
      role:'detail',composition:'closeup',
      sourcePage:'https://commons.wikimedia.org/wiki/File:Test.jpg',
      author:'Commons fixture',license:'CC0'}
  ];
  const bodyHtml = review.map(x=>`<p><img src="${x.src}" alt="${x.alt}"></p>`).join('')+
    '<h2>자료 출처</h2><ul>'+
    review.map(x=>`<li><a href="${x.sourcePage}">사진 원출처</a></li>`).join('')+'</ul>';
  return {category:'질병',representativeImageUrl:review[0].src,imageReview:review,bodyHtml};
}

test('licensed medical images can have CDC, other HTTPS, or Wikimedia original pages',()=>{
  assert.doesNotThrow(()=>assertImageReview(fixture()));
});

test('source URL must remain HTTPS without embedded credentials',()=>{
  for(const wrong of ['http://wwwn.cdc.gov/phil/Details.aspx?pid=24355',
    'https://user:pass@wwwn.cdc.gov/phil/Details.aspx?pid=24355',
    'javascript:alert(1)']){
    const item=fixture();
    item.imageReview[0].sourcePage=wrong;
    assert.throws(()=>assertImageReview(item),/E_IMAGE_REVIEW_SOURCE/);
  }
});

test('original source still requires a matching attribution link',()=>{
  const item=fixture();
  item.bodyHtml=item.bodyHtml.replace('https://wwwn.cdc.gov/phil/Details.aspx?pid=24355',
    'https://wwwn.cdc.gov/phil/Details.aspx?pid=0');
  assert.throws(()=>assertImageReview(item),/E_IMAGE_REVIEW_ATTRIBUTION/);
});

test('a missing license needs a documented usage basis; authorship still matters',()=>{
  const noBasis=fixture();
  noBasis.imageReview[0].license='Not specified';
  assert.throws(()=>assertImageReview(noBasis),/E_IMAGE_REVIEW_LICENSE/);
  const unknownBasis=fixture();
  unknownBasis.imageReview[0].license='Not specified';
  unknownBasis.imageReview[0].usageBasis='any-photo-is-free';
  assert.throws(()=>assertImageReview(unknownBasis),/E_IMAGE_REVIEW_SCHEMA/);
  const noAuthor=fixture();
  noAuthor.imageReview[0].author='';
  assert.throws(()=>assertImageReview(noAuthor),/E_IMAGE_REVIEW_LICENSE/);
});

test('source-attributed product-identification photos are not blocked just for lacking CC metadata',()=>{
  const item=fixture();
  const productPage='https://manufacturer.example.org/products/cetirizine-10mg';
  item.imageReview[0]={...item.imageReview[0],license:'Not specified',
    author:'Example manufacturer',usageBasis:'product-identification',sourcePage:productPage};
  item.imageReview[1]={...item.imageReview[1],license:'',
    author:'Example manufacturer',usageBasis:'product-identification',sourcePage:productPage};
  item.bodyHtml=item.bodyHtml.replace('https://wwwn.cdc.gov/phil/Details.aspx?pid=24355',productPage)
    .replace('https://medical.example.org/source/a',productPage);
  assert.doesNotThrow(()=>assertImageReview(item));
  item.bodyHtml=item.bodyHtml.replaceAll('https://manufacturer.example.org/products/cetirizine-10mg','https://manufacturer.example.org/other');
  assert.throws(()=>assertImageReview(item),/E_IMAGE_REVIEW_ATTRIBUTION/);
});

test('original, authorized and properly cited quotation routes are supported',()=>{
  for(const usageBasis of ['original','authorized','quotation']){
    const item=fixture();
    item.imageReview[0].license='Not specified';
    item.imageReview[0].usageBasis=usageBasis;
    assert.doesNotThrow(()=>assertImageReview(item));
  }
});

test('repeating the exact same image is rejected even when its source is valid',()=>{
  const duplicate=fixture();
  duplicate.imageReview[1].src=duplicate.imageReview[0].src;
  duplicate.bodyHtml=duplicate.bodyHtml.replace('https://medical.example.org/photos/a.jpg',duplicate.imageReview[0].src);
  assert.throws(()=>assertImageReview(duplicate),/E_IMAGE_REVIEW_DUPLICATE/);
});
