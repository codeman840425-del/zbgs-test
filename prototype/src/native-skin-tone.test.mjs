import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {MToonMaterial} from '@pixiv/three-vrm';
import {BODY_TEXTURE_COVERAGE_ADMISSIONS} from './body-texture-coverage-admissions.js';
import {createBodyTextureCoverage} from './body-texture-coverage.js';
import {createNativeSkinTone} from './native-skin-tone.js';

const digest = data => createHash('sha256').update(data).digest('hex');
const toneId = 'native-warm-v1';
const bodyFolder = '/assets/native-contour-roundness-a-v1/';
const skinFolder = '/assets/native-skin-tone-package-v1/fixture/';
const faceName = 'N00_000_00_Face_00_SKIN (Instance)';
const eyelineName = 'N00_000_00_FaceEyeline_00_FACE (Instance)';

function skinMaterial(name, side, width, height, transparent = false) {
  const map = new THREE.Texture({width, height, alpha:255});
  map.flipY = false; map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.minFilter = THREE.LinearFilter; map.generateMipmaps = false;
  return new MToonMaterial({name, side, map, shadeMultiplyTexture:map.clone(), transparent, alphaTest:transparent ? 0 : 0.5});
}

test('native face and body maps compose with the existing coverage owner and roll back together', async t => {
  const manifestPath = bodyFolder + 'manifest.json';
  const coverageBytes = await readFile(new URL('../public' + manifestPath, import.meta.url));
  const baseline = JSON.parse(coverageBytes);
  const coverage = BODY_TEXTURE_COVERAGE_ADMISSIONS.find(row => row.avatarSha256 === baseline.avatarSha256);
  const face = skinMaterial(faceName, THREE.DoubleSide, 1024, 1024);
  const body = skinMaterial(baseline.materialName, THREE.FrontSide, 2048, 2048);
  const eyeline = skinMaterial(eyelineName, THREE.DoubleSide, 1024, 256, true);
  const eyeWhite = skinMaterial('N00_000_00_EyeWhite_00_EYE (Instance)', THREE.FrontSide, 1024, 1024);
  const faceSource = face.map, eyelineSource = eyeline.map, bodySource = body.map, whiteSource = eyeWhite.map;
  const vrm = {scene:new THREE.Group()};
  for (const material of [face, body, eyeline, eyeWhite]) vrm.scene.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  const data = new Map([['face.png', Buffer.from('face')], ['eyeline.png', Buffer.from('eyeline')], ['body.png', Buffer.from('body')],
    ['body-covered.png', Buffer.from('covered body')]]);
  const pin = url => ({url, sha256:digest(data.get(url))});
  const manifest = Buffer.from(JSON.stringify({
    schema:'native-skin-tone-package-v1', version:1, avatarSha256:coverage.avatarSha256,
    coverageManifestSha256:coverage.manifestSha256, toneId,
    face:{materialName:faceName, width:1024, height:1024, sourceSha256:'a'.repeat(64), alphaMode:'MASK', alphaCutoff:0.5, authored:pin('face.png')},
    eyeline:{materialName:eyelineName, width:1024, height:256, sourceSha256:'b'.repeat(64), alphaMode:'BLEND', alphaCutoff:null, authored:pin('eyeline.png')},
    body:{materialName:baseline.materialName, width:2048, height:2048, sourceSha256:coverage.basePngSha256,
      alphaMode:'MASK', alphaCutoff:0.5, coveredSourceSha256:coverage.maskedPngSha256,
      authored:pin('body.png'), coveredAuthored:pin('body-covered.png')},
  }));
  const contract = {url:skinFolder + 'manifest.json', sha256:digest(manifest), coverage, bodySha256:coverage.avatarSha256,
    colors:{original:null, [toneId]:'#f3c3ad'}};
  let corrupted = false, badAlpha = false, closed = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    if (path === contract.url) return new Response(manifest);
    if (path.startsWith(skinFolder)) {
      const file = path.slice(skinFolder.length);
      return new Response(corrupted && file === 'body-covered.png' ? 'changed' : data.get(file));
    }
    return new Response(await readFile(new URL('../public' + path, import.meta.url)));
  });
  const oldBitmap = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async blob => {
    const tag = Buffer.from(await blob.arrayBuffer()).toString();
    const width = tag === 'face' || tag === 'eyeline' ? 1024 : 2048;
    const alpha = tag === 'covered body' ? (badAlpha ? 255 : 0) : ['face','eyeline','body'].includes(tag) ? 255 : 0;
    return {width, height:tag === 'eyeline' ? 256 : width, tag, alpha, close(){closed++;}};
  };
  const oldDocument = globalThis.document;
  globalThis.document = {createElement() {
    let image;
    return {getContext:() => ({drawImage(source){image = source;}, getImageData:() => ({data:new Uint8Array([0,0,0,image.alpha])})})};
  }};
  t.after(() => {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = oldBitmap;
  });

  const owner = await createBodyTextureCoverage({body:[vrm.scene.children[1]], avatarSha256:coverage.avatarSha256,
    entries:baseline.equipment, descriptor:{url:manifestPath,sha256:coverage.manifestSha256}});
  const skin = createNativeSkinTone({vrm,coverage:owner,contract});
  t.after(() => {skin.dispose();owner.dispose();});
  const outfit = owner.prepareEquipmentSet(baseline.equipment.map(item => item.id));
  outfit.commit(); outfit.dispose();
  const originalCovered = body.map;

  corrupted = true;
  await assert.rejects(skin.prepareUpdate(toneId), /资源字节身份不匹配/);
  corrupted = false; badAlpha = true;
  await assert.rejects(skin.prepareUpdate(toneId), /透明度与原遮罩不一致/);
  badAlpha = false;
  assert.equal(face.map, faceSource);
  assert.equal(eyeline.map, eyelineSource);
  assert.equal(body.map, originalCovered);
  assert.equal(closed, 5);
  assert.equal(skin.getState().textureCount, 0);

  const stageSkin = await skin.prepareUpdate(toneId);
  const stageBase = owner.prepareEquipmentSet([]);
  assert.equal(stageSkin.isCurrent(), true);
  stageSkin.commit();
  assert.equal(face.map.image.tag, 'face');
  assert.equal(eyeline.map.image.tag, 'eyeline');
  assert.equal(body.map.image.tag, 'covered body');
  assert.equal(stageBase.isCurrent(), true);
  stageBase.commit();
  assert.equal(body.map.image.tag, 'body');
  assert.equal(body.shadeMultiplyTexture.image.tag, 'body');
  assert.equal(eyeWhite.map, whiteSource);
  stageBase.rollback(); stageSkin.rollback();
  stageBase.dispose(); stageSkin.dispose();
  assert.equal(face.map, faceSource);
  assert.equal(eyeline.map, eyelineSource);
  assert.equal(body.map, originalCovered);

  const failing = await skin.prepareUpdate(toneId);
  const originalUpdate = body.update;
  body.update = () => { throw Error('inject live Body update failure'); };
  assert.throws(() => failing.commit(), /inject live Body update failure/);
  body.update = originalUpdate; failing.dispose();
  assert.equal(face.map, faceSource);
  assert.equal(eyeline.map, eyelineSource);
  assert.equal(body.map, originalCovered);
  const applied = await skin.prepareUpdate(toneId);
  applied.commit(); applied.dispose();
  const reset = await skin.prepareUpdate('original');
  reset.commit(); reset.dispose();
  assert.equal(face.map, faceSource);
  assert.equal(eyeline.map, eyelineSource);
  assert.equal(body.map, originalCovered);
  skin.dispose(); owner.dispose();
  assert.equal(body.map, bodySource);
  assert.equal(closed, 10);
});
