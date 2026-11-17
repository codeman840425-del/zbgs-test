"""Read-only two-case donor, garment-section and virtual-idle surface diagnosis."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evidence/m2-preset-garment-cause-v1'
OUT.mkdir(parents=True, exist_ok=True)
PINS = {}


def read(path):
    path = ROOT / path
    raw = path.read_bytes()
    PINS[path.relative_to(ROOT).as_posix()] = {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
    return raw


def module(name, path):
    read(path)
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


reader = module('garment_glb', 'scripts/m2-male-face-v1/glb.py')
audit = module('garment_audit', 'scripts/qa_representative_batch_v2.py')
old_diagnosis = module('old_vest_diagnosis', 'scripts/diagnose-representative-vest-source.py')


def load(path, token):
    read(path)
    g = reader.GLB(ROOT / path)
    p = next(p for m in g.doc['meshes'] for p in m['primitives'] if token in g.doc['materials'][p['material']]['name'])
    return {'model': g, 'primitive': p, 'positions': g.acc(p['attributes']['POSITION']).astype(float),
            'faces': g.acc(p['indices']).astype(int).reshape(-1, 3)}


def normal(tri):
    n = np.cross(tri[:, 1]-tri[:, 0], tri[:, 2]-tri[:, 0])
    return n / np.linalg.norm(n, axis=1)[:, None]


def sections(mesh, levels):
    # Full shirt/body X span at fixed actual horizontal planes. Not head API's z-filter.
    t = mesh['positions'][mesh['faces']]
    rows = []
    for y in levels:
        points = []
        for first, last in ((0, 1), (1, 2), (2, 0)):
            a, b = t[:, first], t[:, last]
            dy = b[:, 1]-a[:, 1]
            u = np.divide(y-a[:, 1], dy, out=np.full(len(t), np.inf), where=abs(dy)>1e-12)
            keep = (u>=0)&(u<=1)&(abs(dy)>1e-12)
            points.extend((a[keep]+u[keep, None]*(b[keep]-a[keep])).tolist())
        points = np.asarray(points)
        rows.append({'yM':y, 'widthM':float(np.ptp(points[:, 0])) if len(points) else None})
    return rows


def identities(a, b):
    ga, gb, pa, pb = a['model'], b['model'], a['primitive'], b['primitive']
    return {'indicesUnchanged':np.array_equal(a['faces'],b['faces']),
        'attributesUnchanged':{k:np.array_equal(ga.acc(pa['attributes'][k]),gb.acc(pb['attributes'][k]))
                               for k in pa['attributes'] if k not in ('POSITION','NORMAL')},
        'nodesUnchanged':ga.doc['nodes']==gb.doc['nodes'], 'skinsUnchanged':ga.doc['skins']==gb.doc['skins'],
        'materialsUnchanged':ga.doc['materials']==gb.doc['materials'],
        'imageHashesUnchanged':ga.images()==gb.images()}


def donor_rows(a, b, body, new_body, ids):
    ids = np.array(sorted(set(ids)), int)
    F, bary, anchor, _, _ = audit.nearest_binding(a['positions'][ids], body['positions'], body['faces'])
    old_tri = body['positions'][body['faces'][F]]
    new_tri = new_body['positions'][body['faces'][F]]
    mapped_anchor = np.einsum('ni,nij->nj',bary,new_tri)
    offset = a['positions'][ids]-anchor
    actual = b['positions'][ids]-mapped_anchor
    n0, n1 = normal(old_tri), normal(new_tri)
    rows = []
    for i, vertex in enumerate(ids):
        rows.append({'vertex':int(vertex), 'sourcePositionM':a['positions'][vertex].tolist(),
            'actualPositionM':b['positions'][vertex].tolist(), 'displacementM':(b['positions'][vertex]-a['positions'][vertex]).tolist(),
            'donorBodyTriangle':int(F[i]),'donorSourceIndices':body['faces'][F[i]].tolist(),
            'barycentric':bary[i].tolist(),'sourceOffsetM':offset[i].tolist(),
            'actualOffsetM':actual[i].tolist(), 'offsetVectorErrorM':float(np.linalg.norm(offset[i]-actual[i])),
            'donorNormalRotationDegrees':float(np.degrees(np.arccos(np.clip(n0[i]@n1[i],-1,1)))),
            'signedNormalOffsetBeforeM':float(offset[i]@n0[i]),'signedNormalOffsetAfterM':float(actual[i]@n1[i])})
    return rows


def texture(g,p):
    material = g.doc['materials'][p['material']]
    ti = material['pbrMetallicRoughness']['baseColorTexture']['index']
    im = g.doc['images'][g.doc['textures'][ti]['source']]
    v = g.doc['bufferViews'][im['bufferView']]
    data = g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
    return np.asarray(Image.open(io.BytesIO(data)).convert('RGBA'))


def male_virtual_rays(top):
    # This reuses actual CPU-skinned meshes. It is not the photographed frame.
    pose = json.loads(read('evidence/m2-preset-garment-cause-v1/male-wide-muscular-v2-cpu-idle.json'))
    visible = [m for m in pose['meshes'] if m['visible']]
    shirt = next(m for m in visible if 'Tops_01' in m['materialNames'][0])
    skin = next(m for m in visible if 'Body_00' in m['materialNames'][0])
    cam = np.asarray(pose['camera']['position']); width,height=1202,739
    def project(points):
        q=np.asarray(points)-cam; depth=-q[:,2]
        xy=np.column_stack((q[:,0]/depth/np.tan(np.pi/10)/(width/height),q[:,1]/depth/np.tan(np.pi/10)))
        return xy,depth
    # FOV is 36 degrees, hence tan(18 degrees).
    projected=[]
    for m in (shirt,skin):
        xy,depth=project(m['worldPositionsM']);F=np.asarray(m['indices']).reshape(-1,3)
        projected.append((xy[F],depth[F],F,m))
    uv=top['model'].acc(top['primitive']['attributes']['TEXCOORD_0']); image=texture(top['model'],top['primitive'])
    # Fixed screenshot-local box covering the observed left-armpit notch.
    rows=[]
    for py in range(345,390):
        for px in range(676,704):
            point=np.array([2*(px+.5)/width-1,1-2*(py+.5)/height])
            hits=[]
            for xy,depth,F,m in projected:
                hit=old_diagnosis.cover(point,xy,depth)
                if hit is None:hits.append(None);continue
                f,bary,_=hit;perspective=bary/depth[f];perspective/=perspective.sum()
                world=perspective@np.asarray(m['worldPositionsM'])[F[f]]
                hits.append((f,perspective,float(np.linalg.norm(world-cam))))
            if hits[0] is None:continue
            f,bary,depth=hits[0];coord=bary@uv[projected[0][2][f]]
            tex=image[int(np.floor(coord[1]*image.shape[0]))%image.shape[0],int(np.floor(coord[0]*image.shape[1]))%image.shape[1]]
            body_ahead=hits[1] is not None and hits[1][2]<depth
            rows.append({'pixel':[px,py],'topTriangle':int(f),'topIndices':projected[0][2][f].tolist(),
                'topUV':coord.tolist(),'topTextureRGBA':tex.tolist(),'bodyAhead':body_ahead,
                'bodyTriangle':int(hits[1][0]) if hits[1] else None,
                'bodyMinusTopRayDistanceM':float(hits[1][2]-depth) if hits[1] else None})
    return {'frameHistoryReproduced':False,'scope':'Virtual CPU idle + captured camera; not a ray attribution of the original screenshot.',
            'boxPixels':[676,345,704,390],'rows':rows,'bodyAheadSamples':sum(r['bodyAhead'] for r in rows),
            'whiteShirtTextureSamples':sum(min(r['topTextureRGBA'][:3])>180 for r in rows)}


def main():
    spec=json.loads(read('assets-source/m2-representative-batch-v2/spec.json'))
    capture=json.loads(read('evidence/m2-preset-visual-triage-v1/capture-report.json'))
    results=[]
    for sex,identifier in [('female','female-round-full-v2'),('male','male-wide-muscular-v2')]:
        ss=spec['sources'][sex];case=next(v for v in spec['variants'] if v['id']==identifier)
        gear=next(e for e in ss['equipment'] if e['slot']=='top')
        a=load(gear['path'],'Tops_01');folder='assets-source/m2-representative-batch-v2/generated/'+identifier+'/'
        b=load(folder+identifier+'-top.glb','Tops_01');body=load(ss['body']['path'],'Body_00_SKIN');new_body=load(folder+'avatar.vrm','Body_00_SKIN')
        cap=next(c for c in capture['cases'] if c['body']==identifier)
        topF=a['faces'];old,new=a['positions'],b['positions'];T,U=old[topF],new[topF]
        dot=(normal(T)*normal(U)).sum(1);angles=np.degrees(np.arccos(np.clip(dot,-1,1)))
        row={'id':identifier,'parameters':case['parameters'],'material':a['model'].doc['materials'][a['primitive']['material']]['name'],
             'sourceTop':gear,'actualTopPath':folder+identifier+'-top.glb','identities':identities(a,b),
             'captureEquipment':cap['loadedState']['outfit']['equipment'],
             'maximumFaceNormalRotationDegrees':float(angles.max()),'nonpositiveReferenceOrientationCount':int((dot<=0).sum()),
             'materialInfo':old_diagnosis.material_info(a)}
        top_bones=old_diagnosis.bones(a['model']);body_bones=old_diagnosis.bones(body['model'])
        row['sharedSourceRestPrerequisites']={
            'topBoneNamesAllInOriginalBody':set(top_bones)<=set(body_bones),
            'maximumMatchingInverseBindDifference':max(float(abs(matrix-body_bones[name]).max()) for name,matrix in top_bones.items()),
            'sourceTopMeshNodes':[{k:n[k] for k in ('name','mesh','skin','matrix','translation','rotation','scale') if k in n}
                                  for n in a['model'].doc['nodes'] if 'mesh' in n],
            'bodyOnlyFunction':'scripts/m2-representative-head-cage-v1/body.py::body_displacement',
            'actualJacobianReference':'scripts/m2-axial-body-compose-v1/common.py::body_values',
            'newSharedFieldGarmentTrialRun':False}
        if sex=='female':
            levels=[.91,.94,.97,1.00,1.03,1.06,1.09,1.12]
            row['sections']={'sourceTop':sections(a,levels),'derivedTop':sections(b,levels),
                             'sourceBody':sections(body,levels),'derivedBody':sections(new_body,levels)}
            seeds=[616,630,631,632,636,637]
            hem=np.flatnonzero((old[:,1]<.96)&(abs(old[:,0])>.08))
            row['donorRows']=donor_rows(a,b,body,new_body,seeds+hem.tolist())
            pants=load(folder+identifier+'-bottom.glb','TrainingPants')
            row['sourceBindTopPants']=old_diagnosis.front_samples(b,pants)
            row['priorActualPoseDiagnosis']=json.loads(read('evidence/m2-representative-vest-source-diagnosis-v1/report.json'))['status'] if 'status' in json.loads(read('evidence/m2-representative-vest-source-diagnosis-v1/report.json')) else 'see pinned original report'
        else:
            c=T.mean(1);region=(c[:,0]<-.10)&(c[:,0]>-.30)&(c[:,1]>1.25)&(c[:,1]<1.44)&(c[:,2]<.04)
            ids=np.flatnonzero(region);selected=ids[np.argsort(-angles[ids])[:12]]
            row['leftArmpitFaces']=[{'triangle':int(i),'sourceIndices':topF[i].tolist(),'sourceCenterM':c[i].tolist(),
                'normalRotationDegrees':float(angles[i]),'areaRatio':float(np.linalg.norm(np.cross(U[i,1]-U[i,0],U[i,2]-U[i,0]))/np.linalg.norm(np.cross(T[i,1]-T[i,0],T[i,2]-T[i,0])))}for i in selected]
            row['donorRows']=donor_rows(a,b,body,new_body,np.unique(topF[selected]).tolist())
            row['virtualIdleRays']=male_virtual_rays(a)
        results.append(row)
    for path in ['scripts/m2-representative-head-cage-v1/body.py',
                 'scripts/m2-axial-body-compose-v1/common.py',
                 'scripts/m2-representative-batch-v1/deform.py',
                 'scripts/m2-representative-batch-v2/deform.py',
                 'docs/research/REPRESENTATIVE-SHAPE-PIPELINE-OPTIONS-2026-11-16.md',
                 'evidence/m2-representative-vest-specks-68a-v1/root-attribution.json',
                 'assets-source/m2-vest-layer-fit-v1/spec.json']:
        read(path)
    report={'schema':'two-preset-garment-cause-readback-v1','sourceModified':False,'cases':results,'inputs':PINS,
            'limits':['No new browser capture or full action verification.','Virtual CPU idle differs from captured browser frame history.','No garment repair generated.']}
    def default(v):
        if isinstance(v,np.generic):return v.item()
        if isinstance(v,np.ndarray):return v.tolist()
        raise TypeError(type(v).__name__)
    (OUT/'report.json').write_bytes((json.dumps(report,ensure_ascii=False,indent=2,default=default)+'\n').encode('utf-8'))
    print(json.dumps({'cases':[{'id':r['id'],'donors':len(r['donorRows'])}for r in results]},default=default))


if __name__=='__main__':main()
