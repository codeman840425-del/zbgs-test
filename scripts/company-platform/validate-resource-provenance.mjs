import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function validateResourceProvenance({root, resource, label = resource?.id || '?'}) {
  if (!resource?.asset) return;
  const provenance = resource.provenance || {};
  if (!provenance.license || !provenance.sourceParameters || !provenance.sourceParametersSha256 ||
      !provenance.generator || !provenance.generatorSha256)
    throw new Error(`missing-resource-provenance: ${label}`);
  for (const [field, hashField] of [['sourceParameters', 'sourceParametersSha256'], ['generator', 'generatorSha256'],
    ['functionalContractSource', 'functionalContractSourceSha256'], ['environmentBranchSource', 'environmentBranchSourceSha256']]) {
    if (!provenance[field]) {
      if (field.startsWith('functional') || field.startsWith('environment')) continue;
      throw new Error(`missing-resource-provenance: ${label}.${field}`);
    }
    const file = path.resolve(root, provenance[field]);
    const bytes = await fs.readFile(file).catch(() => null);
    if (!bytes) throw new Error(`missing-resource-provenance-file: ${label}.${field}`);
    if (provenance[hashField] !== digest(bytes)) throw new Error(`provenance-hash-mismatch: ${label}.${hashField}`);
  }
}
