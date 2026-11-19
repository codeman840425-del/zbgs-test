import assert from 'node:assert/strict';
import test from 'node:test';
import {Cache} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {registerEmbeddedBitmapOwner} from './embedded-bitmap-owner.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class extends Event {};
const makeImage = () => ({closes:0, close() { this.closes++; }});
globalThis.createImageBitmap = async () => makeImage();

// Uses Three's real parser, URL creation, fetch, source cache and Texture clones.
const data = {
  asset:{version:'2.0'}, scenes:[{}], scene:0,
  buffers:[{uri:'data:application/octet-stream;base64,AAAA', byteLength:3}],
  bufferViews:[{buffer:0, byteLength:3}],
  images:[{bufferView:0, mimeType:'image/png'}, {uri:'data:image/png;base64,AAAA'}],
};
async function setup() {
  const loader = new GLTFLoader();
  const owner = registerEmbeddedBitmapOwner(loader);
  const {parser} = await loader.parseAsync(data, '');
  return {owner, parser};
}

test('only stock private embedded decodes belong to the document', async () => {
  const {owner,parser} = await setup();
  const embedded = await parser.loadImageSource(0,parser.textureLoader);
  const clone = await parser.loadImageSource(0,parser.textureLoader);
  const external = await parser.loadImageSource(1,parser.textureLoader);
  assert.notEqual(clone, embedded);
  assert.equal(clone.image, embedded.image);
  assert.equal(owner.transfer(external.image),false);
  owner.dispose();
  owner.dispose();
  assert.equal(embedded.image.closes,1);
  assert.equal(external.image.closes,0);

  const other = await setup();
  const borrowed = makeImage();
  await other.parser.loadImageSource(0,{isImageBitmapLoader:true, load:(_url,onLoad) => onLoad(borrowed)});
  other.owner.dispose();
  assert.equal(borrowed.closes,0);

  const overridden = await setup();
  overridden.parser.textureLoader.load = (_url,onLoad) => onLoad(borrowed);
  await overridden.parser.loadImageSource(0,overridden.parser.textureLoader);
  overridden.owner.dispose();
  assert.equal(borrowed.closes,0);
});

test('a cache-enabled decoder stays outside the document owner', async t => {
  const previous = Cache.enabled;
  t.after(() => { Cache.enabled = previous; Cache.clear(); });
  Cache.enabled = true;
  const {owner,parser} = await setup();
  const texture = await parser.loadImageSource(0,parser.textureLoader);
  owner.dispose();
  assert.equal(texture.image.closes,0);
});

test('on a rejected parse, a sibling texture completing after cleanup is closed once', async t => {
  const started = Promise.withResolvers(), resume = Promise.withResolvers();
  const image = makeImage();
  t.mock.method(globalThis,'createImageBitmap',() => { started.resolve(); return resume.promise; });
  const loader = new GLTFLoader();
  let pending;
  loader.register(parser => ({name:'RejectDuringDecode', async beforeRoot() {
    pending = parser.loadImageSource(0,parser.textureLoader);
    await started.promise;
    throw Error('reject while texture is decoding');
  }}));
  const owner = registerEmbeddedBitmapOwner(loader);
  await assert.rejects(loader.parseAsync(data,''), /reject while texture is decoding/);
  owner.dispose();
  resume.resolve(image);
  assert.equal((await pending).image,image);
  owner.dispose();
  assert.equal(image.closes,1);
});
