import {readFile} from 'node:fs/promises';
import {digest,fail} from './files.mjs';

// The production operator supplies this registry. Never select a review from
// the incoming character package or from a caller-provided review path.
export async function readGameRuntimeReview(sourceDigest, external) {
  const index=JSON.parse(await readFile(new URL('./game-runtime-reviews.json',import.meta.url)));
  const group=external?index.externalRecords:index.bundledRecords;
  const row=Object.hasOwn(group,sourceDigest)?group[sourceDigest]:null;
  if(!row || !/^game-record-[a-z0-9-]+-reviewed\.json$/.test(row.file))
    fail('unsupported-build','No repository review for selected game runtime');
  const bytes=await readFile(new URL(row.file,import.meta.url));
  if(digest(bytes)!==row.sha256)fail('unsupported-build','Selected review differs from the production registry');
  const reviewed=JSON.parse(bytes);
  if(reviewed.sourceDigest!==sourceDigest)fail('unsupported-build','Selected review differs from the production registry');
  // A facility can be reviewed after the game was handed off. Keep the original
  // reviewed bytes available to inventory/export callers that pin their copy.
  const facilityContract = row.facilityContract ?? reviewed.facilityContract;
  if (row.facilityContract !== undefined &&
      (!external || row.facilityContract !== 'seat-v1' ||
       (reviewed.facilityContract !== undefined && reviewed.facilityContract !== row.facilityContract)))
    fail('unsupported-build','Invalid supplemental seat contract on the fixed game review');
  return {bytes,reviewed,facilityContract};
}
