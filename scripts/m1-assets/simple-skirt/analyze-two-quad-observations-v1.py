"""Read-only same-pair distances and material curves for two frozen observations."""
from pathlib import Path
R=Path(__file__).resolve().parents[3]
src=R/'scripts/m1-assets/simple-skirt/inspect-hem-self-clearance.py'
exec(compile(src.read_text(encoding='utf-8').split('rows=[]')[0],str(src),'exec'),globals())
selected=np.array([[2359,2118],[2361,2120]])
for folder in ['native-full-observation-v1','native-static-control-v1']:
    O=A/folder;result=json.loads((O/'result.json').read_text());rows=[]
    for number in range(1,result['frames']+1):
        fr=json.loads(gzip.decompress((O/('frame-%02d.json.gz'%number)).read_bytes()));p=np.array(fr['positionsWorld']);ds=distance(p,selected)
        endpoint=[]
        for v in [1350,1351]:
            pt=p[mapping[v]];dist=np.sqrt(point_tri(np.broadcast_to(pt,(len(outer),3)),p[faces[outer]]));endpoint.append(float(dist.min()))
        rows.append({'frame':number,'sourceActionSeconds':fr['sourceActionSeconds'],'maxEdgeStretch':fr['maxEdgeStretch'],'originalHemEdgeRatio':fr['originalHemEdgeRatio'],'originalHemEdgeLengthMetres':fr['originalHemEdgeLengthMetres'],'samePairDistancesMetres':ds.tolist(),'hemEndpointsToOuterMetres':endpoint,'colliderPairs':fr['colliderPairs'],'selfPairs':fr['selfPairs'],'absoluteDisplacementMetres':fr['absoluteDisplacementMetres']})
    report={'status':result['status'],'firstFailure':result['firstFailure'],'firstMaterialFailure':result['firstMaterialFailure'],'terminationReason':result['terminationReason'],'frames':result['frames'],'first18Exact':result['first18Exact'],'pairFaces':selected.tolist(),'rows':rows,'limits':['Same post-solve geometry pairs; not a native impulse attribution.','Static input control is not a sitting correction.','Original zero-contact and1.25 material gates unchanged.']}
    (O/'comparison-curves.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}));print(json.dumps({'first':rows[0],'last':rows[-1]}))
