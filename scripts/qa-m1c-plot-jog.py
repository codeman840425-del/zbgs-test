"""Source mannequin pose/contact plots only; not screenshots of the game."""
import importlib.util, json, pathlib
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('source',ROOT/'scripts/qa-m1c-source.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
out=ROOT/'output/playwright/m1c-source/derived';profiles=[('Source Jog','prototype/public/assets/motion/UAL1_Standard.glb','Jog_Fwd_Loop'),('Derived candidate','prototype/public/assets/motion/m1c/jog-ordinary-derived-v1.glb','Jog_Ordinary_Derived_v1')];phases=np.arange(8)/8
fig,axes=plt.subplots(4,8,figsize=(20,12),sharex=True,sharey=True)
for sourceIndex,(label,path,clip)in enumerate(profiles):
 g=m.GLB((ROOT/path).read_bytes());duration=g.duration(clip);world,_,_=g.evaluate(clip,phases*duration);surfaces=[];triangles=[];base=0
 for node in g.nodes:
  if'mesh'not in node or'skin'not in node:continue
  skin=g.j['skins'][node['skin']];ibm=g.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
  for p in g.j['meshes'][node['mesh']]['primitives']:
   a=p['attributes'];pos=g.acc(a['POSITION']);joints=g.acc(a['JOINTS_0']).astype(int);weights=g.acc(a['WEIGHTS_0']);surfaces.append({'position':np.c_[pos,np.ones(len(pos))],'joints':np.array(skin['joints'])[joints],'skinJoints':joints,'weights':weights,'inverseBind':ibm});triangles.append(g.acc(p['indices']).reshape(-1,3)+base);base+=len(pos)
 mesh=g.skin(world,surfaces);triangles=np.concatenate(triangles)
 for view,(horizontal,depth)in enumerate([(0,2),(2,0)]):
  row=sourceIndex+view*2
  for k,phase in enumerate(phases):
   ax=axes[row,k];vertices=mesh[k];tri=vertices[triangles];order=np.argsort(tri[:,:,depth].mean(axis=1));projection=tri[order][:,:,[horizontal,1]];colors=np.tile([.54,.61,.67,1.],(len(order),1));ax.add_collection(PolyCollection(projection,facecolors=colors,edgecolors='none'));ax.axhline(0,color='#45555f',lw=.7);ax.set_xlim(-.9,.9);ax.set_ylim(-.08,1.95);ax.set_aspect('equal');ax.grid(alpha=.15);ax.set_title(f'phase {phase:.3f}',fontsize=9)
   if k==0:ax.set_ylabel(label+'\n'+('front +Z'if view==0 else'side +X'))
   if row==3:ax.set_xlabel('world '+('X'if view==0 else'Z')+' (m)')
fig.suptitle('Actual source SkinnedMesh projection, same 0.933 s cycle / model / scale\nDerived lower body is newly authored; target VRM and normal-speed game acceptance remain untested',fontsize=13);fig.tight_layout(rect=[0,0,1,.94]);fig.savefig(out/'source-derived-poses.png',dpi=140);plt.close(fig)
fig,axes=plt.subplots(2,1,figsize=(12,7),sharex=True)
for label,path,clip in profiles:
 g=m.GLB((ROOT/path).read_bytes());duration=g.duration(clip);times=np.linspace(0,duration,225);w,_,_=g.evaluate(clip,times);surface=g.foot_surfaces()
 axes[0].plot(times/duration,w[:,g.byname['pelvis'],1,3],label=label)
 for side,style in [('l','-'),('r','--')]:axes[1].plot(times/duration,g.skin(w,surface[side])[:,:,1].min(axis=1),style,label=label+' '+side)
axes[0].set_ylabel('pelvis Y (m)');axes[1].set_ylabel('actual sole minimum Y (m)');axes[1].set_xlabel('cycle phase');axes[1].axhline(0,color='black',lw=.7)
for ax in axes:ax.legend();ax.grid(alpha=.3)
fig.tight_layout();fig.savefig(out/'height-contact-comparison.png',dpi=140);plt.close(fig)
print(out/'source-derived-poses.png')
