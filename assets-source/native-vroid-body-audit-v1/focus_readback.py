"""Localize the first audit's stored samples; no new mesh/skin evaluation."""
from pathlib import Path
import hashlib
import importlib.util
import io
import json
import sys
import numpy as np
from PIL import Image
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'evidence/native-vroid-body-audit-v1'
module=importlib.util.spec_from_file_location('audit_local',Path(__file__).with_name('audit.py'))
a=importlib.util.module_from_spec(module);module.loader.exec_module(a)
results=[];loaded={}
for sex in ['female','male']:
    r=json.loads((OUT/(sex+'-result.json')).read_text());z=np.load(OUT/(sex+'-body-arrays.npz'));loaded[sex]=z
    b=next(p for p in r['primitives'] if p['primitive']==r['bodyPrimitive']['primitive'] and p['mesh']==r['bodyPrimitive']['mesh'])
    g=a.reader.GLB(ROOT/r['source']['path']);im=g.doc['images'][b['texture']['image']];v=g.doc['bufferViews'][im['bufferView']]
    raw=g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];alpha=np.asarray(Image.open(io.BytesIO(raw)).convert('RGBA'))[:,:,3]/255
    tex=b['texture'];assert tex['factor']==1 and tex['textureTransform']=={'offset':[0,0],'scale':[1,1]}
    assert tex['sampler']=={'magFilter':9729,'minFilter':9729,'wrapS':10497,'wrapT':10497}
    uv=np.einsum('bi,tij->tbj',a.BARY,z['bodyUV'][z['bodyTriangles']]);h,w=alpha.shape
    x=uv[:,:,0]*w-.5;y=uv[:,:,1]*h-.5;ix=np.floor(x).astype(int);iy=np.floor(y).astype(int);fx=x-ix;fy=y-iy
    linear=(alpha[iy%h,ix%w]*(1-fx)*(1-fy)+alpha[iy%h,(ix+1)%w]*fx*(1-fy)+alpha[(iy+1)%h,ix%w]*(1-fx)*fy+alpha[(iy+1)%h,(ix+1)%w]*fx*fy)
    hidden=linear<.5;xyz=z['bodySamplePositionsM'];indices=np.argwhere(hidden)
    bands={}
    for band,(lo,hi) in r['measurementBandsY'].items():
        mask=(xyz[:,:,1]>=lo)&(xyz[:,:,1]<=hi)
        bands[band]=dict(samples=int(mask.sum()),belowCutoff=int((hidden&mask).sum()),exactZero=int(((linear==0)&mask).sum()))
    witnesses=[]
    # Deterministic nearest-centre and lower/upper hidden positions, not a classifier.
    picks=[int(np.argmin(np.abs(xyz[hidden,0]))),int(np.argmin(xyz[hidden,1])),int(np.argmax(xyz[hidden,1]))]
    for pick in picks:
        ti,bi=indices[pick];witnesses.append(dict(triangle=int(ti),sourceVertexIds=z['bodyTriangles'][ti].tolist(),barycentric=a.BARY[bi].tolist(),worldXYZ=xyz[ti,bi].tolist(),uv=uv[ti,bi].tolist(),bilinearAlpha=float(linear[ti,bi])))
    results.append(dict(sex=sex,sourceSha256=r['source']['sha256'],bodyTriangleCount=len(z['bodyTriangles']),linearAlphaSamples=int(linear.size),belowCutoff=int(hidden.sum()),exactZeroSamples=int((linear==0).sum()),trianglesAllSevenSamplesBelowCutoff=int(hidden.all(1).sum()),trianglesSomeSamplesBelowCutoff=int(hidden.any(1).sum()),hiddenSampleBounds=dict(min=xyz[hidden].min(0).tolist(),max=xyz[hidden].max(0).tolist()),bands=bands,witnesses=witnesses,interpretation='Linear non-mipmap filtering follows actual sampler. Original Body geometry exists at these source triangle sample locations, but MASK alpha rejects these points. Seven samples do not prove whole-triangle coverage or full surface completeness.'))
    target=OUT/(sex+'-linear-alpha.npz');assert not target.exists()
    np.savez_compressed(target,bilinearAlpha=linear)
f,m=loaded['female'],loaded['male']
compare=dict(bodyIndexArraysExact=bool(np.array_equal(f['bodyTriangles'],m['bodyTriangles'])),bodyUVArraysExact=bool(np.array_equal(f['bodyUV'],m['bodyUV'])),nearestAlphaProbeArraysExact=bool(np.array_equal(f['bodyAlphaSamples'],m['bodyAlphaSamples'])),meaning='Shared source index/UV coverage and alpha probes; not same shape, skeleton or inherited acceptance')
a.save('focus-readback.json',dict(schema='native-vroid-body-alpha-focus-v1',results=results,crossSource=compare))
print(json.dumps({'results':results,'crossSource':compare}))
