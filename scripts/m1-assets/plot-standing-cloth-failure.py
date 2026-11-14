"""Forensic orthographic geometry plot, NOT a rendered game screenshot."""
import json,pathlib
import numpy as np
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
R=pathlib.Path(__file__).resolve().parents[2];P=R/'experiments/skirt-offline-corrective/standing-open-v1'
r=json.loads((P/'result.json').read_text(encoding='utf8'));c=json.loads((R/'experiments/skirt-offline-corrective/displayed-initial-0df63cf2bdea/standing-01/initial.json').read_text(encoding='utf8'));t=json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/topology.json').read_text(encoding='utf8'));fail=json.loads((P/'rejected-shape.json').read_text(encoding='utf8'));inv=np.linalg.inv(np.array(c['hipWorld']).reshape(4,4).T)
def local(p):p=np.array(p);return(np.c_[p,np.ones(len(p))]@inv.T)[:,:3]
body=next(m for m in c['colliders']if m['name']=='Bodybaked');b=local(body['positions']);bt=np.array(body['triangles']).reshape(-1,3);bt=bt[np.any((b[bt,1]>-.25)&(b[bt,1]<.18),axis=1)];tri=np.array(t['triangles']);bad=sorted(set(a for a,b in fail['exactColliderPairs']['Bodybaked']))
fig,axs=plt.subplots(2,3,figsize=(13,8),layout='constrained')
for col,frame in enumerate(r['frames']):
 p=local(frame['positionsWorld'])
 for row,axis in enumerate([0,2]):
  ax=axs[row,col];xy=b[:,[axis,1]];ax.add_collection(PolyCollection(xy[bt],facecolors='#b8c1c8',edgecolors='none',alpha=.35));xy=p[:,[axis,1]];ax.add_collection(PolyCollection(xy[tri],facecolors='#326180',edgecolors='#1c435a',linewidths=.12,alpha=.18))
  if frame['frame']==3:ax.add_collection(PolyCollection(xy[tri[bad]],facecolors='#d63835',edgecolors='#a62222',linewidths=1,alpha=.9))
  ax.set(xlim=(-.22,.22),ylim=(-.25,.18),aspect='equal',xlabel=('hips-local X'if axis==0 else'hips-local Z')+' (m)',ylabel='hips-local Y (m)',title=f"Frame {frame['frame']} / {frame['seconds']:.3f}s\nmax edge ratio {frame['maxEdgeStretch']:.3f}");ax.grid(alpha=.15)
fig.suptitle('Native cloth standing trial: rejected at frame 3\nActual geometry, fixed orthographic projections; not normal-speed viewing or finished game art',fontsize=12)
fig.savefig(P/'failure-geometry.png',dpi=140);plt.close(fig)
