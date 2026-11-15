"""Same complete gate and lineage checks, exact reviewed larger local patch."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];source=R/'scripts/m1-assets/simple-skirt/gate-edge-thirds-v1.py';text=source.read_text(encoding='utf-8');changes=[]
def replace(a,b,count=1):
    global text
    assert text.count(a)==count,(a,text.count(a));text=text.replace(a,b);changes.append({'from':a,'to':b,'count':count})
replace("O=S/'edge-thirds-v1'","O=S/'two-quad-thirds-v1'")
replace("m1-sixfold-skirt-edge-thirds-v1.glb","m1-sixfold-skirt-two-quad-thirds-v1.glb")
replace("unchanged=~np.isin(origin,[770,773])","unchanged=~np.isin(origin,[768,770,771,772,773,775])")
replace("O/'edge-thirds-v1.blend'","O/'two-quad-thirds-v1.blend'",3)
O=R/'assets-source/m1/simple-skirt-v1/two-quad-thirds-v1';(O/'gate-adapter.json').write_text(json.dumps({'originalGateSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'compiledGateSha256':hashlib.sha256(text.encode()).hexdigest(),'changes':changes,'thresholdChanges':[]},indent=2)+'\n',encoding='utf-8');exec(compile(text,str(source),'exec'),globals())
