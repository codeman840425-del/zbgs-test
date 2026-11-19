import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildInformationResources, SOURCE_PATH, CONTRACT_PATH, GENERATOR_PATH} from './build-information.mjs';

// Use the same content mesh, UVs, attachment and material as all other replaceable signs.
const root=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const family='assets-source/company-washroom-sign-v1';
const recipePath=family+'/parameters.json', generator='scripts/company-platform/build-washroom-sign.mjs';
const read=name=>fs.readFile(path.join(root,name)), hash=b=>createHash('sha256').update(b).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const [mode,...extra]=process.argv.slice(2);
assert(['--write','--check'].includes(mode)&&!extra.length,'Use --write or --check');
const recipeBytes=await read(recipePath), recipe=JSON.parse(recipeBytes);
assert.equal(recipe.id,'information-content-washroom');
assert.equal(recipe.version,1);
const png=execFileSync('python',['-B',path.join(root,family,'draw.py')],{cwd:root,windowsHide:true});
const commonBytes=await read(SOURCE_PATH), common=JSON.parse(commonBytes);
const {contents:[item]}=await buildInformationResources({source:common,sourceBytes:commonBytes,contractBytes:await read(CONTRACT_PATH),
  baseContents:[{content:{id:'washroom',title:recipe.title},png}]});
const runtime='prototype/public/company-assets/information-v1/content/washroom/v1';
const r=item.resource;
assert.equal(r.id,recipe.id);
assert.equal('prototype/public'+r.asset.url,runtime+'/model.glb');
Object.assign(r.provenance,{sourceParameters:recipePath,sourceParametersSha256:hash(recipeBytes),
  sourceImage:family+'/art.png',sourceImageSha256:hash(png),generator,generatorSha256:hash(await read(generator)),
  contentHelper:family+'/draw.py',contentHelperSha256:hash(await read(family+'/draw.py')),
  meshGenerator:GENERATOR_PATH,meshGeneratorSha256:hash(await read(GENERATOR_PATH))});
const files=new Map([[family+'/art.png',png],[runtime+'/model.glb',item.model],[runtime+'/resource.json',json(r)]]);
for(const [file,bytes] of files){
  const full=path.join(root,file);
  if(mode==='--check'){assert((await fs.readFile(full)).equals(bytes),'Production bytes differ: '+file);continue;}
  // Check each existing parent before making the next directory. Output names are fixed.
  let parent=root;
  for(const name of path.posix.dirname(file).split('/')){
    parent=path.join(parent,name);
    await fs.mkdir(parent).catch(e=>{if(e.code!=='EEXIST')throw e;});
    assert((await fs.lstat(parent)).isDirectory()&&await fs.realpath(parent)===parent,'Linked production path: '+parent);
  }
  const old=await fs.lstat(full).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  assert(!old||old.isFile()&&await fs.realpath(full)===full,'Linked production output: '+full);
  if(old)assert((await fs.readFile(full)).equals(bytes),'Published sign differs; preserve its version: '+file);
  else await fs.writeFile(full,bytes,{flag:'wx'});
}
console.log(JSON.stringify({id:r.id,mode,png:hash(png),glb:r.asset.sha256}));
