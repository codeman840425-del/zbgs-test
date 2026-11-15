"""CPU-only geometric overview. Not a screenshot or textured rendering pass."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
D=Path(__file__).resolve().parent
fig=plt.figure(figsize=(13,7));fig.patch.set_facecolor('#eef0f2')
for row,sex in enumerate(['female','male']):
 data=np.load(D/f'{sex}-head-skin.npz');tri=data['triangles'][:,:,[0,2,1]];lo=float(data['headMin']);hi=float(data['headMax']);cx=float(data['centerX']);norm=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);norm/=np.maximum(np.linalg.norm(norm,axis=1)[:,None],1e-15);light=np.array([.4,-.5,.75]);light/=np.linalg.norm(light);shade=.45+.55*np.abs(norm@light);colors=np.stack([shade*.95,shade*.81,shade*.69],axis=1)
 for col,(title,elev,azim) in enumerate([('front',0,-90),('back',0,90),('side',0,0),('crown',90,-90)]):
  ax=fig.add_subplot(2,4,row*4+col+1,projection='3d');ax.set_proj_type('ortho');ax.add_collection3d(Poly3DCollection(tri,facecolors=colors,edgecolors=(.25,.2,.2,.28),linewidths=.15));ax.set_xlim(cx-.14,cx+.14);ax.set_ylim(-.15,.13);ax.set_zlim(lo-.01,hi+.01);ax.set_box_aspect((.28,.28,hi-lo+.02));ax.view_init(elev=elev,azim=azim);ax.set_axis_off();ax.set_title(sex+' / '+title,fontsize=11)
fig.suptitle('Original F/M head SKIN triangles only - hair excluded',fontsize=15);fig.text(.5,.025,'CPU untextured diagnostic; eye/mouth insert meshes omitted. Not game visibility, material or animation acceptance.',ha='center',fontsize=9);fig.subplots_adjust(top=.90,bottom=.07,left=.01,right=.99,wspace=0,hspace=.02);fig.savefig(D/'skin-only-overview.png',dpi=140);plt.close(fig)
