const SHA256 = /^[0-9a-f]{64}$/;

export function resolveNativeReleaseSidecar(manifest, bodyType, bodySha256) {
  if (manifest?.schema !== 'native-release-sidecar-manifest-v1') {
    throw new Error('Unsupported native release sidecar manifest');
  }
  if (!SHA256.test(String(bodySha256 ?? ''))) {
    throw new Error('Native release body identity is incomplete');
  }
  const entry = manifest.entries?.find((candidate) =>
    candidate.bodyType === bodyType && candidate.sourceModelSha256 === bodySha256);
  if (!entry) return { status: 'fallback-png', reason: 'No exact body sidecar' };
  if (entry.admission !== 'candidate-only' || manifest.runtimeAdmission !== false) {
    throw new Error('Native release sidecar admission state is invalid');
  }
  for (const key of ['derivedTextureSha256', 'fallbackPngSha256']) {
    if (!SHA256.test(String(entry[key] ?? ''))) throw new Error(`Invalid sidecar identity: ${key}`);
  }
  return {
    status: 'candidate-only',
    bodyType: entry.bodyType,
    sourceModelSha256: entry.sourceModelSha256,
    derivedTexture: entry.derivedTexture,
    fallbackPng: entry.fallbackPng,
    runtimePolicy: entry.runtimePolicy,
  };
}
