"""Pinned existing functions and source-only refined topology adapters."""
import sys
sys.dont_write_bytecode = True
import ast, hashlib, importlib.util, json
from pathlib import Path
import numpy as np
from scipy.interpolate import PPoly
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-refined-axial-evaluation-v1'
def module(path, name):
    s=importlib.util.spec_from_file_location(name,ROOT/path); m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
io=module('scripts/m2-axial-head-evaluation-v1/source.py','original_axial_io')
sha,ref,save=io.sha,io.ref,io.save
def function(path,name):
    n=next(n for n in ast.parse((ROOT/path).read_bytes()).body if isinstance(n,ast.FunctionDef) and n.name==name)
    env={'np':np,'PPoly':PPoly};exec(compile(ast.Module([n],[]),path+':unchanged-AST','exec'),env);return env[name]
operator=function('scripts/m2-axial-head-evaluation-v1/evaluate.py','operator')
normal_map=function('scripts/m2-representative-batch-v1/deform.py','normal_map')
def read(path):return json.loads((ROOT/path).read_bytes())
def check(rows):
    for r in rows:
        if sha(ROOT/r['path'])!=r['sha256']:raise ValueError('Input SHA differs: '+r['path'])
def groups():
    entry=read('assets-source/m2-boundary-refinement-api-recovery-v1/pre-G-source-inputs.json')
    result=[]
    for g in entry['groups']:
        a=np.load(ROOT/g['arrays']['path'],allow_pickle=False);pr=read(g['provenance']['path']);pr=pr.get('original',pr)
        P=a[g['positionKey']];D=a[g['deltaKey']] if 'deltaKey' in g else np.empty((0,len(P),3))
        T=a['newTriangles'];parents=a['parentTriangle'];consumers=[]
        for i,c in enumerate(pr['consumers']):
            ids=np.flatnonzero(np.asarray([pr['parentTriangles'][p]['consumer']==i for p in parents]))
            consumers.append({**c,'triangleIndices':ids.tolist(),'vertexIndices':np.unique(T[ids]).tolist()})
        assert np.array_equal(np.sort(np.concatenate([c['triangleIndices'] for c in consumers])),np.arange(len(T)))
        assert np.array_equal(np.unique(T),np.arange(len(P)))
        result.append(dict(accessor=g['originalPositionAccessor'],P=P,D=D,N=a[g['normalKey']],T=T,parent=parents,bary=a['parentBary'],consumers=consumers,provenance=g['provenance'],parentMetadata=pr['parentTriangles']))
    return result
