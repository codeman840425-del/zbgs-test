"""Actual source-mesh choreography keyframes. Not a live game recording."""
import importlib.util,pathlib
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('source',ROOT/'scripts/qa-m1c-source.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
g=m.GLB((ROOT/'prototype/public/assets/motion/m1c/dance-technical-v1.glb').read_bytes());clip=g.j['animations'][0]['name'];times=np.array([0,1.3,2.,2.7,3.15,3.6,4.8,5.7,5.98,6.3,7.2]);w,_,_=g.evaluate(clip,times);sur=[];tris=[];offset=0
for node in g.nodes:
 if'mesh'not in node or'skin'not in node:continue
 skin=g.j['skins'][node['skin']];ibm=g.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
 for p in g.j['meshes'][node['mesh']]['primitives']:
  a=p['attributes'];pos=g.acc(a['POSITION']);joints=g.acc(a['JOINTS_0']).astype(int);weights=g.acc(a['WEIGHTS_0']);sur.append({'position':np.c_[pos,np.ones(len(pos))],'joints':np.array(skin['joints'])[joints],'skinJoints':joints,'weights':weights,'inverseBind':ibm});tris.append(g.acc(p['indices']).reshape(-1,3)+offset);offset+=len(pos)
mesh=g.skin(w,sur);tris=np.concatenate(tris);fig,axes=plt.subplots(2,len(times),figsize=(24,6))
for row,(horizontal,depth)in enumerate([(0,2),(2,0)]):
 for k,t in enumerate(times):
  ax=axes[row,k];tri=mesh[k][tris];order=np.argsort(tri[:,:,depth].mean(axis=1));ax.add_collection(PolyCollection(tri[order][:,:,[horizontal,1]],facecolors='#8295a4',edgecolors='none'));ax.axhline(0,color='black',lw=.6);ax.set_xlim(-.72,.72);ax.set_ylim(-.06,2.25);ax.set_aspect('equal');ax.grid(alpha=.15);ax.set_title(f'{t:.2f}s',fontsize=10)
  if k==0:ax.set_ylabel('front +Z'if row==0 else'side +X')
fig.suptitle('Original 7.2s technical choreography: actual exported source skin, no combat clips\nKeyframes only; not professional dance or target-avatar continuous visual acceptance',fontsize=13);fig.tight_layout(rect=[0,0,1,.9]);out=ROOT/'output/playwright/m1c-source/dance-technical';fig.savefig(out/'source-keyframes.png',dpi=130);plt.close(fig)
print(out/'source-keyframes.png')
