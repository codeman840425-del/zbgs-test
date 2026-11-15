"""Reopen saved author scene and inspect colliders only; disable cloth evaluation."""
from pathlib import Path
import gzip,json
import bpy
import numpy as np
R=Path(__file__).resolve().parents[3];A=R/'assets-source/m1/simple-skirt-v1/active-gap-hem-v1';O=A/'native-author-trial-v1';capture=json.loads(gzip.decompress((A/'continuous-input-v1/capture.json.gz').read_bytes()))
bpy.ops.wm.open_mainfile(filepath=str(O/'authoring-trial.blend'))
for obj in bpy.data.objects:
    for modifier in obj.modifiers:
        if modifier.type=='CLOTH':modifier.show_viewport=False;modifier.show_render=False
rows=[]
for frameIndex in [0,1,2]:
    bpy.context.scene.frame_set(frameIndex+1);deps=bpy.context.evaluated_depsgraph_get()
    for m in capture['frames'][frameIndex]['colliders']:
        obj=bpy.data.objects['Actual_'+m['name']];ev=obj.evaluated_get(deps);me=ev.to_mesh();co=np.array([v.co[:]for v in me.vertices]);three=co[:,[0,2,1]]*np.array([1,1,-1])/10.;expected=np.array(m['positions']).reshape(-1,3);tri=np.array([p.vertices[:]for p in me.polygons]);target=np.array(m['triangles']).reshape(-1,3)
        if m['name'].startswith('m1-uniform-top'):target=target[:,::-1]
        assert np.array_equal(tri,target)
        n=np.cross(three[tri[:,1]]-three[tri[:,0]],three[tri[:,2]]-three[tri[:,0]]);e=np.cross(expected[target[:,1]]-expected[target[:,0]],expected[target[:,2]]-expected[target[:,0]]);cos=np.einsum('ij,ij->i',n,e)/np.maximum(np.linalg.norm(n,axis=1)*np.linalg.norm(e,axis=1),1e-30)
        row={'frame':frameIndex+1,'name':m['name'],'vertices':len(co),'triangles':len(tri),'allIndicesExact':True,'worldMaximumPositionErrorMetres':float(np.linalg.norm(three-expected,axis=1).max()),'worldMinimumNormalCosine':float(cos.min()),'objectMatrixIdentity':bool(np.allclose(np.array(obj.matrix_world),np.eye(4),rtol=0,atol=0)),'collisionModifiers':[{'name':mo.name,'visible':mo.show_viewport}for mo in obj.modifiers if mo.type=='COLLISION'],'collisionDistanceAuthoring':{'outer':obj.collision.thickness_outer,'inner':obj.collision.thickness_inner},'bodyFailedFacesIncluded':None if m['name']!='Bodybaked'else{str(i):tri[i].tolist()for i in [825,834]}}
        rows.append(row);ev.to_mesh_clear()
(O/'collider-input-readback.json').write_text(json.dumps({'status':'colliders-only-readback-no-cloth-evaluation','scale':10,'rows':rows,'limits':['No new physical run; all cloth modifiers disabled before dependency evaluation.','Source body uses original outward winding; top intentionally inward for layer collision.']},indent=2)+'\n',encoding='utf-8');print(json.dumps({'maximumPositionError':max(r['worldMaximumPositionErrorMetres']for r in rows),'minimumNormalCosine':min(r['worldMinimumNormalCosine']for r in rows),'allIdentity':all(r['objectMatrixIdentity']for r in rows),'rows':len(rows)}))
