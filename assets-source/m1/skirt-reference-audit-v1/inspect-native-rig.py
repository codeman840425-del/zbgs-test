from pathlib import Path
import bpy,json
O=Path(__file__).resolve().parent
rig=bpy.data.objects['BlenderChan Rig_rig']
rows=[]
for b in rig.pose.bones:
 if any(s in b.name.lower() for s in ['thigh','leg','foot','root','pelvis','butt','hand','arm','spine']):
  rows.append({'name':b.name,'parent':b.parent.name if b.parent else None,'head':list(b.bone.head_local),'tail':list(b.bone.tail_local),'matrix':list(sum((list(r)for r in b.bone.matrix_local),[])),'basis':list(sum((list(r)for r in b.matrix_basis),[])),'constraints':[{'type':c.type,'name':c.name,'subtarget':getattr(c,'subtarget',''),'influence':c.influence,'ownerSpace':getattr(c,'owner_space',''),'targetSpace':getattr(c,'target_space','')}for c in b.constraints],'custom':{k:str(v) for k,v in b.items()},'deform':b.bone.use_deform})
report={'rigMatrix':list(sum((list(r)for r in rig.matrix_world),[])),'bones':rows,'scene':{'frame':bpy.context.scene.frame_current,'camera':bpy.context.scene.camera.name if bpy.context.scene.camera else None},'objects':[{'name':o.name,'type':o.type,'hiddenRender':o.hide_render,'hiddenView':o.hide_get(),'location':list(o.location)}for o in bpy.data.objects],'skirtModifiers':[{'type':m.type,'settings':{k:str(getattr(m,k))for k in ['factor','iterations','smooth_type','use_only_smooth','use_pin_boundary','rest_source','vertex_group','levels','render_levels','thickness','offset']if hasattr(m,k)}}for m in bpy.data.objects['Skirt'].modifiers]}
(O/'native-rig-inventory.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print('saved native-rig-inventory.json')
