"""Plot actual source triangles and explicit vertex landmarks; no edited mesh."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection,LineCollection
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-nose-parameters-v1'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
r=json.loads((BASE/'measurements.json').read_text());fig=plt.figure(figsize=(16,10))
offset={'T_tip':(20,-4),'U_tipUpper':(-55,8),'B1_lowerBridge':(15,4),'B2_midBridge':(15,3),'R_upperBridge':(12,3),'Aneg_sidewall':(-92,-15),'Apos_sidewall':(25,-18),'S_base':(15,-4),'P_philtrum':(15,-7)}
for row,(sex,b)in enumerate(r['bodies'].items()):
 g=GLB(ROOT/b['source']['sourceVRM']);pr=g.primitives()[b['source']['skinMaterial']];p=g.acc(pr['attributes']['POSITION']);tri=g.acc(pr['indices']).reshape(-1,3);cx=b['centerX'];tip=p[b['landmarks']['T_tip']['exportVertex']];q=p.copy();q[:,0]-=cx;q[:,1]-=tip[1];q[:,2]=-q[:,2]+tip[2];q*=1000
 lower=(b['landmarks']['P_philtrum']['gltfM'][1]-tip[1])*1000-12;upper=(b['eyeIrisMeanY']-tip[1])*1000+10
 crop=tri[(np.max(np.abs(q[tri,0]),axis=1)<46)&(q[tri,1].max(1)>lower)&(q[tri,1].min(1)<upper)];t=q[crop]
 ax=fig.add_subplot(2,3,row*3+1)
 depth=t[:,:,2].mean(1);shade=np.clip((depth+25)/30,0,1);colors=np.column_stack([.92-.2*shade,.88-.28*shade,.83-.3*shade,np.ones(len(shade))])
 ax.add_collection(PolyCollection(t[:,:,:2],facecolors=colors,edgecolors='#9d968d',linewidths=.35));support=b['supportVertices'];ax.scatter(q[support,0],q[support,1],c='#e27220',s=28,zorder=4,label='proposed 8 mm geodesic domain')
 for key,lm in b['landmarks'].items():
  v=q[lm['exportVertex']];ax.plot(v[0],v[1],'o',color='#08549a',ms=3,zorder=5);ax.annotate(f"{key.split('_')[0]} {lm['exportVertex']}",v[:2],xytext=offset[key],textcoords='offset points',fontsize=7.5,arrowprops={'arrowstyle':'-','color':'#08549a','lw':.6},zorder=6)
 for comp in b['boundaryComponents']:
  if comp['count']in [24,32]:v=q[comp['vertices']];ax.scatter(v[:,0],v[:,1],color='#158b6b',s=4,zorder=3)
 ax.set_xlim(-42,42);ax.set_ylim(lower,upper);ax.set_aspect('equal');ax.set_xlabel('lateral mm from face center');ax.set_ylabel('height mm from source tip');ax.set_title(f'{sex}: original front topology / vertex IDs');ax.legend(fontsize=7,loc='lower left')
 ax=fig.add_subplot(2,3,row*3+2);ids=np.unique(tri);mid=set(ids[abs(q[ids,0])<.002]);edges=set(tuple(sorted((int(a),int(b))))for tr in tri for a,b in [(tr[0],tr[1]),(tr[1],tr[2]),(tr[2],tr[0])]if a in mid and b in mid);segments=[q[[a,b]][:,[2,1]]for a,b in edges if max(q[a,1],q[b,1])>lower and min(q[a,1],q[b,1])<upper];ax.add_collection(LineCollection(segments,colors='#746c63',linewidths=1))
 for key,lm in b['landmarks'].items():
  if key.startswith('A'):continue
  v=q[lm['exportVertex']];ax.plot(v[2],v[1],'o',color='#08549a',ms=4);ax.annotate(f"{key.split('_')[0]} {lm['exportVertex']}",(v[2],v[1]),xytext=(8,1),textcoords='offset points',fontsize=8)
 ax.set_xlim(-30,12);ax.set_ylim(lower,upper);ax.set_aspect('equal');ax.set_xlabel('forward mm from source tip');ax.set_ylabel('height mm from source tip');ax.set_title('Original centerline edges (not a silhouette fit)');ax.grid(alpha=.2)
 ax=fig.add_subplot(2,3,row*3+3,projection='3d');xyz=t[:,:,[0,2,1]];ax.add_collection3d(Poly3DCollection(xyz,facecolors=colors,edgecolors='#a49a8c',linewidths=.2));ax.scatter(q[support,0],q[support,2],q[support,1],c='#e27220',s=16,depthshade=False)
 for key,lm in b['landmarks'].items():
  v=q[lm['exportVertex']];ax.text(v[0],v[2],v[1],key.split('_')[0],fontsize=8,color='#084888')
 ax.set_xlim(-35,35);ax.set_ylim(-30,8);ax.set_zlim(lower,upper);ax.view_init(elev=12,azim=60);ax.set_box_aspect((70,38,upper-lower));ax.set_xlabel('lateral mm');ax.set_ylabel('forward mm');ax.set_zlabel('height mm');ax.set_title('Original oblique geometry; no texture/GPU')
fig.suptitle('Nose source landmark review — all coordinates and triangles from pinned original VRMs\nOrange points mark the domain; this figure displays original source only',fontsize=13)
fig.tight_layout(rect=(0,0,1,.94));fig.savefig(BASE/'source-landmarks.png',dpi=170)
