import {fileURLToPath} from 'node:url';
import * as readers from './source/scripts/company-platform/package-template/vocal-origin.mjs';

const [key,pin,reviewed,reviewedPin,reviewedKey,...extra]=process.argv.slice(2);
try {
  if ((extra.length && (extra.length!==1||extra[0]!=='--height-profiles')) || !reviewedKey)
    throw Error('Usage: node check-vocal-origin.mjs ROOM_KEY PUBLISHED_MANIFEST_SHA REVIEWED_PACKAGE REVIEWED_MANIFEST_SHA REVIEWED_ROOM_KEY [--height-profiles]');
  const read=extra.length?readers.readAdaptedVocalHeightRoom:readers.readInheritedVocalRoom;
  const room=await read(
    {packageRoot:fileURLToPath(new URL('./',import.meta.url)),sourceRoomKey:key,manifestSha256:pin},
    {packageRoot:reviewed,sourceRoomKey:reviewedKey,manifestSha256:reviewedPin});
  console.log(JSON.stringify({ok:true,...room},null,2));
} catch(error) {
  console.error(JSON.stringify({ok:false,code:error.code || 'invalid-vocal-origin',path:error.path,message:error.message}));
  process.exitCode=1;
}
