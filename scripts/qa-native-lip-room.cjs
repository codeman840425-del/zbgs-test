// node scripts/run-fixed-check.cjs DIST scripts/qa-native-lip-room.cjs BUILD_ID NEW_EVIDENCE_DIR
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('../prototype/node_modules/playwright');
const {PNG} = require('../prototype/node_modules/playwright-core/lib/utilsBundle.js');
const {recordSpeech} = require('./qa-native-surface-room.cjs');
const {collectNativeSurfaceRuntimeMaterials} = require('./native-surface-runtime-materials.cjs');

const root = path.resolve(__dirname, '..');
const pkg = 'native-facecontour-lip-package-v1';
const toneId = 'native-warm-v1', lipId = 'native-lip-101-v1';
const bodies = ['native-contour-roundness-a-v1', 'native-contour-cheek-b-v1'];
const json = async file => JSON.parse(await fs.readFile(file,'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2));
const readInputs = body => Promise.all([
  json(path.join(root, 'evidence/m2-native-batch-iris-room-v2',body,'green.json')),
  json(path.join(root, 'evidence/m2-native-skin-room-v1',body,'warm.json')),
]);
const restore = (page, record) => page.evaluate(r => __debug.restoreCharacterRecord(r), record);
const capture = (page, previous) => page.evaluate(r => __debug.captureCharacterRecord({previous:r,expectedRevision:r.revision}), previous);
const recordFields = ['appearanceRecipe','nativeHairCenter','liveAccessories','equipmentMaterials','resourceIdentities'];

function extractImage(vrm, materialName, expected) {
  const size = vrm.readUInt32LE(12), doc = JSON.parse(vrm.subarray(20,20+size));
  const materials = doc.materials.filter(m => materialName.test(m.name));
  assert.equal(materials.length,1);
  const material = materials[0];
  const base = material.pbrMetallicRoughness.baseColorTexture.index;
  assert.equal(material.extensions.VRMC_materials_mtoon.shadeMultiplyTexture.index,base);
  const view = doc.bufferViews[doc.images[doc.textures[base].source].bufferView];
  const start = 28 + size + (view.byteOffset ?? 0);
  const bytes = vrm.subarray(start,start+view.byteLength);
  assert.equal(hash(bytes),expected);
  return bytes;
}

// RGB on a partially transparent texel may be rounded by 2D Canvas premultiplication.
// Compare every alpha and every fully opaque RGB value to the pinned native PNG.
function pixelDigest(bytes) {
  const {data} = PNG.sync.read(bytes);
  for (let i=0; i<data.length; i+=4) if (data[i+3]!==255) data.fill(0,i,i+3);
  return hash(data);
}

async function expectedPixels(pair) {
  const load = f => fs.readFile(path.join(root, f));
  const original = await load('assets-source/native-parameter-batch-v2/contour-roundness-a/candidate.vrm');
  const result = {mouth:pixelDigest(extractImage(original,/_FaceMouth_/,pair.states.original.mouthPngSha256))};
  assert.equal(pair.states.original.mouthPngSha256, pair.states.warm.mouthPngSha256);
  for (const [tone, receipt] of Object.entries(pair.states)) {
    const covered = tone === 'original' ? original : await load('assets-source/native-facecontour-skin-tone-v1/generated/covered.vrm');
    const plain = extractImage(covered,/_Face_\d+_SKIN/,receipt.faceSource);
    const authored = await load('prototype/public/assets/'+pkg+'/images/'+receipt.faceOutput+'.png');
    assert.equal(hash(authored), receipt.faceOutput);
    result[tone] = {plain:pixelDigest(plain), lip:pixelDigest(authored)};
    assert.notEqual(result[tone].plain, result[tone].lip);
  }
  return result;
}

async function materialState(page, expectedFace, expectedMouth) {
  const sampled = await page.evaluate(collectNativeSurfaceRuntimeMaterials, {sampleBodyAlpha:true});
  const maps = sampled.materials.map(m=>({role:m.role,name:m.name,id:m.uuid,maps:m.maps}));
  for (const role of ['mouth','faceSkin','body','eyeline','iris','eyeWhite']) assert(maps.some(m=>m.role===role), role);
  const digests = await page.evaluate(async () => {
    const result = {face:[], mouth:[]}, byImage = new Map();
    for (const node of __debug.avatar().vrm.scene.getObjectsByProperty('isMesh',true)) {
      for (const material of [].concat(node.material)) {
        const role = /_FaceMouth_/.test(material.name) ? 'mouth' : /_Face_\d+_SKIN/.test(material.name) ? 'face' : null;
        if (!role) continue;
        for (const texture of [material.map,material.shadeMultiplyTexture]) {
          const image = texture.image;
          if (!byImage.has(image)) {
            const canvas=document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
            const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(image,0,0);
            const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
            for(let i=0;i<pixels.length;i+=4) if(pixels[i+3]!==255)pixels.fill(0,i,i+3);
            const digest=await crypto.subtle.digest('SHA-256',pixels);
            byImage.set(image,[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join(''));
          }
          result[role].push(byImage.get(image));
        }
      }
    }
    return result;
  });
  assert(digests.face.length && digests.face.every(d=>d===expectedFace),'Face base/shade differs from native image');
  assert(digests.mouth.length && digests.mouth.every(d=>d===expectedMouth),'Intraoral base/shade changed');
  return {maps, digests, visible:sampled.coverage.visibleEquipment, alpha:sampled.coverage.alphaPixels.alphaSha256};
}

function compareLipMaterials(plain, lip) {
  assert.deepEqual(lip.visible,plain.visible); assert.deepEqual(lip.alpha,plain.alpha);
  assert.equal(lip.maps.length,plain.maps.length);
  for(const before of plain.maps) {
    const after=lip.maps.find(m=>m.id===before.id);
    assert.ok(after,before.name);
    if(before.role==='faceSkin') {
      for(const key of ['map','shadeMultiplyTexture']) assert.notEqual(after.maps[key],before.maps[key]);
    } else assert.deepEqual(after.maps,before.maps,before.name);
  }
}

// Clip displayed face triangles in UV space, carrying posed world positions through
// each intersection. The authoring AABB includes the native pixel-filter footprint.
function renderLipFrame({open, bounds, plain}) {
  const debug=__debug, a=debug.avatar(), exp=a.vrm.expressionManager, camera=debug.cameraObject();
  exp.resetValues(); exp.setValue('aa',open ? 1 : 0); exp.update();
  a.root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const canvas=debug.renderer.domElement;
  const extent = [Infinity,Infinity,-Infinity,-Infinity];
  let triangles=0;
  function clip(poly,axis,limit,sign) {
    const out=[];
    for(let i=0;i<poly.length;i++) {
      const from=poly[i], to=poly[(i+1)%poly.length];
      const first=sign*(from[axis]-limit)>=0, second=sign*(to[axis]-limit)>=0;
      if(first) out.push(from);
      if(first!==second) {
        const k=(limit-from[axis])/(to[axis]-from[axis]);
        out.push({u:from.u+(to.u-from.u)*k,v:from.v+(to.v-from.v)*k,p:from.p.clone().lerp(to.p,k)});
      }
    }
    return out;
  }
  a.root.traverseVisible(mesh=>{
    if(!mesh.isSkinnedMesh) return;
    const geo=mesh.geometry, mats=[].concat(mesh.material), uv=geo.attributes.uv;
    const ranges=Array.isArray(mesh.material) ? geo.groups : [{start:0,count:geo.index?.count??uv.count,materialIndex:0}];
    for(const range of ranges) {
      const mat=mats[range.materialIndex];
      if(!mat?.visible || mat.isOutline || !/_Face_\d+_SKIN/.test(mat.name)) continue;
      const w=mat.map.image.width,h=mat.map.image.height;
      const box=[(bounds[0]-1)/w,(bounds[1]-1)/h,(bounds[2]+2)/w,(bounds[3]+2)/h];
      for(let i=range.start;i<range.start+range.count;i+=3) {
        const vertices=[0,1,2].map(k=>geo.index ? geo.index.getX(i+k) : i+k)
          .map(id=>({id,u:uv.getX(id),v:uv.getY(id)}));
        if(vertices.every(v=>v.u<box[0])||vertices.every(v=>v.u>box[2])||
           vertices.every(v=>v.v<box[1])||vertices.every(v=>v.v>box[3])) continue;
        for(const v of vertices) v.p=mesh.getVertexPosition(v.id,mesh.position.clone()).applyMatrix4(mesh.matrixWorld);
        let poly=clip(vertices,'u',box[0],1);
        poly=clip(poly,'u',box[2],-1); poly=clip(poly,'v',box[1],1); poly=clip(poly,'v',box[3],-1);
        if(poly.length<3)continue;
        triangles++;
        for(const v of poly) {
          const p=v.p.project(camera),x=(1+p.x)*canvas.width/2,y=(1-p.y)*canvas.height/2;
          extent[0]=Math.min(extent[0],x);extent[1]=Math.min(extent[1],y);
          extent[2]=Math.max(extent[2],x);extent[3]=Math.max(extent[3],y);
        }
      }
    }
  });
  if(!triangles || extent.some(n=>!Number.isFinite(n)) || extent[0]<0 || extent[1]<0 ||
     extent[2]>=canvas.width || extent[3]>=canvas.height) throw Error('Posed lip UV footprint is missing or offscreen: '+JSON.stringify(extent));
  const render=()=>{debug.renderer.render(debug.scene,camera);return canvas.toDataURL('image/png').split(',')[1];};
  const data=render();
  let withoutMouth;
  if(plain) {
    const mouth=new Set();
    a.root.traverseVisible(node=>{if(node.isMesh) for(const m of [].concat(node.material))
      if(m.visible&&/_FaceMouth_/.test(m.name))mouth.add(m);});
    if(!mouth.size)throw Error('Intraoral material absent from actor');
    try {for(const m of mouth)m.visible=false;withoutMouth=render();}
    finally {for(const m of mouth)m.visible=true;debug.renderer.render(debug.scene,camera);}
  }
  return {data,withoutMouth,extent,triangles,aa:exp.getValue('aa'),
    camera:[...camera.matrixWorld.elements,...camera.projectionMatrix.elements]};
}

function diffFrames(plain, lip, directory) {
  assert.deepEqual(lip.camera,plain.camera); assert.deepEqual(lip.extent,plain.extent);
  assert.equal(lip.aa,plain.aa);
  const a=PNG.sync.read(plain.bytes),b=PNG.sync.read(lip.bytes);
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  const [x0,y0,x1,y1]=plain.extent, hidden=PNG.sync.read(plain.withoutMouth);
  const mouth=new Uint8Array(a.width*a.height);
  // Keep projected intraoral pixels after removing the one-pixel antialiasing rim.
  // The authored FaceMouth surface contains the teeth as well as the oral cavity.
  for(let p=0;p<mouth.length;p++) {
    const i=4*p;
    mouth[p]=Number(Math.abs(a.data[i]-hidden.data[i])+Math.abs(a.data[i+1]-hidden.data[i+1])+
                    Math.abs(a.data[i+2]-hidden.data[i+2])>3);
  }
  let changed=0,outside=0,peak=0,intraoralPixels=0,intraoralChanged=0;
  for(let i=0;i<a.data.length;i+=4) {
    const p=i/4, delta=Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),
      Math.abs(a.data[i+2]-b.data[i+2]));
    if(mouth[p] && [-1,0,1].every(y=>[-1,0,1].every(x=>mouth[p+y*a.width+x]))) {
      intraoralPixels++;if(delta)intraoralChanged++;
    }
    if(!delta)continue;
    const x=(i/4)%a.width,y=Math.floor(i/(4*a.width));
    if(x<x0-3 || x>x1+3 || y<y0-3 || y>y1+3) outside++; else changed++;
    peak=Math.max(peak,delta);
  }
  return {directory,plain:plain.file,lip:lip.file,width:a.width,height:a.height,poseAA:plain.aa,
    projectedLipBounds:plain.extent,triangles:plain.triangles,changedInLipRegion:changed,changedOutsideLipRegion:outside,
    visibleIntraoralInteriorPixels:intraoralPixels,changedIntraoralInteriorPixels:intraoralChanged,maxRgbDelta:peak};
}

async function select(page,field,value) {
  const id=field==='skinTone'?'#appearance-skin-tone':'#appearance-lip-color';
  await page.locator(id).selectOption(value);
  await page.waitForFunction(({field,value})=>__debug.avatar().appearance.getState()[field]===value,{field,value});
}

async function run(base,build,out) {
  const pair = await json(path.join(root,'assets-source/native-facecontour-lip-author-v1/pair-readback.json'));
  const expected = await expectedPixels(pair);
  const report={build,status:'incomplete',expected,errors:[],cases:[]};
  await fs.mkdir(out);
  await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    report.browser=browser.version();
    for(const body of bodies) {
      const [green,warm]=await readInputs(body),folder=path.join(out,body);
      const row={body,inputs:[green,warm].map(r=>r.integrity.recordSha256),states:{},frames:[],pairs:[]};
      report.cases.push(row);await fs.mkdir(folder);
      const url=new URL(base);url.search=new URLSearchParams({workbench:'appearance',body,view:'inspect-face-front'});
      async function openPage() {
        const page=await browser.newPage({viewport:{width:1440,height:960}});
        page.on('pageerror',e=>report.errors.push(e.message));
        await page.goto(url.href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
        assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build);return page;
      }
      let page=await openPage();
      try {
        assert.equal(green.identity.id,warm.identity.id);
        assert.equal((await restore(page,green)).applied,true);
        await page.evaluate(()=>__debug.camera('inspect-face-front'));await page.waitForTimeout(650);
        await page.evaluate(()=>{__debug.setPaused(true); const c=__debug.cameraObject();c.fov=18;c.updateProjectionMatrix();});
        async function inspect(tone,kind) {
          const name=tone+'-'+kind;
          row.states[name]=await materialState(page,expected[tone][kind],expected.mouth);
          const frames=[];
          for(const open of [false,true]) {
            const file=name+(open?'-open':'-closed')+'.png';
            const {data,withoutMouth,...frame}=await page.evaluate(renderLipFrame,{open,bounds:pair.states[tone].rgbBoundsInclusive,plain:kind==='plain'});
            const bytes=Buffer.from(data,'base64');
            await fs.writeFile(path.join(folder,file),bytes);
            const hidden=withoutMouth&&Buffer.from(withoutMouth,'base64');
            if(hidden)await fs.writeFile(path.join(folder,file.replace('.png','-intraoral-hidden.png')),hidden);
            frames.push({...frame,file,bytes,withoutMouth:hidden});row.frames.push({...frame,file,sha256:hash(bytes)});
          }
          assert.notDeepEqual(frames[0].extent,frames[1].extent,'aa did not move the displayed lip region');
          return frames;
        }
        const originalPlain=await inspect('original','plain');
        await select(page,'lipColor',lipId);
        const originalLip=await inspect('original','lip');
        const authoredOriginal=await capture(page,green);
        await save(path.join(folder,'original-lip.json'),authoredOriginal);
        await select(page,'skinTone',toneId);
        assert.equal(await page.evaluate(()=>__debug.avatar().appearance.getState().lipColor),lipId);
        const warmLip=await inspect('warm','lip');
        const authoredWarm=await capture(page,warm);
        await save(path.join(folder,'warm-lip.json'),authoredWarm);
        for(const [record,tone] of [[authoredOriginal,'original'],[authoredWarm,toneId]]) {
          assert.equal(record.appearanceRecipe.schema,'workbench-appearance-recipe-v11');
          assert.match(record.appearanceRecipe.lipColorManifestSha256,/^[a-f0-9]{64}$/);
          assert.equal(record.appearanceRecipe.appearance.lipColor,lipId);
          assert.equal(record.appearanceRecipe.appearance.skinTone,tone);
          assert.equal(record.appearanceRecipe.appearance.eyeColor,'green');
        }
        await select(page,'lipColor','original');
        const warmPlain=await inspect('warm','plain');
        for(const [tone,plain,lip] of [['original',originalPlain,originalLip],['warm',warmPlain,warmLip]]) {
          compareLipMaterials(row.states[tone+'-plain'],row.states[tone+'-lip']);
          for(let i=0;i<2;i++) {
            const diff=diffFrames(plain[i],lip[i],body);row.pairs.push(diff);
            assert.ok(diff.changedInLipRegion>0 && diff.changedOutsideLipRegion===0,JSON.stringify(diff));
            assert.equal(diff.changedIntraoralInteriorPixels,0,JSON.stringify(diff));
            if(i===1)assert.ok(diff.visibleIntraoralInteriorPixels>0,'Open mouth exposed no measurable interior');
          }
        }
        const undone=await capture(page,warm);
        for(const key of recordFields)assert.deepEqual(undone[key],warm[key],key+' after removing lip');
        await select(page,'skinTone','original');
        assert.deepEqual((await materialState(page,expected.original.plain,expected.mouth)).maps,row.states['original-plain'].maps);
        await page.close();page=await openPage();
        assert.equal((await restore(page,authoredOriginal)).applied,true);
        const owner=await page.evaluate(()=>__debug.avatar().root.uuid);
        const match='**/'+pkg+'/images/'+pair.states.warm.faceOutput+'.png';
        let hits=0;await page.route(match,r=>{hits++;return r.fulfill({status:503});});
        const previousMaps=await materialState(page,expected.original.lip,expected.mouth);
        await page.locator('#appearance-skin-tone').selectOption(toneId);
        await page.waitForFunction(()=>document.querySelector('#appearance-status')?.dataset.error==='true');
        assert.ok(hits,'User-path skin change did not request the warm lip image');
        const failedSwitchHits=hits;
        assert.deepEqual((await materialState(page,expected.original.lip,expected.mouth)).maps,previousMaps.maps);
        const previousLook=await capture(page,authoredOriginal);
        for(const key of recordFields)assert.deepEqual(previousLook[key],authoredOriginal[key],key+' after a failed skin switch');
        const failure=await restore(page,authoredWarm).catch(e=>({applied:false,reason:e.message}));
        assert.equal(failure.applied,false);assert.ok(hits>failedSwitchHits);
        assert.equal(await page.evaluate(()=>__debug.avatar().root.uuid),owner);
        const retained=await capture(page,authoredOriginal);
        for(const key of recordFields)assert.deepEqual(retained[key],authoredOriginal[key],key+' after failed restore');
        await page.unroute(match);
        for(const [record,tone] of [[authoredOriginal,'original'],[authoredWarm,'warm']]) {
          await page.close();page=await openPage();
          assert.equal((await restore(page,record)).applied,true);
          const recovered=await capture(page,record);
          for(const key of recordFields)assert.deepEqual(recovered[key],record[key],key+' after close/reopen');
          await materialState(page,expected[tone].lip,expected.mouth);
        }
        row.fault={hits,failedSwitchHits,failure,ownerRetained:true};
        row.video='warm-lip-speech-1x.webm';await recordSpeech(page,path.join(folder,row.video));
        row.videoBytes=(await fs.stat(path.join(folder,row.video))).size;assert(row.videoBytes>0);
      } finally {await page.close();}
    }
    assert.deepEqual(report.errors,[]);report.status='technical-pass';
  } catch(error){report.status='failed';report.error=error.stack;throw error;}
  finally{await browser.close();await save(path.join(out,'report.json'),report);}
}

async function preflight() {
  const expected=await expectedPixels(await json(path.join(root,'assets-source/native-facecontour-lip-author-v1/pair-readback.json')));
  for(const body of bodies) {
    const [green,warm]=await readInputs(body);
    assert.equal(green.appearanceRecipe.base.bodyType,body);assert.equal(warm.appearanceRecipe.base.bodyType,body);
    assert.equal(green.identity.id,warm.identity.id);
  }
  console.log(JSON.stringify({cpuOnly:true,bodies,expected}));
}
(process.argv[2]==='--preflight'?preflight():run(...process.argv.slice(2))).catch(e=>{console.error(e);process.exitCode=1;});
