"""Bounded read-only reuse audit. Standard library only; no Blender/browser/runtime.
Reads actual preserved female/male sources and exported VRM geometry. It does not
make a male variant or validate expression/garment visuals after a deformation.
Run: python scripts/m1-variants/audit-male-reuse.py
"""
from pathlib import Path
import struct,json,hashlib,math
ROOT=Path(__file__).resolve().parents[2]
read=lambda name:json.loads((ROOT/name).read_text(encoding='utf-8-sig'))
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
class GLB:
 def __init__(self,path):
  self.raw=path.read_bytes();magic,version,total=struct.unpack_from('<4sII',self.raw)
  assert magic==b'glTF' and version==2 and total==len(self.raw)
  n,kind=struct.unpack_from('<I4s',self.raw,12);assert kind==b'JSON'
  self.doc=json.loads(self.raw[20:20+n]);bn,bkind=struct.unpack_from('<I4s',self.raw,20+n);assert bkind==b'BIN\0'
  self.bin=self.raw[28+n:28+n+bn]
 def acc(self,i):
  a=self.doc['accessors'][i];assert 'sparse' not in a,'Explicit handling required for sparse source attributes'
  v=self.doc['bufferViews'][a['bufferView']];fmt={5121:'B',5123:'H',5125:'I',5126:'f'}[a['componentType']]
  size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];fmt='<'+fmt*size
  offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',struct.calcsize(fmt))
  return [struct.unpack_from(fmt,self.bin,offset+n*stride) for n in range(a['count'])]
 def mesh(self,role):return next(m for m in self.doc['meshes'] if m['name'].startswith(role))
 def mesh_summary(self,role):
  m=self.mesh(role);ps=self.acc(m['primitives'][0]['attributes']['POSITION']);indices=[i[0] for p in m['primitives'] for i in self.acc(p['indices'])]
  names=m.get('extras',{}).get('targetNames',[])
  assert all(len(p.get('targets',[]))==len(names) for p in m['primitives'])
  assert all(self.doc['accessors'][t['POSITION']]['count']==len(ps) for p in m['primitives'] for t in p.get('targets',[]) if 'POSITION' in t)
  assert max(indices)<len(ps) and min(indices)>=0 and all(math.isfinite(v) for p in ps for v in p)
  return {'name':m['name'],'positionCount':len(ps),'usedVertices':len(set(indices)),'triangles':len(indices)//3,'minHeight':min(p[1] for p in ps),'maxHeight':max(p[1] for p in ps),'bounds':[[min(p[k] for p in ps) for k in range(3)],[max(p[k] for p in ps) for k in range(3)]],'triangleIndexSha256':hashlib.sha256(b''.join(struct.pack('<I',i) for i in indices)).hexdigest(),'morphCount':len(names),'allMorphPositionCountsMatchBasis':True,'morphNames':names,'materials':[self.doc['materials'][p['material']]['name'] for p in m['primitives']]}
fspec=read('assets-source/m1-variants/spec.json');mspec=read('assets-source/m1b/spec.json')
freport=read('assets-source/foundation/rebuild-report.json');mreport=read('assets-source/m1b/body-export-report.json')
result={'schema':'zbgs-local-variant-mechanism-audit-v1','scope':'Read-only source/hash/topology/morph mechanism review; no male deformation, Blender execution, browser or post-deform visual acceptance','bodies':{},'toolchains':{}}
for sex,blend,blendhash,vrm,vrmhash,report in [
 ('female',fspec['sourceBlend'],fspec['sourceBlendSha256'],fspec['sourceVRM'],fspec['sourceVRMSha256'],freport),
 ('male',mspec['editableSource'],mspec['editableSourceSha256'],mspec['roundtrip'],mspec['roundtripSha256'],mreport)]:
 assert sha(ROOT/blend)==blendhash and sha(ROOT/vrm)==vrmhash
 g=GLB(ROOT/vrm);v=g.doc['extensions']['VRM'];presets=[]
 for group in v['blendShapeMaster']['blendShapeGroups']:
  for bind in group.get('binds',[]):
   mesh=g.doc['meshes'][bind['mesh']];assert 0<=bind['index']<len(mesh.get('extras',{}).get('targetNames',[]))
  presets.append({'name':group['name'],'preset':group['presetName'],'bindCount':len(group.get('binds',[]))})
 result['bodies'][sex]={'sourceBlend':blend,'sourceBlendSha256':blendhash,'roundtrip':vrm,'roundtripSha256':vrmhash,'hashesVerified':True,'sourceMeshes':[{'name':x['name'],'vertices':x['vertices'],'polygons':x['polygons'],'shapeKeysIncludingBasis':len(x['shapeKeys'])} for x in report['meshes']],'exportedMeshes':{role:g.mesh_summary(role) for role in ['Face','Body']},'humanoidSemantics':sorted(b['bone'] for b in v['humanoid']['humanBones']),'skinJointCounts':[len(s['joints']) for s in g.doc['skins']],'expressions':presets,'licenseName':v['meta']['licenseName'],'meshNodes':[n for n in g.doc['nodes'] if 'mesh' in n]}
 result['toolchains'][sex]=read('assets-source/foundation'+('-male' if sex=='male' else '')+'/toolchain.json')
f=result['bodies']['female'];m=result['bodies']['male'];assert result['toolchains']['female']==result['toolchains']['male']
canonical=lambda names:{n.split('Fcl_')[-1] for n in names}
fn=canonical(f['exportedMeshes']['Face']['morphNames']);mn=canonical(m['exportedMeshes']['Face']['morphNames'])
jaw=next(v['jaw'] for v in fspec['variants'] if v['kind']=='jaw')
# All jaw displacement terms require local Z below upperZ/chinUpperZ. The
# preserved source uses Z-up; exported identity mesh nodes use glTF Y-up.
# Export yaw conversion does not change height. This is a necessary-height
# condition only, not reconstruction of male Blender object transforms/masks.
heightCanPass=m['exportedMeshes']['Face']['minHeight']<max(jaw['upperZ'],jaw['chinUpperZ'])
assert not heightCanPass
result['comparison']={'samePinnedToolchain':True,'sameHumanoidSemanticSet':f['humanoidSemantics']==m['humanoidSemantics'],'sameFaceIndexTopology':f['exportedMeshes']['Face']['triangleIndexSha256']==m['exportedMeshes']['Face']['triangleIndexSha256'],'sameBodyIndexTopology':f['exportedMeshes']['Body']['triangleIndexSha256']==m['exportedMeshes']['Body']['triangleIndexSha256'],'femaleOnlyCanonicalMorphNames':sorted(fn-mn),'maleOnlyCanonicalMorphNames':sorted(mn-fn),'femaleJawHeightMaskOnMale':{'femaleUpperHeight':jaw['upperZ'],'femaleChinUpperHeight':jaw['chinUpperZ'],'maleFaceLowestHeight':m['exportedMeshes']['Face']['minHeight'],'anyMaleVertexCanMeetNecessaryHeightCondition':heightCanPass,'conclusion':'Female numeric jaw region misses every exported male Face vertex; copying values cannot count as a male edit.'}}
result['mechanism']={'sourceEdit':'Per-source Basis displacement added to every corresponding shape-key vertex; no vertex-ID transfer between genders','preserved':'Mesh topology, UV, weights, object matrices and skeleton rest; shape key differences relative to Basis within float tolerance','candidateReuseConditions':['Use own saved male blend, source hashes and source toolchain','Re-measure male coordinate frame, jaw/face landmarks and waist/hip mask/centres; protect eyes/mouth/neck/hands/feet explicitly','Keep current small deformation scope and unchanged bone lengths; neither height nor a full body slider system is established','Rebuild exact-identity male gear/fit entries from male mesh and binds, not female materials/provenance/garment planes','Verify all 54 male face targets and actual eyelid/mouth/teeth/seams after deformation; numeric preservation alone cannot establish anatomy','Run own changed-body garment, sitting and locomotion/contact checks; new body hash is not compatible merely because skeleton semantics match'],'existingDriverScope':'build-variants.py reads female spec, female-equipment helper accepts only 2 female IDs and uses female source provenance/garment parameters; reuse requires bounded male adapter/spec, not direct invocation','maleVariantProduced':False,'maleVariantVerified':False,'fullMaleParameterLibraryRequiredForThisAudit':False}
result['sourceFiles']={name:sha(ROOT/name) for name in ['scripts/m1-variants/build-variants.py','scripts/m1-variants/build-equipment.py','scripts/m1-variants/audit.py','scripts/m1b-assets/export-body.py','scripts/m1b-assets/build.py','scripts/m1-variants/audit-male-reuse.py']}
output=ROOT/'evidence/male-local-variant-reuse.json';output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'output':str(output),'sourceHashesVerified':True,'sameToolchain':True,'femaleFaceSourceVertices':f['sourceMeshes'][0]['vertices'],'maleFaceSourceVertices':m['sourceMeshes'][0]['vertices'],'femaleExportFaceTargets':len(fn),'maleExportFaceTargets':len(mn),'maleJawMaskHeightCanPass':heightCanPass,'maleVariantProduced':False},ensure_ascii=False))
