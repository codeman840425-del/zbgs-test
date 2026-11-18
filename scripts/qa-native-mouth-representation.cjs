const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {chromium} = require('../prototype/node_modules/playwright');
const esbuild = require('../prototype/node_modules/esbuild');
const [base,file,expectedSha,outName] = process.argv.slice(2);
const root = path.resolve(__dirname,'..'), out = path.resolve(outName);
const fixedBuild = 'fbf65135f5eb';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytesOf = uri => Buffer.from(uri.slice(uri.indexOf(',')+1),'base64');

async function main() {
  const parent = await fs.realpath(path.dirname(out));
  assert.ok(parent.startsWith(root+path.sep) && path.dirname(out) === parent,'Expected new output under this checkout');
  const vrm = await fs.readFile(file);
  assert.equal(sha(vrm),expectedSha);
  const record = JSON.parse(await fs.readFile(path.join(root,'evidence/m2-native-short-socks-room-v1/record.json'),'utf8'));
  const code = await fs.readFile(path.join(__dirname,'qa-native-mouth-stage.mjs'),'utf8');
  const bundle = await esbuild.build({stdin:{contents:code,sourcefile:'qa-mouth-stage.mjs',resolveDir:path.join(root,'prototype')},
    write:false,bundle:true,format:'esm',platform:'browser',logLevel:'silent'});
  await fs.mkdir(out);
  const report={build:fixedBuild,record:record.identity.id,sourceSha256:record.appearanceRecipe.base.sha256,
    candidateSha256:expectedSha,stageSha256:sha(code),bundleSha256:sha(bundle.outputFiles[0].contents),errors:[],frames:[],
    scope:'Actual candidate VRM decoded under its own hash. Only its changed mouth geometry is mounted on the restored game actor. Game materials, lighting, rig and simulation are held together; whole-file runtime selection and fit admission are separate.'};
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const deadline=setTimeout(()=>{report.timeout=true;browser.close().catch(()=>{});},120000);
  try {
    report.browser=browser.version();
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.route('**/__mesh_review__/stage.mjs',route=>route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
    await page.route('**/__mesh_review__/candidate.vrm',route=>route.fulfill({contentType:'model/gltf-binary',body:vrm}));
    await page.goto(base+'?workbench=appearance&body=native-male-7586-v1');
    await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
    const state=await page.evaluate(async ({record,expectedSha})=>{
      const d=window.__debug, result=await d.restoreCharacterRecord(record);
      if(!result.applied) throw Error(result.reason);
      d.camera('room');d.setPaused(true);
      const {prepare}=await import('/__mesh_review__/stage.mjs');
      window.__qaMouth=await prepare('/__mesh_review__/candidate.vrm',expectedSha);
      return {build:d.buildInfo.shortId,sha:d.avatar().getAssetProfile().sha256,frustumCulled:__qaMouth.frustumCulled};
    },{record,expectedSha});
    assert.equal(state.build,fixedBuild);assert.equal(state.sha,report.sourceSha256);
    report.frustumCulled=state.frustumCulled;
    const expressions={rest:{},open:{aa:1},rounded:{ou:1},smileBlink:{happy:.65,blink:.55,aa:.35}};
    for (const [expression,weights] of Object.entries(expressions)) {
      for (const camera of ['room','front','left','right','outside']) {
        const frame=await page.evaluate(({camera,weights})=>__qaMouth.frame(camera,weights),{camera,weights});
        if(frame.png) await fs.writeFile(path.join(out,'open-mouth.png'),bytesOf(frame.png));
        delete frame.png;report.frames.push({expression,camera,...frame});
      }
    }
    const clip=await page.evaluate(()=>__qaMouth.clip());
    await fs.writeFile(path.join(out,'speech-1x.webm'),bytesOf(clip.data));delete clip.data;report.clip=clip;
    await page.evaluate(()=>__qaMouth.close());
    assert.ok(clip.maxAA-clip.minAA>.1 && clip.frames>=30,'No meaningful on-screen speech');
    assert.ok(clip.simDelta/clip.duration>.85 && clip.simDelta/clip.duration<1.15,'Simulation and recorded seconds differ');
    for (const camera of ['room','front','left','right']) {
      assert.ok(report.frames.some(f=>f.camera===camera&&f.visibleMouth>0),'Mouth invisible for '+camera);
    }
    const open=Object.fromEntries(report.frames.filter(f=>f.expression==='open').map(f=>[f.camera,f]));
    assert.equal(open.left.visibleX[0],0);
    assert.equal(open.right.visibleX[1],open.right.width-1);
    assert.ok(open.left.visibleMouth<open.front.visibleMouth && open.right.visibleMouth<open.front.visibleMouth);
    assert.equal(open.outside.visibleMouth,0);
    assert.deepEqual(report.errors,[]);
    assert.ok(report.frames.every(f=>f.changed.pixels===0),'Pixel mismatch in compared poses');
    report.status='matched';
  } catch(error){report.status='failed';report.error=String(error);throw error;}
  finally {clearTimeout(deadline);await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
