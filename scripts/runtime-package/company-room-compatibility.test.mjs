import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import outputs from '../project-output.cjs';
import {requireCompanyRoomRuntime} from './company-room-compatibility.mjs';
import {digest} from './files.mjs';

const exec=promisify(execFile);
const root=await outputs.productionRoot();
const plant='6359150e83c284125dc757ac6680cc326d58bf57df142dfc4af0d6b522c658f2';
const vocal='5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012';
const readReview=async name=>JSON.parse(await readFile(new URL('game-record-'+name+'-reviewed.json',import.meta.url)));
const seatReview=await readReview('company-seat');
const vocalReview=await readReview('vocal-active-v2');
const runtimeOf=review=>({sourceCommit:review.sourceCommit,sourceDigest:review.sourceDigest,
  buildId:review.sourceDigest.slice(0,12),entry:'record-consumer.html'});
const check=(room,runtime,files=new Map())=>requireCompanyRoomRuntime(room,{manifest:{runtime},files});

test('historic seat-only game cannot claim standing vocals; unknown transfers, builds and unreviewed capabilities fail closed',async()=>{
  const seat={...runtimeOf(seatReview),facilityContract:'seat-standing-vocal-v1'};
  await assert.rejects(check(vocal,seat),{code:'incompatible-facility-runtime'});
  await assert.rejects(check('0'.repeat(64),seat),{code:'unsupported-room-contract'});
  await assert.rejects(check(plant,{...seat,sourceDigest:'0'.repeat(64)}),{code:'unsupported-build'});
  const undeclared=runtimeOf(await readReview('production-lip'));
  await assert.rejects(check(plant,{...undeclared,facilityContract:'seat-v1'}),{code:'incompatible-facility-runtime'});
});

test('source commit, build ID, entry and compiled closure must match the fixed registered review',async()=>{
  const runtime=runtimeOf(vocalReview);
  for(const changed of [{sourceCommit:seatReview.sourceCommit},{buildId:'be0e52c243ec'},{entry:'index.html'}])
    await assert.rejects(check(vocal,{...runtime,...changed}),{code:'unsupported-build'});
  // Even the exact valid reviewed identity is unusable without its physical files.
  await assert.rejects(check(vocal,runtime),{code:'modified-dependency'});
});

const releases={
  seat:['m2-company-seat-fixed','3cba17b8df616540b404c8739dcf82c40bb580e49fceb37a6209fb73d2b36d43'],
  clearance:['m2-company-seat-clearance-fixed','1759505cc6ef16f93a16508ba795ac52c060e137306f0742d4950423d71f8406'],
  firstVocal:['m2-company-vocal-active-v1','7f3d9bd41fbf0356bf78a42cab8b8f7ee28c2720a6bbc687c4c36d98a0bfd88a'],
  active:['m2-company-vocal-active-v2','ebedf0c7fb017cddc4196ae6909ce29cbba12c92ebca359bf0c833c11b75cac5'],
};
const pairDir=release=>path.join(root,'output',release[0],'pair');

test('a reviewed vocal runtime rejects a substituted transitive module or additional executable',async t=>{
  const game=pairDir(releases.active);
  if(!existsSync(path.join(game,'runtime-package.json')))return t.skip('Fixed vocal game package unavailable');
  const files=new Map();
  for(const name of Object.keys(vocalReview.files))files.set(name,await readFile(path.join(game,name)));
  const runtime=runtimeOf(vocalReview);
  await check(vocal,runtime,files);
  const name=Object.keys(vocalReview.files).find(key=>key.startsWith('assets/foundation-avatar-'));
  assert.ok(name);
  const changed=new Map(files);
  const bytes=Buffer.from(files.get(name));bytes[0]^=1;changed.set(name,bytes);
  await assert.rejects(check(vocal,runtime,changed),{code:'modified-dependency'});
  files.set('assets/unreviewed.mjs',Buffer.from('export {}'));
  await assert.rejects(check(vocal,runtime,files),{code:'unsupported-build'});
});

// Supply the independently received plant and v1.1 transfers. Use the existing
// Node preflight dependencies on NODE_PATH if the transfer carries only source.
const plantDir=process.env.FACILITY_COMPANY_TRANSFER,vocalDir=process.env.FACILITY_VOCAL_TRANSFER;
test('public CLI rejects matrix case 09 without staging, retries the same destination, and keeps historical room pairs',async t=>{
  if(!(plantDir && vocalDir))return t.skip('Set FACILITY_COMPANY_TRANSFER and FACILITY_VOCAL_TRANSFER');
  const base=await mkdtemp(await outputs.projectOutput(path.join(root,'experiments','company-contract-'),root));
  const out=path.join(base,'combined');
  async function compose(release,isVocal){
    const args=['scripts/production/package-facility-room.mjs','--game',pairDir(release),'--game-sha256',release[1],
      '--room',isVocal?vocalDir:plantDir,'--out',out];
    if(isVocal)args.push('--room-profile','vocal-use-v1.1');
    return exec(process.execPath,args,{cwd:root,windowsHide:true,env:{...process.env,TEMP:base,TMP:base,TMPDIR:base}});
  }
  try {
    for(const release of [releases.seat,releases.clearance]){
      await assert.rejects(compose(release,true),error=>error.code===1 &&
        /Room requires seat-standing-vocal-v1; reviewed character runtime .* provides seat-v1/.test(error.stderr));
      assert.deepEqual(await readdir(base),[]);
    }
    for(const [release,isVocal] of [[releases.seat,false],[releases.clearance,false],
      [releases.firstVocal,true],[releases.active,true],[releases.active,false]]){
      const {stdout}=await compose(release,isVocal);
      const result=JSON.parse(stdout),bytes=await readFile(path.join(out,'facility-package.json'));
      const receipt=JSON.parse(bytes);
      assert.equal(digest(bytes),result.manifestSha256);
      assert.equal(receipt.gameInventorySha256,release[1]);
      assert.equal(receipt.roomManifestSha256,isVocal?vocal:plant);
      assert.deepEqual(result.rooms.map(room=>room.key),isVocal?['singing-studio','singing-rental']:['plant-home','plant-rental']);
      t.diagnostic(JSON.stringify({build:receipt.gameRuntime.buildId,room:receipt.roomManifestSha256,
        game:receipt.gameInventorySha256,output:result.manifestSha256,files:result.files}));
      await rm(out,{recursive:true});
    }
  } finally {await rm(base,{recursive:true});}
});
