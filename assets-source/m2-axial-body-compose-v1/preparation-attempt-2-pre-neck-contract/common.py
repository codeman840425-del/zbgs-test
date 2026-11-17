"""Same-original-source body displacement plus sealed axial-head arrays."""
import ast
import importlib.util
import importlib.metadata
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from scipy.interpolate import PPoly

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-axial-body-compose-v1'


def module(path, name):
    loader=importlib.util.spec_from_file_location(name,ROOT/path)
    result=importlib.util.module_from_spec(loader);loader.loader.exec_module(result)
    return result


io=module('scripts/m2-axial-head-evaluation-v1/source.py','compose_source_io')
body=module('scripts/m2-representative-head-cage-v1/body.py','compose_body_only')
export=module('scripts/m2-axial-head-export-v1/adapter.py','compose_author_N')


def require(condition,message):
    if not condition: raise ValueError(message)


def original_function(name):
    path='scripts/m2-axial-head-evaluation-v1/evaluate.py'
    node=next(n for n in ast.parse((ROOT/path).read_bytes()).body if isinstance(n,ast.FunctionDef) and n.name==name)
    env={'np':np,'PPoly':PPoly}
    exec(compile(ast.Module([node],[]),path+':'+name,'exec'),env)
    return env[name]


def load():
    spec=json.loads((BASE/'spec.json').read_bytes())
    for ref in spec['inputs']:
        require(io.sha(ROOT/ref['path'])==ref['sha256'],'Input SHA differs: '+ref['path'])
    for name,version in spec['versions'].items():
        require(importlib.metadata.version(name)==version,'Numeric dependency differs: '+name)
    evaluation=json.loads((ROOT/spec['sourceEvaluationSpec']['path']).read_bytes())
    source,inventory=io.load(evaluation)
    records,points,groups,unused=io.source_records(source,inventory)
    require(not any(len(r['sourceIndices']) for r in unused),'Unexpected unused source points')
    require(records==json.loads((ROOT/spec['sourceRecords']['path']).read_bytes())['records'],'Full-source records differ')
    context=body.legacy.source_context(SimpleNamespace(doc=source.doc,accessor=source.acc))
    masks=json.loads((ROOT/spec['fixedSourceMasks']['path']).read_bytes())
    return spec,source,records,points,context,masks


def body_values(P,parameters,context):
    D=body.body_displacement(P,parameters,context)
    epsilon=1e-5 # Exact established body-only preflight convention.
    JB=np.eye(3)+np.stack([(body.body_displacement(P+np.eye(3)[a]*epsilon,parameters,context)-
        body.body_displacement(P-np.eye(3)[a]*epsilon,parameters,context))/(2*epsilon) for a in range(3)],axis=2)
    return D,JB


def compose(QG,JG,D,JB):
    require(QG.shape==D.shape and JG.shape==JB.shape==(len(D),3,3),'Composite array shape differs')
    return QG+D,JG+JB-np.eye(3)


def neck_decomposition(points,records,masks,QG,D,QF):
    rows=[]
    for mask in masks['neck']:
        r=next(r for r in records if r['positionAccessor']==mask['positionAccessor'] and r['endpoint']==mask['endpoint'])
        ids=np.asarray(mask['sourceIndices'],int);take=r['offset']+ids
        P=points[take];B=D[take];F=QF[take]
        rows.append({'positionAccessor':r['positionAccessor'],'endpoint':r['endpoint'],'sourceIndices':ids,
            'sourcePointsM':P,'bodyDisplacementM':B,'headOperationDisplacementM':F-(P+B),
            'finalDisplacementFromOriginalM':F-P,'sealedGDisplacementM':QG[take]-P,
            'maximumBodyDisplacementM':float(np.linalg.norm(B,axis=1).max()),
            'maximumHeadOperationDisplacementM':float(np.linalg.norm(F-(P+B),axis=1).max()),
            'maximumFinalDisplacementFromOriginalM':float(np.linalg.norm(F-P,axis=1).max())})
    return rows
