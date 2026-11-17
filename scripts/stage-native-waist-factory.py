"""Waist data spec for the shared, pinned factory staging implementation."""
from pathlib import Path
import argparse,importlib.util,json
ROOT=Path(__file__).resolve().parents[1]
module=importlib.util.spec_from_file_location('factory_stage',ROOT/'scripts/stage-native-face-factory.py')
x=importlib.util.module_from_spec(module);module.loader.exec_module(x)
SPEC=json.loads((ROOT/'scripts/production/native-import/waist.json').read_text(encoding='utf-8'))
BODY_SHA=SPEC['bodySha256']
FILES=SPEC['files']
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
 print(json.dumps(x.stage(destination=ROOT/'prototype/public/assets/native-waist-factory-v1',source_root=ROOT,check=args.check,spec=SPEC)))
