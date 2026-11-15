"""Editable Blender Actions from target absolute world/normalized tracks.
Bone display axes differ from normalized nodes; explicit rest conversion is kept.
"""
import bpy,json,pathlib
from mathutils import Matrix,Vector
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-target-adaptation-v1'
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
reports=[]
for body in ['female','male']:
 rig=json.loads((OUT/(body+'-normalized-rig.json')).read_text());ref=json.loads((OUT/(body+'-world-reference.json')).read_text());bones=rig['normalizedBones'];names=ref['names'];inds={s:i for i,s in enumerate(names)}
 bpy.ops.wm.read_factory_settings(use_empty=True);arm=bpy.data.armatures.new(body+' normalized rig');obj=bpy.data.objects.new(body+' target squat',arm);bpy.context.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for s in names:
  b=arm.edit_bones.new(s);p=C@Vector(bones[s]['worldPosition']+[1]);b.head=p.xyz;child=next((k for k in names if bones[k]['parentSemantic']==s),None);tail=(C@Vector(bones[child]['worldPosition']+[1])).xyz if child else p.xyz+Vector((0,0,.04));b.tail=tail if (tail-p.xyz).length>.005 else p.xyz+Vector((0,0,.04))
 for s in names:
  par=bones[s]['parentSemantic']
  if par:arm.edit_bones[s].parent=arm.edit_bones[par]
 bpy.ops.object.mode_set(mode='POSE');br={s:arm.bones[s].matrix_local.copy()for s in names};nr={s:C@Matrix([bones[s]['worldMatrix'][i::4]for i in range(4)])@C.inverted()for s in names}
 for k,t in enumerate(ref['times']):
  for s in names:
   desired=C@Matrix(ref['world'][k][inds[s]])@C.inverted();pb=obj.pose.bones[s];pb.rotation_mode='QUATERNION';pb.matrix=desired@nr[s].inverted()@br[s];bpy.context.view_layer.update();frame=1+t*30000/1001;pb.keyframe_insert('location',frame=frame);pb.keyframe_insert('rotation_quaternion',frame=frame);pb.keyframe_insert('scale',frame=frame)
 obj['coordinateSpace']='three-vrm-3.5.5-normalized-local-absolute';obj['avatarSha256']=rig['avatarSha256'];obj['sourceNormalizedJson']=body+'-squat-normalized.json';bpy.ops.object.mode_set(mode='OBJECT');bpy.context.scene.render.fps=30000;bpy.context.scene.render.fps_base=1001;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=240;bpy.context.preferences.filepaths.save_version=0
 file=OUT/(body+'-squat-editable.blend');bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True);bpy.ops.wm.open_mainfile(filepath=str(file));obj=bpy.data.objects[body+' target squat'];maxerr=0
 for k in [0,95,195,239]:
  bpy.context.scene.frame_set(k+1)
  for s in names:
   actual=obj.pose.bones[s].head;expected=(C@Vector([ref['world'][k][inds[s]][i][3]for i in range(3)]+[1])).xyz;maxerr=max(maxerr,(actual-expected).length)
 reports.append({'body':body,'blender':bpy.app.version_string,'file':file.name,'reopened':True,'maximumBoneHeadReplayErrorMetres':maxerr,'editableActions':[a.name for a in bpy.data.actions]})
(OUT/'blender-editable-check.json').write_text(json.dumps(reports,indent=2),encoding='utf-8');print(reports)
