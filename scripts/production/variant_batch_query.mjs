// Read the configured outfit sets from the same production API as the browser.
import {registerHooks} from 'node:module';

const hook = registerHooks({load(url, context, next) {
  return next(url, url.endsWith('.json') ? {...context, importAttributes:{type:'json'}} : context);
}});

try {
  const [bodyType] = process.argv.slice(2);
  if (!bodyType || process.argv.length !== 3) throw Error('Expected one body type');
  const {THREE} = await import('../headless-avatar-node.mjs');
  const {performCharacterProduction} = await import('../../prototype/src/character-production.js');
  globalThis.createImageBitmap = async blob => {
    const bytes = Buffer.from(await blob.arrayBuffer());
    const png = bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47;
    return {width:png ? bytes.readUInt32BE(16) : 1, height:png ? bytes.readUInt32BE(20) : 1, close(){}};
  };
  const renderer = {compileAsync() { throw Error('GPU compilation is unavailable in the CPU variant query'); }};
  const {query}=await performCharacterProduction({schema:'character-production-request-v1', operation:'query', bodyType},
    {scene:new THREE.Scene(), renderer});
  const outfits = query.appearance.equipment.sets.map(({index, role, resources}) => ({
    index, role, equipment:Object.values(resources).map(({id, slot, sha256}) => ({id, slot, sha256})),
  }));
  console.log(JSON.stringify({ok:true, body:query.body, outfits}));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  hook.deregister();
}
