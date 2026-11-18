import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const [a,b,report]=process.argv.slice(2);
assert(a&&b&&report,'Usage: node compare-trees.mjs EXPECTED_DIR REBUILT_DIR REPORT.json');
async function walk(root,prefix=''){
  const result=[];
  for(const e of await fs.readdir(path.join(root,prefix),{withFileTypes:true})){
    assert(!e.isSymbolicLink(),'Unexpected linked file '+e.name);
    const name=path.posix.join(prefix,e.name);
    if(e.isDirectory())result.push(...await walk(root,name));else result.push(name);
  }
  return result.sort();
}
const left=await walk(a),right=await walk(b),items=[],tree=createHash('sha256');
assert.deepEqual(right,left);
for(const name of left){
  const [x,y]=await Promise.all([fs.readFile(path.join(a,name)),fs.readFile(path.join(b,name))]);
  assert(x.equals(y),name+' differs');
  const sha256=createHash('sha256').update(x).digest('hex');
  tree.update(name+'\0').update(x).update('\0');
  items.push({name,bytes:x.length,sha256});
}
const treeSha256=tree.digest('hex');
await fs.writeFile(report,JSON.stringify({status:'passed',expected:path.resolve(a),rebuilt:path.resolve(b),count:items.length,treeSha256,items},null,2)+'\n');
console.log(items.length+' files identical; tree '+treeSha256);
