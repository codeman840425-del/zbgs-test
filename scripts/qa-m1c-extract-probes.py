"""Extract three CC0 UAL2 action probes, without relabeling them as dances."""
import copy,hashlib,importlib.util,json,pathlib,struct,zipfile
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('source',ROOT/'scripts/qa-m1c-source.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
raw=(ROOT/'analysis/assets/UAL2-Standard.zip').read_bytes();assert hashlib.sha256(raw).hexdigest()=='4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68';z=zipfile.ZipFile(__import__('io').BytesIO(raw));member='Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb';source=z.read(member);g=m.GLB(source);j=copy.deepcopy(g.j);wanted=['OverhandThrow','NinjaJump_Start','NinjaJump_Land'];j['animations']=[a for a in j['animations']if a['name']in wanted];assert len(j['animations'])==3
j['accessors']=[];j['bufferViews']=[];binary=bytearray();mapping={}
def accessor(old):
 if old not in mapping:
  a=copy.deepcopy(g.j['accessors'][old]);assert not a.get('normalized'),'Audit normalized packing before expanding';v=g.acc(old);binary.extend(b'\0'*((-len(binary))%4));offset=len(binary);binary.extend(v.tobytes());a['bufferView']=len(j['bufferViews']);a.pop('byteOffset',None);j['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':v.nbytes});mapping[old]=len(j['accessors']);j['accessors'].append(a)
 return mapping[old]
for mesh in j['meshes']:
 for p in mesh['primitives']:
  p['attributes']={k:accessor(v)for k,v in p['attributes'].items()}
  if'indices'in p:p['indices']=accessor(p['indices'])
  for target in p.get('targets',[]):
   for key,index in target.items():target[key]=accessor(index)
for skin in j['skins']:skin['inverseBindMatrices']=accessor(skin['inverseBindMatrices'])
for a in j['animations']:
 for sampler in a['samplers']:sampler['input']=accessor(sampler['input']);sampler['output']=accessor(sampler['output'])
assert not j.get('images');j['buffers']=[{'byteLength':len(binary)}];text=json.dumps(j,separators=(',',':')).encode();text+=b' '*((-len(text))%4);binary.extend(b'\0'*((-len(binary))%4));blob=struct.pack('<4sII',b'glTF',2,28+len(text)+len(binary))+struct.pack('<I4s',len(text),b'JSON')+text+struct.pack('<I4s',len(binary),b'BIN\0')+binary
out=ROOT/'analysis/assets/ual2-probes';out.mkdir(parents=True,exist_ok=True);(out/'ual2-action-probes.glb').write_bytes(blob);(out/'quaternius-UAL2-CC0.txt').write_bytes(z.read('Universal Animation Library 2[Standard]/License.txt'));cooked=m.GLB(blob)
maxWorldError=0.;maxFootSkinError=0.;samples=[]
for clip in wanted:
 d=g.duration(clip);phases=np.array([0,.25,.5,.75,1.]);a,_,_=g.evaluate(clip,phases*d);b,_,_=cooked.evaluate(clip,phases*d);maxWorldError=max(maxWorldError,float(np.abs(a-b).max()))
 for side in ['l','r']:maxFootSkinError=max(maxFootSkinError,float(np.abs(g.skin(a,g.foot_surfaces()[side])-cooked.skin(b,cooked.foot_surfaces()[side])).max()))
 for i,phase in enumerate(phases):samples.append({'clip':clip,'phase':phase,'time':phase*d,'joints':{bone:b[i,g.byname[bone],:3,3].tolist()for bone in ['pelvis','hand_l','hand_r','foot_l','foot_r']},'footMinY':{side:float(cooked.skin(b[i:i+1],cooked.foot_surfaces()[side])[:,:,1].min())for side in ['l','r']}})
start,_,_=g.evaluate('NinjaJump_Start',np.array([g.duration('NinjaJump_Start')]));land,_,_=g.evaluate('NinjaJump_Land',np.array([0.]));seam=float(np.abs(start-land).max())
profile={'schema':'m1.source-probes.1','status':'source-import-only-not-dance-acceptance','file':'ual2-action-probes.glb','sha256':hashlib.sha256(blob).hexdigest(),'sourceMember':member,'sourceGLBSha256':hashlib.sha256(source).hexdigest(),'sourceArchiveSha256':hashlib.sha256(raw).hexdigest(),'sourcePage':'https://quaternius.itch.io/universal-animation-library-2','license':'CC0-1.0','author':'Quaternius / Gonzalo Furnier','clipNames':wanted,'restSkeletonUnchanged':j['nodes']==g.nodes,'translationOwner':'clip-hips; no path translation during in-place action probe','intent':{'OverhandThrow':'Original throw: raised arms, bent elbows, torso twist/side-bend test; not a dance','NinjaJump_Start':'Original high jump launch; not a small hop, no auto-loop','NinjaJump_Land':'Original matched landing; append only after matching end pose of Start'},'limits':['No avatar/runtime/garment acceptance','Start source can put sole below zero in anticipation; target floor adaptation remains necessary','Jump has ~0.54m source sole height; fails requested small-hop qualification as-is','Relative-pelvis negative foot span does not by itself prove an actual crossover step'],'extractionQA':{'worldMatrixMaxError':maxWorldError,'footSkinMaxError':maxFootSkinError,'jumpStartEndVsLandStartMatrixMaxError':seam}}
(out/'ual2-action-probes.profile.json').write_text(json.dumps(profile,indent=2));evidence=ROOT/'output/playwright/m1c-source/dance';evidence.mkdir(exist_ok=True);(evidence/'source-analysis.json').write_text(json.dumps({'crosscheckSamples':samples},indent=2));print(json.dumps(profile,indent=2))
assert maxWorldError<1e-10 and maxFootSkinError<1e-10
