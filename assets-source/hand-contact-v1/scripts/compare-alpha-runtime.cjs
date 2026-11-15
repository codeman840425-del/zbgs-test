const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const dir=path.resolve(process.argv[2]);
function clean(value){
 if(Array.isArray(value))return value.map(clean);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['alphaProof','simulateMs','fitElapsedMs','timing'].includes(k)).map(([k,v])=>[k,clean(v)]));
 return value;
}
const modes=[];
for(const mode of ['lap','authored']){
 const a=JSON.parse(fs.readFileSync(path.join(dir,'alpha-equivalence-legacy',mode+'.json'))),b=JSON.parse(fs.readFileSync(path.join(dir,'alpha-equivalence-actual',mode+'.json')));
 assert.equal(a.frames.length,270);assert.equal(b.frames.length,270);assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
 assert.equal(a.identity.runtimeBuild.sourceDigest,b.identity.runtimeBuild.sourceDigest,'Must be same fixed build');
 assert.equal(a.identity.primary.actualSha256,b.identity.primary.actualSha256,'Must be same actual body bytes');
 for(let i=0;i<270;i++)assert.deepEqual(clean(a.frames[i]),clean(b.frames[i]),mode+' frame '+(i+1)+' pose/geometry differs');
 const stats=b.frames.flatMap(f=>f.handContacts||[]).map(h=>h.alphaProof).filter(Boolean).at(-1);
 assert(stats?.hits>0,'Optimization must actually be exercised');
 modes.push({mode,frames:270,exactPoseAndSelectedRawSkinEquality:true,stats});
}
const result={passed:true,modes,scope:'Exact fields except elapsed timing and optimization counters; selected real raw skin/waist geometry. Separate full actual skin intersection gate required.'};
fs.writeFileSync(path.join(dir,'alpha-equivalence-report.json'),JSON.stringify(result,null,2));console.log(result);
