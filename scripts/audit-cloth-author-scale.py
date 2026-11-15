"""Exactly three isolated no-collision cloth strips; no garment/product mutation.
Run Blender4.5.9 --background --factory-startup --threads2 --python-exit-code1
--python scripts/audit-cloth-author-scale.py
"""
from pathlib import Path
import hashlib,json,time
import bpy
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/cloth-author-scale'
OUT.mkdir(parents=True,exist_ok=True)
if (OUT/'report.json').exists():
    raise RuntimeError('Preserve existing experiment; use a fresh checkout/output instead of overwrite')
assert bpy.app.version[:2]==(4,5)
started=time.monotonic()
COLS,ROWS=3,9
WIDTH,HEIGHT=.08,.4
base=np.array([[-WIDTH/2+WIDTH*c/(COLS-1),0,HEIGHT-HEIGHT*r/(ROWS-1)]for r in range(ROWS)for c in range(COLS)])
faces=[[r*COLS+c,r*COLS+c+1,(r+1)*COLS+c+1,(r+1)*COLS+c]for r in range(ROWS-1)for c in range(COLS-1)]
edges=np.unique(np.sort(np.array([(f[i],f[(i+1)%4])for f in faces for i in range(4)]),axis=1),axis=0)
rest=np.linalg.norm(base[edges[:,0]]-base[edges[:,1]],axis=1)
settings_fields=['quality','mass','air_damping','tension_stiffness','compression_stiffness','shear_stiffness','bending_stiffness','tension_stiffness_max','compression_stiffness_max','shear_stiffness_max','bending_stiffness_max','tension_damping','compression_damping','shear_damping','bending_damping','time_scale','use_dynamic_mesh','use_internal_springs','use_sewing_springs','vertex_group_structural_stiffness','vertex_group_shear_stiffness','vertex_group_bending','vertex_group_mass','pin_stiffness']
inputs={'schema':'cloth-author-scale-fixture-v1','verticesBaseMetres':base.tolist(),'quadFaces':faces,'topPinnedVertexIds':list(range(COLS)),'fps':30,'frames':61,'durationSeconds':2,'quality':8,'massPerVertexAuthorParameter':.15,'airDamping':0,'bendingModel':'ANGULAR','baseLinearStiffness':[15,15,8],'baseBending':.6,'cases':[{'id':'scale1-original','scale':1,'linearFactor':1},{'id':'scale10-original','scale':10,'linearFactor':1},{'id':'scale10-linear-converted','scale':10,'linearFactor':10}],'scope':'Same topology, vertex mass, spring damping and time; geometry/gravity scaled; no collisions, wind, pressure, internal/sewing springs or garment inputs.'}
(OUT/'input.json').write_text(json.dumps(inputs,indent=2)+'\n',encoding='utf-8')
results=[]
for case in inputs['cases']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.render.fps=30;scene.render.fps_base=1;scene.frame_start=1;scene.frame_end=61
    scene.gravity=(0,0,-9.81*case['scale']);scene.unit_settings.system='NONE'
    mesh=bpy.data.meshes.new(case['id']);mesh.from_pydata((base*case['scale']).tolist(),[],faces);mesh.update()
    obj=bpy.data.objects.new(case['id'],mesh);scene.collection.objects.link(obj)
    group=obj.vertex_groups.new(name='TopPin');group.add(list(range(COLS)),1,'REPLACE')
    mod=obj.modifiers.new('IsolatedNativeCloth','CLOTH');s=mod.settings
    s.quality=8;s.mass=.15;s.air_damping=0;s.bending_model='ANGULAR';s.bending_stiffness=.6
    s.tension_stiffness=15*case['linearFactor'];s.compression_stiffness=15*case['linearFactor'];s.shear_stiffness=8*case['linearFactor']
    # No stiffness groups exist. Preserve all other defaults, including damping and max_*.
    s.vertex_group_mass=group.name;s.pin_stiffness=1;s.use_dynamic_mesh=False
    s.use_internal_springs=False;s.use_sewing_springs=False
    mod.collision_settings.use_collision=False;mod.collision_settings.use_self_collision=False
    mod.point_cache.frame_start=1;mod.point_cache.frame_end=61
    settings={k:getattr(s,k)for k in settings_fields if hasattr(s,k)}
    settings['bending_model']=s.bending_model
    data=[]
    for frame in range(1,62):
        scene.frame_set(frame)
        ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh()
        raw=np.empty(len(base)*3);m.vertices.foreach_get('co',raw);ev.to_mesh_clear()
        p=raw.reshape(-1,3)/case['scale'];assert np.isfinite(p).all()
        length=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)
        column_lengths=[float(np.linalg.norm(np.diff(p[c::COLS],axis=0),axis=1).sum())for c in range(COLS)]
        end_to_end=[float(np.linalg.norm(p[c]-p[(ROWS-1)*COLS+c]))for c in range(COLS)]
        data.append({'frame':frame,'seconds':(frame-1)/30,'meanNormalizedColumnLengthMetres':float(np.mean(column_lengths)),'columnLengthStrain':float(np.mean(column_lengths)/HEIGHT-1),'meanNormalizedEndToEndMetres':float(np.mean(end_to_end)),'edgeStretchRatioMinMax':[float((length/rest).min()),float((length/rest).max())],'pinResidualMetres':float(np.linalg.norm(p[:COLS]-base[:COLS],axis=1).max()),'outOfPlaneMaxMetres':float(np.abs(p[:,1]).max()),'positionsNormalizedMetres':p.tolist()})
    result={'case':case,'actualSettings':settings,'gravity':list(scene.gravity),'objectScale':list(obj.scale),'collision':False,'selfCollision':False,'samples':data}
    (OUT/(case['id']+'.json')).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');results.append(result)

reference=np.array([r['positionsNormalizedMetres']for r in results[0]['samples']])
summary=[]
for r in results:
    positions=np.array([x['positionsNormalizedMetres']for x in r['samples']])
    summary.append({'case':r['case'],'strainAtHalfOneTwoSeconds':{str(t):r['samples'][int(t*30)]['columnLengthStrain']for t in [.5,1,2]},'finalNormalizedColumnLengthMetres':r['samples'][-1]['meanNormalizedColumnLengthMetres'],'maximumNormalizedVertexDifferenceFromScale1Metres':float(np.linalg.norm(positions-reference,axis=2).max()),'maximumPinResidualMetres':max(x['pinResidualMetres']for x in r['samples']),'maximumOutOfPlaneMetres':max(x['outOfPlaneMaxMetres']for x in r['samples'])})
report={'schema':'cloth-author-scale-result-v1','blender':bpy.app.version_string,'blenderBuildHash':bpy.app.build_hash.decode(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'inputSha256':hashlib.sha256((OUT/'input.json').read_bytes()).hexdigest(),'seconds':time.monotonic()-started,'summary':summary,'limits':['Mechanism test only, not calibrated real fabric or evidence every garment failure has this cause.','Vertical symmetric no-collision strip primarily exercises tension; same conversion follows compression/shear source formulas but their independent loading modes are not experimentally isolated.','ANGULAR bending remains .6, not multiplied; no significant out-of-plane bending load is intended.','No stiffness weight groups; max_* defaults recorded, not used to silently compensate base values.','No physics parameter search; exactly three predefined cases, all61frames retained.']}
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
