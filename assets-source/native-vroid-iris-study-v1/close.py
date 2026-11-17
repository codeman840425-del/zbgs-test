"""Seal one completed native color sample. No editor/API or image mutations."""
from pathlib import Path
import hashlib,json,platform,sys
sys.dont_write_bytecode=True
import numpy as np
from PIL import __version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def ref(p):
    p=Path(p)
    return dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size)

def write(name,value):
    with (BASE/name).open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def main():
    cycle=json.loads((BASE/'native-cycle.json').read_bytes());result=json.loads((BASE/'cpu-readback/result.json').read_bytes());entry=json.loads((BASE/'cpu-readback/iris-material.json').read_bytes())
    assert cycle['failure'] is None and not result['failures'] and result['allAccessorsExact']
    assert cycle['restored']['ready'] and cycle['restored']['dirty'] is False
    for r in [cycle['source'],cycle['entry']]+cycle['generated']:
        assert sha(ROOT/r['path'])==r['sha256']
    for x in (BASE/'records').glob('*.json'):
        r=json.loads(x.read_bytes());assert r['ok'],x
    payload=lambda p:json.loads(next(c['text'] for r in json.loads(p.read_bytes())['responses'] if r.get('id')==2 for c in r['result']['content'] if c['type']=='text'))
    assert payload(BASE/'records/16-export-vrm1.json')['warnings']==[]
    runtime_target=ROOT/'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm'
    assert sha(runtime_target)=='7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'
    write('manifest.json',dict(schema='native-iris-color-source-v1',id='native-male-iris-green-v1',version=1,status='source-produced-runtime-pending',sourceEditable=cycle['source'],nativeEditable=ref(BASE/'generated/male-iris-green.vroid'),nativeVrm=result['candidate'],originalVrm=result['source'],targetColorRGBA=cycle['targetRGBA'],targetHex=cycle['targetHex'],image=entry['extractedImage'],consumer=entry['candidate'],sourceImage=ref(BASE/'cpu-readback/source-iris.png'),possibleRuntimeTarget=ref(runtime_target),runtimeTargetAdmitted=False,scope='paired iris native calibration only',runtimeAccepted=False,characterControllerChanged=False,licenseMeta=result['candidateMeta']))
    dependencies=[ROOT/'assets-source/vroid-bridge-study-v1/call.py',ROOT/'scripts/m2-male-face-v1/glb.py',ROOT/'assets-source/native-vroid-color-preflight-v1/result.json',ROOT/'experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0/mcp_server/vroid_mcp.py']
    records=list((BASE/'records').glob('*.json'))
    write('closure.json',dict(schema='native-paired-iris-study-closure-v1',status=result['status'],nativeSeconds=cycle['wallSeconds'],nativeExportSeconds=json.loads((BASE/'records/16-export-vrm1.json').read_bytes())['wallSeconds'],cpuReadbackSeconds=result['wallSeconds'],nativeRequestCount=len(records),sourceBytes=result['source']['bytes'],candidateBytes=result['candidate']['bytes'],producedResourceBytes=sum(p.stat().st_size for p in (BASE/'generated').iterdir() if p.is_file()),imageBytes=entry['extractedImage']['bytes'],all139AccessorsExact=len(result['accessors'])==139 and result['allAccessorsExact'],nonTargetImageBytesExact=all(r['encodedExact'] for r in result['images'] if r['role']=='non-target'),repeatExtractionByteExact=result['repeatExtractionByteExact'],windowReleased=True,desktopInput=False,originalsUnchanged=True,sourceAuthorSelfCheck=True,independentAudit=False,runtimeAccepted=False,dependencies=[ref(p) for p in dependencies],toolVersions=dict(python=platform.python_version(),numpy=np.__version__,pillow=pillow_version),files=[ref(BASE/p) for p in ['native-cycle.json','cold-reopen-readback.json','cpu-readback/result.json','cpu-readback/iris-material.json','manifest.json','README.md']]))
    rows=[ref(p) for p in sorted(BASE.rglob('*')) if p.is_file() and p.name!='package-files.json']
    write('package-files.json',dict(schema='native-iris-study-package-files-v1',files=rows))
    for r in rows:assert sha(ROOT/r['path'])==r['sha256'] and (ROOT/r['path']).stat().st_size==r['bytes']
    print(json.dumps(dict(manifest=ref(BASE/'manifest.json'),closure=ref(BASE/'closure.json'),inventory=ref(BASE/'package-files.json'),files=len(rows))))

if __name__=='__main__':main()
