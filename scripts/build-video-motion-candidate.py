"""Build an isolated current-game video-action candidate; no public pointer changes."""
from pathlib import Path
import shutil,json,hashlib,subprocess,argparse
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--asset-dir',default='assets-source/video-motion-v1')
parser.add_argument('--output-dir',default='experiments/video-motion-room-v1')
args=parser.parse_args()
OUT=(ROOT/args.output_dir).resolve()
assert OUT.is_relative_to(ROOT/'experiments'), 'Candidate output must stay under experiments'
assert not OUT.exists(), 'Use a new version; never replace fixed evidence'
p=OUT/'prototype';p.mkdir(parents=True)
for name in ['src','scripts','public']:
 shutil.copytree(ROOT/'prototype'/name,p/name)
for name in ['package.json','package-lock.json','vite.config.js','index.html','foundation.html']:
 shutil.copy2(ROOT/'prototype'/name,p/name)
a=ROOT/args.asset_dir;m=p/'public/assets/motion/m1c'
e=json.loads((a/'dance-imports.entry.json').read_text())
assert hashlib.sha256((a/e['file']).read_bytes()).hexdigest()==e['sha256']
shutil.copy2(a/e['file'],m/e['file'])
f=m/'dance-imports.json';j=json.loads(f.read_text());j['entries'].append(e);f.write_text(json.dumps(j,ensure_ascii=False,indent=2),encoding='utf-8')
# Local package resolution only; pinned lockfile is copied and receipt records it.
subprocess.run(['cmd','/c','mklink','/J',str(p/'node_modules'),str(ROOT/'prototype/node_modules')],check=True)
subprocess.run(['node','scripts/build-id.mjs'],cwd=p,check=True)
subprocess.run(['node',str(ROOT/'prototype/node_modules/vite/bin/vite.js'),'build','--outDir','../dist'],cwd=p,check=True)
receipt={'source':'current prototype exact copy plus manifest entry; no controller edits','entry':e,'build':json.loads((p/'public/build-info.json').read_text()),'inputs':{str(x.relative_to(p)):hashlib.sha256(x.read_bytes()).hexdigest() for x in p.rglob('*') if x.is_file() and 'node_modules' not in x.parts}}
(OUT/'source-copy-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
