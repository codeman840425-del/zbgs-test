import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateJointHandProfile} from '../joint-hand-workspace.mjs';
const tests=[];
for(const name of ['female','jaw','waisthip']){
 const p=JSON.parse(fs.readFileSync(new URL('../'+name+'.profile.json',import.meta.url)));
 assert(validateJointHandProfile(p,p.bodySHA256));assert(!validateJointHandProfile(p,'0'.repeat(64)));
 for(const change of [x=>x.profiles.pop(),x=>x.profiles[1].semantic=x.profiles[0].semantic,x=>x.profiles[0].radiusU=0,x=>x.profiles[0].axis=[1,1,1],x=>x.profiles[0].tmax=x.profiles[0].tmin,x=>x.profiles[0].side='right',x=>x.units='centimetres']){const bad=structuredClone(p);change(bad);assert(!validateJointHandProfile(bad,p.bodySHA256));}
 tests.push({name,bodySHA256:p.bodySHA256,positive:1,negative:8});
}
const report={passed:true,tests,scope:'Schema/body validator only. Resource-byte SHA is separately checked by foundation loader; real browser gate confirms successful loading.'};
fs.writeFileSync(new URL('../portable/schema-validation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
