import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import * as THREE from 'three';
import { disposeAvatarScene } from './dispose-avatar-scene.js';

const jsonHook = registerHooks({load(url, context, next) {
  return next(url, url.endsWith('.json') ? {...context, importAttributes:{type:'json'}} : context);
}});
await import('../../scripts/headless-avatar-node.mjs');
const { prepareRecordedCharacter } = await import('./character-record-consumer.js');
jsonHook.deregister();

function watch(resources) {
  const counts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of counts.keys())
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  return counts;
}

test('dispose the library resource types once, including multiply referenced shader and skeleton textures', t => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BufferGeometry();
  const color = new THREE.Texture(), uniformOnly = new THREE.Texture(), borrowedArray = new THREE.Texture();
  const skeleton = new THREE.Skeleton([new THREE.Bone()]);
  const otherSkeleton = new THREE.Skeleton([new THREE.Bone()]);
  skeleton.computeBoneTexture();
  otherSkeleton.computeBoneTexture();
  const boneTexture = skeleton.boneTexture;
  const otherBoneTexture = otherSkeleton.boneTexture;
  skeleton.previousBoneTexture = boneTexture;
  otherSkeleton.previousBoneTexture = boneTexture;
  const shader = new THREE.ShaderMaterial({uniforms:{
    color:{value:color}, shade:{value:uniformOnly}, boneAlias:{value:boneTexture}, unowned:{value:[borrowedArray]},
  }});
  shader.map = color;
  const standard = new THREE.MeshStandardMaterial({map:color});
  const line = new THREE.LineBasicMaterial();
  const first = new THREE.SkinnedMesh(geometry, [shader,shader,standard]);
  const second = new THREE.SkinnedMesh(geometry, shader);
  const third = new THREE.SkinnedMesh(geometry, standard);
  first.bind(skeleton,new THREE.Matrix4());
  second.bind(skeleton,new THREE.Matrix4());
  third.bind(otherSkeleton,new THREE.Matrix4());
  second.visible = false;
  scene.add(first,second,third,new THREE.Line(geometry,line));
  const counts = watch([geometry,color,uniformOnly,borrowedArray,boneTexture,otherBoneTexture,shader,standard,line]);
  const skeletonRelease = t.mock.method(skeleton,'dispose');
  const otherRelease = t.mock.method(otherSkeleton,'dispose');
  disposeAvatarScene(scene);
  for (const [resource,count] of counts)
    assert.equal(count,resource===borrowedArray?0:1,resource.type);
  assert.equal(skeletonRelease.mock.callCount(),1);
  assert.equal(otherRelease.mock.callCount(),1);
  for (const item of [skeleton,otherSkeleton]) {
    assert.equal(item.boneTexture,null);
    assert.equal(item.previousBoneTexture,null);
  }
});

function renderedResources(avatar) {
  const materials = new Map(), geometries = new Set(), textures = new Set(), skeletons = new Set();
  avatar.vrm.scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of [object.material].flat()) {
      if (!material) continue;
      if (!materials.has(material)) materials.set(material,[]);
      materials.get(material).push(object.name);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      if (material.isShaderMaterial)
        for (const uniform of Object.values(material.uniforms ?? {})) if (uniform.value?.isTexture) textures.add(uniform.value);
    }
  });
  return {materials,geometries,textures,skeletons};
}

function watchActor({materials,geometries,textures}) {
  return watch([...materials.keys(),...geometries,...textures]);
}

test('real signed actors reproduce two and four skin references but release each owner only once', async t => {
  // Only browser bitmap decoding is substituted. The signed records, VRM,
  // outfit and real GLTFLoader/VRMLoaderPlugin are the production inputs.
  const decoded = [];
  t.mock.method(globalThis,'createImageBitmap',async blob => {
    const bytes = Buffer.from(await blob.slice(0,24).arrayBuffer());
    const png = bytes.length === 24 && bytes.readUInt32BE(0) === 0x89504e47;
    const image = {
      width:png ? bytes.readUInt32BE(16) : 1, height:png ? bytes.readUInt32BE(20) : 1,
      closes:0, close() { this.closes++; this.width = this.height = 0; },
    };
    decoded.push(image);
    return image;
  });
  const input = await readFile(new URL('../../evidence/m2-uniform-lite-operator-v1/records.json',import.meta.url));
  assert.equal(createHash('sha256').update(input).digest('hex'),
    'd38cd555d8b125c606ef28775b08fa96b2834c40c082e7ee06478dc4035f6989');
  const scene = new THREE.Scene(), renderer = {}, actors = [];
  try {
    const actorImages = [];
    for (const record of JSON.parse(input)) {
      const start = decoded.length;
      const actor = await prepareRecordedCharacter(record,{scene,renderer});
      actor.attach();
      actors.push(actor);
      actorImages.push(decoded.slice(start));
    }
    const [female,male] = actors;
    const originalMale = renderedResources(male.avatar);
    const originalFemale = renderedResources(female.avatar);
    const femaleCounts = watchActor(originalFemale);
    const maleCounts = watchActor(originalMale);
    for (const [name,referenceCount] of [['M00_000_00_Face_00_SKIN',2],['M00_001_01_Body_00_SKIN',4]]) {
      const [[material,meshes]] = [...originalMale.materials].filter(([item]) => item.name === name);
      assert(material.isShaderMaterial);
      assert.equal(meshes.length,referenceCount);
      assert.equal(maleCounts.get(material),0);
    }
    assert([...maleCounts.keys()].every(resource => !femaleCounts.has(resource)));
    assert([...originalMale.skeletons].every(skeleton => !originalFemale.skeletons.has(skeleton)));
    male.dispose();
    male.dispose();
    male.avatar.dispose();
    assert.equal(male.avatar.root.parent,null);
    assert.equal(female.avatar.root.parent,scene);
    assert.ok(actorImages.every(images => images.length > 0));
    assert.ok(actorImages[1].every(image => image.closes === 1));
    const peerTextures = [...originalFemale.textures].filter(texture => actorImages[0].includes(texture.image));
    assert.ok(peerTextures.length > 0);
    for (const texture of peerTextures) {
      texture.needsUpdate = true;
      assert.ok(texture.image.width > 0 && texture.image.height > 0);
    }
    for (const [resource,count] of maleCounts) assert.equal(count,1,resource.name || resource.type);
    for (const count of femaleCounts.values()) assert.equal(count,0);
    const before = female.motion.getMetrics().frame;
    female.update(1/60,{action:'idle'});
    assert(female.motion.getMetrics().frame>before);
    female.dispose();
    female.avatar.dispose();
    assert.ok(decoded.every(image => image.closes === 1));
    for (const [resource,count] of femaleCounts) assert.equal(count,1,resource.name || resource.type);
    assert.deepEqual(scene.children,[]);
  } finally {
    for (const actor of actors) actor.dispose();
  }
});
