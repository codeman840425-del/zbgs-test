"""Waist data spec for the shared, pinned factory staging implementation."""
from pathlib import Path
import argparse,importlib.util,json
ROOT=Path(__file__).resolve().parents[1]
module=importlib.util.spec_from_file_location('factory_stage',ROOT/'scripts/stage-native-face-factory.py')
x=importlib.util.module_from_spec(module);module.loader.exec_module(x)
BODY_SHA='cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5'
PREFIX='assets-source/native-vroid-waist-factory-equipment-v1/'
FILES={
 'generated/female-geometry-waist-unmasked.vrm':('assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-waist-unmasked.vrm',BODY_SHA),
 'equipment.json':(PREFIX+'equipment.json','59992ef62df1363660870e73ffc6769d8ffabfb94e0391139eff8a0188d42bce'),
 'native-vroid-waist-geometry-top-v1.glb':(PREFIX+'native-vroid-waist-geometry-top-v1.glb','c0c6ef880c572446df6b6b3a30460f86fa9e9cad2f519eb9b42aea2013c677f6'),
 'native-vroid-waist-geometry-shorts-v1.glb':(PREFIX+'native-vroid-waist-geometry-shorts-v1.glb','1cd9a14ddd7f833679da0ccb54b1a2327c38a2a3e08c57ade80a15f74021e75c'),
 'native-vroid-waist-geometry-shoes-v1.glb':(PREFIX+'native-vroid-waist-geometry-shoes-v1.glb','33a97b9b7ad594c86cbaed56e83c0b9dfabfaa10b68d8d3c44ef78d9e01a8356'),
 'manifest.json':('assets-source/native-vroid-waist-body-texture-fit-v1/manifest.json','46a868ddc366a4f64de1154cbea3f70478b3f8406ceddb5a79d2b174ef373d5e'),
 'native-tops-body.png':('assets-source/native-vroid-waist-body-texture-fit-v1/native-tops-body.png','dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c'),
}
SPEC=dict(files=FILES,bodySha256=BODY_SHA,bodyType='native-female-waist-v1',urlRoot='/assets/native-waist-factory-v1/',schema='native-waist-factory-staging-v1')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
 print(json.dumps(x.stage(destination=ROOT/'prototype/public/assets/native-waist-factory-v1',source_root=ROOT,check=args.check,spec=SPEC)))
