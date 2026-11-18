import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

export const plantCompiler='scripts/company-platform/build-desktop-plants.mjs';
export const plantProducer='scripts/company-platform/build-desktop-plants-v2.mjs';
export const editableValidator='scripts/company-platform/plant-editable-source.mjs';
export const plantToolLock='scripts/company-platform/desktop-plant-tools-v2.json';
const compilerSha256='1cf35cdad2b27fb4d8afafd9c376765111520a7993679140e9342c7f6d37146c';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,file)=>{throw Object.assign(new Error(code+': '+file),{code,path:file});};

export async function readProductionFile(root,name) {
  if(typeof name!=='string'||!/^assets-source\/company-[^/]+\//u.test(name)||/[\\:\x00-\x1f<>|"?*]/u.test(name)||
      name.split('/').some(part=>!part||/[. ]$/u.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/iu.test(part)))
    fail('invalid-appearance-source',String(name));
  const file=path.resolve(root,name);
  try{
    if(await fs.realpath(file)!==file||!(await fs.lstat(file)).isFile())fail('appearance-linked-path',name);
    return await fs.readFile(file);
  }catch(error){
    if(error.code==='ENOENT'||error.code==='ENOTDIR')fail('appearance-source-missing',name);
    throw error;
  }
}

export async function editableSources(root,recipe) {
  const pins=new Map();
  for(const [name,source] of Object.entries(recipe.sources??{})){
    if(!source || !Object.hasOwn(source,'editable'))continue;
    const pin=source.editable;
    if(!pin||typeof pin!=='object'||Array.isArray(pin)||Object.keys(pin).length!==2||
        typeof pin.path!=='string'||typeof pin.sha256!=='string'||!/^[a-f0-9]{64}$/.test(pin.sha256))
      fail('invalid-appearance-source','sources.'+name+'.editable');
    if(digest(await readProductionFile(root,pin.path))!==pin.sha256)fail('appearance-source-pin-mismatch',pin.path);
    pins.set(name,{path:pin.path,sha256:pin.sha256});
  }
  return pins;
}

export async function plantToolchain(root){
  const pin=async name=>({path:name,sha256:digest(await fs.readFile(path.join(root,name)))});
  const [producer,compiler,validator]=await Promise.all([plantProducer,plantCompiler,editableValidator].map(pin));
  if(compiler.sha256!==compilerSha256)fail('appearance-tool-pin-mismatch',plantCompiler);
  const bytes=await fs.readFile(path.join(root,plantToolLock)),locked=JSON.parse(bytes);
  for(const tool of [producer,validator])if(locked[tool.path]!==tool.sha256)fail('appearance-tool-pin-mismatch',tool.path);
  return {producer,compiler,validator,lock:{path:plantToolLock,sha256:digest(bytes)}};
}

export async function verifyPlantEditableProvenance(root,resource,recipe) {
  const pins=await editableSources(root,recipe);
  const design=recipe.designs?.find(d=>d.id===resource.id&&d.version===resource.version);
  const original=pins.get(design?.source),p=resource.provenance;
  if(!design)fail('invalid-plant-source-design',resource.id+'@'+resource.version);
  if(original){
    const tools=await plantToolchain(root);
    if(p.generator!==plantProducer || p.generatorSha256!==tools.producer.sha256 ||
        !isDeepStrictEqual(p.dependencies?.editableSource,original) ||
        !isDeepStrictEqual(p.dependencies?.geometryCompiler,tools.compiler) ||
        !isDeepStrictEqual(p.dependencies?.editableSourceValidator,tools.validator) || !isDeepStrictEqual(p.dependencies?.producerLock,tools.lock))
      fail('plant-editable-provenance-mismatch',resource.id+'@'+resource.version);
  }else if(p.dependencies?.editableSource || p.dependencies?.editableSourceValidator || p.generator===plantProducer)
    fail('plant-editable-provenance-mismatch',resource.id+'@'+resource.version);
  return pins;
}
