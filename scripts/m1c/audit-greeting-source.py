"""Offline source facts and actual skinned mannequin views; no browser/runtime."""
import hashlib,importlib.util,json,pathlib
import numpy as np
from PIL import Image,ImageDraw
ROOT=pathlib.Path(__file__).resolve().parents[2]
s=importlib.util.spec_from_file_location('source_glb',ROOT/'scripts/qa-m1c-source.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
folder=ROOT/'assets-source/m1c-gesture';data=(ROOT/'prototype/public/assets/motion/UAL1_Standard.glb').read_bytes();assert hashlib.sha256(data).hexdigest()==m.SHAS['plain'];source=m.GLB(data);times=np.linspace(0,2,481);w,_,_=source.evaluate('Interact',times)
report={'sourceSha256':m.SHAS['plain'],'clip':'Interact','duration':2,'method':'Complete ancestor TRS and quaternion slerp at240Hz; actual world wrist origins','hands':{},'decision':'Do not relabel Interact as greeting/wave. Left hand reaches forward and withdraws; right hand stays near rest. New greeting is separately authored.'}
for side in ['l','r']:
 p=w[:,source.byname['hand_'+side],:3,3];report['hands'][side]={'start':p[0].tolist(),'worldRangeXYZ':np.ptp(p,axis=0).tolist(),'peakForwardTime':float(times[np.argmax(p[:,2])]),'peakForwardWorld':p[np.argmax(p[:,2])].tolist(),'end':p[-1].tolist()}
(folder/'interact-audit.json').write_text(json.dumps(report,indent=2)+'\n')

def skin_primitives(g,world):
 result=[]
 for node in g.nodes:
  if 'mesh'not in node or 'skin'not in node:continue
  sk=g.j['skins'][node['skin']];ibm=g.acc(sk['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
  for prim in g.j['meshes'][node['mesh']]['primitives']:
   a=prim['attributes'];pos=g.acc(a['POSITION']);j=g.acc(a['JOINTS_0']).astype(int);weights=g.acc(a['WEIGHTS_0']);sur={'position':np.c_[pos,np.ones(len(pos))],'joints':np.array(sk['joints'])[j],'skinJoints':j,'weights':weights,'inverseBind':ibm}
   result.append((g.skin(world,[sur]),g.acc(prim['indices']).reshape(-1,3),prim['material']))
 return result

def preview(g,clip,times,file):
 world,_,_=g.evaluate(clip,np.array(times));parts=skin_primitives(g,world);canvas=Image.new('RGB',(1200,len(times)*330),'#f5f3ee');draw=ImageDraw.Draw(canvas);colors=[np.array([177,136,73]),np.array([98,105,136])]
 for row,t in enumerate(times):
  for col,axis in enumerate([0,2]):
   offset=col*600;top=row*330;triangles=[]
   for points,faces,material in parts:
    v=points[row][faces];depth=v[:,:,2 if axis==0 else 0].mean(1);normal=np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]);normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-12);shade=.55+.45*abs(normal@np.array([.35,.5,.79]));screen=np.stack([offset+300+v[:,:,axis]*165,top+312-v[:,:,1]*165],axis=2)
    for d,xy,light in zip(depth,screen,shade):triangles.append((float(d),xy,tuple((colors[material]*light).astype(int))))
   for _,xy,color in sorted(triangles,key=lambda x:x[0]):draw.polygon([tuple(p)for p in xy],fill=color)
   draw.text((offset+10,top+10),f'{clip} | t={t:.2f}s | {"front"if axis==0 else"side"} | source mannequin',fill='black')
 canvas.save(file)
preview(source,'Interact',[0,.5,.8,1.2,1.7,2],folder/'interact-source-views.png')
g=m.GLB((folder/'generated/greeting-wave-left-v1.glb').read_bytes());preview(g,'Greeting_Wave_Left_Once_v1',[0,.45,.8,1.1,1.65,2.8],folder/'generated/wave-source-views.png')
print(json.dumps(report,indent=2))
