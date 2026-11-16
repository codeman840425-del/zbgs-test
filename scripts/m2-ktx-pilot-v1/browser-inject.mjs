import { createKtxPilotAdapter, importPilotDependencies } from './runtime-adapter.mjs';

async function pinnedModule(url, expectedSha) {
  const response = await fetch(url);
  if (!response.ok) throw Error('Pilot module fetch failed HTTP' + response.status);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== expectedSha) throw Error('Pilot KTX2Loader module SHA mismatch');
}

export async function createPilotForCurrentAvatar({ repoRootUrl, debug = globalThis.__debug } = {}) {
  if (!repoRootUrl) throw Error('Provide the read-only repository mount URL');
  if (!debug?.ready || !debug.avatar?.()) throw Error('Fixed801 avatar is not ready');
  const build = debug.buildInfo;
  if (build?.shortId !== '801c7a9c9026' || build?.sourceDigest !== '801c7a9c90260da47b0fc771caf3f282f67f8962d77fb6a15a07db3aca1fc0dc')
    throw Error('Pilot expects the fixed801 build identity');
  const avatar = debug.avatar();
  const root = new URL(repoRootUrl, location.href).href;
  const [sourceManifest, decoderManifest] = await Promise.all([
    fetch(new URL('assets-source/m2-ktx-pilot-v1/manifest.json', root)).then(response => response.json()),
    fetch(new URL('assets-source/m2-ktx-pilot-v1/runtime-dependencies.json', root)).then(response => response.json()),
  ]);
  const threeModuleUrl = new URL('prototype/node_modules/three/build/three.module.js', root).href;
  const ktx2LoaderModuleUrl = new URL('prototype/node_modules/three/examples/jsm/loaders/KTX2Loader.js', root).href;
  await pinnedModule(ktx2LoaderModuleUrl, decoderManifest.ktx2Loader.sha256);
  // The fixed room bundle embeds Three and uses no bare-module import map.
  // This mapping is only for the separately imported experimental loader.
  const map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({ imports: { three: threeModuleUrl } });
  document.head.append(map);
  const dependencies = await importPilotDependencies({ threeModuleUrl, ktx2LoaderModuleUrl });
  if (debug.avatar() !== avatar) throw Error('Avatar changed while preparing pilot injection');
  return createKtxPilotAdapter({
    ...dependencies, renderer: debug.renderer, vrm: avatar.vrm,
    bodyType: avatar.profile.bodyType, avatarSha256: avatar.profile.sha256,
    appearance: avatar.appearance, sourceManifest, sourceBaseUrl: root,
    transcoderPath: new URL('prototype/node_modules/three/examples/jsm/libs/basis/', root).href,
    decoderManifest,
  });
}
