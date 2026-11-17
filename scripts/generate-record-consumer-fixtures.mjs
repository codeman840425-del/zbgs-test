import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCharacterRecord} from '../prototype/src/character-record.js';
const root = new URL('../', import.meta.url);
const specs = [
  ['native-female', 'm2-character-runtime-fixed-v1/native-female-face-v1-record.json', 'd03-female-a', '原生女性 · 道具'],
  ['native-male', 'm2-character-runtime-fixed-v1/native-male-7586-v1-record.json', 'd03-male-a', '原生男性 · 道具'],
  ['native-female-peer', 'm2-character-runtime-fixed-v1/native-female-face-v1-record.json', 'd03-female-b', '同体另一身份'],
  ['male-material', 'm2-character-material-fixed-v1/character-record.json', 'd03-male-b', '旧男性 · 材质短裤'],
];
const destination = new URL('prototype/public/assets/record-consumer-v1/', root);
await mkdir(destination, {recursive:true});
const entries = [];
for (const [key, path, id, name] of specs) {
  const bytes = await readFile(new URL('evidence/' + path, root));
  const source = JSON.parse(bytes.toString('utf8'));
  const record = await createCharacterRecord({...source, identity:{...source.identity,id,name}, now:source.createdAt,
    provenance:{producer:'deterministic-record-consumer-fixtures-v1', sourceRefs:[{path:'evidence/'+path,sha256:createHash('sha256').update(bytes).digest('hex')}]}},
    {validateResources: () => ({status:'pending',scope:'source fixtures; browser restores separately'})});
  await writeFile(new URL(key+'.json',destination),JSON.stringify(record)+'\n');
  entries.push({id,label:name,url:'/assets/record-consumer-v1/'+key+'.json',recordSha256:record.integrity.recordSha256});
}
await writeFile(new URL('manifest.json',destination),JSON.stringify({schema:'record-consumer-samples-v1',entries},null,2)+'\n');
console.log('Generated',entries.length,'deterministic final records; no random generation');
