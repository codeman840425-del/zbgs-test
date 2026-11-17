"""Fresh actual rebuilds of male pieces/coverage, then identity/read-only checks."""
from pathlib import Path
import hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
COVERAGE=ROOT/'assets-source/native-vroid-male-body-texture-fit-v1'
OUT=ROOT/'evidence/native-vroid-male-equipment-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def write(path,value):
    with path.open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def main():
    assert not (OUT/'qa.json').exists()
    checks=[]
    for label,package in [('equipment',BASE),('coverage',COVERAGE)]:
        initial={p.name:sha(p) for p in (package/'generated').iterdir()}
        repeat=OUT/(label+'-repeat');assert not repeat.exists()
        command=[sys.executable,'-B',str(package/'build.py'),'--out',str(repeat)]
        result=subprocess.run(command,cwd=ROOT,capture_output=True)
        write(OUT/(label+'-repeat-execution.json'),dict(argv=command,exitCode=result.returncode,stdout=result.stdout.decode(),stderr=result.stderr.decode()))
        assert result.returncode==0
        assert {p.name:sha(p) for p in repeat.iterdir()}==initial,'Actual rebuild differs'
        conflict=subprocess.run([sys.executable,'-B',str(package/'build.py')],cwd=ROOT,capture_output=True)
        assert conflict.returncode!=0 and b'Fresh output directory required' in conflict.stderr
        assert {p.name:sha(p) for p in (package/'generated').iterdir()}==initial
        write(OUT/(label+'-existing-output-rejection.json'),dict(exitCode=conflict.returncode,stderr=conflict.stderr.decode(),outputsUnchanged=True))
        checks.append(dict(package=package.relative_to(ROOT).as_posix(),resourceHashes=initial,rebuildByteExact=True,existingOutputRejected=True))
    write(OUT/'qa.json',dict(schema='male-equipment-and-coverage-repeat-QA-v1',checks=checks,
        runtimeAndPublicEdited=False,studioOrGPUCalls=0,crossPlatformDeterminismVerified=False,
        preparationFailure=dict(kind='Coverage dict comparison treated omitted texCoord0 as different',
            snapshot='evidence/native-vroid-male-equipment-v1/first-coverage-build.py.txt',
            firstError='AssertionError at assert t==s; no output directory created',
            correction='Compare exact index/extensions plus glTF-default texCoord0, matching existing female producer; no data or tolerance changed')))
    print(json.dumps({'actualRebuildPackages':2,'allResourcesByteExact':True,'existingOutputRejected':True}))

if __name__=='__main__':main()
