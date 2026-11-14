"""Exactly one 2-thread, 60s maximum independent cloth experiment."""
import json,pathlib,subprocess,sys,time
R=pathlib.Path(__file__).resolve().parents[2];label=sys.argv[1]if len(sys.argv)>1 else'standing-open-v1'
assert label.replace('-','').replace('_','').isalnum();out=R/'experiments/skirt-offline-corrective'/label;out.mkdir();start=time.monotonic()
command=[str(R/'experiments/tools/blender-4.5.9-windows-x64/blender.exe'),'--background','--factory-startup','--threads','2','--python-exit-code','1','--python',str(R/'scripts/m1-assets/trial-standing-native-cloth.py'),'--',str(out)]
if '--local-sim'in sys.argv:command.append('--local-sim')
if '--ring-cage'in sys.argv:command.append('--ring-cage')
with(out/'blender.log').open('w',encoding='utf8')as log:
 try:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,timeout=60,check=False);result={'returncode':r.returncode,'elapsed':time.monotonic()-start}
 except subprocess.TimeoutExpired:result={'returncode':-1,'status':'timeout-rejected','elapsed':time.monotonic()-start}
(out/'run.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'out':str(out),**result}));raise SystemExit(result['returncode']!=0)
