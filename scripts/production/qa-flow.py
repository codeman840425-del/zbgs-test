"""Bounded negative checks against real current assets; does not mutate assets."""
import copy
import hashlib
import json
from flow import ROOT, GLB, Validator, local, read_json, validate_config

config=read_json(ROOT/'scripts/production/workflows.json')
validate_config(config)
checks=[]


def rejects(label, operation, text):
    try:operation()
    except (ValueError,FileNotFoundError) as error:
        assert text in str(error), (label,str(error))
        checks.append(label)
    else:raise AssertionError('Failed to reject '+label)


bad=copy.deepcopy(config);bad['workflows'].append(bad['workflows'][0])
rejects('duplicate workflow ID',lambda:validate_config(bad),'Duplicate')
bad=copy.deepcopy(config);bad['workflows'][0]['stages']['export'][0]['writes']=['../outside']
rejects('write-scope traversal',lambda:validate_config(bad),'Unsafe path')
bad=copy.deepcopy(config);bad['workflows'][0]['stages']['source'][0]['argv']=['python','scripts/does-not-exist.py']
rejects('missing exporter entry',lambda:validate_config(bad),'Missing command script')
rejects('absolute/remote asset URL',lambda:Validator().url('https://example.org/asset.glb'),'Expected local')
shorts=next(w for w in config['workflows']if w['kind']=='shorts');v=Validator()
base=v.json('assets-source/m1b/spec.json');body=GLB(v.pin(base['roundtrip'],base['roundtripSha256']))
manifest=shorts['identity']['manifest'];item=v.item(v.json(manifest),'m1b-uniform-shorts-v1')
bad=copy.deepcopy(item);bad['compatibleAvatarSha256']='0'*64
rejects('wrong body fit rejected before GLB use',lambda:v.equipment(bad,base['roundtripSha256'],body,manifest),'Wrong body fit')
bad=copy.deepcopy(item);bad['sha256']='0'*64
rejects('stale exported asset SHA',lambda:v.equipment(bad,base['roundtripSha256'],body,manifest),'SHA mismatch')
bad=copy.deepcopy(item);bad['bindings'][0]['inverseBindMatrix'][12]+=.02
rejects('20mm declared inverse-bind corruption',lambda:v.equipment(bad,base['roundtripSha256'],body,manifest),'Inverse bind mismatch')
bad=copy.deepcopy(item);bad['bindings'][0]['targetRawBone']='nonexistentRawHand'
rejects('unknown raw-bone mapping',lambda:v.equipment(bad,base['roundtripSha256'],body,manifest),'Target raw bone absent')
data=bytearray((ROOT/'prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb').read_bytes());data[8:12]=(20).to_bytes(4,'little')
rejects('truncated/misdeclared GLB length',lambda:GLB(bytes(data)),'length mismatch')
tracked=set()
for workflow in config['workflows']:
    tracked.update(local(ROOT,x)for x in workflow['sources'])
for directory in ['prototype/public/assets/m1b','prototype/public/assets/m1c','prototype/public/assets/m1-variants','prototype/public/assets/motion/m1c']:
    tracked.update(p for p in (ROOT/directory).rglob('*')if p.is_file())
fingerprint=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in tracked}
before=fingerprint()
results=[Validator().validate(w)for w in config['workflows']]
assert fingerprint()==before,'Validator modified source/output files'
checks.append('five real workflows validate without changing source/output hashes')
print(json.dumps({'passed':True,'checks':checks,'readOnlyHashedFiles':len(before),'workflows':[r['workflow']for r in results],'browserStarted':False,'exportersInvoked':False,'scope':'Structural readback and rejection only; no source regeneration or visual acceptance'},indent=2))
