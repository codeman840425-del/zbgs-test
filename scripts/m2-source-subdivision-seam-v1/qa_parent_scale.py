"""Synthetic only: retain parent determinant threshold across child subdivision."""
import ast
import json
from pathlib import Path
import numpy as np
from contact_seam import classify
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets-source/m2-source-subdivision-seam-v1/generated'
tree=ast.parse((ROOT/'scripts/m2-hairstyle-v1/check-head-space.py').read_bytes())
node=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='segment_hits')
env={'np':np};exec(compile(ast.Module([node],[]),'original-segment-hits','exec'),env)
legacy=env['segment_hits'];rows=[]
for scale,expected in [(8e-5,True),(4e-5,False)]:
    tri=np.array([[0.,0.,0.],[2.,0.,0.],[0.,2.,0.]])*scale
    a=np.array([.5,.5,-1.])*scale;b=np.array([.5,.5,1.])*scale;m=(a+b)/2
    T=np.array([[1.,0,0],[.5,.5,0],[.5,0,.5]])
    B=np.array([[1.,0,0],[.5,.5,0]])
    row=classify(a,m,T@tri,T,B)
    row.update(scale=scale,legacyOriginalParentHit=bool(legacy(a,b,tri[None])[0]),
        legacyChildHit=bool(legacy(a,m,(T@tri)[None])[0]),expected=expected)
    assert row['legacyOriginalParentHit']==expected and row['accepted']==expected
    assert not row['legacyChildHit']
    rows.append(row)
path=OUT/'synthetic-parent-determinant-scale.json'
if path.exists():raise RuntimeError('Refuse overwrite')
path.write_text(json.dumps({'cases':rows,'allExpected':True,'realCandidateContacts':False},indent=2)+'\n',encoding='utf-8')
print(json.dumps([{'scale':x['scale'],'rawChildDet':x['rawChildDeterminant'],
    'parentScaleDet':x['parentParameterScaleDeterminant'],'accepted':x['accepted']} for x in rows]))
