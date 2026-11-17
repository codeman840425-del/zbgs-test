"""Summarize saved CPU arrays and verify deterministic rebuild; no pose evaluation."""
from pathlib import Path
import hashlib
import json
import math
import struct
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[2]
PKG=Path(__file__).resolve().parent
OUT=ROOT/'evidence/native-vroid-equipment-v1'
sha=lambda b:hashlib.sha256(b).hexdigest()
def write(name,value):
    with (OUT/name).open('x',encoding='utf-8') as f:json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')
layout=json.loads((OUT/'skin-coordinates-layout.json').read_text())['arrayLayout']
raw=(OUT/'skin-coordinates.f64').read_bytes()
def quantile(a,q):
    n=(len(a)-1)*q;i=int(n);return a[i]+(a[min(i+1,len(a)-1)]-a[i])*(n-i)
rows=[]
for row in layout:
    values=struct.unpack_from('<'+'d'*row['count'],raw,row['offsetFloat64']*8)
    errors=sorted(math.dist(values[i:i+3],values[i+3:i+6]) for i in range(0,len(values),6))
    rows.append(dict(case=row['case'],id=row['id'],vertices=len(errors),nonzero=sum(v!=0 for v in errors),errorNm=dict(max=max(errors)*1e9,p50=quantile(errors,.5)*1e9,p95=quantile(errors,.95)*1e9,p99=quantile(errors,.99)*1e9),initialOneNmPass=max(errors)<=1e-9))
write('statistics.json',dict(schema='native-equipment-saved-array-statistics-v1',coordinatesSha256=sha(raw),rows=rows))
start=time.monotonic()
rebuilt=subprocess.run([sys.executable,'-B',str(PKG/'build.py'),'--check'],capture_output=True,encoding='utf-8',timeout=60)
write('rebuild.json',dict(command='python -B assets-source/native-vroid-equipment-v1/build.py --check',exitCode=rebuilt.returncode,wallSeconds=time.monotonic()-start,stdout=rebuilt.stdout,stderr=rebuilt.stderr))
assert rebuilt.returncode==0
inputs=['assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm','scripts/verify-catalog-bindings.mjs','scripts/m1-assets/qa-skirt-equivalence.mjs','scripts/m1-variants/build-equipment.py','prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js','prototype/node_modules/three/src/objects/SkinnedMesh.js','prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js','prototype/node_modules/three/package.json','prototype/node_modules/@pixiv/three-vrm/package.json']
def receipt(p):
    b=p.read_bytes();return dict(path=p.relative_to(ROOT).as_posix(),bytes=len(b),sha256=sha(b))
write('closure.json',dict(schema='native-vroid-equipment-closure-v1',inputs=[receipt(ROOT/p) for p in inputs],python=sys.version,node=subprocess.run(['node','--version'],capture_output=True,text=True).stdout.strip(),status='raw-extraction-preserved; runtime-float32-drift-failed-original-1nm-experiment; integration-not-admitted',noRuntimeChangesByThisPackage=True))
files=[receipt(p) for folder in (PKG,OUT) for p in sorted(folder.iterdir()) if p.is_file() and p.name!='package-files.json']
with (PKG/'package-files.json').open('x',encoding='utf-8') as f:json.dump(dict(schema='native-equipment-package-files-v1',files=files),f,indent=2);f.write('\n')
print(json.dumps(dict(files=len(files),statistics=rows)))
