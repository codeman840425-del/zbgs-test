"""One explicitly recorded native hairset-study call through original Bridge."""
from pathlib import Path
import importlib.util,json,sys
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sp=importlib.util.spec_from_file_location('original_bridge_call',ROOT/'assets-source/vroid-bridge-study-v1/call.py')
client=importlib.util.module_from_spec(sp);sp.loader.exec_module(client)

def payload(record,require_ok=True):
    if require_ok:assert record['ok'] is True,record.get('failures')
    response=next(r for r in record['responses'] if r.get('id')==2)
    return json.loads(next(b['text'] for b in response['result']['content'] if b.get('type')=='text'))

def call(name,tool,args,allow_known_hair_layer_error=False):
    requests=BASE/'requests';records=BASE/'records'
    requests.mkdir(parents=True,exist_ok=True);records.mkdir(exist_ok=True)
    request=requests/(name+'.json');output=records/(name+'.json')
    with request.open('x',encoding='utf-8') as f:json.dump(dict(method='tools/call',params=dict(name=tool,arguments=args)),f,indent=2);f.write('\n')
    try:record=client.run_call(request,output)
    except SystemExit:
        record=json.loads(output.read_bytes())
        assert allow_known_hair_layer_error and tool=='vroid_list_hair_materials', 'Unapproved native failure retained'
        value=payload(record,False)
        assert isinstance(value,list)
        errors=[]
        def walk(x):
            if isinstance(x,dict):
                if 'error' in x:errors.append(x['error'])
                for y in x.values():walk(y)
            elif isinstance(x,list):
                for y in x:walk(y)
        walk(value)
        assert errors and all(e=='texture is not editable yet' for e in errors), 'Different hair material error; stop'
        print(json.dumps({'preservedCallOk':False,'onlyKnownReadonlyHairLayerErrors':len(errors)}))
        return value
    return payload(record)

if __name__=='__main__':
    print(json.dumps(call(sys.argv[1],sys.argv[2],json.loads(sys.argv[3]) if len(sys.argv)>3 else {}),ensure_ascii=False))
