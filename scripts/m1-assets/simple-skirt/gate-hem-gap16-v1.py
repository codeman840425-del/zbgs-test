from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];source=R/'scripts/m1-assets/simple-skirt/gate-edge-thirds-v1.py';text=source.read_text();changes=[]
def replace(a,b,count=1):
 global text
 assert text.count(a)==count,(a,text.count(a));text=text.replace(a,b);changes.append({'from':a,'to':b,'count':count})
replace("O=S/'edge-thirds-v1'","O=S/'hem-gap16-v1'")
replace('m1-sixfold-skirt-edge-thirds-v1.glb','m1-sixfold-skirt-hem-gap16-v1.glb')
replace("S/'active-gap-hem-v1/m1-sixfold-skirt-active-gap-hem-v1.glb'","S/'two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb'")
replace("    for key in old['attributes']:assert np.array_equal(read(p['attributes'][key])[:n],oldRead(old['attributes'][key]))","    for key in old['attributes']:\n        if key not in ('POSITION','NORMAL') or i==0:assert np.array_equal(read(p['attributes'][key])[:n],oldRead(old['attributes'][key]))")
replace("unchanged=~np.isin(origin,[770,773]);assert np.array_equal(faces[unchanged],oldFaces[origin[unchanged]])","assert np.array_equal(faces,oldFaces)")
replace("'allExistingAttributesExact':True","'onlyHemPositionAndAffectedNormalsChanged':True")
replace("O/'edge-thirds-v1.blend'","O/'hem-gap16-v1.blend'",3)
O=R/'assets-source/m1/simple-skirt-v1/hem-gap16-v1';(O/'gate-adapter.json').write_text(json.dumps({'changes':changes,'thresholdChanges':[],'compiledSha256':hashlib.sha256(text.encode()).hexdigest()},indent=2)+'\n')
exec(compile(text,str(source),'exec'),globals())
