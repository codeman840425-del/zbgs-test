from pathlib import Path
import bpy,json,hashlib,collections
O=Path(__file__).resolve().parent
def drivers(owner):
 ad=getattr(owner,'animation_data',None)
 return [{'path':f.data_path,'index':f.array_index,'expression':f.driver.expression,'variables':[{'name':v.name,'type':v.type,'targets':[{'id':t.id.name if t.id else None,'bone':getattr(t,'bone_target',None),'path':getattr(t,'data_path',None)}for t in v.targets]}for v in f.driver.variables]}for f in ad.drivers]if ad else []
rows=[]
for o in bpy.data.objects:
 if o.type!='MESH':continue
 used=collections.Counter()
 for v in o.data.vertices:
  for g in v.groups:
   if g.weight>.001:used[o.vertex_groups[g.group].name]+=1
 rows.append({'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'shapeKeys':[k.name for k in o.data.shape_keys.key_blocks]if o.data.shape_keys else [],'shapeDrivers':drivers(o.data.shape_keys)if o.data.shape_keys else [],'objectDrivers':drivers(o),'weights':dict(used),'modifiers':[{'name':m.name,'type':m.type,'object':getattr(m,'object',None).name if getattr(m,'object',None)else None}for m in o.modifiers]})
rigs=[]
for o in bpy.data.objects:
 if o.type=='ARMATURE':rigs.append({'name':o.name,'bones':len(o.data.bones),'skirtBones':[{'name':b.name,'parent':b.parent.name if b.parent else None,'deform':b.use_deform}for b in o.data.bones if any(x in b.name.lower()for x in ['skirt','dress'])],'drivers':drivers(o),'skirtConstraints':[{'bone':p.name,'constraints':[{'type':c.type,'name':c.name,'target':getattr(c,'target',None).name if getattr(c,'target',None)else None,'subtarget':getattr(c,'subtarget',None)}for c in p.constraints]}for p in o.pose.bones if any(x in p.name.lower()for x in ['skirt','dress'])]})
actions=[{'name':a.name,'frameRange':list(a.frame_range),'slots':[s.identifier for s in a.slots]if hasattr(a,'slots')else [],'curves':len(a.fcurves)if hasattr(a,'fcurves')else None}for a in bpy.data.actions]
report={'file':'BlenderChan-Free.blend','sha256':hashlib.sha256((O/'BlenderChan-Free.blend').read_bytes()).hexdigest(),'blender':bpy.app.version_string,'openedWithAutoexecDisabled':True,'meshes':rows,'rigs':rigs,'actions':actions,'texts':[t.name for t in bpy.data.texts],'notes':['Read only: did not run bundled scripts/install RigTools/pose or save source','Bone existence is not proof of seated garment acceptance; no target-body fitting performed']}
(O/'blenderchan-source-inspection.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps({'skirtMeshes':[r for r in rows if 'skirt'in r['name'].lower()],'actions':actions,'rigs':[{'name':r['name'],'skirtBones':r['skirtBones']}for r in rigs]},indent=2))

