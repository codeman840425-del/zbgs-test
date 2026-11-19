import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';

const root=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const sourceDir='assets-source/company-public-washbasin-v1', family='public-washbasin-v1';
const generator='scripts/company-platform/build-public-washbasins.mjs';
const branches='assets-source/company-environment-specs-v1/branches.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const round=x=>Number(x.toFixed(7));
const coords=point=>point.toArray().map(round);

async function safe(owner,relative) {
  const parts=relative.split('/');
  assert(parts.every(p=>/^[\w-][\w.-]*$/.test(p) && !p.endsWith('.') &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)),'Invalid project path: '+relative);
  let dest=owner;
  for(const part of parts) {
    dest=path.join(dest,part);
    const stat=await fs.lstat(dest).catch(e=>{if(e.code!=='ENOENT')throw e;});
    if(stat)assert(!stat.isSymbolicLink() && await fs.realpath(dest)===dest,'Linked path: '+dest);
  }
  return dest;
}
const read=async relative=>fs.readFile(await safe(root,relative));
const pin=async relative=>({path:relative,sha256:sha(await read(relative))});
function unpack(bytes) {
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const end=20+bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(end+4),0x004e4942);
  return {g:JSON.parse(bytes.subarray(20,end)),bin:bytes.subarray(end+8)};
}
function pack(g,bin) {
  const body=Buffer.from(JSON.stringify(g)),size=Math.ceil(body.length/4)*4,header=Buffer.alloc(20),tail=Buffer.alloc(8);
  [0x46546c67,2,28+size+bin.length,size,0x4e4f534a].forEach((n,i)=>header.writeUInt32LE(n,4*i));
  tail.writeUInt32LE(bin.length);tail.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,body,Buffer.alloc(size-body.length,32),tail,bin]);
}
async function load(bytes) {
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  scene.updateMatrixWorld(true);return scene;
}
const bounds=mesh=>new T.Box3().setFromObject(mesh,true);
const kinds=['frame-round','cabinet-square','pier-round','shelf-square'];
const counterY=.788, fitScale=1.4;
function validate(d) {
  assert.deepEqual(Object.keys(d).sort(),['kind','id','version','displayName','slabThickness','frameColor','counterColor','trimColor'].sort());
  assert(kinds.includes(d.kind) && /^public-washbasin-[a-z][a-z0-9-]{0,48}$/.test(d.id));
  assert(Number.isSafeInteger(d.version) && d.version>=1 && typeof d.displayName==='string' && d.displayName.trim());
  assert(Number.isFinite(d.slabThickness) && d.slabThickness>=.024 && d.slabThickness<=.044,'Slab thickness must be 24–44 mm');
  assert([d.frameColor,d.counterColor,d.trimColor].every(c=>/^#[\da-f]{6}$/i.test(c)),'Expected six-digit sRGB finishes');
}
function convexOutline(points) {
  const sorted=[...new Map(points.map(p=>[p.map(round).join('/'),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function side(seq) {
    const chain=[];
    for(const p of seq){while(chain.length>=2 && cross(chain.at(-2),chain.at(-1),p)<=1e-10)chain.pop();chain.push(p);}
    return chain.slice(0,-1);
  }
  const hull=side(sorted).concat(side(sorted.reverse()));
  assert(hull.length>=4);return hull;
}
function sectionOutline(geometry,y) {
  const pos=geometry.attributes.position,points=[];
  for(let i=0;i<pos.count;i+=3) {
    const tri=[0,1,2].map(k=>v().fromBufferAttribute(pos,i+k));
    for(let j=0;j<3;j++){
      const a=tri[j],b=tri[(j+1)%3];
      if((a.y-y)*(b.y-y)<0) {
        const p=a.clone().lerp(b,(y-a.y)/(b.y-a.y));points.push([p.x,p.z]);
      }
    }
  }
  return convexOutline(points);
}
function shapeOf(outline) {
  const s=new T.Shape();
  outline.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));
  s.closePath();return s;
}
function slab(outline,hole,thickness,topY) {
  const shape=shapeOf(outline);
  if(hole)shape.holes.push(shapeOf(hole.slice().reverse()));
  return new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:1}).rotateX(-Math.PI/2).translate(0,topY-thickness,0);
}
function clipped(w,d,corner,rear=corner) {
  return [[-w+rear,-d],[w-rear,-d],[w,-d+rear],[w,d-corner],[w-corner,d],[-w+corner,d],[-w,d-corner],[-w,-d+rear]];
}
function build(d,bytes) {
  const {g:original,bin}=unpack(bytes);
  const g={asset:{version:'2.0',generator:'company-public-washbasin-v1'},scene:0,scenes:[{nodes:[0]}],
    nodes:[{name:d.id,children:[]}],meshes:[],materials:structuredClone(original.materials),buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
  const children=g.nodes[0].children,chunks=[];
  const color=(name,hex,metal,rough)=>g.materials.push({name:'wash-'+name,pbrMetallicRoughness:{baseColorFactor:[...new T.Color(hex).toArray(),1],metallicFactor:metal,roughnessFactor:rough}})-1;
  const frame=color('frame',d.frameColor,d.kind==='frame-round'?.52:.08,.55),counter=color('counter',d.counterColor,.1,.35),trim=color('trim',d.trimColor,.34,.55);
  function mesh(name,geo,material) {
    if(geo.index)geo=geo.toNonIndexed();
    geo.computeBoundingBox();
    const attributes={};
    for(const [attr,key] of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]) {
      const a=geo.getAttribute(key);if(!a)continue;
      const data=Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength);
      const view=g.bufferViews.push({buffer:0,byteOffset:g.buffers[0].byteLength,byteLength:data.length,target:34962})-1;
      chunks.push(data);g.buffers[0].byteLength+=data.length;
      attributes[attr]=g.accessors.push({bufferView:view,componentType:5126,count:a.count,type:a.itemSize===2?'VEC2':'VEC3',
        ...(key==='position'?{min:geo.boundingBox.min.toArray(),max:geo.boundingBox.max.toArray()}:{})})-1;
    }
    const index=g.meshes.push({name,primitives:[{attributes,material}]})-1;
    children.push(g.nodes.push({name,mesh:index})-1);
    return geo;
  }
  function box(name,x,y,z,w,h,depth,mat=frame) {
    return mesh(name,new T.BoxGeometry(w,h,depth).translate(x,y,z),mat);
  }
  function post(name,x,z,r,h,mat=frame) {
    return mesh(name,new T.CylinderGeometry(r,r,h,20).translate(x,h/2,z),mat);
  }
  function donor(primitive) {
    const geom=new T.BufferGeometry(),ix=original.accessors[primitive.indices],iv=original.bufferViews[ix.bufferView];
    assert([5123,5125].includes(ix.componentType));
    const width=ix.componentType===5123?2:4;
    const indices=Array.from({length:ix.count},(_,i)=>bin.readUIntLE((iv.byteOffset??0)+(ix.byteOffset??0)+width*i,width));
    for(const [attr,key] of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]) {
      if(primitive.attributes[attr]===undefined)continue;
      const a=original.accessors[primitive.attributes[attr]],view=original.bufferViews[a.bufferView];
      const count=a.type==='VEC3'?3:2,offset=(a.byteOffset??0)+(view.byteOffset??0),arr=new Float32Array(indices.length*count);
      assert.equal(a.componentType,5126);
      for(const [k,id] of indices.entries())for(let j=0;j<count;j++)arr[k*count+j]=bin.readFloatLE(offset+id*(view.byteStride??4*count)+4*j);
      geom.setAttribute(key,new T.BufferAttribute(arr,count));
    }
    return geom;
  }
  const prims=original.meshes[0].primitives;
  const roundBowl=d.kind.endsWith('-round'),names=roundBowl?['basin-bowl','basin-faucet','faucet-inset']:['basin-bowl','basin-drain','basin-faucet'];
  const parts=prims.map(donor);
  const b=new T.Box3();
  for(const part of parts){part.computeBoundingBox();b.union(part.boundingBox);}
  const center=b.getCenter(v()),offset=v(-center.x*fitScale,.9-b.max.y*fitScale,-.02-center.z*fitScale);
  for(const [i,part] of parts.entries())mesh(names[i],part.scale(fitScale,fitScale,fitScale).translate(...offset.toArray()),prims[i].material);
  const bowl=parts[0],outline=sectionOutline(bowl,counterY),inset=.001;
  // The slab bears on the outside of the ceramic wall. Its through-cut follows the actual section at slab height.
  const avg=outline.reduce((s,p)=>[s[0]+p[0]/outline.length,s[1]+p[1]/outline.length],[0,0]);
  const hole=outline.map(p=>{const rel=new T.Vector2(p[0]-avg[0],p[1]-avg[1]);rel.multiplyScalar((rel.length()-inset)/rel.length());return [avg[0]+rel.x,avg[1]+rel.y];});
  const corners={'frame-round':.019,'cabinet-square':.008,'pier-round':.070,'shelf-square':.035};
  mesh('wash-countertop',slab(clipped(.60,.30,corners[d.kind]),hole,d.slabThickness,counterY),counter);
  const low=bowl.boundingBox.min.y;
  const baseOutline=sectionOutline(bowl,low+.001),footBox=new T.Box2().setFromPoints(baseOutline.map(p=>new T.Vector2(...p)));
  const footCenter=footBox.getCenter(new T.Vector2()),footSize=footBox.getSize(new T.Vector2());
  const flange=baseOutline.map(([x,z])=>[footCenter.x+(x-footCenter.x)*(1+.025/footSize.x),footCenter.y+(z-footCenter.y)*(1+.025/footSize.y)]);
  mesh('pedestal-foot',slab(flange,null,low+.001,low+.001),frame);
  const top=counterY-d.slabThickness;
  const seats=[];
  function panel(name,x,z,w,depth,height=top) {
    box(name,x,height/2,z,w,height,depth);seats.push({name,x,z,top:height});
  }
  if(d.kind==='frame-round') {
    for(const [lr,x] of [['left',-.52],['right',.52]])for(const [side,z] of [['front',.22],['rear',-.22]]){
      const name=lr+'-'+side+'-tube';post(name,x,z,.024,top);seats.push({name,x,z,top});
    }
    for(const [side,z] of [['front',.22],['rear',-.245]])box(side+'-box-rail',0,top-.025,z,1.055,.047,.036);
    for(const x of [-.52,.52])box((x<0?'left':'right')+'-lower-tie',x,.17,0,.034,.035,.44,trim);
    box('rear-footrest',0,.17,-.24,1.04,.035,.024,trim);
  } else if(d.kind==='cabinet-square'){
    const w=.55,depth=.49;
    for(const x of [-.54,.54])box((x<0?'left':'right')+'-plinth-foot',x,.045,-.012,.085,.09,.44);
    for(const z of [-.258,.19])box((z<0?'rear':'front')+'-plinth-rail',0,.045,z,1.08,.09,.022);
    for(const [side,x] of [['left',-w],['right',w]]){
      box(side+'-cabinet-wall',x,(.085+top)/2,-.008,.035,top-.085,depth);
      seats.push({name:side+'-cabinet-wall',x,z:0,top});
    }
    for(const z of [-.253,.198])box((z<0?'rear':'front')+'-lower-carcass-rail',0,.106,z,1.105,.042,.045);
    box('carcass-back',0,(.105+top)/2,-.252,1.103,top-.105,.025);
    for(const x of [-.272,.272]){
      const side=x<0?'left':'right';
      box(side+'-fluted-front',x,.414,.24,.534,.57,.022,frame);
      for(let k=0;k<11;k++)box(side+'-flute-'+k,x+(k-5)*.046,.414,.257,.019,.565,.012,trim);
    }
    box('cabinet-pull-reveal',0,top-.043,.226,1.08,.065,.028,trim);
  } else if(d.kind==='pier-round'){
    for(const [side,x] of [['left',-.435],['right',.435]]){
      const outline=clipped(.077,.236,.034).map(([px,pz])=>[x+px,pz-.029]);
      const name=side+'-stone-pier';mesh(name,slab(outline,null,top,top),frame);seats.push({name,x,z:0,top});
    }
    box('low-stone-stretcher',0,.192,-.250,.88,.085,.040,trim);
    box('rear-stone-apron',0,top-.043,-.253,.91,.086,.045,frame);
  } else {
    for(const [name,x,w] of [['left-cupboard-wall',-.53,.032],['central-cupboard-wall',-.335,.032],['right-shelf-end',.53,.045]])panel(name,x,-.005,w,.49);
    box('tall-cupboard-front',-.4325,.385,.243,.193,.70,.021,trim);
    box('cupboard-base',-.4325,.039,-.002,.194,.078,.475);
    box('inner-shelf-upright',.250,.234,-.04,.025,.468,.35);
    box('shelf-low',.390,.225,-.025,.30,.029,.411,trim);
    box('shelf-middle',.390,.46,-.025,.30,.029,.411,trim);
    box('rear-towel-rail',.098,top-.074,-.248,.87,.030,.024,trim);
  }
  return {model:pack(g,Buffer.concat(chunks)),seats,sourceTransform:{uniformScale:fitScale,translation:offset.toArray()},hole,slabTop:counterY};
}

function physicalMesh(mesh) {
  const a=mesh.geometry.attributes.position,index=mesh.geometry.index;
  const vertex=i=>mesh.localToWorld(v().fromBufferAttribute(a,index?index.getX(i):i));
  const faces=[];
  for(let i=0;i<(index?.count??a.count);i+=3) {
    const tri=new T.Triangle(vertex(i),vertex(i+1),vertex(i+2));
    if(tri.getArea()>1e-12)faces.push({tri,box:new T.Box3().setFromPoints([tri.a,tri.b,tri.c])});
  }
  return {obj:mesh,faces,box:bounds(mesh)};
}
function join(a,b) {
  const eps=.00025,broader=a.box.clone().expandByScalar(eps);
  if(!broader.intersectsBox(b.box))return null;
  const ray=new T.Ray(),h=v(),nearest=v();
  for(const fa of a.faces){
    const box=fa.box.clone().expandByScalar(eps);
    if(!box.intersectsBox(b.box))continue;
    for(const fb of b.faces){
      if(!box.intersectsBox(fb.box))continue;
      for(const [from,to] of [[fa.tri,fb.tri],[fb.tri,fa.tri]]) {
        const pts=[from.a,from.b,from.c];
        for(let i=0;i<3;i++){
          const start=pts[i],end=pts[(i+1)%3],delta=end.clone().sub(start),len=delta.length();
          if(to.closestPointToPoint(start,nearest).distanceTo(start)<=eps)return start;
          if(!len)continue;
          ray.set(start,delta.multiplyScalar(1/len));
          if(ray.intersectTriangle(to.a,to.b,to.c,false,h)&&h.distanceTo(start)<=len+1e-7)return h.clone();
        }
      }
    }
  }
  return null;
}
async function inspect(built,d) {
  const scene=await load(built.model),parts=new Map(),slots={},meshes=[];
  const digest=createHash('sha256');let triangleCount=0;
  scene.traverse(o=>{
    if(!o.isMesh)return;
    assert(!parts.has(o.name));o.material.side=T.DoubleSide;
    const part=physicalMesh(o);parts.set(o.name,part);meshes.push(o);
    const slot=o.material.name.startsWith('wash-')?o.material.name.slice(5):'original';
    (slots[slot]??=[]).push(o.name);
    for(const f of part.faces)for(const p of [f.tri.a,f.tri.b,f.tri.c]){
      const bytes=Buffer.alloc(12);p.toArray().forEach((n,i)=>bytes.writeFloatLE(n,4*i));digest.update(bytes);
    }
    triangleCount+=part.faces.length;
  });
  const size=bounds(scene);
  assert(size.min.distanceTo(v(-.6,0,-.3))<1e-5&&size.max.distanceTo(v(.6,.9,.3))<1e-5,'Unexpected installation box');
  const get=name=>{const p=parts.get(name);assert(p,'Missing '+name);return p;};
  const bowl=get('basin-bowl'),tap=get('basin-faucet'),slab=get('wash-countertop'),foot=get('pedestal-foot');
  assert(built.hole.length>=4 && Math.abs(slab.box.max.y-counterY)<1e-6);
  const hit=(from,dir,objects)=>new T.Raycaster(from,dir,0,3).intersectObjects(objects,false)[0];
  const down=v(0,-1,0),up=v(0,1,0);
  const land=(x,z,objects,from=.93)=>hit(v(x,from,z),down,objects.map(p=>p.obj));
  const gapLimit=.00025;
  function connection(a,b){
    const p=join(a,b);assert(p,'Detached parts: '+a.obj.name+' / '+b.obj.name);return coords(p);
  }
  const core={bowlToCounter:connection(bowl,slab),tapToBowl:connection(tap,bowl),bowlToFoot:connection(bowl,foot)};
  const support=[];
  for(const {name,x,z,top} of built.seats){
    const part=get(name),ground=hit(v(x,-.02,z),up,meshes);
    const underside=hit(v(x,top-.01,z),up,[slab.obj]);
    assert(ground && Math.abs(ground.point.y)<1e-6 && underside && Math.abs(underside.point.y-top)<gapLimit,'Foot or slab underside missing: '+name);
    support.push({name,ground:coords(ground.point),groundMesh:ground.object.name,slabContact:connection(part,slab)});
  }
  const footProbe=foot.box.getCenter(v());
  const floor=hit(v(footProbe.x,-.02,footProbe.z),up,[foot.obj]);assert(floor&&Math.abs(floor.point.y)<1e-6,'Pedestal misses the floor');
  const occupied=new Set([slab.obj.name]),contacts=[];
  let advanced=true;
  while(advanced){
    advanced=false;
    for(const part of parts.values()){
      if(occupied.has(part.obj.name))continue;
      for(const name of occupied){
        const touch=join(part,get(name));
        if(touch){occupied.add(part.obj.name);contacts.push({part:part.obj.name,connectedTo:name,point:coords(touch)});advanced=true;break;}
      }
    }
  }
  assert.equal(occupied.size,parts.size,'Floating pieces: '+[...parts.keys()].filter(k=>!occupied.has(k)).join(','));
  // Crossmembers and their feet must clear the ceramic throughout its entire installed height.
  // A contact joint is permitted at the purpose-made flange and cut-out countertop.
  const ceramicClearances={};
  for(const part of parts.values()) {
    if(!part.obj.material.name.startsWith('wash-') || part===slab || part===foot)continue;
    const partBox=part.box,ceramicBox=bowl.box;
    if(partBox.max.y<ceramicBox.min.y || partBox.min.y>ceramicBox.max.y)continue;
    const boundsGap=Math.max(partBox.min.x-ceramicBox.max.x,ceramicBox.min.x-partBox.max.x,
      partBox.min.z-ceramicBox.max.z,ceramicBox.min.z-partBox.max.z);
    if(boundsGap>0)ceramicClearances[part.obj.name]=round(boundsGap);
    else {
      assert(!join(part,bowl),'Fixture penetrates ceramic body: '+part.obj.name);
      ceramicClearances[part.obj.name]='triangle sections clear';
    }
  }
  const wellPoints=[];
  function well(targets) {
    for(const x of [-.075,0,.075])for(const z of [.03,.055,.08]) {
      const first=new T.Raycaster(v(x,.95,z),down).intersectObjects(targets,false)[0];
      assert(first && ['basin-bowl','basin-drain'].includes(first.object.name) && first.point.y<counterY-.027,'Basin aperture covered at '+[x,z]+' by '+first?.object.name);
      wellPoints.push({node:first.object.name,point:coords(first.point)});
    }
  }
  well(meshes);
  const tapTipZ=tap.box.max.z-.006;
  const nozzle=hit(v(0,counterY,tapTipZ),up,[tap.obj]);assert(nozzle,'Faucet nozzle underside missing');
  const runoff=hit(nozzle.point.clone().addScaledVector(down,.0005),down,meshes);
  assert(runoff && ['basin-bowl','basin-drain'].includes(runoff.object.name) && runoff.point.y<counterY-.027,'Spout is outside open well');
  const mid=land(0,.018,[bowl]);assert(mid);
  const stand=v(0,1.38,.64),approach=hit(stand,mid.point.clone().sub(stand).normalize(),meshes);
  assert(approach && ['basin-bowl','basin-drain'].includes(approach.object.name),'Positive-Z service view is blocked by '+approach?.object.name);
  for(const x of [-.44,.44]) {
    const wing=land(x,.07,[slab]);assert(wing && Math.abs(wing.point.y-counterY)<1e-5,'Counter wing is absent');
  }
  const obstruction=new T.Mesh(new T.BoxGeometry(.44,.006,.30),new T.MeshBasicMaterial());
  obstruction.name='closed-counter-control';obstruction.position.set(0,counterY+.004,0);obstruction.updateMatrixWorld(true);
  assert.throws(()=>well([...meshes,obstruction]),/Basin aperture covered/);
  return {materialSlots:slots,inspection:{geometrySha256:digest.digest('hex'),triangles:triangleCount,connectedMeshes:parts.size,
    bounds:{min:coords(size.min),max:coords(size.max)},originalPose:built.sourceTransform,outerProfileAtSlab:built.hole.map(p=>p.map(round)),
    slabTopMetres:counterY,slabThicknessMetres:d.slabThickness,coreContacts:core,pedestalFloor:coords(floor.point),floorToSlab:support,
    connectivity:contacts,ceramicClearances,wellPoints,spout:{underside:coords(nozzle.point),wellHit:coords(runoff.point)},serviceSideView:{from:coords(stand),first:approach.object.name,hit:coords(approach.point)},negativeControl:'Solid plate over the bowl rejected'}};
}

const args = parseArgs({options:{check:{type:'boolean'}, write:{type:'boolean'}, output:{type:'string'},
  parameters:{type:'string'}, help:{type:'boolean'}}}).values;
if (args.help) {
  console.log('build-public-washbasins.mjs --check | --write | --output PROJECT_TRIAL_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.write,args.check,Boolean(args.output)].filter(Boolean).length, 1, 'Choose one output mode');
assert(!args.parameters || args.output, 'Trial recipes require --output');
let project = root;
for(let current=root; current!==path.dirname(current); current=path.dirname(current)) {
  if(['company-workspace','output'].includes(path.basename(current).toLowerCase())) {
    const candidate = path.dirname(current);
    const marker = await fs.stat(path.join(candidate,'scripts/company-platform/local-workspace.ps1')).catch(e=>{if(e.code!=='ENOENT')throw e;});
    if(marker?.isFile()) project = candidate;
  }
}
const scratch = 'output/public-washroom-v1/producer';
const stage = await safe(project, scratch);
await checkManagedOutput(stage,root,{allowDelivery:false});
let dest;
if(args.output) {
  assert(!args.output.split(/[\\/]/).includes('..'), 'Path traversal in trial destination');
  const absolute = path.resolve(project,args.output), trial = path.relative(project,absolute).split(path.sep).join('/');
  assert(/^(output|company-workspace\/production-trials)\//.test(trial), 'Trial must stay inside project outputs');
  assert(trial!==scratch && !trial.startsWith(scratch+'/publication.lock') && !trial.startsWith(scratch+'/stage-'), 'Reserved producer directory');
  dest = await safe(project,trial);
  await checkManagedOutput(dest,root,{allowDelivery:false});
}
const input=args.parameters??sourceDir+'/parameters.json',contractPath=sourceDir+'/contract.json',recordPath=sourceDir+'/original/sources.json';
assert(input.endsWith('.json'));
const [recipeBytes,canonical,contractBytes,recordBytes,environmentBytes]=await Promise.all([input,sourceDir+'/parameters.json',contractPath,recordPath,branches].map(read));
const recipe=JSON.parse(recipeBytes),contract=JSON.parse(contractBytes),record=JSON.parse(recordBytes),signed=JSON.parse(canonical).designs;
assert.deepEqual(Object.keys(recipe).sort(),['schema','version','designs'].sort());
assert(recipe.schema==='company-public-washbasins' && recipe.version===1 && Array.isArray(recipe.designs) && recipe.designs.length);
const branch=JSON.parse(environmentBytes).groups.flatMap(g=>g.branches).find(b=>b.id===contract.environmentBranch);
assert.equal(branch.id,'sanitary-support');
const {width,height,depth}=branch.fixedFunctionAndInstall.dimensionsMeters;
assert.deepEqual(contract.resource.mounting,{origin:'bottom',width,height,depth});
assert.equal(record.author,'Kenney');assert.equal(record.license,'CC0-1.0');
const license=sourceDir+'/original/License.txt',licenseBytes=await read(license);
assert.equal(sha(licenseBytes),record.licenseSha256);assert(licenseBytes.toString().includes('Creative Commons Zero, CC0'));
const collection={schemaVersion:1,id:'company-public-washbasin-v1',sourceParameters:input,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:sha(await read(generator)),contract:contractPath,contractSha256:sha(contractBytes),resources:[]};
installNodeImageDecodeShim();
const files=new Map();
for(const d of recipe.designs) {
  validate(d);
  const stock=signed.find(s=>s.id===d.id && s.version===d.version);
  if(args.parameters && stock)assert.deepEqual(d,stock,'Edit geometry under a new ID/version');
  const key=d.kind.endsWith('-round')?'bathroomSink':'bathroomSinkSquare',original=record.originalModels[key];
  assert.equal(original.path,sourceDir+'/original/'+key+'.glb');
  const bytes=await read(original.path);assert.equal(bytes.length,original.bytes);assert.equal(sha(bytes),original.sha256);
  const built=build(d,bytes),{materialSlots,inspection}=await inspect(built,d);
  const folder='prototype/public/company-assets/'+family+'/'+d.id+'/v'+d.version;
  const modelPath=folder+'/model.glb',resourcePath=folder+'/resource.json';
  assert(!files.has(modelPath),'Duplicate identity: '+d.id);
  const asset={format:'glb',url:modelPath.replace('prototype/public',''),sha256:sha(built.model),bytes:built.model.length};
  const provenance={license:'CC0-1.0 Kenney basin ceramic, pedestal and mixer. Project-authored worktop, floor mounting and support structure.',
    sourceAuthor:record.author,sourceLicense:record.license,sourceUrl:record.page,sourceDesign:d.kind,
    sourceArtifactPath:original.path,sourceArtifactSha256:original.sha256,sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,
    generator,generatorSha256:collection.generatorSha256,functionalContractSource:contractPath,functionalContractSourceSha256:collection.contractSha256,
    environmentBranch:branch.id,environmentBranchSource:branches,environmentBranchSourceSha256:sha(environmentBytes),
    dependencies:{sourceRecord:await pin(recordPath),license:{path:license,sha256:sha(licenseBytes)},originalModel:{path:original.path,sha256:original.sha256}},
    tools:['Three.js r'+T.REVISION,'GLTFLoader triangle readback']};
  files.set(modelPath,built.model);files.set(resourcePath,json({id:d.id,version:d.version,displayName:d.displayName,...contract.resource,materialSlots,provenance,asset}));
  collection.resources.push({id:d.id,version:d.version,modelPath,resourcePath,sha256:asset.sha256,geometrySha256:inspection.geometrySha256,
    triangles:inspection.triangles,inspection});
}
assert.equal(new Set(collection.resources.map(r=>r.geometrySha256)).size,collection.resources.length,'Duplicate physical structure');
files.set(sourceDir+'/collection.json',json(collection));
const manifestTargets = await Promise.all([...files].map(async ([rel,bytes])=>({rel,bytes,target:await safe(dest??root,rel)})));
const missing = file => fs.lstat(file).then(()=>false).catch(e=>{if(e.code!=='ENOENT')throw e; return true;});
async function publish() {
  if(args.check) {
    for(const {bytes,target} of manifestTargets) assert(bytes.equals(await fs.readFile(target)),'Signed output differs: '+target);
    return;
  }
  await fs.mkdir(stage,{recursive:true});
  const lock = path.join(stage,'publication.lock');
  await fs.mkdir(lock);
  let spool;
  const own = [], dirs = [];
  try {
    if(dest) assert(await missing(dest),'Trial output already exists: '+dest);
    const pending = [];
    for(const item of manifestTargets) {
      if(await missing(item.target)) pending.push(item);
      else assert(item.bytes.equals(await fs.readFile(item.target)),'Refusing to replace signed output: '+item.target);
    }
    if(!pending.length) return;
    spool = await fs.mkdtemp(path.join(stage,'stage-'));
    const batch = path.join(spool,'batch');
    for(const {rel,bytes} of pending) {
      const target = await safe(batch,rel);
      await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,bytes,{flag:'wx'});
    }
    async function mkdirs(parent, directory) {
      let cursor = parent;
      for(const part of path.relative(parent,directory).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor,part);
        try { await fs.mkdir(cursor); dirs.push(cursor); }
        catch(error) {
          if(error.code!=='EEXIST') throw error;
          assert((await fs.lstat(cursor)).isDirectory() && await fs.realpath(cursor)===cursor);
        }
      }
    }
    if(dest) {
      await mkdirs(project,path.dirname(dest)); await fs.rename(batch,dest);
    } else {
      for(const {rel,target} of pending) {
        await mkdirs(root,path.dirname(target));
        const source = path.join(batch,rel);
        await fs.link(source,target); own.push({source,target});
      }
    }
  } catch(error) {
    for(const {source,target} of own.reverse()) {
      const a = await fs.stat(source,{bigint:true}), b = await fs.lstat(target,{bigint:true});
      if(a.dev===b.dev && a.ino===b.ino) await fs.unlink(target);
    }
    for(const dir of dirs.reverse()) await fs.rmdir(dir).catch(e=>{if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;});
    throw error;
  } finally {
    try {
      if(spool) {
        assert.equal(path.dirname(await fs.realpath(spool)),stage);
        await fs.rm(spool,{recursive:true});
      }
    } finally { await fs.rmdir(lock); }
  }
}
await publish();
console.log(JSON.stringify({status:'passed',resources:collection.resources.map(({id,version,sha256,triangles})=>({id,version,sha256,triangles}))}));
