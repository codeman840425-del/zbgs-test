"""Stage exact male native sources into one isolated factory asset directory."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'prototype/public/assets/native-male-factory-v1'
FILES={
    'native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm':'7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81',
    'native-vroid-male-unmasked-base-v1/generated/manifest.json':'7f11fdee6e0d76ae563e67005f5613e2e8b6840291ff86f5bf3af2c3f32c226c',
    'native-vroid-male-equipment-v1/generated/equipment.json':'e412188206670c9bf84b7f2019aab8a60778a2d0f6ac29df9d92091fd18d80a8',
    'native-vroid-male-equipment-v1/generated/native-unmasked-7586-top-v1.glb':'9276dd1dd88f1ac8ebdab228441eeaf50a3148d8a448d43dcb5c1a369385f4ae',
    'native-vroid-male-equipment-v1/generated/native-unmasked-7586-shorts-v1.glb':'1766826c44a0a8530caee223f29559c4ef5e462e372907db2e1b353a35252e71',
    'native-vroid-male-equipment-v1/generated/native-unmasked-7586-shoes-v1.glb':'e10770630ad50646c995b0b125af1ac3187649d60107b691f20a6e9dc92cca5f',
    'native-vroid-male-equipment-v1/generated/floor-measurement.json':'03346fedd692f7ac122a5ad5cd4213fa41677ab84d61bb47884a0f5492211502',
    'native-vroid-male-body-texture-fit-v1/generated/manifest.json':'c432a7cdd1f6f5e5af4bf07b79465b902f26c09b00f39254f206c2df24617143',
    'native-vroid-male-body-texture-fit-v1/generated/native-tops-body.png':'15ab2ecee54e10bfdb84a38be10e41fa7c7658e9a9f77b8293c2fd27569d7136',
}
sha=lambda b:hashlib.sha256(b).hexdigest()

def plan(source_root):
    files={}
    for relative,expected in FILES.items():
        raw=(source_root/relative).read_bytes()
        if sha(raw)!=expected:raise ValueError('Source identity mismatch: '+relative)
        files[relative]=raw
    equipment=json.loads(files['native-vroid-male-equipment-v1/generated/equipment.json'])
    for entry in equipment['items']:
        relative=(Path('native-vroid-male-equipment-v1/generated')/entry['url']).as_posix()
        if relative not in FILES or sha(files[relative])!=entry['sha256'] or len(files[relative])!=entry['bytes']:
            raise ValueError('Equipment URL is outside the exact staged source plan')
        if entry['compatibleAvatarSha256']!=FILES['native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm']:
            raise ValueError('Wrong staged equipment avatar identity')
    stage_manifest=dict(schema='native-male-factory-staging-v1',id='native-male-factory-v1',version=1,
        bodyType='native-male-7586-v1',assetId='native-vroid-unmasked-male-79-v1',
        sourceEquipmentId=equipment['id'],sourceEquipmentSha256=FILES['native-vroid-male-equipment-v1/generated/equipment.json'],
        status='exact-source-staging-not-game-or-visual-admission',
        sources=[dict(source='assets-source/'+relative,url='/assets/native-male-factory-v1/'+relative,
                      sha256=FILES[relative],bytes=len(raw)) for relative,raw in files.items()],
        jsonOrGLBRewritten=False,resourceMapping='Original package-relative URLs retained under identical sibling directories',
        license='Original source metadata unchanged; internal technical candidate only')
    files['staging-manifest.json']=(json.dumps(stage_manifest,ensure_ascii=False,indent=2)+'\n').encode()
    return files

def stage(source_root,destination):
    files=plan(source_root)
    # Whole-plan preflight includes the final manifest, so a conflict writes nothing.
    for relative,raw in files.items():
        target=destination/relative
        if target.exists() and target.read_bytes()!=raw:
            raise ValueError('Refusing different staged output: '+relative)
    for relative,raw in files.items():
        target=destination/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists():
            # Hard-link publication is atomic and refuses a concurrent overwrite.
            with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:
                temporary=Path(f.name);f.write(raw)
            try:
                try:os.link(temporary,target)
                except FileExistsError:
                    if target.read_bytes()!=raw:raise ValueError('Concurrent staged output differs: '+relative)
            finally:temporary.unlink()
        if target.read_bytes()!=raw:raise ValueError('Staged readback differs: '+relative)
    return dict(passed=True,files=len(files),stagingManifestSha256=sha(files['staging-manifest.json']),
                sourcesBytePreserved=True,outputJSONRewritten=False,runtimeOrVisualAccepted=False)

def check_profile():
    code=r"""
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {foundationProfile} from './prototype/src/foundation-profiles.js';
import {outfitSelection} from './prototype/src/outfit-selection.js';
import {resolveEquipmentSet} from './prototype/src/equipment-set.js';
import {verifyEquipmentBindings} from './scripts/verify-catalog-bindings.mjs';
import {BODY_TEXTURE_COVERAGE_ADMISSIONS} from './prototype/src/body-texture-coverage-admissions.js';
const p=foundationProfile('native-male-7586-v1');
assert.equal(p.id,'native-vroid-unmasked-male-79-v1');
assert.equal(p.sha256,'7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81');
assert.equal(p.baseBodyDisplay,'source-with-hair');
assert.ok(Object.values(p.previewAppearanceSupport).every(v=>v===false));
for(const k of ['forearmCollision','handSurfaceContact','bodyCoverage','garmentCoverage','additionalBodyCoverage','additionalEquipmentManifests','outfitSeatLayerThickness'])assert.equal(p[k],undefined,k);
assert.equal(p.seatLayerThickness,0);
const readURL=url=>fs.readFileSync('prototype/public'+url);
const manifest=JSON.parse(readURL(p.manifestUrl));
const look=outfitSelection(p,0),selected=resolveEquipmentSet(manifest.items,look.ids,p.sha256);
assert.equal(look.bottomRole,'shorts');assert.equal(p.outfits.length,1);assert.equal(selected.length,3);
const avatar=readURL(p.url);
const digest=b=>createHash('sha256').update(b).digest('hex');
assert.equal(digest(avatar),p.sha256);
const resources=selected.map(e=>{
  const url=new URL(e.url,'http://fixture'+p.manifestUrl).pathname;
  assert.ok(url.startsWith('/assets/native-male-factory-v1/'));
  const b=readURL(url);assert.equal(digest(b),e.sha256);assert.equal(b.length,e.bytes);
  return {id:e.id,...verifyEquipmentBindings(b,avatar,e)};
});
const coverageBytes=readURL(p.bodyTextureCoverage.url),coverage=JSON.parse(coverageBytes);
assert.equal(digest(coverageBytes),p.bodyTextureCoverage.sha256);assert.equal(coverage.avatarSha256,p.sha256);
const admission=BODY_TEXTURE_COVERAGE_ADMISSIONS.find(a=>a.avatarSha256===p.sha256&&a.manifestSha256===p.bodyTextureCoverage.sha256);
assert.ok(admission);assert.equal(admission.basePngSha256,coverage.basePngSha256);assert.equal(admission.maskedPngSha256,coverage.covered.sha256);
assert.deepEqual(coverage.equipment.map(e=>e.id),selected.map(e=>e.id));
assert.equal(coverage.equipment.filter(e=>e.covered).length,1);
assert.equal(coverage.equipment.find(e=>e.covered).id,p.ids.top);
const maskURL=new URL(coverage.covered.url,'http://fixture'+p.bodyTextureCoverage.url).pathname;
assert.equal(digest(readURL(maskURL)),coverage.covered.sha256);
const floor=JSON.parse(readURL('/assets/native-male-factory-v1/native-vroid-male-equipment-v1/generated/floor-measurement.json'));
assert.equal(p.sourceFloorY,floor.sourceFloorY);
assert.throws(()=>resolveEquipmentSet(manifest.items,look.ids,'843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef'),/exact body identity/);
const again=foundationProfile('native-male-7586-v1');again.ids.top='changed';assert.notEqual(foundationProfile('native-male-7586-v1').ids.top,'changed');
console.log(JSON.stringify({schema:'native-male-factory-configuration-CPU-check-v1',passed:true,bodyType:'native-male-7586-v1',resources,sourceFloorY:p.sourceFloorY,coverageManifestSha256:p.bodyTextureCoverage.sha256,coverageAdmissionMatched:true,fullFactoryConstructed:false,rendererOrGPUUsed:false}));
"""
    result=subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,capture_output=True,text=True)
    if result.returncode:raise RuntimeError(result.stderr+'\n'+result.stdout)
    return json.loads(result.stdout)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true',help='Also check actual foundationProfile/outfit/bind and resource contracts without GPU')
    args=parser.parse_args()
    result=stage(ROOT/'assets-source',DEST)
    if args.check:result['profileCPUCheck']=check_profile()
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
