"""Same native pose, display-only exposure fix; separate cage strain diagnostics."""
import bpy,json,numpy as np,hashlib
from pathlib import Path
from mathutils import Vector
O=Path(__file__).resolve().parent/'native-pressure-v1';sc=bpy.context.scene;sk=bpy.data.objects['Skirt'];cam=sc.camera
sc.use_nodes=False;sc.view_settings.view_transform='AgX';sc.view_settings.exposure=0;sc.view_settings.gamma=1

def points():
 ev=sk.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();p=np.array([list(ev.matrix_world@v.co)for v in me.vertices]);edges=np.array([list(e.vertices)for e in me.edges]);ev.to_mesh_clear();return p,edges
rows=[]
for scope in ['displayAllModifiers','beforeSolidify','controlCageArmatureCorrectiveSmooth']:
 for m in sk.modifiers:
  if m.type=='SOLIDIFY':m.show_viewport=scope=='displayAllModifiers'
  if m.type=='SUBSURF':m.show_viewport=scope!='controlCageArmatureCorrectiveSmooth'
 reference=None
 for frame in [1,16,31,46,61]:
  sc.frame_set(frame);bpy.context.view_layer.update();P,E=points();lens=np.linalg.norm(P[E[:,1]]-P[E[:,0]],axis=1)
  if reference is None:reference=lens.copy()
  ratios=lens/np.maximum(reference,1e-12);idx=int(ratios.argmax());rows.append({'scope':scope,'frame':frame,'count':len(P),'maxRatio':float(ratios.max()),'p95Ratio':float(np.quantile(ratios,.95)),'maxEdge':E[idx].tolist(),'standingLengthM':float(reference[idx]),'lengthM':float(lens[idx]),'actualPoints':P[E[idx]].tolist()})
for m in sk.modifiers:
 if m.type in ['SUBSURF','SOLIDIFY']:m.show_viewport=True
# Preserve initial overexposed outputs as explicitly failed display evidence.
for frame in [1,61]:
 sc.frame_set(frame)
 for label,location in [('front',(0,-4,1.0)),('side',(4,0,1.0))]:
  cam.location=location;cam.rotation_euler=(Vector((0,-.04,.85))-cam.location).to_track_quat('-Z','Y').to_euler()
  sc.render.filepath=str(O/f'{frame:02}-{label}-review.png');bpy.ops.render.render(write_still=True)
report={'displayOnlyChanges':{'compositor':False,'viewTransform':'AgX','exposure':0,'gamma':1},'sourceMeshWeightsModifiersUnchanged':True,'metricsModifierIsolation':'Only diagnostic viewport copies disabled downstream subdivision/solidify temporarily; restored before rendering/saving.','strain':rows}
(O/'display-review.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
sc.frame_set(61);bpy.ops.wm.save_as_mainfile(filepath=str(O/'BlenderChan-Native-Pressure-Review-v1.blend'))
print(json.dumps({'seatStrain':[r for r in rows if r['frame']==61]},indent=2))
