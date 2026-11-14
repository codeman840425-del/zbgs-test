"""Run one <=180s, 2-thread Blender trial after parent grants the CPU window."""
import argparse, json, pathlib, subprocess, time
ROOT=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('capture');parser.add_argument('--trial',default='trial-01');parser.add_argument('--execute',action='store_true');args=parser.parse_args()
capture=pathlib.Path(args.capture).resolve();out=(capture/args.trial).resolve()
assert out.parent==capture,'Trial must be a direct child directory'
config=json.loads((ROOT/'assets-source/m1/offline-corrective/config.json').read_text(encoding='utf8'))
command=[str(ROOT/'experiments/tools/blender-4.5.9-windows-x64/blender.exe'),'--background','--factory-startup','--threads','2','--python-exit-code','1','--python',str(ROOT/'scripts/m1-assets/bake-skirt-corrective.py'),'--',str(capture),str(out)]
if not args.execute:print(json.dumps({'command':command,'timeoutSeconds':180,'status':'plan-only'},indent=2));raise SystemExit()
assert not out.exists(),'Refuse to overwrite trial; choose a new --trial label'
out.mkdir()
started=time.monotonic();status='failed'
with (out/'blender.log').open('w',encoding='utf8')as log:
    try:
        r=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,timeout=180,check=False)
        status='baked-unreviewed'if r.returncode==0 and (out/'targets.json').exists()else'failed'
        result={'status':status,'returncode':r.returncode,'seconds':time.monotonic()-started}
    except subprocess.TimeoutExpired:result={'status':'timeout-rejected-first-trial','seconds':time.monotonic()-started}
(out/'run.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));raise SystemExit(0 if status=='baked-unreviewed'else 1)
