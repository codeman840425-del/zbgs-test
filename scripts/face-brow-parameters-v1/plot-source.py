"""CPU diagnostic projection of actual exported Basis triangles, no texture/render acceptance."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-brow-parameters-v1'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
spec=json.loads((BASE/'spec.json').read_text());fig,axes=plt.subplots(2,2,figsize=(11,5.7))
for row,(sex,source)in enumerate(spec['bodies'].items()):
 old=GLB(ROOT/source['sourceVRM']);new=GLB(BASE/'generated'/f'{sex}-brow-height1-spacing1-v1/avatar.vrm')
 brow=next(p for p in old.primitives().items()if '_FaceBrow_'in p[0])[1];bp=old.acc(brow['attributes']['POSITION']);ids=np.unique(old.acc(brow['indices']));cx=(bp[ids,0].min()+bp[ids,0].max())/2;lo=bp[ids,1].min()-.007;hi=bp[ids,1].max()+.007
 for col,g in enumerate([old,new]):
  ax=axes[row,col]
  for material,color in [('_Face_00_SKIN','#dec6b0'),('_FaceBrow_','#493629')]:
   prim=next(p for name,p in g.primitives().items()if material in name);pos=g.acc(prim['attributes']['POSITION']);tri=g.acc(prim['indices']).reshape(-1,3);t=pos[tri];t=t[(t[:,:,1].max(1)>lo)&(t[:,:,1].min(1)<hi)];xy=t[:,:,:2].copy();xy[:,:,0]-=cx;xy[:,:,1]-=lo
   ax.add_collection(PolyCollection(xy*1000,facecolor=color,edgecolor='none',zorder=2 if 'Brow'in material else 1))
  ax.set_xlim(-90,90);ax.set_ylim(0,(hi-lo)*1000);ax.set_aspect('equal');ax.set_title(f'{sex}: '+('source Basis'if col==0 else '+1 mm height, +1 mm per-side spacing'));ax.set_xlabel('lateral mm (original center)');ax.set_ylabel('height mm from crop');ax.grid(alpha=.2,zorder=0)
fig.suptitle('Actual source / exported endpoint geometry — orthographic, untextured, CPU only')
fig.tight_layout();fig.savefig(BASE/'source-before-after.png',dpi=150)
