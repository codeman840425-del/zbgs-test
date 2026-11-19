import {digest,fail} from './files.mjs';
import {readGameRuntimeReview} from './game-runtime-review.mjs';

export const lowerVocal=Object.freeze({
  profile:'vocal-fit-v1',
  transfer:'64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc',
  ancestor:'5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012',
  gameInventory:'3d3e2b3885003d0585c1b7eb6ea40c7490001a647f227c2dcff9377aa26060b5',
  runtime:'ddcf40a56d0ef69662f7d0798ca7e6210bd8cc20f6dc52a2cc034d40b20fe28f',
  resource:'floor-vocal-mic-disc-fit-lower',
  model:'c31e1b2eb9f6f2407974da44d3652ea817ce285fa1de4ebee7e3c55b4af3652a',
});

// Transfer SHA identifies both published rooms and the required use-point
// contract. The caller has already checked this manifest and its files.
const roomContracts=new Map([
  ['6359150e83c284125dc757ac6680cc326d58bf57df142dfc4af0d6b522c658f2','seat-v1'],
  ['5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012','seat-standing-vocal-v1'],
  [lowerVocal.transfer,'seat-standing-vocal-v1'],
]);

// Historical reviews predate facilityContract. These fixed releases produced
// the real company seat and standing-vocal packages. Retain the old reviews
// unchanged; new contracts belong to the independently registered review.
const historicalContracts=new Map([
  ['be0e52c243ec7147c785ac36119dd3dc534443822d39305fa1cb8ef5bdf88113','seat-v1'],
  ['d9140194fb8429f139d60e0b2aeedc75f47ee8448294eb41883229e0f3f7d800','seat-v1'],
  ['07a8411e1fe9a4ad225a05b445c54c441158cb80c2a8f50787aa3e1fc8655b71','seat-standing-vocal-v1'],
  ['6c3c7b43ae35c1be316d3a2e5410a6e2385887744e520c28a299e1529d4945e6','seat-standing-vocal-v1'],
]);

export async function requireCompanyRoomRuntime(roomDigest,{manifest,files}) {
  const required=roomContracts.get(roomDigest);
  if(!required)fail('unsupported-room-contract','Unreviewed company room transfer');
  const runtime=manifest.runtime,{reviewed,facilityContract}=await readGameRuntimeReview(runtime.sourceDigest,true);
  if(reviewed.schema!=='reviewed-game-character-runtime-v1' || reviewed.sourceCommit!==runtime.sourceCommit ||
      reviewed.sourceDigest.slice(0,12)!==runtime.buildId || runtime.entry!=='record-consumer.html')
    fail('unsupported-build','Character package identity differs from the registered runtime review');
  const available=historicalContracts.get(reviewed.sourceDigest)??facilityContract;
  if(available!==required && !(required==='seat-v1' && available==='seat-standing-vocal-v1'))
    fail('incompatible-facility-runtime',`Room requires ${required}; reviewed character runtime ${runtime.buildId} provides ${available??'no facility contract'}`);
  if(roomDigest===lowerVocal.transfer && (reviewed.sourceDigest!==lowerVocal.runtime ||
      !files.has('runtime-package.json') || digest(files.get('runtime-package.json'))!==lowerVocal.gameInventory))
    fail('incompatible-facility-runtime','Lowered microphone requires the reviewed performer-anchor runtime and original record pair');
  // Authenticate the compiled bytes we will publish, including transitive JS.
  // Agreement between two claims inside an incoming game is insufficient.
  for(const [name,pin] of Object.entries(reviewed.files)) {
    const bytes=files.get(name);
    if(!bytes || bytes.length!==pin.bytes || digest(bytes)!==pin.sha256)
      fail('modified-dependency','Character runtime file differs from the registered review: '+name);
  }
  for(const name of files.keys()){
    if(/\.(?:[cm]?js|html?|css|wasm)$/i.test(name) && !Object.hasOwn(reviewed.files,name))
      fail('unsupported-build','Unreviewed executable in character package: '+name);
  }
}
