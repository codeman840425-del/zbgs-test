"""Run from any directory with python -B path/to/replay.py. Prints the read-only receipt."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root/'scripts/production'))
from asset_budget import budget_config, check

pair = root/'output/m2-rule-batch-delivery-v1/pair'
fixed = root/'experiments/worktrees/shape-ext-a-6e858e51'
game = pair/'game'
read = lambda path: json.loads(path.read_bytes())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
version = 'm2-technical-v1'
config_path = root/'scripts/production/asset-budgets-v1.json'
config = budget_config(config_path,version)
manifest = read(game/'runtime-package.json')
records = read(pair/'records.json')
runtime = manifest['runtime']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=fixed,text=True).strip()==runtime['sourceCommit']
assert sha(game/'runtime-package.json')==read(pair/'receipt.json')['packageManifestSha256']
ids = [record['identity']['id'] for record in records]
assert ids==['public-batch-a','public-batch-b']
args = ['-B','scripts/production/record_budget.py','measure',str((pair/'records.json').relative_to(root)),
        '--source-root',str(fixed.relative_to(root)),'--budget-version',version,
        '--concurrent-group',ids[0],'--concurrent-group',ids[1],'--concurrent-group',*ids]
result = subprocess.run([sys.executable,*args],cwd=root,capture_output=True)
exact = json.loads(result.stdout)
rows = {row['path']:row for row in manifest['files']}
models, actors = {}, []
additive = ['fileBytes','primitiveVertices','nodeTriangles','primitives','materials','textures','images','rgba8MipBytes']
for record in records:
    base = record['appearanceRecipe']['base']
    body = 'assets/'+base['bodyType']+'/body.vrm'
    outfit = record['appearanceRecipe']['equipment']['resources']
    assets = [(body,base['sha256'],'body')] + [(outfit[slot]['url'][1:],outfit[slot]['sha256'],'garment')
                                                for slot in ('top','pants','shoes')]
    names = []
    for name,pin,kind in assets:
        names.append(name)
        assert rows[name]['sha256']==pin
        if name in models:
            continue
        cost = check(game/name,kind,config)
        assert cost['sha256']==pin and cost['metrics']['fileBytes']==rows[name]['bytes']
        models[name]={'sha256':pin,'class':kind,'singleAssetStatus':cost['status'],
                      'violations':cost['violations'],'metrics':cost['metrics']}
    actors.append({'id':record['identity']['id'],'recordSha256':record['integrity']['recordSha256'],
                   'selectedModelFiles':names,
                   'standaloneModelSums':{k:sum(models[n]['metrics'][k] for n in names) for k in additive}})

physical = {p.relative_to(game).as_posix():p for p in game.rglob('*') if p.is_file()}
assert physical.keys()==rows.keys()|{'runtime-package.json'}
for n,row in rows.items():
    assert physical[n].stat().st_size==row['bytes'] and sha(physical[n])==row['sha256']
shared = sorted(set(actors[0]['selectedModelFiles']) & set(actors[1]['selectedModelFiles']))
assert len(models)==5 and len(shared)==3
assert all(sum(sha(p)==models[n]['sha256'] for p in physical.values())==1 for n in shared)
cold = root/'evidence/m2-rule-batch-delivery-v1/cold/report.json'
report = {'sourceCommit':runtime['sourceCommit'],'build':runtime['buildId'],
          'packageManifestSha256':sha(game/'runtime-package.json'),'recordsFileSha256':sha(pair/'records.json'),
          'budgetVersion':version,'budgetConfigFileSha256':sha(config_path),
          'recordBudget':{'command':['python',*args],'exitCode':result.returncode,'response':exact},
          'assets':models,'actors':actors,'sharedModelPaths':shared,
          'combinedStandaloneModels':{k:sum(a['standaloneModelSums'][k] for a in actors) for k in additive},
          'physicalGamePackage':{'filesIncludingManifest':len(physical),'expandedFileBytes':sum(p.stat().st_size for p in physical.values()),
                                 'selectedUniqueModelBytes':sum(v['metrics']['fileBytes'] for v in models.values()),
                                 'sharedGarmentFileBytes':sum(models[n]['metrics']['fileBytes'] for n in shared)},
          'coldReceipt':{'path':cold.relative_to(root).as_posix(),'sha256':sha(cold),'status':read(cold)['status'],
                         'transportScope':read(cold)['transportScope']},
          'interpretation':{'actorAndPair':'Arithmetic sums of selected standalone model definitions. Includes each actor’s three garment models. Exact record/concurrent-group assessment unavailable.',
                            'rgba8MipBytes':'Static hypothetical RGBA8 image/mip allocation. GPU allocations, dynamic maps, hidden drawables and browser sharing are not measured.',
                            'transfer':'Physical file lengths in the unpacked game; actual requests, HTTP/CDP wire bytes, and cache behaviour unmeasured for this pair.',
                            'ordinaryPCPerformance':'unmeasured','wholeOutfitAdmission':'not-evaluated'}}
print(json.dumps(report,ensure_ascii=True,indent=2))
