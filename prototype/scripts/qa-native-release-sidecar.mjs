import {mkdir, writeFile} from 'node:fs/promises';
import manifest from '../../evidence/m2-native-release-sidecar-v1/manifest.json' with {type: 'json'};
import {runNativeReleaseSidecarDiagnostic} from '../src/native-release-sidecar-diagnostic.js';

const root = new URL('../../', import.meta.url);
const reportURL = new URL('evidence/m2-native-release-sidecar-diagnostic-v1/report.json', root);

function makeMaterial(entry) {
  return {
    name: entry.target.materialName,
    map: {id: 'original-map'},
    shadeMultiplyTexture: {id: 'original-shade'},
    alphaTest: entry.target.materialContract.alphaCutoff,
    transparent: false,
    update() {},
  };
}

async function runEntry(entry) {
  let attempts = 0;
  const loadCandidate = async (_url, options) => {
    attempts += 1;
    if (options.failureProbe) throw new Error('diagnostic failure probe');
    return {width: 2048, height: 2048, id: `ktx2-${attempts}`, dispose() {}};
  };
  const loadFallback = async (_url, _options) => ({id: 'png-fallback', dispose() {}});
  return runNativeReleaseSidecarDiagnostic({
    manifest,
    bodyType: entry.bodyType,
    bodySha256: entry.sourceModelSha256,
    material: makeMaterial(entry),
    loadCandidate,
    loadFallback,
  });
}

const bodies = [];
for (const entry of manifest.entries) {
  const result = await runEntry(entry);
  if (Object.values(result.checks).some(value => value !== true)) {
    throw new Error(`Sidecar diagnostic did not pass for ${entry.bodyType}`);
  }
  bodies.push({
    bodyType: entry.bodyType,
    bodySha256: entry.sourceModelSha256,
    resolution: {
      status: result.resolution.status,
      derivedTexture: result.resolution.derivedTexture,
      derivedTextureSha256: entry.derivedTextureSha256,
      fallbackPng: result.resolution.fallbackPng,
      fallbackPngSha256: entry.fallbackPngSha256,
      target: result.resolution.target,
    },
    checks: result.checks,
    runtimeAdmissionChanged: result.runtimeAdmissionChanged,
    materialApplied: result.materialApplied,
    restoredOriginalMaterial: result.restoredOriginalMaterial,
  });
}

const report = {
  schema: 'native-release-sidecar-diagnostic-v1',
  status: 'technical-pass-diagnostic-only',
  sourceManifest: 'evidence/m2-native-release-sidecar-v1/manifest.json',
  loader: 'deterministic injected KTX2/PNG fakes; browser/WebGL loader is not exercised',
  bodies,
  checks: [
    'exact body SHA resolves only its own candidate',
    'candidate material target preserves MASK alpha cutoff 0.5, texCoord 0 and source image identity',
    'candidate load failure leaves the previously active material references unchanged',
    'close/reopen loads the same exact candidate twice and restores the caller material',
    'PNG fallback is selected after decode failure without changing runtime admission',
  ],
  runtimeAdmissionChanged: false,
  acceptedForRuntime: [],
  limits: [
    'This diagnostic does not import KTX2Loader or exercise WebGL/GPU, ordinary-PC performance or visual acceptance.',
    'The default VRM material path and native admission registry are untouched.',
    'The two candidate identities remain separate even when encoded bytes are equal.',
  ],
};

await mkdir(new URL('.', reportURL), {recursive: true});
await writeFile(reportURL, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({status: report.status, bodies: bodies.length, report: 'evidence/m2-native-release-sidecar-diagnostic-v1/report.json'}));

