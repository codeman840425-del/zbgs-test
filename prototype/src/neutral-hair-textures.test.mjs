import assert from 'node:assert/strict';
import test from 'node:test';
import {Texture} from 'three';
import {createNeutralHairTextures, neutralHairImageKeys} from './neutral-hair-textures.js';

class Bitmap {
  width = 1;
  height = 1;
}
globalThis.ImageBitmap = Bitmap;
globalThis.document = {createElement() {
  const canvas = {getContext:() => ({
    drawImage() {},
    getImageData:() => ({data:Uint8ClampedArray.of(4,19,11,127)}),
    putImageData({data}) {canvas.pixel = [...data];},
  })};
  return canvas;
}};

function input(renderer, {body='a'.repeat(64), image={mimeType:'image/png', bufferView:0}, buffer={}}={}) {
  const map = new Texture(new Bitmap()), shadeMap = map.clone();
  shadeMap.offset.x = .2;
  const parser = {textureLoader:{isImageBitmapLoader:true}, associations:new Map([[map,{textures:0}],[shadeMap,{textures:0}]]),
    json:{textures:[{source:0}], images:[image], bufferViews:[{buffer:0}], buffers:[buffer]}};
  const keys = neutralHairImageKeys([{map,shadeMap}], parser, body);
  return {map,shadeMap,cache:createNeutralHairTextures(renderer,keys)};
}

test('share immutable converted pixels, retain private material sampling, release at the final actor',()=>{
  const renderer = {isWebGLRenderer:true};
  const a = input(renderer), b = input(renderer);
  const map=a.cache.get(a.map), shade=a.cache.get(a.shadeMap), peer=b.cache.get(b.map);
  assert.deepEqual(map.image.pixel,[19,19,19,127]);
  assert.notEqual(map,shade);assert.notEqual(map,peer);
  assert.equal(shade.offset.x,.2);assert.equal(map.offset.x,0);
  assert.equal(shade.source,map.source);assert.equal(peer.source,map.source);
  assert.equal(a.cache.get(a.map),map);assert.equal(a.cache.size,2);
  assert.notEqual(a.map.image,map.image);
  a.cache.dispose();a.cache.dispose();
  const c=input(renderer);
  assert.equal(c.cache.get(c.map).source,peer.source);
  assert.deepEqual(peer.image.pixel,[19,19,19,127]);
  b.cache.dispose();c.cache.dispose();
  const fresh=input(renderer);
  assert.notEqual(fresh.cache.get(fresh.map).source,map.source);
  fresh.cache.dispose();
});

test('different bodies, renderers, non-embedded or replaced pixels keep private sources',()=>{
  const renderer={isWebGLRenderer:true}, trusted=input(renderer);
  const original=trusted.cache.get(trusted.map).source;
  const cases=[input({isWebGLRenderer:true}),input(renderer,{body:'b'.repeat(64)}),
    input(renderer,{buffer:{uri:'external.bin'}}),input(renderer,{image:{uri:'external.png'}})];
  const changed=input(renderer);
  changed.map.image=new Bitmap();cases.push(changed);
  for(const c of cases) {
    assert.notEqual(c.cache.get(c.map).source,original);
    c.cache.dispose();
  }
  trusted.cache.dispose();
});
