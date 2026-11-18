import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const root = fileURLToPath(new URL('../../',import.meta.url));
const referencePath = 'prototype/public/company-assets/side-table-v1/round/v1/resource.json';
const contract = 'docs/COMPANY-SIDE-TABLE-CONTRACT-v1.txt';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFile(path.join(root,file));

async function main() {
  const [definition, mode] = process.argv.slice(2);
  if (!definition || !['--write','--check'].includes(mode) || process.argv.length !== 4)
    throw Error('Usage: node describe-sourced-table.mjs REGISTRATION.json --write|--check');
  const regs = JSON.parse(await fs.readFile(definition,'utf8'));
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(regs.id) || !Number.isSafeInteger(regs.version) || regs.version < 1 ||
      typeof regs.displayName !== 'string' || !regs.displayName.trim() ||
      !/^assets-source\/company-[a-z0-9-]+\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.json$/.test(regs.sourceParameters) ||
      !/^scripts\/company-platform\/[a-z0-9-]+\.mjs$/.test(regs.generator)) throw Error('Invalid table registration');
  const recipeBytes = await read(regs.sourceParameters), recipe = JSON.parse(recipeBytes);
  if (recipe.schema !== 'company-sourced-side-table-v1' || !recipe.asset?.license || !recipe.asset?.assetPage)
    throw Error('Expected an attributed sourced-table recipe');
  const reference = JSON.parse(await read(referencePath));
  const base = `/company-assets/sourced-side-table-v1/${regs.id}/v${regs.version}`;
  const file = `prototype/public${base}/resource.json`;
  const model = await read(`prototype/public${base}/model.glb`);
  const resource = {...reference, id:regs.id, version:regs.version, displayName:regs.displayName,
    provenance:{
      sourceParameters:regs.sourceParameters, sourceParametersSha256:hash(recipeBytes),
      generator:regs.generator, generatorSha256:hash(await read(regs.generator)),
      functionalContractSource:contract, functionalContractSourceSha256:hash(await read(contract)),
      sourceDesign:'textured-round-table', reference:'side-table-round@1', sourceUrl:recipe.asset.assetPage,
      author:recipe.asset.author, license:recipe.asset.license,
    },
    asset:{format:'glb', url:`${base}/model.glb`, bytes:model.length, sha256:hash(model)},
  };
  if (!compareFacilityFunction(reference,resource).compatible) throw Error('Incompatible side-table function');
  await preflightLibraryAssets({root,resources:[resource]});
  const bytes = Buffer.from(JSON.stringify(resource,null,2)+'\n');
  try {
    const existing = await read(file);
    if (!existing.equals(bytes)) throw Error('This table version already has different pinned bytes. Use a new version.');
  } catch (error) {
    if (mode !== '--write' || error.code !== 'ENOENT') throw error;
    // Publish an entire preflighted file, and never overwrite a competing version.
    const temp = await fs.mkdtemp(path.join(root,path.dirname(file),'.registration-'));
    const candidate = path.join(temp,'resource.json');
    try {
      await fs.writeFile(candidate,bytes,{flag:'wx'});
      await fs.link(candidate,path.join(root,file));
    } finally {
      await fs.rm(candidate,{force:true});
      await fs.rmdir(temp);
    }
  }
  console.log(JSON.stringify({file,id:resource.id,version:resource.version,...resource.asset}));
}
main().catch(error => {console.error(error);process.exitCode=1;});
