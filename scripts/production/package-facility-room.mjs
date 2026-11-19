import {createHash} from 'node:crypto';
import {readFile, realpath, lstat, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import outputs from '../project-output.cjs';
import {checkedBytes,digest,jsonBytes,publishStagedDirectory,runtimePath} from '../runtime-package/files.mjs';

const shaPattern=/^[0-9a-f]{64}$/;
const roomManifestPin='6359150e83c284125dc757ac6680cc326d58bf57df142dfc4af0d6b522c658f2';
const companyPrefix='source/prototype/src/company/';
const parse=bytes=>JSON.parse(bytes.toString('utf8'));
const inputsDir=import.meta.dirname;

async function readPinned(root,file,expected) {
  if (!shaPattern.test(expected)) throw Error('Expected SHA-256 for '+file);
  const bytes=await readFile(path.join(root,file));
  if(digest(bytes)!==expected) throw Error('Transfer manifest SHA-256 mismatch: '+file);
  return bytes;
}

async function readCompany(roomRoot) {
  const manifestBytes=await readPinned(roomRoot,'transfer-manifest.json',roomManifestPin);
  const manifest=parse(manifestBytes), files=new Map();
  if(manifest.schema!=='company-transfer'||manifest.version!==1) throw Error('Unsupported company transfer');
  // The pinned transfer includes original source filenames with spaces.
  for(const row of manifest.files) {
    const file=await realpath(path.join(roomRoot,row.path));
    const relative=path.relative(roomRoot,file).split(path.sep).join('/');
    if(relative!==row.path || files.has(relative)) throw Error('Unexpected company path '+row.path);
    const bytes=await readFile(file);
    if(bytes.length!==row.bytes || digest(bytes)!==row.sha256) throw Error('Company file identity mismatch: '+row.path);
    files.set(relative,bytes);
  }
  const build=parse(files.get('viewer/company-build-info.json'));
  const hash=createHash('sha256');
  for(const input of build.inputs) {
    hash.update(input).update('\0').update(files.get('source/prototype/'+input)).update('\0');
  }
  if(hash.digest('hex')!==manifest.sourceDigest || build.sourceDigest!==manifest.sourceDigest ||
    build.shortId!==manifest.buildId) throw Error('Company source digest differs from its transferred build');
  return {manifest,files,manifestBytes};
}

async function readGame(gameRoot,pin) {
  const bytes=await readPinned(gameRoot,'runtime-package.json',pin);
  const manifest=parse(bytes), files=new Map();
  if(manifest.schema!=='game-character-record-package-v1' || manifest.recordManifest!=='records/manifest.json' ||
    manifest.records.length!==2 || manifest.runtime.entry!=='record-consumer.html') throw Error('Expected a standalone record pair');
  for(const row of manifest.files) {
    if(files.has(row.path)) throw Error('Duplicate game file '+row.path);
    files.set(row.path,await checkedBytes(gameRoot,row));
  }
  const build=parse(files.get('build-info.json'));
  if(build.sourceDigest!==manifest.runtime.sourceDigest || build.shortId!==manifest.runtime.buildId) throw Error('Game source digest differs');
  const records=parse(files.get(manifest.recordManifest)).entries;
  if(records.length!==2 || new Set(records.map(r=>r.id)).size!==2) throw Error('Expected two distinct actors');
  for(const [i,record] of records.entries()) {
    const row=manifest.records[i],sidecar=parse(files.get(row.file));
    if(row.id!==record.id || record.url!=='/'+row.file || row.recordSha256!==record.recordSha256 ||
      sidecar.identity.id!==row.id || sidecar.integrity.recordSha256!==row.recordSha256) throw Error('Record pair identity mismatch');
  }
  const html=files.get(manifest.runtime.entry).toString();
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="(\/assets\/[A-Za-z0-9_-]+\.js)"[^>]*><\/script>/g)];
  if(scripts.length!==1 || !files.has(scripts[0][1].slice(1))) throw Error('Unrecognized fixed record-consumer entry');
  files.set('runtime-package.json',bytes);
  return {manifest,files,entry:scripts[0][1]};
}

async function compileHost(company,root) {
  const localRequire=createRequire(path.join(root,'prototype','package.json'));
  const esbuild=localRequire('esbuild');
  const three=await import(pathToFileURL(path.join(path.dirname(localRequire.resolve('three')),'three.module.js')));
  const lock=parse(company.files.get('source/prototype/package-lock.json'));
  const localLock=parse(await readFile(path.join(root,'prototype','package-lock.json')));
  const threeLock=lock.packages['node_modules/three'];
  if(threeLock.integrity!==localLock.packages['node_modules/three'].integrity ||
     three.REVISION!==threeLock.version.split('.')[1] ||
     esbuild.version!==localLock.packages['node_modules/esbuild'].version) throw Error('Use the locked Three.js and esbuild versions');
  const host=await readFile(path.join(inputsDir,'facility-room-host.mjs'),'utf8');
  const built=await esbuild.build({stdin:{contents:host,resolveDir:inputsDir,sourcefile:'facility-room-host.mjs'},
    absWorkingDir:root,bundle:true,format:'esm',target:'es2022',write:false,legalComments:'inline',
    plugins:[{name:'transferred-company',setup(build){
      build.onResolve({filter:/^released-company\//},args=>({namespace:'company',path:args.path.slice('released-company/'.length)}));
      build.onResolve({namespace:'company',filter:/^\./},args=>({namespace:'company',path:path.posix.join(path.posix.dirname(args.importer),args.path)}));
      build.onLoad({namespace:'company',filter:/.*/},args=>{
        const contents=company.files.get(companyPrefix+args.path);
        if(!contents)throw Error('Missing verified company module: '+args.path);
        return {contents,loader:args.path.endsWith('.json')?'json':'js'};
      });
      build.onResolve({filter:/^three$/},()=>({namespace:'consumer',path:'three'}));
      build.onLoad({namespace:'consumer',filter:/.*/},()=>({
        contents:'export const {'+Object.keys(three).join(',')+'}=window.__recordConsumer.three;'
      }));
      build.onResolve({filter:/^three\/addons\//},args=>({path:localRequire.resolve(args.path)}));
    }}]});
  return {bytes:Buffer.from(built.outputFiles[0].contents),hostSha256:digest(host),
    threeVersion:threeLock.version,esbuildVersion:esbuild.version};
}

export async function packageFacilityRoom({game,room,gameSha256,out}) {
  const root=await outputs.productionRoot(),destination=await outputs.projectOutput(out,root);
  const gameRoot=await realpath(game),roomRoot=await realpath(room);
  for(const input of [gameRoot,roomRoot]) {
    const rel=path.relative(input,destination);
    if(!rel || (!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel))) throw Error('Destination overlaps a transfer input');
  }
  if(await lstat(destination).catch(e=>{if(e.code!=='ENOENT')throw e;})) throw Error('Output already exists: '+destination);
  const [company,character]=await Promise.all([readCompany(roomRoot),readGame(gameRoot,gameSha256)]);
  const host=await compileHost(company,root);
  const files=new Map(character.files);
  function add(name,bytes) {
    if(runtimePath('/'+name)!==name || files.has(name)) throw Error('Conflicting package path '+name);
    files.set(name,bytes);
  }
  for(const [file,bytes] of company.files) {
    if(file.startsWith('viewer/company-assets/')) add(file.slice('viewer/'.length),bytes);
  }
  for(const name of ['library-catalog.json','templates.json']) add('facility/'+name,company.files.get('data/'+name));
  const rooms=['plant-home','plant-rental'].map(key=>{
    const save='facility/rooms/'+key+'/save.json', bytes=company.files.get('data/rooms/'+key+'/save.json');
    const doc=parse(bytes).document,roomId=key+'/ground/live',floorId=key+'/ground',chair=roomId+'/station-1/chair';
    if(doc.id!==key || !doc.nodes.some(n=>n.id===roomId&&n.parentId===floorId) ||
      !doc.nodes.some(n=>n.id===chair&&n.resource?.id==='chair-ladder')) throw Error('Missing released live room or station chair: '+key);
    add(save,bytes);
    return {key,roomId,floorId,seatId:chair+'#seat',save,saveSha256:digest(bytes)};
  });
  const metadata={schema:'company-character-room-v1',gameInventorySha256:gameSha256,
    gameRuntime:character.manifest.runtime,roomManifestSha256:roomManifestPin,
    roomSourceDigest:company.manifest.sourceDigest,rooms};
  add('facility/rooms.json',jsonBytes(metadata));
  add('facility/company-host.js',host.bytes);
  const template=await readFile(path.join(inputsDir,'facility-room.html'),'utf8');
  add('facility-room.html',Buffer.from(template.replace('__RECORD_CONSUMER_ENTRY__',character.entry)));
  const rows=[...files].map(([name,bytes])=>({path:name,bytes:bytes.length,sha256:digest(bytes)}));
  const receipt={...metadata,entry:'facility-room.html',host:{sourceSha256:host.hostSha256,templateSha256:digest(template),
    packagerSha256:digest(await readFile(import.meta.filename)),threeVersion:host.threeVersion,esbuildVersion:host.esbuildVersion},
    files:rows.sort((a,b)=>a.path<b.path?-1:1)};
  const receiptBytes=jsonBytes(receipt);
  add('facility-package.json',receiptBytes);
  await mkdir(path.dirname(destination),{recursive:true});
  const stage=await mkdtemp(destination+'.stage-');
  try {
    for(const [name,bytes] of files) {
      const file=path.join(stage,name);
      await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes,{flag:'wx'});
    }
    await publishStagedDirectory(stage,destination);
  } finally {await rm(stage,{force:true,recursive:true});}
  return {entry:path.join(destination,receipt.entry),files:files.size,manifestSha256:digest(receiptBytes),rooms};
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const {values}=parseArgs({options:{game:{type:'string'},room:{type:'string'},'game-sha256':{type:'string'},out:{type:'string'}}});
    if(!['game','room','game-sha256','out'].every(k=>values[k])) throw Error('Usage: --game FIXED_GAME --game-sha256 INVENTORY_SHA256 --room COMPANY_TRANSFER --out NEW_PROJECT_DIR');
    console.log(JSON.stringify(await packageFacilityRoom({...values,gameSha256:values['game-sha256']})));
  } catch(error){console.error(error.message);process.exitCode=1;}
}
