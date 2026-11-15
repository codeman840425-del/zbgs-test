"""One author-only outer surface; original complete render mesh reconstructed and gated."""
from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[3];adapter=R/'scripts/m1-assets/simple-skirt/trial-self025-v1.py';wrapper=adapter.read_text(encoding='utf-8').replace('native-self025-moving-v1','native-single-layer-moving-v1').replace('native-self025-static-v1','native-single-layer-static-v1')
end="exec(compile(text,str(source),'exec'),globals())";assert wrapper.endswith(end+'\n');wrapper=wrapper[:-len(end+'\n')];exec(compile(wrapper,str(adapter),'exec'),globals())
replace("'clothDistanceAuthoring':.002","'clothDistanceAuthoring':.011")
replace("cc.distance_min=.002","cc.distance_min=.011")
setup=r"""mappingPath=A/'single-layer-author-v1/mapping.json';authorMap=json.loads(mappingPath.read_text());assert authorMap['sourceSha256']==hashlib.sha256(raw).hexdigest()
authorKeep=np.array(authorMap['authorKeepOldSim']);authorFaceIds=np.array(authorMap['authorFaceIndices']);oldToAuthor=np.full(len(points),-1,int);oldToAuthor[authorKeep]=np.arange(len(authorKeep));authorFaces=oldToAuthor[faces[authorFaceIds]];assert authorFaces.min()>=0
assert np.array_equal(np.array(authorMap['renderToOldSim']),renderToSim)
def rebuildRender(q):
    full=np.empty((len(points),3));full[authorKeep]=q
    for rec in authorMap['innerMap']:
        ids=np.array(rec['outerTriangleOldSim']);tri=full[ids];u=tri[1]-tri[0];un=np.linalg.norm(u);n=np.cross(u,tri[2]-tri[0]);nn=np.linalg.norm(n)
        assert un>1e-9 and nn>2e-12,'Degenerate author mapping frame; hard stop'
        u/=un;n/=nn;v=np.cross(n,u);full[rec['innerSim']]=np.array(rec['barycentric'])@tri+np.stack([u,v,n],axis=1)@np.array(rec['localOffsetUVNMetres'])
    return full
assert np.max(np.linalg.norm(rebuildRender(points[authorKeep])-points,axis=1))<1e-6
"""
replace('scale=10.;cfg=',setup+'scale=10.;cfg=')
replace("skirt=mesh('Actual_Source_Skirt_Offline_Cloth',points,faces)","skirt=mesh('Author_Outer_Surface_Original_Render_Return_Rebuilt',points[authorKeep],authorFaces)")
replace("uv[rf.ravel()]","uv[rf[authorFaceIds].ravel()]")
replace("animate(skirt,targets);","animate(skirt,[q[authorKeep] for q in targets]);")
replace("vg.add(fixed.tolist(),1.,'REPLACE')","vg.add(oldToAuthor[fixed].tolist(),1.,'REPLACE')")
replace("p=three(xyz.reshape(-1,3));ev.to_mesh_clear()","p=rebuildRender(three(xyz.reshape(-1,3)));ev.to_mesh_clear()")
replace("'renderVertices':len(source)","'authorMappingSha256':hashlib.sha256(mappingPath.read_bytes()).hexdigest(),'authorVertices':len(authorKeep),'authorFaces':len(authorFaces),'originalRenderRetained':True,'physicalEquivalenceClaim':False,'renderVertices':len(source)")
(O/'trial-adapter.json').write_text(json.dumps({'sourceSha256':'02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7','compiledTrialSha256':hashlib.sha256(text.encode()).hexdigest(),'changes':changes,'baseline':'native-self025-object12-moving-v1','physicalParametersSameAsB':True,'authorDOFChanged':True,'originalRenderAssetUnchanged':True,'finalFullRenderGatesUnchanged':True,'mapping':'../single-layer-author-v1/mapping.json','mode':mode,'limits':['No full-body/action approval; authoring-only structure comparison.','No point collision projection; only local-frame return reconstruction.']},indent=2)+'\n',encoding='utf-8')
exec(compile(text,str(source),'exec'),globals())
