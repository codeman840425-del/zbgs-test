"""Final fixed source/receipt/repeat inventory audit. No Blender execution."""
import ast,copy,hashlib,json,subprocess,sys,types,argparse
from pathlib import Path
ROOT=Path('F:/gamemake-representative-cage-trial')
OUT=Path(__file__).resolve().parent
BASE=ROOT/'assets-source/m2-representative-cage-trial-v1'
PIN='d31ce67e7c6ea5aab3ec8d6abe914add5eea4e0a'
def sha(data):return hashlib.sha256(data).hexdigest()
def require(value,message):
    if not value:raise ValueError(message)
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==PIN
expected={'verified/preflight.json':'221061315809ce1f2b8bb352f57d6bf5ff6a2072a38625a6755ef6fabc92e02c','verified/batch.json':'2e033090e1c233da0807067697562dc6c1ee89fdd07b0a8bad70645bebd2b7c5','verified/qa.json':'8a3b5ea16702bf8ae6b08a53c4279aa69f85b51bddd4cf90c33cff283d950bea','package-files.json':'df7835680aaae9f181f6d77ec8d77d344426a5369d089a1dbbdcffa5b9d04a42'}
for rel,digest in expected.items():assert sha((BASE/rel).read_bytes())==digest
inventory=json.loads((BASE/'package-files.json').read_bytes())
assert len(inventory['files'])==134
inventory_rows=[]
for entry in inventory['files']:
    data=(ROOT/entry['path']).read_bytes()
    blob=subprocess.check_output(['git','cat-file','blob',PIN+':'+entry['path']],cwd=ROOT)
    assert data==blob and sha(blob)==entry['sha256'] and len(blob)==entry['bytes'],entry['path']
    inventory_rows.append({'path':entry['path'],'sha256':entry['sha256'],'worktreeAndGitBlobExact':True})
repeat=json.loads((BASE/'repeat.json').read_bytes())
assert len(repeat['assets'])==32
for entry in repeat['assets']:
    original=(BASE/entry['path']).read_bytes();repeated=(BASE/entry['repeatedPath']).read_bytes()
    assert original==repeated and sha(original)==entry['sha256'] and len(original)==entry['bytes']
prior=json.loads((OUT/'actual-container-probe.json').read_bytes())
assert {x['sha256'] for x in prior['cases']}=={x['sha256'] for x in repeat['assets']}
preflight=json.loads((BASE/'verified/preflight.json').read_bytes())
batch=json.loads((BASE/'verified/batch.json').read_bytes())
qa=json.loads((BASE/'verified/qa.json').read_bytes())
assert batch['receipt']==preflight['receipt']
assert len(batch['variants'])==len(qa['variants'])==8
assert all(r['status']=='failed-production-admission' for r in qa['variants'])
assert not preflight['runtimeAccepted'] and not batch['runtimeAccepted'] and not qa['runtimeAccepted']
spec=json.loads((BASE/'spec.json').read_bytes())
source_file=ROOT/'scripts/m2-representative-cage-trial-v1/preflight.py'
tree=ast.parse(source_file.read_bytes())
functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['input_receipt','group_records']]
# Supply only recorded app metadata and the actual hashed installed binary path.
# This checks Python entry guards, never bpy modifier behavior.
app=types.SimpleNamespace(binary_path='F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe',version_string=preflight['blenderVersion'],build_hash=preflight['blenderBuildHash'].encode())
namespace={'Path':Path,'ROOT':ROOT,'BASE':BASE,'__file__':str(source_file),'sha':sha,'require':require,'bpy':types.SimpleNamespace(app=app)}
exec(compile(ast.Module(body=functions,type_ignores=[]),str(source_file),'exec'),namespace)
actual_receipt=namespace['input_receipt'](spec)
assert actual_receipt==preflight['receipt']
negative=[]
for name,mutate in [('bad body SHA',lambda s:s['sources']['female']['body'].update(sha256='0'*64)),('bad binary SHA',lambda s:s['tool'].update(sha256='0'*64)),('bad version',lambda s:s['tool'].update(version='0.0')),('bad build',lambda s:s['tool'].update(buildHash='invalid'))]:
    bad=copy.deepcopy(spec);mutate(bad)
    try:namespace['input_receipt'](bad)
    except ValueError:negative.append(name)
    else:raise AssertionError(name)
class PrepareReached(Exception):pass
def stop_before_solve(*args):raise PrepareReached()
main_ast=next(n for n in ast.parse((ROOT/'scripts/m2-representative-cage-trial-v1/batch.py').read_bytes()).body if isinstance(n,ast.FunctionDef) and n.name=='main')
main_namespace={**namespace,'argparse':argparse,'sys':sys,'json':json,'input_receipt':namespace['input_receipt'],'solve_source':stop_before_solve}
exec(compile(ast.Module(body=[main_ast],type_ignores=[]),'actual-batch-main','exec'),main_namespace)
entry_results=[]
for label,receipt in [('valid',actual_receipt),('missing',None),('stale-producer',copy.deepcopy(actual_receipt)),('stale-input',copy.deepcopy(actual_receipt))]:
    if label=='stale-producer':receipt['producer'][0]['sha256']='0'*64
    if label=='stale-input':receipt['inputs'][0]['sha256']='0'*64
    case=OUT/'final-entry-cases'/label;case.mkdir(parents=True,exist_ok=False)
    data={'status':'preflight-passed'}
    if receipt is not None:data['receipt']=receipt
    (case/'preflight.json').write_text(json.dumps(data),encoding='utf-8')
    argv=sys.argv;sys.argv=['batch.py','--','--out',str(case)]
    try:
        main_namespace['main']()
        raise AssertionError('Unexpected solve/output')
    except PrepareReached:
        assert label=='valid';entry_results.append({'case':label,'result':'accepted-until-solve-boundary'})
    except ValueError as error:
        assert label!='valid';entry_results.append({'case':label,'result':'rejected-before-solve','error':str(error)})
    finally:sys.argv=argv
snapshot=OUT/'snapshot-final';snapshot.mkdir(exist_ok=False)
for rel in ['spec.json','package-files.json','repeat.json','verified/preflight.json','verified/batch.json','verified/qa.json']:
    target=snapshot/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((BASE/rel).read_bytes())
for p in (ROOT/'scripts/m2-representative-cage-trial-v1').glob('*.py'):(snapshot/p.name).write_bytes(p.read_bytes())
result={'commit':PIN,'pins':expected,'inventoryCount':len(inventory_rows),'inventory':inventory_rows,'repeatAssetCount':32,'repeatMatchesPriorIndependentGeometrySnapshot':True,'inputReceiptExact':True,'inputGuardNegatives':negative,'actualBatchMainEntryChecks':entry_results,'entryCheckScope':'Actual Python input_receipt and batch.main AST executed with recorded app metadata and actual files. Stops before solve_source. Blender APIs never executed.','qaStatuses':qa['variants'],'geometryRerun':False,'blenderExecuted':False}
(OUT/'final-pin-probe.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())
print(json.dumps({'commit':PIN,'inventoryGitBlobsExact':len(inventory_rows),'repeatResourcesExact':32,'receiptExact':True,'entryChecks':entry_results,'sourceGuardNegatives':len(negative),'qaFailed':len(qa['variants'])}))
