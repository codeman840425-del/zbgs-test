import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const out=path.dirname(fileURLToPath(import.meta.url)),root=process.cwd();
const file='prototype/src/facial-geometry.js';
const current=fs.readFileSync(file,'utf8');
const old=execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function extract(code,name){const start=code.indexOf(`function ${name}(`);assert(start>=0);let first=code.indexOf('{',start),depth=1,i=first+1;for(;depth;i++){if(code[i]==='{')depth++;if(code[i]==='}')depth--;}return code.slice(start,i);}
const before=new Function(extract(old,'normals')+';return normals;')();
const after=new Function(extract(current,'normals')+';return normals;')();
const select=new Function(extract(current,'normalNeighborhood')+';return normalNeighborhood;')();
fs.writeFileSync(path.join(out,'source-before.js'),old);fs.writeFileSync(path.join(out,'source-reviewed.js'),current);
let seed=121937;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
let cases=0,components=0;
// A moved vertex 0 affects 1; unchanged face [1,3,4] must still contribute at 1.
assert.deepEqual(select([0,1,2,1,3,4,4,5,6],new Set([0,1,2])),[0,1,2,1,3,4]);
// Preserve duplicates, winding and source order, rather than using a face Set.
assert.deepEqual(select([2,1,0,4,5,6,0,1,2,2,1,0],new Set([1])),[2,1,0,0,1,2,2,1,0]);
for(let n=0;n<120;n++){
 const count=41,indices=[];for(let i=0;i<85;i++)for(let c=0;c<3;c++)indices.push(Math.floor(random()*count));
 indices.push(0,0,0,1,2,3,1,2,3,3,2,1); // degenerate, repeated and cancelling faces
 const a=new Set(),b=new Set();for(let i=0;i<count;i++){if(random()<.13)a.add(i);if(random()<.13)b.add(i);}
 const vertices=n===0?new Set():n===1?new Set(Array.from({length:count},(_,i)=>i)):new Set([...a,...b]);
 const filtered=select(indices,vertices);
 const expected=[];for(let i=0;i<indices.length;i+=3)if(indices.slice(i,i+3).some(v=>vertices.has(v)))expected.push(...indices.slice(i,i+3));assert.deepEqual(filtered,expected);
 for(const precise of [false,true])for(let shape=0;shape<4;shape++){
  const Type=precise?Float64Array:Float32Array;
  const position=Type.from({length:count*3},()=>n%5===0?0:(random()-.5)*(n%3===0?1e-8:1));
  const full=before(position,indices,precise),small=after(position,filtered,precise,vertices);
  for(const v of vertices)for(let c=0;c<3;c++){assert(Object.is(full[v*3+c],small[v*3+c]));components++;}
  // Actual output writes only affected entries. Check final full buffers,
  // including untouched authored normals and morph delta conversion to F32.
  const original=Float32Array.from({length:count*3},()=>random()-.5),oldFinal=original.slice(),newFinal=original.slice();
  for(const v of vertices){const k=v*3;if(full[k]||full[k+1]||full[k+2])for(let c=0;c<3;c++)oldFinal[k+c]=full[k+c];if(small[k]||small[k+1]||small[k+2])for(let c=0;c<3;c++)newFinal[k+c]=small[k+c];}
  assert.equal(hash(oldFinal),hash(newFinal));
  const oldDelta=original.slice(),newDelta=original.slice();for(const v of vertices){const k=v*3;for(let c=0;c<3;c++){oldDelta[k+c]=(full[k]||full[k+1]||full[k+2])?full[k+c]-original[k+c]:0;newDelta[k+c]=(small[k]||small[k+1]||small[k+2])?small[k+c]-original[k+c]:0;}}assert.equal(hash(oldDelta),hash(newDelta));cases++;
 }
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({baselineCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baselineSha256:hash(old),reviewedSha256:hash(current),cases,affectedComponentsCompared:components,fullBufferAndMorphDeltaByteEquality:true,boundaryUnchangedIncidentFace:true,duplicateTriangleOrderPreserved:true,scope:'Extracted actual functions; deterministic synthetic Float32/Float64, degenerate and opposite winding, empty/full/overlapping union. Root owns actual source full-buffer comparison; no GPU or timing claim.'},null,2)+'\n');
console.log(JSON.stringify({cases,components,reviewedSha256:hash(current)}));
