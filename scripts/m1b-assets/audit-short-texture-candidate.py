"""Read-only atlas/mesh coverage audit. Does not edit images or exported assets."""
import argparse, hashlib, io, json, pathlib, struct
import numpy as np
from PIL import Image

p=argparse.ArgumentParser();p.add_argument('candidate');p.add_argument('--report',required=True);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[2]
source=root/'prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb'
raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:]
def acc(i):
    x=g['accessors'][i];v=g['bufferViews'][x['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2'}[x['componentType']]);width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[x['type']]
    return np.ndarray((x['count'],width),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+x.get('byteOffset',0),strides=(v.get('byteStride',width*dt.itemsize),dt.itemsize)).copy()
prim=next(x for m in g['meshes'] for x in m['primitives'] if 'baseColorTexture' in g['materials'][x['material']].get('pbrMetallicRoughness',{}))
mat=g['materials'][prim['material']];ti=mat['pbrMetallicRoughness']['baseColorTexture']['index'];im=g['images'][g['textures'][ti]['source']];v=g['bufferViews'][im['bufferView']]
original=np.array(Image.open(io.BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGBA'))
candidatePath=pathlib.Path(a.candidate);candidate=np.array(Image.open(candidatePath).convert('RGBA'))
def sample(image,uv):
    xy=np.floor((uv%1)*[image.shape[1],image.shape[0]]).astype(int)
    return image[xy[:,1],xy[:,0]]
uv=acc(prim['attributes']['TEXCOORD_0']);tri=acc(prim['indices']).reshape(-1,3)
bary=np.array([[i/12,j/12,1-(i+j)/12] for i in range(13) for j in range(13-i)])
samples=np.einsum('bi,tij->tbj',bary,uv[tri]).reshape(-1,2)
o=sample(original,samples);c=sample(candidate,samples);cut=round(float(mat.get('alphaCutoff',.5))*255)
yy,xx=np.mgrid[:original.shape[0],:original.shape[1]];atlasUv=np.c_[(xx.ravel()+.5)/original.shape[1],(yy.ravel()+.5)/original.shape[0]]
norm=sample(candidate,atlasUv)[:,3].reshape(original.shape[:2])
r={'sourceGlbSha256':hashlib.sha256(raw).hexdigest(),'candidateSha256':hashlib.sha256(candidatePath.read_bytes()).hexdigest(),'originalSize':list(original.shape[1::-1]),'candidateSize':list(candidate.shape[1::-1]),'normalizedAtlasLostOpaquePixels':int(((original[:,:,3]>=cut)&(norm<cut)).sum()),'actualMeshSampleCount':len(samples),'actualMeshSourceOpaqueSamples':int((o[:,3]>=cut).sum()),'actualMeshNewlyTransparentSamples':int(((o[:,3]>=cut)&(c[:,3]<cut)).sum()),'actualMeshNewlyOpaqueSamples':int(((o[:,3]<cut)&(c[:,3]>=cut)).sum()),'limits':['91 barycentric probes per triangle, not exhaustive texel rasterization','Coverage alone does not prove UV seam/detail alignment or visual quality','Images and public assets unchanged']}
r['directReplacementAccepted']=r['actualMeshNewlyTransparentSamples']==0 and r['actualMeshNewlyOpaqueSamples']==0 and r['originalSize']==r['candidateSize']
pathlib.Path(a.report).write_text(json.dumps(r,indent=2)+'\n',encoding='utf8');print(json.dumps(r,indent=2))
