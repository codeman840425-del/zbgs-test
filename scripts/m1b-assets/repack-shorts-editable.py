"""Turn actual Blender-edited garment geometry into exact-body equipment.
Preserves original raw bind identity; refuses unknown bone/material names.
"""
import argparse,hashlib,importlib.util,json,pathlib
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2]
def load(name,path):
 s=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('male_export','scripts/m1b-assets/build.py');audit=load('source_glb','scripts/qa-m1c-source.py')
p=argparse.ArgumentParser();p.add_argument('--input',default='output/m1b-shorts/editable-export-1.glb');args=p.parse_args()
cfg=json.loads((ROOT/'assets-source/m1b/shorts/spec.json').read_text());data=(ROOT/args.input).read_bytes();g=audit.GLB(data);world,_,_=g.evaluate(None,np.array([0.]))
rawIndex={m.src['nodes'][node]['name']:i for i,node in enumerate(m.skin['joints'])};originalMaterials={x['name']:i for i,x in enumerate(m.src['materials'])};parts=[]
for node in g.nodes:
 if 'mesh'not in node:continue
 assert 'skin'in node,'Unexpected unskinned helper geometry in export'
 skin=g.j['skins'][node['skin']];boneNames=[g.nodes[i]['name']for i in skin['joints']];assert set(boneNames)<=set(rawIndex)
 ibm=g.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);palette=world[0,skin['joints']]@ibm
 for prim in g.j['meshes'][node['mesh']]['primitives']:
  a={k:g.acc(v)for k,v in prim['attributes'].items()if k in ['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0']};j=a['JOINTS_0'].astype(int);w=a['WEIGHTS_0'];matrices=np.sum(palette[j]*w[:,:,None,None],axis=1)
  a['POSITION']=np.einsum('vij,vj->vi',matrices,np.c_[a['POSITION'],np.ones(len(w))])[:,:3].astype(np.float32)
  a['NORMAL']=np.einsum('vij,vj->vi',matrices[:,:3,:3],a['NORMAL']);a['NORMAL']/=np.linalg.norm(a['NORMAL'],axis=1,keepdims=True)
  a['JOINTS_0']=np.array([[rawIndex[boneNames[k]] for k in row]for row in j],dtype=np.uint16)
  material=g.j['materials'][prim['material']];name=material['name']
  if name in originalMaterials: material=originalMaterials[name]
  else:
   assert name=='M1B_Shorts_InnerFacing';material={k:material[k]for k in ['name','doubleSided','pbrMetallicRoughness','extensions']if k in material}
  parts.append((a,g.acc(prim['indices']).reshape(-1,3),material))
entry=m.export(cfg['id'],'男性露膝独立短裤','bottom',parts,'Actual editable Blender mesh export repacked to verified original male raw skeleton; no body faces removed')
entry.update(styleId=cfg['styleId'],fitId=cfg['fitId'],limits=cfg['limits'],sourceSpec='assets-source/m1b/shorts/spec.json')
mp=m.OUT/'equipment.json';manifest=json.loads(mp.read_text(encoding='utf8'));manifest['items']=[e for e in manifest['items']if e['id']!=entry['id']]+[entry];mp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
report={'input':args.input,'inputSha256':hashlib.sha256(data).hexdigest(),'output':entry['url'],'outputSha256':entry['sha256'],'stats':entry['stats'],'preservedBodySha256':cfg['compatibleAvatarSha256'],'styleId':cfg['styleId'],'fitId':cfg['fitId']}
(ROOT/'assets-source/m1b/shorts/repack-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report,indent=2))
