// Actual callback extracted from before/candidate, using real Three materials/mesh.
// Does not load a VRM, execute the full avatar factory, or measure GPU rendering.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
const read=n=>fs.readFileSync(new URL(n,import.meta.url));
const manifest=JSON.parse(read('manifest.json')),checks=[];
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function callback(bytes){const s=bytes.toString().replaceAll('\r\n','\n'),start=s.indexOf('materials.map(',s.indexOf('bodyMaterials.set(')),end=s.indexOf('\n      );',start);assert(start>=0&&end>start);const expression=s.slice(start,end).trim().replace(/,$/,'');return materials=>Function('THREE','materials',`return (${expression});`)(THREE,materials);}
const before=read('foundation-avatar.js.before'),candidate=read('foundation-avatar.js.candidate');assert.equal(digest(before),manifest.baseRawSHA256);assert.equal(digest(candidate),manifest.candidateRawSHA256);
const oldFactory=callback(before),newFactory=callback(candidate);
const surface=new THREE.MeshBasicMaterial(),outline=new THREE.MeshBasicMaterial();outline.isOutline=true;const original=[surface,outline];
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geometry.setIndex([0,1,2]);geometry.addGroup(0,3,0);geometry.addGroup(0,3,1);const mesh=new THREE.Mesh(geometry,original),groups=JSON.stringify(geometry.groups),positions=Array.from(geometry.attributes.position.array),indices=Array.from(geometry.index.array);
const visibleGroups=()=>geometry.groups.filter(g=>mesh.material[g.materialIndex]?.visible).length;
mesh.material=oldFactory(original);assert.equal(visibleGroups(),2);checks.push('confirmed-before: neutral body duplicates both same-range material groups');const old=mesh.material;
mesh.material=newFactory(original);assert.equal(visibleGroups(),1);assert(mesh.material[0].isMeshStandardMaterial);assert.equal(mesh.material[0].side,THREE.DoubleSide);assert.equal(mesh.material[0].roughness,1);assert.equal(mesh.material[0].color.getHex(),old[0].color.getHex());checks.push('candidate: one neutral group remains with same surface appearance properties');const neutral=mesh.material;
assert.equal(JSON.stringify(geometry.groups),groups);assert.deepEqual(Array.from(geometry.attributes.position.array),positions);assert.deepEqual(Array.from(geometry.index.array),indices);assert.equal(surface.visible,true);assert.equal(outline.visible,true);checks.push('source materials, positions, indices and groups unchanged');
mesh.material=original;assert.equal(mesh.material,original);assert.equal(mesh.material[1],outline);assert.equal(visibleGroups(),2);checks.push('dressed reference restoration retains original visible surface+outline materials');
const noOutline=newFactory([surface]);assert.equal(noOutline.length,1);assert.equal(noOutline[0].visible,true);checks.push('single-material/no-outline fallback remains visible');
[...old,...neutral,...noOutline,surface,outline].forEach(m=>m.dispose());geometry.dispose();
const result={passed:true,checks,baseBuild:manifest.baseBuild,baseSHA256:manifest.baseRawSHA256,candidateSHA256:manifest.candidateRawSHA256,scope:'Extracted real material-construction callback with actual Three objects. Group eligibility count only, not GPU calls, posed skin, VRM factory lifecycle or pixel equivalence.'};fs.writeFileSync(new URL('node-check.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
