"""Compare the fixed source curves and sampled surfaces without reauthoring them."""
import json
from pathlib import Path
import sys
import numpy as np
from scipy.spatial import cKDTree
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-medium-curly-hair-v1'
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB
sys.path.insert(0, str(Path(__file__).parent))
from build import encoded


def geometry(folder):
    glb = GLB((folder/'hair.glb').read_bytes())
    p = glb.doc['meshes'][0]['primitives'][0]
    return np.array(glb.accessor(p['attributes']['POSITION'])), np.array(glb.accessor(p['indices']),int).reshape(-1,3)


def sampled_distance(points, surface):
    neighbors = cKDTree(surface.mean(1)).query(points,k=64)[1]
    maximum = 0.
    for offset in range(0,len(points),128):
        q = points[offset:offset+128,None,:]
        triangles = surface[neighbors[offset:offset+128]]
        a,b,c = triangles[:,:,0],triangles[:,:,1],triangles[:,:,2]
        ab,ac = b-a,c-a
        normal = np.cross(ab,ac)
        norm2 = np.sum(normal*normal,axis=2)
        perpendicular2 = np.sum((q-a)*normal,axis=2)**2/norm2
        dot00,dot01,dot11 = np.sum(ab*ab,axis=2),np.sum(ab*ac,axis=2),np.sum(ac*ac,axis=2)
        dot02,dot12 = np.sum((q-a)*ab,axis=2),np.sum((q-a)*ac,axis=2)
        denominator = dot00*dot11-dot01*dot01
        u = (dot11*dot02-dot01*dot12)/denominator
        v = (dot00*dot12-dot01*dot02)/denominator
        distance2 = np.where((u>=0)&(v>=0)&(u+v<=1),perpendicular2,np.inf)
        for start,end in [(a,b),(b,c),(c,a)]:
            edge = end-start
            t = np.clip(np.sum((q-start)*edge,axis=2)/np.sum(edge*edge,axis=2),0,1)
            distance2 = np.minimum(distance2,np.sum((q-start-t[:,:,None]*edge)**2,axis=2))
        maximum = max(maximum,float(np.sqrt(distance2.min(1)).max()))
    return maximum


def main():
    spec = json.loads((BASE/'spec.json').read_text(encoding='utf-8'))
    rows = []
    for preset in spec['presets']:
        high,low = [BASE/folder/preset['id'] for folder in ['corrected','budget']]
        high_curves,low_curves = [json.loads((p/'curves.json').read_bytes()) for p in [high,low]]
        assert high_curves == low_curves
        hp,hf = geometry(high); lp,lf = geometry(low)
        rows.append({'id':preset['id'],'authoredCenterlinesExact':True,'centerlines':len(high_curves),
                     'sourceSamplesPerCenterline':len(high_curves[0]['centerline']),
                     'highTriangles':len(hf),'budgetTriangles':len(lf),'highVertices':len(hp),'budgetVertices':len(lp),
                     'highVertexToBudgetSurfaceSampleUpperM':sampled_distance(hp,lp[lf]),
                     'budgetVertexToHighSurfaceSampleUpperM':sampled_distance(lp,hp[hf]),
                     'maxBoundsDifferenceM':float(np.max(np.abs(np.array([hp.min(0),hp.max(0)])-np.array([lp.min(0),lp.max(0)]))))})
    report = {'sameAuthoredCenterlines':True,'rows':rows,
              'method':'Per-vertex closest point on 64 nearest triangle centroids, in both directions. Upper estimates for these vertex samples, without a continuous-surface Hausdorff claim.',
              'views':['corrected/source-projections.png','source-projections.png'],'runtimeAccepted':False}
    (BASE/'sampling-comparison.json').write_bytes(encoded(report))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
