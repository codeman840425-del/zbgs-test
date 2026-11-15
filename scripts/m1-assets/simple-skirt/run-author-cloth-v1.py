"""Hard60-second process budget for the single isolated Blender author attempt."""
from pathlib import Path
import hashlib,json,subprocess,time
R=Path(__file__).resolve().parents[3];O=R/'assets-source/m1/simple-skirt-v1/active-gap-hem-v1/native-author-trial-v1'
O.mkdir(exist_ok=True);assert not(O/'runner-result.json').exists(),'One frozen trial only'
blender=Path('F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe');script=R/'scripts/m1-assets/simple-skirt/trial-author-cloth-v1.py'
cmd=[str(blender),'--background','--factory-startup','--threads','2','--python-exit-code','1','--python',str(script)];start=time.monotonic();timeout=False
try:
    result=subprocess.run(cmd,cwd=R,capture_output=True,timeout=60);output=result.stdout+result.stderr;code=result.returncode
except subprocess.TimeoutExpired as e:
    output=(e.stdout or b'')+(e.stderr or b'');code=None;timeout=True
(O/'blender.log').write_bytes(output)
report={'command':cmd,'timeoutSeconds':60,'threads':2,'timedOut':timeout,'returnCode':code,'wallSeconds':time.monotonic()-start,'scriptSha256':hashlib.sha256(script.read_bytes()).hexdigest(),'frameFiles':len(list(O.glob('frame-*.json.gz'))),'resultExists':(O/'result.json').exists(),'note':'Timeout kills the sole Blender process; no background server or retries.'}
(O/'runner-result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report));print(output.decode('utf-8',errors='replace')[-6000:])
