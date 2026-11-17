from pathlib import Path
import importlib.util,json,sys
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent
sp=importlib.util.spec_from_file_location('bridge',ROOT/'assets-source/vroid-bridge-study-v1/call.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
def payload(r,ok=True):
 if ok:assert r['ok'] is True,r.get('failures')
 return json.loads(next(b['text'] for x in r['responses'] if x.get('id')==2 for b in x['result']['content'] if b.get('type')=='text'))
def call(name,tool,args,allowHair=False):
 req=BASE/'requests'/(name+'.json');out=BASE/'records'/(name+'.json');req.parent.mkdir(parents=True,exist_ok=True)
 with req.open('x',encoding='utf8') as f:json.dump({'method':'tools/call','params':{'name':tool,'arguments':args}},f,indent=2);f.write('\n')
 try:r=m.run_call(req,out)
 except SystemExit:
  r=json.loads(out.read_bytes());assert allowHair and tool=='vroid_list_hair_materials';return payload(r,False)
 return payload(r)
