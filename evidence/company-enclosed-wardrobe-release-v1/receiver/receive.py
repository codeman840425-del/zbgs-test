"""Offline second author. Run with a sealed package, its manifest SHA, four art inputs, a new trial and a receipt directory."""
from pathlib import Path
from hashlib import sha256
import argparse, json, os, shutil, struct, subprocess, sys

args = argparse.ArgumentParser(description=__doc__)
for name in ('candidate', 'manifest', 'art', 'trial', 'out'):
    args.add_argument('--'+name, required=True)
args = args.parse_args()
master, trial, art, out = (Path(v).resolve() for v in (args.candidate,args.trial,args.art,args.out))
assert not sys.flags.optimize and master!=trial and master not in trial.parents and master not in out.parents
out.mkdir(parents=True,exist_ok=True)
source=trial/'source'
scripts='scripts/company-platform/'
batch=scripts+'batch-inputs/enclosed-wardrobe-rooms.json'
asset_dir='assets-source/company-receiver-louvered-wardrobe'
ref={'id':'enclosed-wardrobe-louvered-ash','version':1}
keys=['closet-rental','closet-floor']
wardrobe_id='closet-rental/ground/dressing/wardrobe'
art_names=('author.py','louvered.glb','LICENSE.txt','recipe.json')
def digest(p): return sha256(p.read_bytes()).hexdigest()
def tree(p): return {f.relative_to(p).as_posix():digest(f) for f in sorted(p.rglob('*')) if f.is_file()}
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,obj): p.write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
def extended(p): return chr(92)*2+'?'+chr(92)+str(p.resolve()) if os.name=='nt' else str(p)
def copytree(src,dst): shutil.copytree(extended(src),extended(dst),dirs_exist_ok=True)
def run(name,cwd,cmd,bad=False):
    env={**os.environ,'npm_config_offline':'true','npm_config_audit':'false','npm_config_fund':'false'}
    p=subprocess.run([str(c) for c in cmd],cwd=cwd,env=env,capture_output=True,encoding='utf8',errors='replace')
    (out/(name+'.log')).write_text(p.stdout+p.stderr,encoding='utf8')
    with (out/'commands.jsonl').open('a',encoding='utf8') as f:
        f.write(json.dumps(dict(label=name,cwd=str(cwd),argv=list(map(str,cmd)),returncode=p.returncode),ensure_ascii=False)+'\n')
    assert (p.returncode!=0)==bad,(name,p.stdout[-900:],p.stderr[-1600:])
    return (p.stdout or p.stderr).strip()
def build(name,src,install=False):
    cwd=src/'prototype'
    if install:run(name+'-install',cwd,['npm.cmd' if os.name=='nt' else 'npm','ci','--offline','--no-audit','--no-fund'])
    identity=run(name+'-id',cwd,['node','scripts/build-company-id.mjs'])
    run(name+'-vite',cwd,['node','node_modules/vite/bin/vite.js','build','--config','vite.company.config.js'])
    return identity
def verify(name,where,pin):
    v=json.loads(run(name,where,['node','verify.mjs','.',pin]))
    assert v['ok'] and v['checkedFiles']==v['declaredFiles'] and v['extraFiles']==v['changedFiles']==v['missingFiles']==0
    return v
def production(name,recipe,mode='--publish',bad=False,src=source):
    return json.loads(run(name,src,['node',scripts+'publish-room-appearance.mjs',mode,recipe.relative_to(src).as_posix()],bad))
def batch_run(name,src,inp,dst):
    return json.loads(run(name,src,['node',scripts+'batch.mjs',inp,dst]))
def compare(a,b):
    diff={k:(a.get(k),b.get(k)) for k in set(a)|set(b) if a.get(k)!=b.get(k)}
    assert not diff,diff
def model_geometry(model):
    data=model.read_bytes()
    assert data[:4]==b'glTF' and struct.unpack_from('<I',data,8)[0]==len(data)
    g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
    result={}
    for side in ('left','right'):
        names={n['name']:n for n in g['nodes']}
        pivot=names['wardrobe-'+side+'-pivot']
        nodes=[g['nodes'][i] for i in pivot['children']]
        blade=next(n for n in nodes if n['name']=='wardrobe-'+side+'-inset')
        counts=[]
        for p in g['meshes'][blade['mesh']]['primitives']:
            assert p.get('mode',4)==4
            counts.append(g['accessors'][p.get('indices',p['attributes']['POSITION'])]['count']//3)
        assert sum(counts)==6*12,counts
        result[side]=sum(counts)
    return result

assert digest(master/'transfer-manifest.json')==args.manifest
sealed=verify('sealed',master,args.manifest)
if not trial.exists(): copytree(master,trial)
assert digest(trial/'transfer-manifest.json')==args.manifest
receipt=out/'before-install.json'
if not receipt.exists(): write(receipt,verify('received',trial,args.manifest))
assert read(receipt)==sealed
incoming=trial/'receiver-inputs'
incoming.mkdir(exist_ok=True)
for name in art_names:
    if (art/name).resolve()!=(incoming/name).resolve():shutil.copyfile(art/name,incoming/name)
if Path(__file__).resolve()!=trial/'receive.py':shutil.copyfile(__file__,trial/'receive.py')
original=trial/'pristine-rooms'
official=trial/'data/rooms'
if not (out/'pristine.json').exists():
    assert build('pristine',source,True)==sealed['build']
    viewer=tree(trial/'viewer')
    compare(viewer,tree(source/'prototype/dist-company'))
    assert batch_run('pristine-rooms',source,batch,original)['ok']
    room_files={k:tree(original/k) for k in keys}
    for k in keys:
        compare(room_files[k],tree(official/k/'batch-result'))
        assert set(room_files[k])=={'input.json','layout.json','save.json','report.json'}
    write(out/'pristine.json',dict(sealed=sealed,viewerFiles=len(viewer),rooms=room_files))
assert read(out/'pristine.json')['sealed']==sealed
dest=source/asset_dir
run('author',trial,[sys.executable,incoming/'author.py',source,dest])
art_hashes={name:digest(incoming/name) for name in art_names}
compare(art_hashes,{name:digest(dest/name) for name in art_names})
recipe=dest/'recipe.json'
catalog=source/'prototype/src/company/library-catalog.json'
plan=source/(scripts+'library-inputs.json')
models=source/'prototype/public/company-assets/enclosed-wardrobe-v1'
def snapshot():return dict(plan=digest(plan),catalog=digest(catalog),models=tree(models),pristineRooms=tree(original))
before=snapshot()
bad_dir=source/'assets-source/company-wardrobe-receiver-negative'
bad_dir.mkdir(exist_ok=True)
bad=read(recipe)
bad['sources']['louvered']['editable']['sha256']='0'*64
write(bad_dir/'invalid.json',bad)
failure=production('bad-editable',bad_dir/'invalid.json',bad=True)
assert failure['code']=='appearance-source-pin-mismatch' and snapshot()==before
published=production('publish',recipe)
checked=production('check',recipe,'--check')
assert checked['status']=='unchanged'
run('catalog',source,['node',scripts+'build-library.mjs','--check'])
entries=read(catalog)['resources']
assert [r for r in entries if r['id']!=ref['id']]==read(trial/'data/library-catalog.json')['resources']
resource=next(r for r in entries if r['id']==ref['id'] and r['version']==1)
prov=resource['provenance']
assert prov['dependencies']['editableSource']==read(recipe)['sources']['louvered']['editable']
assert prov['sourceArtifactSha256']==art_hashes['louvered.glb'] and prov['sourceParametersSha256']==art_hashes['recipe.json']
model=source/'prototype/public'/resource['asset']['url'].lstrip('/')
assert digest(model)==resource['asset']['sha256']
geom=model_geometry(model)
rooms=read(source/batch)
target=next(o for o in next(i for i in rooms['items'] if i['key']==keys[0])['operations'] if o['id']==wardrobe_id)
target['resource']=ref
write(trial/'louvered-rooms.json',rooms)
derived=trial/'derived-rooms'
assert batch_run('louvered-rooms',source,trial/'louvered-rooms.json',derived)['ok']
expected=read(original/keys[0]/'layout.json')
next(n for n in expected['nodes'] if n['id']==wardrobe_id)['resource']=ref
assert read(derived/keys[0]/'layout.json')==expected
children=[n for n in expected['nodes'] if n.get('parentId')==wardrobe_id]
assert sorted(n['attachment']['slotId'] for n in children)==['left','right']
flat_files={name:digest(derived/keys[1]/name) for name in ('input.json','layout.json','save.json')}
compare(flat_files,{name:digest(original/keys[1]/name) for name in flat_files})
build_id=build('louvered',source)
assert build_id!=sealed['build']
package=trial/'louvered-ash'
if not package.exists():
    run('package',source,['node',scripts+'package-company.mjs','prototype/dist-company',build_id,derived/keys[0],package,
        '--room',keys[0],derived/keys[0],'--room',keys[1],derived/keys[1]])
new=verify('second-handoff',package,digest(package/'transfer-manifest.json'))
assert new['build']==build_id
for k in keys:compare(tree(derived/k),tree(package/'data/rooms'/k/'batch-result'))
assert read(package/'data/layout.json')==expected
saved_art=package/'source'/asset_dir
for filename,pin in [('author.py',art_hashes['author.py']),('LICENSE.txt',art_hashes['LICENSE.txt']),('louvered.glb',art_hashes['louvered.glb'])]:
    assert digest(saved_art/filename)==pin
assert digest(package/'source'/prov['sourceParameters'])==art_hashes['recipe.json']
assert digest(package/'viewer'/resource['asset']['url'].lstrip('/'))==digest(model)
write(out/'handoff-ready.json',dict(directory=str(package),newAsset=ref,geometry=geom,modelSha256=digest(model),verification=new))
fresh=trial/'independent-rebuild/source'
if not fresh.exists():copytree(package/'source',fresh)
assert build('fresh',fresh,True)==build_id
files=tree(fresh/'prototype/dist-company')
compare(files,tree(package/'viewer'))
run('fresh-catalog',fresh,['node',scripts+'build-library.mjs','--check'])
assert production('fresh-published-check',fresh/prov['sourceParameters'],'--check',src=fresh)['status']=='unchanged'
recreated=trial/'fresh-art'
run('fresh-author',fresh,[sys.executable,fresh/asset_dir/'author.py',fresh,recreated])
compare(art_hashes,tree(recreated))
assert verify('sealed-again',master,args.manifest)==sealed and verify('derivative-again',package,new['manifestSha256'])==new
write(out/'receiver.json',dict(status='passed',base=read(out/'pristine.json'),receiverArt=art_hashes,publisher=published,
    newAsset=ref,modelSha256=digest(model),louverTriangles=geom,garments=children,unchangedFlat=flat_files,
    badEditable=failure,unchangedAfterFailure=list(before),derived=new,derivedCleanViewerFiles=len(files),
    reproducedArtFromDerivedSource=True,packageDirectory=str(package)))
print(json.dumps(dict(complete=True,build=build_id,manifest=new['manifestSha256'])))

