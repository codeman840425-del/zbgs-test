const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('../prototype/node_modules/playwright');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const request = (operation, fields) => ({schema:'character-production-request-v1', operation, ...fields});
const outfitSelection = ({base, equipment}) => ({
  bodySha256:base.sha256, role:equipment.role,
  equipment:Object.values(equipment.resources).map(({id, slot, sha256}) => ({id, slot, sha256})),
});
const editOutfit = (record, selection) => request('edit', {record, edits:[{domain:'outfit', selection}]});
function selectedItem(entries, slot) {
  const matches = entries.filter(item => item.slot === slot);
  assert.equal(matches.length, 1, 'Expected one selected ' + slot);
  return matches[0];
}

async function main() {
  const [base, outArg, recordsArg, expectedBuild, slotOption, ...extra] = process.argv.slice(2);
  assert(!extra.length && (slotOption === undefined || slotOption === '--slot=top'), 'Optional argument: --slot=top');
  const slot = slotOption ? 'top' : 'socks';
  const role = slot === 'socks' ? 'pants-socks' : 'pants-top-far';
  const slotName = slot === 'socks' ? 'sock' : 'top';
  if (!recordsArg || !/^(?:[a-f0-9]{12}|[a-f0-9]{64})$/.test(expectedBuild ?? ''))
    throw Error('Expected BASE_URL NEW_EVIDENCE_DIR TWO_RECORDS_JSON EXPECTED_BUILD');
  const {productionRoot, projectOutput} = require('./project-output.cjs');
  const out = await projectOutput(outArg, await productionRoot());
  const inputBytes = await fs.readFile(recordsArg), records = JSON.parse(inputBytes);
  const {canonicalJson} = await import('../prototype/src/character-record.js');
  const match = (actual, expected, label) => assert.equal(canonicalJson(actual), canonicalJson(expected), label);
  assert.equal(records.length, 2);
  const [first, second] = records;
  assert.notEqual(first.identity.id, second.identity.id);
  assert.notEqual(first.appearanceRecipe.base.sha256, second.appearanceRecipe.base.sha256);
  const [firstSelection, secondSelection] = records.map(record => outfitSelection(record.appearanceRecipe));
  const expectedCount = slot === 'socks' ? 4 : 3;
  for (const selection of [firstSelection, secondSelection]) {
    assert.equal(selection.equipment.length, expectedCount);
    assert.equal(selection.role, role);
  }
  const firstItem = selectedItem(firstSelection.equipment, slot);
  const secondItem = selectedItem(secondSelection.equipment, slot);
  assert.notEqual(firstItem.sha256, secondItem.sha256);

  const wrongHash = structuredClone(firstSelection);
  selectedItem(wrongHash.equipment, slot).sha256 = secondItem.sha256;
  const wrongBody = {...secondSelection, bodySha256:firstSelection.bodySha256};
  const mixed = {...firstSelection, equipment:firstSelection.equipment.map(item => item.slot === slot ? secondItem : item)};
  const missing = {...secondSelection, equipment:secondSelection.equipment.filter(item => item.slot !== slot)};
  const badCases = [
    ['mismatched-'+slotName+'-sha', first, wrongHash, 'outfit.selection'],
    ['mismatched-body-sha', second, wrongBody, 'outfit.selection.bodySha256'],
    ['another-bodys-'+slotName, first, mixed, 'outfit.selection'],
    ['missing-'+slotName, second, missing, 'outfit.selection'],
  ];
  const report={status:'incomplete',inputSha256:digest(inputBytes),cases:[],pageErrors:[],failedResponses:[],
    scope:'Actual D02 production and consumer on the fixed build. No recording, clothing contact or performance measurement.'};
  await fs.mkdir(out, {recursive:false});
  await fs.copyFile(__filename, path.join(out, 'executed-script.cjs'));
  let browser, context, page;
  try {
    browser = await chromium.launch({channel:'chrome', headless:true});
    context = await browser.newContext({viewport:{width:1440,height:1000}});
    report.browser=browser.version();
    context.on('response', response => {
      if (response.status() >= 400)
        report.failedResponses.push({path:new URL(response.url()).pathname,status:response.status()});
    });
    const open = async () => {
      page = await context.newPage();
      page.on('pageerror', error => report.pageErrors.push(error.message));
      await page.goto(base+'record-consumer.html?production=1');
      await page.waitForFunction(() => window.__recordConsumer?.ready, null, {timeout:60000});
      const {shortId, sourceDigest} = await page.evaluate(() => __recordConsumer.buildInfo);
      assert.equal(expectedBuild.length === 12 ? shortId : sourceDigest, expectedBuild);
      report.build={shortId, sourceDigest};
    };
    const show = async input => {
      const group=await page.evaluate(input => __recordConsumer.selectGroup(0,input),input);
      assert.deepEqual(group.items.map(item => item.status), ['completed','completed'], JSON.stringify(group.items));
    };
    const production = payload => page.evaluate(async payload => {
      try { return await __recordConsumer.production(payload); }
      catch (error) { return {ok:false,code:error.code,field:error.field,editIndex:error.editIndex,reason:error.message}; }
    }, payload);
    const snapshot = (remember = false) => page.evaluate(async remember => {
      const consumer = __recordConsumer;
      if (remember) window.__productionGuardActors = new Map(consumer.actors);
      const active = [];
      for (const [id,actor] of consumer.actors) {
        const proposed = await actor.capture();
        const equipment = actor.avatar.getOutfitInfo().equipment;
        active.push({id,root:actor.avatar.root.uuid,attached:actor.avatar.root.parent===consumer.scene,
          sameObject:window.__productionGuardActors?.get(id)===actor,recordSha256:actor.recordSha256,revision:actor.revision,
          recipeSha256:proposed.integrity.recipeSha256,liveAccessories:proposed.liveAccessories,
          equipmentMaterials:proposed.equipmentMaterials,resourceIdentities:proposed.resourceIdentities,
          visibleEquipment:Object.values(equipment.items).filter(item=>item.visible).map(item=>item.id).sort()});
      }
      return {sceneChildren:consumer.scene.children.map(object=>object.uuid),active};
    }, remember);
    function verifyActive(state, expected, label) {
      assert.equal(state.active.length, expected.length);
      for (const record of expected) {
        const actor=state.active.find(item=>item.id===record.identity.id);
        assert(actor?.attached,label);
        assert.equal(actor.revision,record.revision,label);
        assert.equal(actor.recordSha256,record.integrity.recordSha256,label);
        assert.equal(actor.recipeSha256,record.integrity.recipeSha256,label);
        for (const field of ['liveAccessories','equipmentMaterials','resourceIdentities'])
          match(actor[field],record[field],label);
        match(actor.visibleEquipment,Object.values(record.appearanceRecipe.equipment.resources).map(item=>item.id).sort(),label);
      }
    }
    await open();
    await show(records);
    const before = await snapshot(true);
    verifyActive(before, records, 'baseline');
    report.before=before;
    const leftVisible = async label => match(await snapshot(), before, label);
    for (const [name, record, selection, field] of badCases) {
      const result = await production(editOutfit(record, selection));
      assert.equal(result.ok, false, name);
      assert.equal(result.code, 'production-input', name);
      assert.equal(result.field, field, name);
      assert.equal(result.editIndex, 0, name);
      assert(!Object.hasOwn(result,'record'),name);
      await leftVisible(name);
      report.cases.push({name,actor:record.identity.id,selection,result,activeUnchanged:true});
    }
    const damagedRecord = structuredClone(first);
    selectedItem(Object.values(damagedRecord.appearanceRecipe.equipment.resources), slot).sha256 = secondItem.sha256;
    const damaged = await production(request('validate',{record:damagedRecord}));
    assert.equal(damaged.ok,false,'tampered complete record');
    assert(!Object.hasOwn(damaged,'record'));
    await leftVisible('tampered complete record');
    report.cases.push({name:'tampered-complete-record',actor:first.identity.id,result:damaged,activeUnchanged:true});

    const blockedURLs = new Map();
    for (const record of slot === 'top' ? records : [first]) {
      const recipe = record.appearanceRecipe;
      const visibleResource = selectedItem(Object.values(recipe.equipment.resources), slot);
      const resourceURL = new URL(visibleResource.url, new URL(recipe.equipment.manifestUrl, base)).href;
      let hits = 0;
      const block = route => { hits++; return route.fulfill({status:503,body:'Injected equipment read failure'}); };
      await page.route(resourceURL, block);
      let unavailable;
      try { unavailable = await production(editOutfit(record,outfitSelection(recipe))); }
      finally { await page.unroute(resourceURL,block); }
      assert(hits > 0, 'exact '+slot+' resource was intercepted');
      assert.equal(unavailable.ok,false);
      assert.match(unavailable.reason,/503/);
      assert(!Object.hasOwn(unavailable,'record'));
      await leftVisible('503 while restoring detached edit candidate');
      const pathname = new URL(resourceURL).pathname;
      blockedURLs.set(pathname, (blockedURLs.get(pathname) ?? 0) + hits);
      report.cases.push({name:'resource-503',actor:record.identity.id,path:pathname,result:unavailable,
        blockedRequests:hits,activeUnchanged:true});
    }

    const settled=[];
    for (const old of records) {
      const query = await production(request('query',{bodyType:old.appearanceRecipe.base.bodyType}));
      assert(query.ok,query.reason);
      const defaultSet = query.query.appearance.equipment.sets.find(item=>item.index===0);
      const fallback = outfitSelection({base:old.appearanceRecipe.base,equipment:defaultSet});
      const original = selectedItem(Object.values(old.appearanceRecipe.equipment.resources), slot);
      assert(!fallback.equipment.some(item => item.id === original.id));
      if (slot === 'socks') assert(!fallback.equipment.some(item => item.slot === slot));
      else assert.notEqual(selectedItem(fallback.equipment, slot).sha256, original.sha256);
      const removed = await production(editOutfit(old,fallback));
      assert(removed.ok,removed.reason);
      assert.equal(removed.record.appearanceRecipe.equipment.index,defaultSet.index);
      match(outfitSelection(removed.record.appearanceRecipe), fallback, 'replacement equipment');
      assert(!Object.values(removed.record.appearanceRecipe.equipment.resources).some(item => item.id === original.id));
      const valid = outfitSelection(old.appearanceRecipe);
      valid.equipment.reverse();
      const restored = await production(editOutfit(removed.record,valid));
      assert(restored.ok,restored.reason);
      for (const field of ['identity','provenance','appearanceRecipe','equipmentMaterials','liveAccessories','resourceIdentities'])
        match(restored.record[field],old[field],field);
      assert.equal(restored.record.revision,old.revision+2);
      const validated=await production(request('validate',{record:restored.record}));
      assert(validated.ok,validated.reason);
      match(validated.record,restored.record,'validate after exact selection retry');
      settled.push(restored.record);
      await leftVisible('successful detached edit leaves mounted original untouched');
      report.cases.push({name:'valid-remove-and-retry',actor:old.identity.id,sourceRevision:old.revision,
        resultRevision:restored.record.revision,restoredRecipeSha256:restored.record.integrity.recipeSha256,activeUnchanged:true});
    }
    const output = path.join(out,'retry-records.json');
    await fs.writeFile(output,JSON.stringify(settled)+'\n',{flag:'wx'});
    await page.close();
    await open();
    await show(JSON.parse(await fs.readFile(output)));
    const reopened = await snapshot(true);
    verifyActive(reopened,settled,'reopened valid retries');
    assert(reopened.active.every(item=>before.active.every(old=>old.root!==item.root)));
    assert.equal(digest(await fs.readFile(recordsArg)),report.inputSha256,'disk input preserved');
    assert.equal(report.pageErrors.length,0,JSON.stringify(report.pageErrors));
    assert(report.failedResponses.every(row => row.status === 503 && blockedURLs.has(row.path)));
    for (const [pathname,hits] of blockedURLs) {
      assert.equal(report.failedResponses.filter(row => row.path === pathname).length, hits);
    }
    report.reopened=reopened;
    report.status='passed';
  } catch (error) {
    report.failure=String(error.stack || error);
    process.exitCode=1;
    await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
  } finally {
    await browser?.close();
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,build:report.build?.shortId,failure:report.failure,caseCount:report.cases.length}));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
