"""Deterministic geometry-reuse fit packaging; does not run frozen writers."""
from pathlib import Path
import argparse, hashlib, json
ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / 'assets-source/m2-male-jaw-hair-fit-v1'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def encoded(x): return (json.dumps(x, ensure_ascii=False, indent=2)+'\n').encode('utf8')
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,default=PACKAGE);args=ap.parse_args()
    out=args.out.resolve()
    if not out.is_relative_to(PACKAGE.resolve()): raise ValueError('Output must remain within new fit source package')
    pins=json.loads((PACKAGE/'source-pins.json').read_text(encoding='utf8'))
    for p in pins['files']:
        assert sha(ROOT/p['path'])==p['sha256'], 'Frozen input changed: '+p['path']
    source=ROOT/'assets-source/m2-male-hairstyle-v1'
    original=sha(ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm')
    target=sha(ROOT/'assets-source/m2-male-face-v1/generated/avatar.vrm')
    asset=sha(source/'male-sidepart.glb')
    fit={'schema':'character-hair-fit-v1','id':'male-sidepart-jaw-fit-v1','version':1,
         'styleId':'male-sidepart-v1','targetBodySha256':target,'sourceBodySha256':original,
         'assetSha256':asset,'attachment':{'bone':'head','space':'raw-head-bind-local','position':[0,0,0],'quaternion':[0,0,0,1],'scale':[1,1,1]},
         'sourceMaterial':'M00_000_HairBack_00_HAIR','physics':'rigid',
         'geometryReuse':True,'rawBone':'J_Bip_C_Head',
         'hideOriginal':{'sourceMesh':0,'primitive':5,'materialNames':['M00_000_HairBack_00_HAIR'],'hideWholeBody':False},
         'provenance':{'sourcePackage':'assets-source/m2-male-hairstyle-v1','originalFitSha256':sha(source/'fit.json'),'sourcePinsSha256':sha(PACKAGE/'source-pins.json')},
         'evidence':'evidence/m2-male-jaw-hair-fit-v1/geometry-report.json',
         'limits':['Static geometry/source validation only; runtime and visual checks are separate.','Original Face 75 strict intersection pairs retained; not an alpha-aware zero-contact claim.','No dynamics; same original-author GLB bytes and extras retained.']}
    fitBytes=encoded(fit)
    manifest={'schema':'character-hairstyle-v1','id':'male-sidepart-v1','label':'偏侧蓬松短发 · 男性下颌派生适配',
        'mount':'head','headLocal':True,'sourceMaterial':fit['sourceMaterial'],
        'url':'/assets/m2-male-jaw-hair-fit-v1/male-sidepart.glb','sha256':asset,
        'compatibleBodies':[target],'physics':'rigid',
        'fit':{'id':fit['id'],'version':1,'url':'/assets/m2-male-jaw-hair-fit-v1/fit.json','sha256':hashlib.sha256(fitBytes).hexdigest()}}
    params={'method':'reuse-exact-existing-hair-geometry','styleId':fit['styleId'],'fitId':fit['id'],'version':1,
        'originalParametersSha256':sha(source/'parameters.json'),'geometryDeltaM':0,'attachment':fit['attachment'],
        'editableSource':'editable.blend','editableContext':'Original male context retained; jaw placement is defined by fit and verified equal Head bind. No claim the contextual body is jaw.',
        'editableSourceSha256':sha(source/'editable.blend'),'sourcePins':'source-pins.json'}
    files={'fit.json':fitBytes,'manifest.json':encoded(manifest),'parameters.json':encoded(params),
           'male-sidepart.glb':(source/'male-sidepart.glb').read_bytes(),
           'editable.blend':(source/'editable.blend').read_bytes(),
           'provenance.json':(source/'provenance.json').read_bytes()}
    out.mkdir(parents=True,exist_ok=True)
    for name,data in files.items(): (out/name).write_bytes(data)
    print(json.dumps({k:hashlib.sha256(v).hexdigest()for k,v in files.items()}))
if __name__=='__main__': main()
