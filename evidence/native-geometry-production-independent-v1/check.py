"""Read-only independent semantic/actual-referenced-index comparison; no producer execution."""
from pathlib import Path
import sys,json,hashlib,importlib.util,copy,io
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('reader',R/'scripts/m2-male-face-v1/glb.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
sha=lambda b:hashlib.sha256(b).hexdigest()
P=R/'assets-source/native-vroid-geometry-production-v1';F=R/'assets-source/native-vroid-geometry-factory-input-v1'
paths={'baseline':P/'generated/female-geometry-baseline.vrm','face':P/'generated/female-face-derived-correct.vrm','waist':P/'generated/female-waist-derived.vrm',
 'old789':R/'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm','old843':R/'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm'}
for k in ['baseline','face','waist']:paths[k+'Unmasked']=F/f'generated/female-geometry-{k}-unmasked.vrm'
gs={k:mod.GLB(v) for k,v in paths.items()}
def img(g,i):
 v=g.doc['bufferViews'][g.doc['images'][i]['bufferView']];return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def eq(a,b):return a.shape==b.shape and a.dtype==b.dtype and a.tobytes()==b.tobytes()
def roles(g):
 out={}
 def add(i,s):out.setdefault(i,[]).append(s)
 for mi,m in enumerate(g.doc['meshes']):
  for pi,p in enumerate(m['primitives']):
   label=f'{mi}/{pi}:'+g.doc['materials'][p['material']]['name']
   add(p['indices'],label+':indices')
   for key,i in p['attributes'].items():add(i,label+':'+key)
   for ti,t in enumerate(p.get('targets',[])):
    for key,i in t.items():add(i,label+f':morph{ti}:'+key)
 for si,s in enumerate(g.doc.get('skins',[])):add(s['inverseBindMatrices'],f'skin{si}:IBM')
 return out
def compare(a,b):
 ga,gb=gs[a],gs[b];da,db=ga.doc,gb.doc;assert len(da['accessors'])==len(db['accessors'])
 rr=roles(ga);changed=[]
 for i in range(len(da['accessors'])):
  x,y=ga.acc(i),gb.acc(i)
  if not eq(x,y):
   assert x.shape==y.shape
   changed.append({'accessor':i,'roles':rr.get(i,[]),'changedScalars':int(np.count_nonzero(x!=y)),'maxAbs':float(np.max(np.abs(y.astype(float)-x)))})
 prim=[]
 for mi,m in enumerate(da['meshes']):
  for pi,p in enumerate(m['primitives']):
   q=db['meshes'][mi]['primitives'][pi];ix=ga.acc(p['indices']).ravel();assert eq(ga.acc(p['indices']),gb.acc(q['indices']))
   ids=np.unique(ix);x=ga.acc(p['attributes']['POSITION'])[ids].astype(float);y=gb.acc(q['attributes']['POSITION'])[ids].astype(float);delta=y-x
   morph=[]
   for ti,(t,u) in enumerate(zip(p.get('targets',[]),q.get('targets',[]))):
    dx=ga.acc(t['POSITION'])[ids].astype(float);dy=gb.acc(u['POSITION'])[ids].astype(float)
    if not np.array_equal(dx,dy):morph.append({'target':ti,'maxDeltaChangeM':float(np.max(np.linalg.norm(dy-dx,axis=1))),'maxEndpointChangeM':float(np.max(np.linalg.norm(y+dy-x-dx,axis=1)))})
   attrs={key:eq(ga.acc(i)[ids],gb.acc(q['attributes'][key])[ids]) for key,i in p['attributes'].items()}
   prim.append({'mesh':mi,'primitive':pi,'material':da['materials'][p['material']]['name'],'positionAccessor':p['attributes']['POSITION'],'referencedVertices':len(ids),'changedVertices':int(np.count_nonzero(np.any(delta!=0,axis=1))),'maxEuclideanM':float(np.max(np.linalg.norm(delta,axis=1))),'changedSourceYRange':None if not np.any(delta) else [float(x[np.any(delta!=0,axis=1),1].min()),float(x[np.any(delta!=0,axis=1),1].max())],'attributeExact':attrs,'changedMorphDeltas':morph})
 nodes=[{'index':i,'name':n.get('name'),'before':n,'after':db['nodes'][i]} for i,n in enumerate(da['nodes']) if n!=db['nodes'][i]]
 ea,eb=copy.deepcopy(da['extensions']),copy.deepcopy(db['extensions']);ma=ea['VRMC_vrm'].pop('meta');mb=eb['VRMC_vrm'].pop('meta')
 return {'pair':[a,b],'changedAccessors':changed,'primitives':prim,'changedNodes':nodes,'skinsJSONExact':da['skins']==db['skins'],'meshesJSONExact':da['meshes']==db['meshes'],'materialsExact':da['materials']==db['materials'],'samplersExact':da.get('samplers')==db.get('samplers'),'texturesExact':da['textures']==db['textures'],'expressionsExact':ea['VRMC_vrm']['expressions']==eb['VRMC_vrm']['expressions'],'extensionsExceptMetaExact':ea==eb,'metaChangedKeys':[k for k in set(ma)|set(mb) if ma.get(k)!=mb.get(k)],'changedImages':[i for i in range(len(da['images'])) if img(ga,i)!=img(gb,i)]}
comparisons={k:compare(a,b) for k,a,b in [('face','baseline','face'),('waist','baseline','waist'),('oldToBaseline','old789','baseline'),('old843ToBaselineUnmasked','old843','baselineUnmasked')]}
restores={}
for k in ['baseline','face','waist']:
 a,b=gs[k],gs[k+'Unmasked'];c=compare(k,k+'Unmasked');assert not c['changedAccessors'] and not c['changedNodes'] and c['changedImages']==[11]
 assert c['materialsExact'] and c['meshesJSONExact'] and c['skinsJSONExact'] and c['extensionsExceptMetaExact'] and not c['metaChangedKeys']
 d=copy.deepcopy(b.doc);d['images'][11]['bufferView']=a.doc['images'][11]['bufferView'];d['bufferViews']=d['bufferViews'][:-1];d['buffers']=a.doc['buffers'];assert d==a.doc
 assert b.bin[:len(a.bin)]==a.bin
 src=np.asarray(Image.open(io.BytesIO(img(a,11))).convert('RGBA'));don=np.asarray(Image.open(io.BytesIO(img(gs['old843'],11))).convert('RGBA'))
 assert img(b,11)==img(gs['old843'],11) and np.array_equal(src[:,:,:3],don[:,:,:3])
 consumers=[]
 for mi,m in enumerate(a.doc['materials']):
  for name,t in [('base',m.get('pbrMetallicRoughness',{}).get('baseColorTexture')),('shade',m.get('extensions',{}).get('VRMC_materials_mtoon',{}).get('shadeMultiplyTexture'))]:
   if t and a.doc['textures'][t['index']]['source']==11:consumers.append({'material':mi,'name':m['name'],'use':name,'textureInfo':t,'texture':a.doc['textures'][t['index']]})
 restores[k]={'allSourceBinaryPrefixExact':True,'onlyBodyImageJSONAndAppendedBufferChange':True,'allAccessorsAndRestExact':True,'donorPNGExact':True,'RGBExact':True,'changedAlphaPixels':int(np.count_nonzero(src[:,:,3]!=don[:,:,3])),'size':list(src.shape),'bodyConsumers':consumers,'imageSHA':sha(img(b,11))}
def payload(name):
 d=json.loads((P/'records'/name).read_text(encoding='utf-8'));r=d['responses'][-1]['result'];assert not r.get('isError');return json.loads(r['content'][0]['text'])
param={}
for kind,before,after in [('face','09-face-params.json','28-face-correct-params-after.json'),('waist','10-waist-params.json','36-waist-params-after.json')]:
 x={r['key']:r for r in payload(before)};y={r['key']:r for r in payload(after)};assert x.keys()==y.keys();param[kind]=[{'key':key,'before':x[key]['value'],'after':y[key]['value'],'kind':y[key]['kind']}for key in x if x[key]!=y[key]]
receiptNames=['11-export-baseline.json','23-set-face-round-correct.json','24-set-face-cheek-correct.json','25-save-face-correct.json','26-menu-face-correct-cold.json','27-open-face-correct-cold.json','29-export-face-correct.json','32-set-waist.json','33-save-waist.json','34-main-menu-waist-cold.json','35-open-waist-cold.json','37-export-waist.json','93-status-restored.json']
receipts={n:{'sha256':sha((P/'records'/n).read_bytes()),'payload':payload(n)}for n in receiptNames}
result={'schema':'native-geometry-production-independent-v1','inputs':{k:{'path':v.relative_to(R).as_posix(),'sha256':sha(v.read_bytes())}for k,v in paths.items()},'readerSHA':sha((R/'scripts/m2-male-face-v1/glb.py').read_bytes()),'comparisons':comparisons,'unmask':restores,'parameters':param,'receipts':receipts,'scope':'CPU source content only; menu reopen is not process cold start; no factory fit/motion/contact/visual acceptance'}
with(OUT/'result.json').open('x',encoding='utf-8')as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'comparisons':{k:{'changedAccessors':len(v['changedAccessors']),'changedNodes':len(v['changedNodes']),'changedImages':v['changedImages'],'changedPrimitives':[(x['material'],x['changedVertices'],x['maxEuclideanM'])for x in v['primitives']if x['changedVertices']]}for k,v in comparisons.items()},'parameters':param,'unmask':{k:v['changedAlphaPixels']for k,v in restores.items()}},ensure_ascii=False))
