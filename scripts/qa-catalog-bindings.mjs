import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {verifyEquipmentBindings} from './verify-catalog-bindings.mjs';
const root=path.resolve('prototype/public'),read=url=>fs.readFileSync(path.join(root,url)),hash=b=>createHash('sha256').update(b).digest('hex'),cases=[];
for(const kind of ['female','male']){
 const body=read('/assets/foundation/base-'+kind+'-roundtrip.vrm'),url=kind==='male'?'/assets/m1b/equipment.json':'/assets/m1/equipment.json',m=JSON.parse(read(url));
 for(const e of m.items){const raw=read(path.posix.join(path.posix.dirname(url),e.url));assert.equal(hash(body),e.compatibleAvatarSha256);assert.equal(hash(raw),e.sha256);assert.equal(raw.length,e.bytes);const result=verifyEquipmentBindings(raw,body,e);const bad=structuredClone(e);bad.bindings[0].inverseBindMatrix[12]+=.1;assert.throws(()=>verifyEquipmentBindings(raw,body,bad),/inverse bind mismatch/);const other=read('/assets/foundation/base-'+(kind==='male'?'female':'male')+'-roundtrip.vrm');assert.throws(()=>verifyEquipmentBindings(raw,other,e),/inverse bind mismatch/);cases.push({body:kind,id:e.id,sha256:e.sha256,...result,rejectsAlteredBind:true,rejectsOppositeBody:true});}
}
const report={scope:'Offline actual GLB/VRM bytes and inverse binds; not rendered outfit acceptance',passed:true,cases};fs.writeFileSync('evidence/avatar-record-v2-bind-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
