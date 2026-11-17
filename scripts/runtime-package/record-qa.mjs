import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,cp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRecordInventory,exportRecordInventory} from './record-inventory.mjs';
import {digest,jsonBytes,writeFresh,copyDeclaredFiles} from './files.mjs';
const args=process.argv.slice(2),opts={};for(let i=0;i<args.length;i+=2)opts[args[i]]=args[i+1];
for(const key of ['--dist','--source-root','--record','--out'])assert(opts[key],key+' required');
const common={dist:path.resolve(opts['--dist']),sourceRoot:path.resolve(opts['--source-root'])};
const record=JSON.parse(await readFile(opts['--record'],'utf8'));
const temp=await mkdtemp(path.join(tmpdir(),'gamemake-record-package-'));
const report={status:'incomplete',cases:[],scope:'Package identity, dependency regeneration and failure safety; no browser or visual claims'};
const passed=name=>report.cases.push({name,passed:true});
const reject=(code,work)=>assert.rejects(work,error=>error.code===code,code);
async function hashes(root,prefix=''){
 const result=[];for(const entry of await readdir(path.join(root,prefix),{withFileTypes:true})){
  const p=path.posix.join(prefix,entry.name);if(entry.isDirectory())result.push(...await hashes(root,p));else result.push([p,digest(await readFile(path.join(root,p)))]);
 }return result.sort(([a],[b])=>a.localeCompare(b,'en'));
}
try{
 const inventory=await createRecordInventory({...common,record});report.runtime=inventory.runtime;
 assert.deepEqual(await createRecordInventory({...common,record}),inventory);passed('same record yields identical complete inventory');
 const first=path.join(temp,'first'),second=path.join(temp,'second');
 await exportRecordInventory({...common,inventory,out:first});await exportRecordInventory({...common,inventory,out:second});
 assert.deepEqual(await hashes(first),await hashes(second));passed('two independent exports are byte-identical');
 await reject('output-conflict',()=>exportRecordInventory({...common,inventory,out:first}));passed('existing output cannot be overwritten');
 for(const mutate of [x=>x.files.pop(),x=>{x.files[0].sha256='0'.repeat(64);},x=>{x.files.push({...x.files[0],path:'../outside'});}]){
  const bad=structuredClone(inventory);mutate(bad);await reject('inventory-mismatch',()=>exportRecordInventory({...common,inventory:bad,out:path.join(temp,'invalid')}));
 }passed('deleted, substituted and traversal declarations rejected by regeneration');
 const generated=structuredClone(inventory);generated.files.find(row=>row.generated!==undefined).path='assets/replacement.js';
 await reject('invalid-inventory',()=>copyDeclaredFiles({inventory:generated,dist:common.dist,out:path.join(temp,'generated-substitution')}));passed('generated record cannot replace executable or asset bytes');
 const corrupted=path.join(temp,'corrupted');await cp(first,corrupted,{recursive:true});
 const bundle=inventory.files.find(row=>row.path.endsWith('.js'));
 await writeFile(path.join(corrupted,bundle.path),'tampered');
 await reject('modified-dependency',()=>createRecordInventory({...common,dist:corrupted,record}));passed('modified executable bundle rejected');
 const metadata=path.join(temp,'metadata');await mkdir(metadata);const b=JSON.parse(await readFile(path.join(common.dist,'build-info.json'),'utf8'));b.inputs=['must-not-be-read.js'];
 await writeFile(path.join(metadata,'build-info.json'),jsonBytes(b));
 await reject('modified-dependency',()=>createRecordInventory({...common,dist:metadata,record}));passed('build metadata checked before its source paths/imports are used');
 const asset=inventory.files.find(row=>row.path.endsWith('.vrm'));await cp(first,corrupted,{recursive:true});await rm(path.join(corrupted,asset.path));
 await reject('missing-dependency',()=>createRecordInventory({...common,dist:corrupted,record}));passed('missing actual body fails with exact dependency cause');
 const badRecord=structuredClone(record);badRecord.identity.name+='tampered';await assert.rejects(()=>createRecordInventory({...common,record:badRecord}),/record hash/);passed('record integrity verified before resource collection');
 report.files=inventory.files.length;report.totalBytes=inventory.files.reduce((n,row)=>n+row.bytes,0);report.status='passed';
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{await rm(temp,{recursive:true,force:true});await writeFresh(path.resolve(opts['--out']),jsonBytes(report));console.log(JSON.stringify(report));}
