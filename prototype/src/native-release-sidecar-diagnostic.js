import {resolveNativeReleaseSidecar} from './native-release-sidecar.js';

const check = (condition, message) => {
  if (!condition) throw new Error(`Native release sidecar diagnostic: ${message}`);
};

const snapshotMaterial = material => ({
  map: material?.map,
  shadeMultiplyTexture: material?.shadeMultiplyTexture,
  alphaTest: material?.alphaTest,
  transparent: material?.transparent,
});

const sameMaterialState = (material, snapshot) =>
  material?.map === snapshot.map &&
  material?.shadeMultiplyTexture === snapshot.shadeMultiplyTexture &&
  material?.alphaTest === snapshot.alphaTest &&
  material?.transparent === snapshot.transparent;

function validateMaterialContract(material, target) {
  check(material && typeof material === 'object', 'material is missing');
  check(material.name === target.materialName || material.name === `${target.materialName} (Outline)`,
    'material name differs from the registered target');
  check(material.map && material.shadeMultiplyTexture, 'material textures are missing');
  check(material.alphaTest === target.materialContract.alphaCutoff && material.transparent === false,
    'material alpha/transparent contract differs from the registered target');
  return {
    materialName: material.name,
    alphaMode: target.materialContract.alphaMode,
    alphaCutoff: target.materialContract.alphaCutoff,
    transparent: material.transparent,
  };
}

function validateLoadedTexture(texture, target) {
  check(texture && typeof texture === 'object', 'texture loader returned no texture');
  if (texture.width !== undefined) check(texture.width === target.width, 'decoded texture width differs');
  if (texture.height !== undefined) check(texture.height === target.height, 'decoded texture height differs');
}

/**
 * Exercise the candidate sidecar lifecycle through injected loaders.
 *
 * This is deliberately a diagnostic seam. It does not import the runtime
 * loader, mutate a registry, or change the default VRM material path. The
 * caller supplies loaders so a browser QA command can use KTX2Loader and a
 * PNG ImageBitmap loader while Node tests can use deterministic fakes.
 */
export async function runNativeReleaseSidecarDiagnostic({
  manifest,
  bodyType,
  bodySha256,
  material,
  loadCandidate,
  loadFallback,
  disposeTexture = texture => texture?.dispose?.(),
}) {
  const resolution = resolveNativeReleaseSidecar(manifest, bodyType, bodySha256);
  const initial = material ? snapshotMaterial(material) : null;
  const checks = {
    exactBodySha: resolution.status === 'candidate-only' && resolution.sourceModelSha256 === bodySha256,
    materialContract: false,
    pngFallback: false,
    candidateLoad: false,
    loadFailurePreservesOld: false,
    closeReopen: false,
  };
  check(typeof loadFallback === 'function', 'PNG fallback loader is missing');

  if (resolution.status === 'fallback-png') {
    const fallback = await loadFallback(null, {reason: resolution.reason, bodyType, bodySha256});
    check(fallback && typeof fallback === 'object', 'PNG fallback loader returned no texture');
    checks.pngFallback = true;
    disposeTexture(fallback);
    return {
      schema: 'native-release-sidecar-diagnostic-v1',
      scope: 'candidate-only diagnostic-only',
      resolution,
      checks,
      runtimeAdmissionChanged: false,
      materialApplied: false,
      restoredOriginalMaterial: true,
    };
  }

  check(material && typeof loadCandidate === 'function', 'candidate diagnostic inputs are missing');
  checks.materialContract = Boolean(validateMaterialContract(material, resolution.target));
  const original = initial;
  const updateMaterial = texture => {
    material.map = texture;
    material.shadeMultiplyTexture = texture;
    material.needsUpdate = true;
    if (typeof material.update === 'function') material.update(0);
  };
  const restoreMaterial = snapshot => {
    material.map = snapshot.map;
    material.shadeMultiplyTexture = snapshot.shadeMultiplyTexture;
    material.alphaTest = snapshot.alphaTest;
    material.transparent = snapshot.transparent;
    material.needsUpdate = true;
    if (typeof material.update === 'function') material.update(0);
  };
  let firstTexture = null;
  let reopenedTexture = null;
  let fallbackTexture = null;
  try {
    firstTexture = await loadCandidate(resolution.derivedTexture, {kind: 'ktx2', attempt: 1});
    validateLoadedTexture(firstTexture, resolution.target);
    checks.candidateLoad = true;
    updateMaterial(firstTexture);

    // Close the first candidate and reopen the same exact resource. Keeping
    // the original snapshot lets this check prove that close/reopen leaves no
    // stale material references after the diagnostic restores its caller.
    disposeTexture(firstTexture);
    firstTexture = null;
    restoreMaterial(original);
    reopenedTexture = await loadCandidate(resolution.derivedTexture, {kind: 'ktx2', attempt: 2});
    validateLoadedTexture(reopenedTexture, resolution.target);
    updateMaterial(reopenedTexture);
    checks.closeReopen = true;

    const activeBeforeFailure = snapshotMaterial(material);
    let failed = false;
    try {
      await loadCandidate(resolution.derivedTexture, {kind: 'ktx2', attempt: 3, failureProbe: true});
    } catch (error) {
      failed = true;
      // A failed candidate decode must not replace the currently visible map.
      checks.loadFailurePreservesOld = sameMaterialState(material, activeBeforeFailure);
      fallbackTexture = await loadFallback(resolution.fallbackPng, {
        reason: 'candidate-load-failed',
        error: String(error),
        bodyType,
        bodySha256,
      });
      check(fallbackTexture && typeof fallbackTexture === 'object', 'PNG fallback loader returned no texture');
      checks.pngFallback = true;
    }
    check(failed, 'failure probe unexpectedly succeeded');
    check(checks.loadFailurePreservesOld, 'candidate load failure changed the active material');
  } finally {
    restoreMaterial(original);
    if (firstTexture) disposeTexture(firstTexture);
    if (reopenedTexture) disposeTexture(reopenedTexture);
    if (fallbackTexture) disposeTexture(fallbackTexture);
  }

  return {
    schema: 'native-release-sidecar-diagnostic-v1',
    scope: 'candidate-only diagnostic-only',
    resolution,
    checks,
    runtimeAdmissionChanged: false,
    materialApplied: false,
    restoredOriginalMaterial: sameMaterialState(material, original),
  };
}

