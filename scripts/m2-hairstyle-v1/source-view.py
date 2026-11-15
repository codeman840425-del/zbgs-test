import sys,pathlib,json,numpy as np
sys.path.insert(0,str(pathlib.Path('scripts/m2-male-face-v1').resolve()))
from glb import GLB
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
s=GLB(pathlib.Path('prototype/public/assets/foundation/base-female-roundtrip.vrm'));p=s.doc['meshes'][0]['primitives'][5];v=s.acc(p['attributes']['POSITION']);t=s.acc(p['indices']).reshape(-1,3);used=np.unique(t)
fig,axs=plt.subplots(1,3,figsize=(12,6))
for ax,(a,b) in zip(axs,[(0,1),(2,1),(0,2)]):
 ax.triplot(v[:,a],v[:,b],t,linewidth=.4);ax.scatter(v[used,a],v[used,b],s=4);ax.set_aspect('equal');ax.set_xlabel(str(a));ax.set_ylabel(str(b))
fig.savefig('assets-source/m2-hairstyle-v1/original-topology.png')
print('head',[(i,x) for i,x in enumerate(s.doc['nodes']) if x.get('name')=='J_Bip_C_Head'])
