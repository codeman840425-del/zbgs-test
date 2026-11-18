import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

// In an independent handoff, keep this editable file beside the source GLB under assets-source/.
const folder = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(process.argv[2] ?? path.join(folder,'../..'));
const three = path.join(sourceRoot,'prototype/node_modules/three');
const {BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial, Scene} =
  await import(pathToFileURL(path.join(three,'build/three.module.js')));
const {mergeGeometries} = await import(pathToFileURL(path.join(three,'examples/jsm/utils/BufferGeometryUtils.js')));
const {GLTFExporter} = await import(pathToFileURL(path.join(three,'examples/jsm/exporters/GLTFExporter.js')));
const {PNG}=createRequire(path.join(sourceRoot,'prototype/package.json'))('pngjs');
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.({target:this});}, error=>this.onerror?.(error));
  }
};
const scene = new Scene();
const ceramic = new MeshStandardMaterial({color:new Color('#c6a88e'),roughness:.78});
const green = new MeshStandardMaterial({color:new Color('#ffffff'),roughness:.9});
green.name = 'painted_leaf';
const box = (w,h,d,x,y,z) => new BoxGeometry(w,h,d).translate(x,y,z).toNonIndexed();
const pot = [box(.18,.058,.086,0,.029,0),box(.197,.009,.097,0,.059,0)];
for (const x of [-.07,-.05,-.03,-.01,.01,.03,.05,.07])
  for (const side of [-1,1]) pot.push(box(.006,.045,.004,x,.032,side*.043));
const tray = new Mesh(mergeGeometries(pot),ceramic);
tray.name = 'ceramic_trough';
scene.add(tray);

// A small grove of two fans. Each folded blade grows from the rim and has its own raised midrib.
const vertices = [], uv = [];
function triangle(a,b,c) {
  vertices.push(...a,...b,...c,...c,...b,...a);
  uv.push(0,0, .5,1, 1,0, 1,0, .5,1, 0,0);
}
const baseY = .062;
for (const [start,count,phase] of [[-.046,9,.2],[.046,7,.65]]) {
  for (let i=0;i<count;i++) {
    const angle=phase + i * 2.39996, reach=.029+(i%3)*.010, height=.074+(i%4)*.012;
    const dx=Math.cos(angle),dz=Math.sin(angle), half=.005+(i%2)*.002;
    const bottom=[start,baseY,0], tip=[start+dx*reach,baseY+height,dz*reach];
    const mid=[start+dx*reach*.32,baseY+height*.59,dz*reach*.32];
    const left=[mid[0]-dz*half,mid[1]-.008,mid[2]+dx*half], right=[mid[0]+dz*half,mid[1]-.008,mid[2]-dx*half];
    triangle(bottom,left,mid);triangle(bottom,mid,right);triangle(mid,left,tip);triangle(mid,tip,right);
  }
}
const leaves=new BufferGeometry();
leaves.setAttribute('position',new Float32BufferAttribute(vertices,3));
leaves.setAttribute('uv',new Float32BufferAttribute(uv,2));
leaves.computeVertexNormals();
const fans = new Mesh(leaves,green);fans.name='paired_leaf_fans';scene.add(fans);
const source=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true}));
const jsonEnd=20+source.readUInt32LE(12), binary=source.subarray(jsonEnd+8);
const gltf=JSON.parse(source.subarray(20,jsonEnd)), image=new PNG({width:64,height:64});
for(let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) {
  const index=4*(image.width*y+x), u=x/63, v=y/63;
  const vein=Math.abs(u-.5)<.065 || Math.abs((v+Math.abs(u-.5)*1.1)% .29-.14)<.025;
  const color=vein?[169,192,120]:[51+Math.round(35*v),91+Math.round(40*v),61];
  image.data.set([...color,255],index);
}
const png=PNG.sync.write(image);
const view=gltf.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:png.length})-1;
gltf.images=[{name:'herb-veins',bufferView:view,mimeType:'image/png'}];
gltf.textures=[{source:0}];
gltf.materials.find(m=>m.name==='painted_leaf').pbrMetallicRoughness.baseColorTexture={index:0};
const pad=(bytes,value)=>Buffer.concat([bytes,Buffer.alloc((4-bytes.length%4)%4,value)]);
const payload=Buffer.concat([binary,png]);gltf.buffers[0].byteLength=payload.length;
const j=pad(Buffer.from(JSON.stringify(gltf)),32),b=pad(payload,0);
const file=Buffer.alloc(28+j.length+b.length);
file.write('glTF');file.writeUInt32LE(2,4);file.writeUInt32LE(file.length,8);
file.writeUInt32LE(j.length,12);file.write('JSON',16);j.copy(file,20);
file.writeUInt32LE(b.length,20+j.length);file.writeUInt32LE(0x004e4942,24+j.length);b.copy(file,28+j.length);
await fs.writeFile(path.join(folder,'planter-with-leaf-print.glb'),file,{flag:'wx'});
