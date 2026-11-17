"""Actual independent rebuild and bounded negative input/overwrite checks."""
from pathlib import Path
import hashlib
import json
import platform
import subprocess
import sys
sys.dont_write_bytecode=True
import numpy as np
from PIL import __version__ as pillow_version
from verify import verify

ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
OUT=ROOT/'evidence/native-vroid-male-unmasked-base-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def write(path,value):
    with path.open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def main():
    assert not (OUT/'qa.json').exists(), 'Existing QA evidence must remain'
    original={p.name:sha(p) for p in (BASE/'generated').iterdir() if p.is_file()}
    rebuild=OUT/'rebuild'
    wrong=OUT/'wrong-source-must-not-exist'
    assert not rebuild.exists() and not wrong.exists()
    def command(name,args):
        p=subprocess.run([sys.executable,'-B',str(BASE/'build.py'),*map(str,args)],cwd=ROOT,capture_output=True)
        row=dict(argv=[sys.executable,'-B','assets-source/native-vroid-male-unmasked-base-v1/build.py',*map(str,args)],
            exitCode=p.returncode,stdout=p.stdout.decode('utf-8',errors='replace'),stderr=p.stderr.decode('utf-8',errors='replace'))
        write(OUT/(name+'.json'),row)
        return row
    positive=command('rebuild-execution',['--out',rebuild])
    assert positive['exitCode']==0,positive
    assert {p.name:sha(p) for p in rebuild.iterdir()}==original, 'Independent rebuild differs'
    rebuilt=verify(rebuild)
    write(OUT/'rebuild-independent-readback.json',rebuilt)
    negative=command('wrong-source-execution',['--source',ROOT/'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm','--out',wrong])
    assert negative['exitCode']!=0 and 'Input identity mismatch' in negative['stderr']
    assert not wrong.exists(), 'Wrong source wrote output'
    conflict=command('existing-output-execution',[])
    assert conflict['exitCode']!=0 and 'Fresh output directory required' in conflict['stderr']
    assert {p.name:sha(p) for p in (BASE/'generated').iterdir() if p.is_file()}==original
    result=dict(schema='male-unmasked-repeat-and-rejection-QA-v1',status='CPU-resource-rebuild-and-rejection-passed-not-factory',
        repeatedResourcesByteExact=original,rebuildIndependentReadbackPassed=True,wrongFemaleSourceRejectedBeforeWrite=True,
        existingOutputsRejectedAndUnchanged=True,python=platform.python_version(),numpy=np.__version__,pillow=pillow_version,
        crossPlatformByteDeterminismVerified=False,studioOrGPUCalls=0,runtimeOrPublicEdited=False)
    write(OUT/'qa.json',result)
    print(json.dumps(result))

if __name__=='__main__':main()
