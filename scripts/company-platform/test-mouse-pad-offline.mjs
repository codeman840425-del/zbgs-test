import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import rooms from './batch-inputs/mouse-pad-rooms.json' with {type:'json'};
import {runCompanyBatch} from './batch.mjs';
import {checkManagedOutput,packageCompany} from './package-company.mjs';

const [distArg,outArg,...extra] = process.argv.slice(2);
if (!distArg || !outArg || extra.length) throw Error('Usage: node test-mouse-pad-offline.mjs DIST NEW_TEST_DIRECTORY');
const dist = path.resolve(distArg), out=path.resolve(outArg);
const build = JSON.parse(await fs.readFile(path.join(dist,'company-build-info.json'),'utf8')).shortId;
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(out);
const batchDir = path.join(out,'batch'), [home,rental] = rooms.items.map(item=>item.key);
const bad = structuredClone(rooms);
bad.items[1].operations.find(op=>op.id.endsWith('/mouse')).transform.position = [.1,.84,.21];
const mouse = rental+'/ground/live/station-1/mouse';
const read = (key,file) => fs.readFile(path.join(batchDir,key,file));
const capture = async key => Object.fromEntries(await Promise.all(
  ['input.json','layout.json','save.json','report.json'].map(async file=>[file,createHash('sha256').update(await read(key,file)).digest('hex')])));
const missing = filename => assert.rejects(fs.stat(filename),{code:'ENOENT'});
const assertRejected = result => {
  assert.equal(result.ok,false);
  const rejected = result.results.find(item=>item.key===rental);
  assert.equal(rejected.code,'desktop-area-occupied'); assert.equal(rejected.path,mouse);
};
const first = await runCompanyBatch(bad,{outputDirectory:batchDir});
assert.equal(first.results[0].status,'created');
assertRejected(first); await missing(path.join(batchDir,rental));
const originalHome = await capture(home);
const retry = await runCompanyBatch(rooms,{outputDirectory:batchDir,only:rental});
assert.equal(retry.ok,true); assert.deepEqual(await capture(home),originalHome);
const originalRental = await capture(rental);
const later = await runCompanyBatch(bad,{outputDirectory:batchDir,only:rental});
assertRejected(later); assert.deepEqual(await capture(rental),originalRental);

// The centre is still on the rotated desk, but one edge of the usable pad hangs over.
const atEdge = structuredClone(rooms);
atEdge.items[1].operations.find(op=>op.id.endsWith('/mouse')).transform.position = [.88,.84,.20];
const edge = await runCompanyBatch(atEdge,{outputDirectory:batchDir,only:rental});
assert.equal(edge.ok,false);
assert.equal(edge.results[0].code,'invalid-desktop-envelope');
assert.deepEqual(await capture(rental),originalRental);

const layout = JSON.parse(await read(rental,'layout.json'));
layout.nodes.find(node=>node.id===mouse).transform.position = [.1,.84,.21];
const raw = path.join(out,'invalid-layout.json'), target=path.join(out,'rejected-package');
await fs.writeFile(raw,JSON.stringify(layout));
await assert.rejects(packageCompany({sourceRoot:fileURLToPath(new URL('../../',import.meta.url)),distDirectory:dist,
  buildId:build,inputPath:path.join(batchDir,home),outputDirectory:target,rooms:[{key:rental,folder:raw}]}),
  error=>error.code==='desktop-area-occupied' && error.path===mouse);
await missing(target);
const report={status:'passed',build,invalidItem:first.results[1],overDeskEdge:edge.results[0],validRetry:retry.results[0].status,
  preserved:{[home]:originalHome,[rental]:originalRental},invalidNamedRoom:{code:'desktop-area-occupied',id:mouse,createdPackage:false}};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,build,report:path.join(out,'report.json')}));
