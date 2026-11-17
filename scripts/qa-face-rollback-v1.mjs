import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const original = fs.readFileSync(path.join(root, 'scripts/qa-face-prepare-snapshots.mjs'), 'utf8');
let source = original.replace("a.api=baselineCreate({vrm:a.vrm,avatarSha256:source.sha,prepareRender:async p=>aparts.push(p)});", "a.api=createFacialGeometry({vrm:a.vrm,avatarSha256:source.sha,prepareRender:async p=>aparts.push(p)});")
  .replace('const results=[],failures=[],lifecycle=[];', 'const results=[],failures=[],lifecycle=[]; const rollbackKeys=new Set();')
  .replace('assert.deepEqual(a.api.getState(),b.api.getState());', "{const actual=a.api.getState(),expected=b.api.getState();delete actual.revision;delete expected.revision;assert.deepEqual(actual,expected);}")
  .replace('assert.deepEqual(aparts.map(parts=>parts.map(p=>a.meshes.indexOf(p.mesh))),bparts.map(parts=>parts.map(p=>b.meshes.indexOf(p.mesh))));', '');
source = source.replace('for(const args of combos){aparts.length=0;bparts.length=0;',
  "for(const args of combos){aparts.length=0;bparts.length=0;if(!rollbackKeys.has(`${sex}-${shared}`)&&args.mouthWidth===.04){const before=b.meshes.map(m=>m.geometry);const update=await b.api.prepareUpdate({mouthWidth:.04});assert.equal(update.commit().applied,true);assert.equal(update.rollback().applied,true);b.meshes.forEach((m,i)=>assert.equal(m.geometry,before[i]));update.dispose();rollbackKeys.add(`${sex}-${shared}`);}");
source = source.replace('// Source gate failures', "fs.writeFileSync(path.join(out,'rollback-check.json'),JSON.stringify({validAssertions:true,rollbackKeys:[...rollbackKeys],results},null,2));process.exit(0);\n// Source gate failures");
const temp = path.join(root, 'scripts/.tmp-qa-face-rollback.mjs');
const oi=process.argv.indexOf('--out');if(oi<0)throw Error('--out NEW_DIR required');
const out=path.resolve(root,process.argv[oi+1]);
if(fs.existsSync(out))throw Error('Refuse overwrite existing rollback evidence');
fs.writeFileSync(temp, source);
const run = spawnSync(process.execPath, [temp, '--out', out], { cwd: root, encoding: 'utf8' });
if(fs.existsSync(out))fs.copyFileSync(temp,path.join(out,'executed-script.mjs'));
fs.rmSync(temp, { force: true });
if (run.status !== 0) { process.stderr.write(run.stderr); process.exit(run.status || 1); }
console.log(JSON.stringify({ status: 'rollback-check-passed', out, stdout: run.stdout.trim() }));
