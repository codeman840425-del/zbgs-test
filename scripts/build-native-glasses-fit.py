"""Reuse the existing four-ring temple authoring method on measured native heads.

Input comes from qa-native-glasses-fit-input.cjs, with original/unfitted frames.
This produces candidate data only, never changes the source glasses or body.
"""
import argparse, gzip, hashlib, json, pathlib, struct
import numpy as np
from scipy.optimize import linprog

ROOT = pathlib.Path(__file__).resolve().parents[1]
BODIES = ['native-female-843ac-v1', 'native-female-face-v1',
          'native-female-waist-v1', 'native-male-7586-v1']
EXPECTED_ACCESSORY = 'c8098a499434c384850a73e6c207fb6c5e85620e9012c4426cd989952e5bec52'

def digest(raw): return hashlib.sha256(raw).hexdigest()
def transform(p, matrix): return (np.c_[p, np.ones(len(p))] @ matrix.T)[:, :3]
def rotation(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = a @ b
    if c < -0.999999: raise ValueError('Opposite source/target ring tangent')
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)

def build(input_dir, output_dir):
    raw = (ROOT / 'prototype/public/assets/m1c/studio-glasses-v1.glb').read_bytes()
    assert digest(raw) == EXPECTED_ACCESSORY
    n = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20+n]); binary = raw[28+n:]
    def positions(i):
        a = gltf['accessors'][i]; view = gltf['bufferViews'][a['bufferView']]
        assert a['componentType'] == 5126 and a['type'] == 'VEC3'
        return np.ndarray((a['count'], 3), dtype='<f4', buffer=binary,
            offset=view.get('byteOffset', 0)+a.get('byteOffset', 0),
            strides=(view.get('byteStride', 12), 4)).copy()
    sources = {m['name']: positions(m['primitives'][0]['attributes']['POSITION'])
               for m in gltf['meshes'] if m['name'].startswith('Temple')}
    files = {}; manifest = {'schema': 'm1.glasses-temple-fit-manifest.1', 'profiles': []}
    for body in BODIES:
        source = input_dir / (body+'-stand.json.gz'); capture = json.loads(gzip.decompress(source.read_bytes()))
        assert capture['live']['avatarSha256'] and capture['pose'] == 'stand'
        matrix = np.array(capture['glassesMatrix']).reshape(4, 4).T
        inverse = np.linalg.inv(matrix); scale = np.linalg.norm(matrix[:3, 0])
        triangles = []; face = None
        for mesh in capture['meshes']:
            if mesh['role'] != 'skin': continue
            vertices = transform(np.array(mesh['positions']), inverse)
            indices = np.array(mesh['triangles'])
            triangles.extend(vertices[indices])
            if any('_Face_' in m['name'] and 'SKIN' in m['name'] for m in mesh['materials']):
                if face is not None: raise ValueError('Ambiguous face primitive')
                face = vertices[np.unique(indices)]
        if face is None: raise ValueError('Missing measured face surface')
        triangles = np.array(triangles); a = triangles[:, 0, 1:]
        u = triangles[:, 1, 1:] - a; v = triangles[:, 2, 1:] - a
        den = u[:, 0]*v[:, 1] - u[:, 1]*v[:, 0]
        def surface(y, z, sign):
            q = np.array([y, z])-a; ok = np.abs(den)>1e-14
            b = np.zeros(len(triangles)); c = b.copy()
            b[ok] = (q[ok, 0]*v[ok, 1]-q[ok, 1]*v[ok, 0])/den[ok]
            c[ok] = (u[ok, 0]*q[ok, 1]-u[ok, 1]*q[ok, 0])/den[ok]
            ok &= (b>=-1e-8)&(c>=-1e-8)&(b+c<=1+1e-8)
            x = (triangles[:, 0, 0]+b*(triangles[:, 1, 0]-triangles[:, 0, 0])+c*(triangles[:, 2, 0]-triangles[:, 0, 0]))*sign
            return max(x[ok], default=0)
        controls = []
        for sign in [-1, 1]:
            name = 'Temple'+str(sign)
            old = np.array([[sign*.059, 0, 0], [sign*.062, 0, -.025], [sign*.060, -.001, -.105], [sign*.055, -.012, -.117]])
            # Existing bounded source-family ear selection, independently measured
            # for all four inputs; does not claim arbitrary ear topology support.
            ear = face[(face[:, 0]*sign>.072)&(face[:, 2]<-.065)]
            if len(ear)<4: raise ValueError('Ear selector insufficient for '+body)
            crest = ear[np.argmax(ear[:, 1])]; new = old.copy()
            new[2] = [crest[0], crest[1]+.00135+.0004/scale, crest[2]]
            new[3] = [sign*.067, crest[1]-.009, ear[:, 2].min()-.009]
            A = []; B = []
            for seg in range(3):
                for j in range(65):
                    q=j/64; point=new[seg]*(1-q)+new[seg+1]*q
                    sx=surface(point[1], point[2], sign)
                    if sx<=0: continue
                    w=np.zeros(4); w[seg]=1-q; w[seg+1]=q
                    A.append(-w[1:]); B.append(-(sx+.00135+.00035/scale-w[0]*.059))
            result=linprog([1,1,1], A_ub=A, b_ub=B,
                           bounds=[(.061,.085),(.072,.09),(.058,.09)], method='highs')
            if not result.success: raise ValueError(body+': '+result.message)
            new[1:,0]=result.x*sign; original=sources[name]
            assert original.shape==(36,3)
            rings=[]
            for k in range(4):
                tangent=lambda p: p[min(3,k+1)]-p[max(0,k-1)]
                rot=rotation(tangent(old),tangent(new))
                rings.append({'indices':list(range(k*9,(k+1)*9)), 'sourceCenter':old[k].tolist(),
                    'targetCenter':new[k].tolist(),'rotationRowMajor':rot.ravel().tolist()})
            controls.append({'mesh':name,'positionSHA256':digest(original.astype('<f4').tobytes()),
                'vertices':36,'rings':rings,'earCrestAccessoryLocal':crest.tolist(),
                'earBounds':[ear.min(0).tolist(),ear.max(0).tolist()]})
        profile={'schema':'m1.glasses-temple-fit.1','id':body+'-temple-v1',
            'bodySHA256':capture['live']['avatarSha256'],'accessorySHA256':EXPECTED_ACCESSORY,
            'units':'original accessory mesh coordinates before actual measured frame transform',
            'controls':controls,'sourceCapture':{'path':source.relative_to(ROOT).as_posix(),'sha256':digest(source.read_bytes())},
            'method':'Existing acc01 four-ring LP, exact current rendered skin surface and ear crest',
            'limits':['Candidate, not visual/contact acceptance. Original unfitted frame used only for measurement.',
                      'Bounded VRoid source-family ear selector; other head/ear shapes require revalidation.',
                      'Skin sections omit hair; normal-speed glasses/face/hair review still required.']}
        data=(json.dumps(profile,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
        files[body+'.json']=data
        manifest['profiles'].append({'body':body,'url':'/assets/native-glasses-fit-v1/'+body+'.json',
            'sha256':digest(data),'bytes':len(data),'bodySHA256':profile['bodySHA256']})
    files['manifest.json']=(json.dumps(manifest,indent=2)+'\n').encode('utf-8')
    for name,data in files.items():
        destination=output_dir/name
        if destination.exists() and destination.read_bytes()!=data: raise ValueError('Conflicting output '+str(destination))
    output_dir.mkdir(parents=True,exist_ok=True)
    for name,data in files.items():
        if not (output_dir/name).exists(): (output_dir/name).write_bytes(data)
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input',default='assets-source/native-glasses-fit-v1/input-987')
    p.add_argument('--output',default='assets-source/native-glasses-fit-v1/generated');a=p.parse_args()
    print(json.dumps(build(ROOT/a.input,ROOT/a.output),indent=2))
