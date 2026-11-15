"""Diagnostic actual-mesh projection, not game screenshots or visual acceptance."""
import json,sys
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
ROOT=Path(__file__).resolve().parents[2];CAP=Path(sys.argv[1]);OUT=ROOT/'assets-source/m1/seated-front-v1'
d=json.loads((CAP/'capture.json').read_text(encoding='utf-8'));n=len(d['frames']);nv=d['topology']['displayed']['vertexCount']
a=np.fromfile(CAP/'displayed.f32',dtype='<f4').reshape(n,nv,3)
b=np.fromfile(OUT/'candidate-world.f32',dtype='<f4').reshape(n,nv,3)
raw=np.fromfile(CAP/'colliders.f32',dtype='<f4').reshape(n,-1,3)
faces=np.array(d['topology']['displayed']['triangles']).reshape(-1,3)
indices=[76,139,190]
for index in indices:
 hip=np.array(d['frames'][index]['hipWorld']).reshape(4,4).T;inv=np.linalg.inv(hip)
 transform=lambda x:(np.column_stack([x,np.ones(len(x))])@inv.T)[:,:3]
 fig,axes=plt.subplots(2,2,figsize=(9,8))
 for col,(label,points) in enumerate([('Reference',a[index]),('Authored candidate',b[index])]):
  p=transform(points)
  for row,(view,xy) in enumerate([('front',(0,1)),('side',(2,1))]):
   ax=axes[row,col];offset=0
   for m in d['topology']['colliders']:
    pts=transform(raw[index,offset:offset+m['vertexCount']]);offset+=m['vertexCount']
    if m['role'] not in ['body','top']:continue
    tris=pts[np.array(m['triangles']).reshape(-1,3)]
    relevant=np.all(tris[:,:,1]<.25,axis=1)&np.all(tris[:,:,1]>-.6,axis=1)
    ax.add_collection(PolyCollection(tris[relevant][:,:,xy],facecolor='#ddd0c4' if m['role']=='body' else '#c8c8cb',edgecolor='none',alpha=.5))
   ax.add_collection(PolyCollection(p[faces][:,:,xy],facecolor='#46576f',edgecolor='#a2abb5',linewidth=.2,alpha=.8))
   ax.set(xlim=(-.4,.4),ylim=(-.4,.25),aspect='equal',title=f'{label} / {view}')
 fig.suptitle(f"ACTUAL GEOMETRY diagnostic only / frame {index+1} / progress {d['frames'][index]['sitProgress']:.3f}\nNo textures, alpha or game occlusion; not rendered visual acceptance")
 fig.tight_layout();fig.savefig(OUT/f'geometry-{index+1}.png',dpi=140);plt.close(fig)
