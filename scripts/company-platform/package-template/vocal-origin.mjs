import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {vocalDeclarations} from './training-room.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const validPin = value => typeof value==='string' && /^[a-f0-9]{64}$/i.test(value);
const reject = (code, location, message) => { throw Object.assign(Error(message),{code,path:location}); };
export const validOriginKey = key => typeof key==='string' && (key==='@default' || /^[a-z][a-z0-9-]{0,62}$/.test(key));
const keyForSlot = slot => slot.micId+'#'+slot.performer.slotId;
const compareText = (a,b) => a===b?0:a<b?-1:1;
function declarations(document) {
  return vocalDeclarations(document).sort((a,b)=>compareText(keyForSlot(a),keyForSlot(b)));
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}

// The caller supplies the published manifest digest. Only source files that actually
// establish this room's standing-slot contract are needed, so unrelated assets need not be loaded.
export async function readVocalAuthority({packageRoot,manifestSha256,sourceRoomKey}) {
  if (!validOriginKey(sourceRoomKey)) reject('missing-vocal-origin-room',sourceRoomKey,'Select a named room or @default from the source package');
  if (!validPin(manifestSha256)) reject('vocal-origin-manifest-mismatch',packageRoot,'A complete source manifest SHA256 is required');
  const root=await fs.realpath(packageRoot);
  async function read(name) {
    const file=path.join(root,name), actual=await fs.realpath(file);
    if (path.relative(file,actual)!=='' || !(await fs.lstat(file)).isFile())
      reject('vocal-origin-source-mismatch',name,'Expected a regular source file inside the selected package');
    return fs.readFile(file);
  }
  const manifestBytes=await read('transfer-manifest.json');
  if (sha(manifestBytes)!==manifestSha256.toLowerCase()) reject('vocal-origin-manifest-mismatch',root,'Source manifest differs from the published digest');
  const manifest=JSON.parse(manifestBytes);
  if (manifest.schema!=='company-transfer' || manifest.version!==1 || !Array.isArray(manifest.files))
    reject('unsupported-vocal-origin-version',root,'Expected company-transfer version 1');
  const prefix=sourceRoomKey==='@default'?'data':'data/rooms/'+sourceRoomKey;
  const pinned=async (filename,missingCode)=>{
    const name=prefix+'/'+filename, matches=manifest.files.filter(file=>file.path===name);
    if (matches.length!==1) reject(missingCode,name,'Expected exactly one pinned file in the selected source room');
    const bytes=await read(name), digest=sha(bytes);
    if (digest!==matches[0].sha256 || bytes.length!==matches[0].bytes) reject('vocal-origin-source-mismatch',name,'Source room bytes differ from its manifest');
    return {data:JSON.parse(bytes),sha256:digest};
  };
  const save=await pinned('save.json','missing-vocal-origin-room');
  if (save.data.schema!=='company-save' || save.data.version!==1 || save.data.document?.schema!=='company-layout' || save.data.document.version!==1)
    reject('unsupported-vocal-origin-version',prefix,'Unknown source save or layout version');
  const report=await pinned('use-points.json','missing-vocal-origin-points');
  if (report.data.schema!=='company-installed-use-points' || report.data.version!==1)
    reject('unsupported-vocal-origin-version',prefix,'Unknown use point report version');
  const document=save.data.document;
  if (document.singingRooms!==undefined && (!Array.isArray(document.singingRooms) ||
      document.singingRooms.some(rule=>!rule || (rule.performer?.coordinateSpace==='facility' &&
        (!rule.roles?.mic || !rule.regionId || !rule.performer.slotId)))))
    reject('vocal-origin-source-mismatch',prefix,'The source contains a malformed standing-slot declaration');
  if (!Array.isArray(manifest.usePointReports) || (manifest.roomOrigins!==undefined && !Array.isArray(manifest.roomOrigins)))
    reject('missing-vocal-origin-points',prefix,'The source has no valid room-level report index');
  const slots=declarations(document), ids=slots.map(keyForSlot);
  const rows=(manifest.usePointReports??[]).filter(row=>row.path===prefix+'/use-points.json');
  if (!ids.length || new Set(ids).size!==ids.length || rows.length!==1 || rows[0].companyId!==document.id ||
      rows[0].count!==ids.length || report.data.companyId!==document.id || report.data.revision!==document.revision ||
      report.data.saveSha256!==save.sha256 || !Array.isArray(report.data.points) || report.data.points.length!==ids.length)
    reject('missing-vocal-origin-points',prefix,'The selected room needs a standing-slot report bound to its own save');
  for (const slot of slots) {
    const point=report.data.points.find(p=>p.id===keyForSlot(slot)), local=slot.performer;
    if (point?.kind!=='standing-vocal' || point.companyId!==document.id || point.revision!==document.revision ||
        point.roomId!==slot.regionId || point.facilityId!==slot.micId || point.slotId!==local.slotId ||
        !isDeepStrictEqual(point.local,{coordinateSpace:'facility',position:local.position,yaw:local.yaw,approach:local.approach,exit:local.exit}) ||
        !isDeepStrictEqual(point.performerReferences,{coordinateSpace:'use-point',mouth:local.mouth,eye:local.eye}))
      reject('vocal-origin-source-mismatch',keyForSlot(slot),'The selected physical slot and saved local declaration disagree');
    if (slot.heightProfiles) {
      const selected=slot.heightProfiles[point.heightProfile];
      const node=document.nodes.find(node=>node.id===slot.micId);
      if (!['standard','low'].includes(point.heightProfile) || !isDeepStrictEqual(node?.resource,point.resource) ||
          !isDeepStrictEqual(selected?.resource,point.resource) || !isDeepStrictEqual(selected?.mouth,local.mouth) ||
          !isDeepStrictEqual(selected?.eye,local.eye))
        reject('vocal-height-binding-mismatch',keyForSlot(slot),'The selected preset, microphone and references do not match');
    }
  }
  const originRows=(manifest.roomOrigins??[]).filter(row=>row.key===sourceRoomKey);
  if (originRows.length>1) reject('vocal-origin-source-mismatch',prefix,'Duplicate source room receipt');
  return {companyId:document.id,slots,points:report.data.points,originRow:originRows[0],receipt:{sourceManifestSha256:sha(manifestBytes),sourceRoomKey,
    sourceSaveSha256:save.sha256,sourcePointsSha256:report.sha256,declarationSha256:sha(JSON.stringify(canonical(slots))),pointIds:ids}};
}

export function inheritVocalOrigin(authority, document, points) {
  if (document.id!==authority.companyId)
    reject('vocal-origin-room-mismatch',document.id,'The selected source room belongs to a different company');
  if (!isDeepStrictEqual(declarations(document),authority.slots))
    reject('vocal-slot-binding-mismatch',document.id,'The standing microphone, slot or performer references differ from the reviewed room');
  if (!isDeepStrictEqual(points.filter(p=>p.kind==='standing-vocal').map(p=>p.id).sort(compareText),authority.receipt.pointIds))
    reject('vocal-slot-binding-mismatch',document.id,'Current physical checks did not produce the selected standing slots');
  return {mode:'inherited-vocal',...authority.receipt};
}

export function adaptVocalHeightOrigin(authority,document,points) {
  return heightOrigin(authority,document.id,declarations(document),points);
}

function heightOrigin(authority,companyId,slots,points) {
  const ids=slots.map(keyForSlot);
  if(companyId!==authority.companyId || !isDeepStrictEqual(ids,authority.receipt.pointIds) ||
      points.length!==ids.length || !ids.length)
    reject('vocal-height-binding-mismatch',companyId,'The adaptation must retain the original room and standing slots');
  for(const slot of slots) {
    const p=points.find(p=>p.id===keyForSlot(slot)), original=authority.points.find(q=>q.id===p?.id);
    const preset=slot.heightProfiles?.[p?.heightProfile];
    if(!original || !preset || !isDeepStrictEqual(slot.heightProfiles.standard.resource,original.resource) ||
        !isDeepStrictEqual(p.resource,preset.resource) ||
        !isDeepStrictEqual(p.performerReferences,{coordinateSpace:'use-point',mouth:preset.mouth,eye:preset.eye}))
      reject('vocal-height-binding-mismatch',keyForSlot(slot),'The presets must include the reviewed original microphone and the active references');
    // Everything except the independently reviewed fit, selected height and edit revision is invariant.
    const {heightProfile, ...common}=p;
    if(!isDeepStrictEqual({...common,resource:original.resource,performerReferences:original.performerReferences,revision:original.revision},original))
      reject('vocal-height-binding-mismatch',p.id,'The base, attachment, physical slot, clearance or travel targets changed');
  }
  return {mode:'adapted-vocal-height',...authority.receipt};
}

export async function readAdaptedVocalHeightRoom(current,reviewed) {
  const [target,base]=await Promise.all([readVocalAuthority(current),readVocalAuthority(reviewed)]);
  const expected={key:current.sourceRoomKey,companyId:target.companyId,saveSha256:target.receipt.sourceSaveSha256,
    ...heightOrigin(base,target.companyId,target.slots,target.points)};
  if(!isDeepStrictEqual(target.originRow,expected)) reject('vocal-height-binding-mismatch',current.sourceRoomKey,'Missing receipt for the specified reviewed source');
  return {key:current.sourceRoomKey,companyId:target.companyId,saveSha256:target.receipt.sourceSaveSha256,points:target.points,slots:target.slots};
}

// Resolve only the requested output and the separately reviewed original. The caller pins both packages.
export async function readInheritedVocalRoom(current, reviewed) {
  const [target, ancestor]=await Promise.all([readVocalAuthority(current),readVocalAuthority(reviewed)]);
  const expected={key:current.sourceRoomKey,companyId:target.companyId,saveSha256:target.receipt.sourceSaveSha256,
    mode:'inherited-vocal',...ancestor.receipt};
  if (target.companyId!==ancestor.companyId || !isDeepStrictEqual(target.slots,ancestor.slots) ||
      !isDeepStrictEqual(target.originRow,expected))
    reject('vocal-origin-not-inherited',current.sourceRoomKey,'The selected room has no verified inheritance from this reviewed source room');
  return {key:current.sourceRoomKey,companyId:target.companyId,saveSha256:target.receipt.sourceSaveSha256,
    sourceManifestSha256:ancestor.receipt.sourceManifestSha256,points:target.points};
}
