"""Deterministic Face_SKIN geometry-to-UV surface layers. CPU only."""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-surface-layer-v1'
ORIGINAL_SHA = {'female': '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',
                'male': '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'}
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, local, require


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()


def png(array):
    stream = io.BytesIO(); Image.fromarray(array).save(stream, format='PNG', compress_level=9)
    return stream.getvalue()


def validate(spec):
    require(spec['schema'] == 'character-surface-layer-source-v1' and spec['version'] == 1, 'Unsupported source schema/version')
    require(set(spec) == {'schema', 'id', 'version', 'bodies', 'anatomy', 'layers'} and spec['id'] == 'm2-face-surface-layers-v1', 'Unknown source field/id')
    require(set(spec['bodies']) == {'female', 'male'} and set(spec['layers']) == {'freckles', 'blush'}, 'Exact body/layer set required')
    for name, body in spec['bodies'].items():
        require(body == {'path': 'prototype/public/assets/foundation/base-'+name+'-roundtrip.vrm', 'sha256': ORIGINAL_SHA[name]}, 'Unsupported exact original body: '+name)
    for name, layer in spec['layers'].items():
        expected = {'colorRGB8', 'opacity', 'sides'} | ({'spotsPerCheek', 'spotsOnNoseBridge', 'radiusM', 'seed'} if name == 'freckles' else {'falloff'})
        require(set(layer) == expected, name+' unknown source parameter')
        require(type(layer['opacity']) in [float, int] and np.isfinite(layer['opacity']) and 0 <= layer['opacity'] <= 1, name+' opacity must be finite 0..1')
        require(len(layer['colorRGB8']) == 3 and all(type(v) is int and 0 <= v <= 255 for v in layer['colorRGB8']), name+' invalid RGB8')
        require(layer['sides'] and len(set(layer['sides'])) == len(layer['sides']) and set(layer['sides']) <= {'left', 'right'}, name+' invalid sides')
    f = spec['layers']['freckles']
    require(all(type(f[k]) is int and 1 <= f[k] <= 40 for k in ['spotsPerCheek', 'spotsOnNoseBridge']) and type(f['seed']) is int, 'Invalid freckle count/seed')
    require(type(f['radiusM']) in [float, int] and np.isfinite(f['radiusM']) and .0003 <= f['radiusM'] <= .0015, 'Invalid freckle radius')
    require(type(spec['layers']['blush']['falloff']) in [float, int] and np.isfinite(spec['layers']['blush']['falloff']) and 1 <= spec['layers']['blush']['falloff'] <= 5, 'Invalid blush falloff')
    require(spec['anatomy'] == {'cheekBelowEyeM': .014, 'cheekOutwardFromIrisM': .008, 'cheekRadiiXYM': [.022, .012],
            'featureProtectionMarginM': .003, 'noseBridgeAboveTipM': .006, 'noseBridgeHalfWidthM': .008}, 'Anatomical region changes require a separate reviewed source version')


def read_source(body):
    data = local(ROOT, body['path']).read_bytes()
    require(sha(data) == body['sha256'], 'Body SHA mismatch: '+body['path'])
    g = GLB(data); doc = g.doc
    matches = [(mi, pi, p) for mi, mesh in enumerate(doc['meshes']) for pi, p in enumerate(mesh['primitives'])
               if doc['materials'][p['material']]['name'].endswith('_Face_00_SKIN')]
    require(len(matches) == 1, 'Ambiguous Face_SKIN primitive')
    mi, pi, primitive = matches[0]
    node = next(n for n in doc['nodes'] if n.get('mesh') == mi)
    require(not any(k in node for k in ['matrix', 'translation', 'rotation', 'scale']), 'Expected identity Face mesh transform')
    material = doc['materials'][primitive['material']]
    texture_info = material['pbrMetallicRoughness']['baseColorTexture']
    require(texture_info.get('texCoord', 0) == 0 and not texture_info.get('extensions'), 'Unsupported source UV transform')
    require(doc['extensions']['VRM']['materialProperties'][primitive['material']]['vectorProperties']['_MainTex'] == [0, 0, 1, 1], 'Unsupported MToon source UV transform')
    props = doc['extensions']['VRM']['materialProperties'][primitive['material']]['textureProperties']
    indices = [material['pbrMetallicRoughness']['baseColorTexture']['index'], props['_MainTex'], props['_ShadeTexture']]
    refs = []
    for usage, index in zip(['baseColorTexture', '_MainTex', '_ShadeTexture'], indices):
        texture = doc['textures'][index]; image = doc['images'][texture['source']]
        require('bufferView' in image and 'uri' not in image, 'Embedded source image required')
        view = doc['bufferViews'][image['bufferView']]
        encoded = g.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
        pixels = np.array(Image.open(io.BytesIO(encoded)).convert('RGBA'))
        refs.append({'usage': usage, 'textureIndex': index, 'imageIndex': texture['source'], 'sourceTextureSha256': sha(encoded),
                     'sourcePixelSha256': sha(pixels.tobytes()), 'mapSize': [pixels.shape[1], pixels.shape[0]]})
    require(all(ref['sourceTextureSha256'] == refs[0]['sourceTextureSha256'] and ref['sourcePixelSha256'] == refs[0]['sourcePixelSha256'] for ref in refs), 'Different map/shade source requires dedicated layer descriptions')
    require(refs[0]['mapSize'] == [1024, 1024], 'Only actual 1024x1024 source Face maps supported')
    return g, mi, pi, primitive, material, refs, pixels


def raster(g, primitive, width, height):
    attrs = primitive['attributes']; P = np.array(g.accessor(attrs['POSITION'])); UV = np.array(g.accessor(attrs['TEXCOORD_0']))
    N = np.array(g.accessor(attrs['NORMAL'])); F = np.array(g.accessor(primitive['indices']), int).reshape(-1, 3)
    xyz = np.zeros((height, width, 3)); normal = np.zeros_like(xyz); coverage = np.zeros((height, width), bool); aliases = np.zeros_like(coverage)
    for ids in F:
        uv = UV[ids]*[width, height]; lo = np.maximum(np.ceil(uv.min(0)-.5).astype(int), 0); hi = np.minimum(np.floor(uv.max(0)-.5).astype(int), [width-1, height-1])
        if np.any(hi < lo): continue
        a, b, c = uv; ab, ac = b-a, c-a; denominator = ab[0]*ac[1]-ab[1]*ac[0]
        if abs(denominator) < 1e-10: continue
        xx, yy = np.meshgrid(np.arange(lo[0], hi[0]+1), np.arange(lo[1], hi[1]+1)); qx, qy = xx+.5-a[0], yy+.5-a[1]
        v, w = (qx*ac[1]-qy*ac[0])/denominator, (ab[0]*qy-ab[1]*qx)/denominator
        inside = (v >= -1e-9) & (w >= -1e-9) & (v+w <= 1+1e-9)
        x, y = xx[inside], yy[inside]; bary = np.column_stack([1-v[inside]-w[inside], v[inside], w[inside]])
        points = bary @ P[ids]; occupied = coverage[y, x]
        aliases[y, x] |= occupied & (np.linalg.norm(xyz[y, x]-points, axis=1) > 1e-5)
        xyz[y, x] = points; normal[y, x] = bary @ N[ids]; coverage[y, x] = True
    return xyz, normal, coverage, aliases


def regions(g, mi, primitive, xyz, normal, coverage, aliases, anatomy):
    doc = g.doc; skin = np.array(g.accessor(primitive['attributes']['POSITION']))
    used = np.unique(np.array(g.accessor(primitive['indices']), int)); center = (skin[used, 0].min()+skin[used, 0].max())/2
    human = {h['bone']: h['node'] for h in doc['extensions']['VRM']['humanoid']['humanBones']}
    parents = {child: i for i, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    def eye_x(side):
        index = human[side+'Eye']; value = 0.
        while True:
            node = doc['nodes'][index]
            require(not any(k in node for k in ['matrix', 'rotation', 'scale']), 'Expected reviewed raw eye rest hierarchy')
            value += node.get('translation', [0, 0, 0])[0]
            if index not in parents: return value
            index = parents[index]
    require(eye_x('left') < center < eye_x('right'), 'Raw eye semantic side convention differs')
    geometry = {}
    for p in doc['meshes'][mi]['primitives']:
        name = doc['materials'][p['material']]['name']; ids = np.unique(np.array(g.accessor(p['indices']), int))
        geometry[name] = np.array(g.accessor(p['attributes']['POSITION']))[ids]
    def feature(token):
        items = [P for name, P in geometry.items() if token in name]
        require(len(items) == 1, 'Missing/ambiguous feature: '+token)
        return items[0]
    iris, eye, mouth = feature('_EyeIris_'), feature('_EyeWhite_'), feature('_FaceMouth_')
    eye_low = float(eye[:, 1].min()); mouth_top = float(mouth[:, 1].max()); margin = anatomy['featureProtectionMarginM']
    front = (normal[..., 2] < -.2) & (xyz[..., 2] < eye[:, 2].min()+.02)
    guard = np.zeros_like(coverage); boxes = []
    for name, points in geometry.items():
        if not any(token in name for token in ['_EYE', 'FaceEye', 'FaceBrow', 'FaceMouth']): continue
        for sign in [-1, 1]:
            half = points[(points[:, 0]-center)*sign >= 0]
            if not len(half): continue
            low, high = half[:, :2].min(0)-margin, half[:, :2].max(0)+margin
            guard |= np.all(xyz[..., :2] >= low, axis=2) & np.all(xyz[..., :2] <= high, axis=2)
            boxes.append({'material': name, 'sideSign': sign, 'minimumXYM': low.tolist(), 'maximumXYM': high.tolist()})
    central = used[(abs(skin[used, 0]-center) < .018) & (skin[used, 1] > mouth_top) & (skin[used, 1] < eye_low)]
    require(len(central) > 0, 'Nose landmark candidates missing')
    tip = skin[central[np.argmin(skin[central, 2])]]
    guard |= (abs(xyz[..., 0]-center) < .018) & (xyz[..., 1] <= tip[1]+.004)
    protected = ~coverage | ~front | aliases | guard
    cheeks = {}
    for side, sign in [('left', -1), ('right', 1)]:
        half = iris[(iris[:, 0]-center)*sign > 0]; eye_x = (half[:, 0].min()+half[:, 0].max())/2
        cheeks[side] = {'centerXYM': [float(eye_x+sign*anatomy['cheekOutwardFromIrisM']), eye_low-anatomy['cheekBelowEyeM']],
                        'radiiXYM': anatomy['cheekRadiiXYM']}
    nose = {'centerXYM': [float(center), float((tip[1]+anatomy['noseBridgeAboveTipM']+eye_low+.004)/2)],
            'radiiXYM': [anatomy['noseBridgeHalfWidthM'], float((eye_low+.004-tip[1]-anatomy['noseBridgeAboveTipM'])/2)]}
    require(nose['radiiXYM'][1] > .001, 'No safe nose bridge interval')
    return protected, cheeks, nose, {'centerXM': float(center), 'noseTipM': tip.tolist(), 'eyeLowerY': eye_low,
        'mouthTopY': mouth_top, 'cheeks': cheeks, 'noseBridge': nose, 'protectedGeometryBounds': boxes,
        'rasterGeometryAliasPixels': int(aliases.sum()), 'sideConvention': 'original semantic left is negative raw X; both original bases, avatar front -Z'}


def ellipse(xyz, region):
    return np.sum(((xyz[..., :2]-region['centerXYM'])/region['radiiXYM'])**2, axis=2)


def make_plan(spec):
    validate(spec); plan, variants, traces = {}, [], []
    for body_type, body in spec['bodies'].items():
        g, mi, pi, primitive, material, refs, source_pixels = read_source(body)
        xyz, normal, coverage, aliases = raster(g, primitive, 1024, 1024)
        protected, cheeks, nose, trace = regions(g, mi, primitive, xyz, normal, coverage, aliases, spec['anatomy'])
        prefix = body_type+'-'; plan[prefix+'protected.png'] = png(protected.astype('uint8')*255)
        layers = []
        for name, params in spec['layers'].items():
            fields = [(side, cheeks[side]) for side in params['sides']]
            if name == 'freckles': fields.append(('nose', nose))
            region = np.logical_or.reduce([ellipse(xyz, field) < 1 for _, field in fields]) & ~protected
            if params['sides'] == ['left']: region &= xyz[..., 0] < trace['centerXM']
            if params['sides'] == ['right']: region &= xyz[..., 0] > trace['centerXM']
            alpha = np.zeros_like(coverage, float)
            if name == 'blush':
                for _, field in fields:
                    r2 = ellipse(xyz, field); alpha = np.maximum(alpha, np.exp(-r2*params['falloff'])*np.maximum(0, 1-r2)**2)
            else:
                for label, field in fields:
                    rng = np.random.default_rng(params['seed']+{'left': 0, 'right': 1000, 'nose': 2000}[label])
                    count = params['spotsOnNoseBridge'] if field is nose else params['spotsPerCheek']
                    for _ in range(count):
                        angle = rng.uniform(0, np.pi*2); radius = np.sqrt(rng.uniform(0, .8))
                        center = np.array(field['centerXYM'])+np.array(field['radiiXYM'])*radius*[np.cos(angle), np.sin(angle)]
                        distance2 = np.sum((xyz[..., :2]-center)**2, axis=2)/params['radiusM']**2
                        alpha = np.maximum(alpha, np.exp(-distance2*2)*rng.uniform(.65, 1))
            alpha = np.rint(np.where(region, alpha*params['opacity']*255, 0)).astype('uint8')
            require(alpha.any(), 'Empty actual '+body_type+' '+name+' layer')
            rgba = np.zeros((1024, 1024, 4), 'uint8'); rgba[alpha > 0, :3] = params['colorRGB8']; rgba[..., 3] = alpha
            filename = prefix+name+'.png'; mask = prefix+name+'-region.png'
            plan[filename], plan[mask] = png(rgba), png(region.astype('uint8')*255)
            layers.append({'id': name, 'url': filename, 'sha256': sha(plan[filename]), 'order': 10 if name == 'freckles' else 20,
                'sourceParameters': copy.deepcopy(params), 'allowedOpacity': [0, 1], 'regionMask': {'url': mask, 'sha256': sha(plan[mask])},
                'nonzeroAlphaPixels': int(np.count_nonzero(alpha))})
        variants.append({'bodyType': body_type, 'avatarSha256': body['sha256'], 'materialName': material['name'],
            'sourceTextureSha256': refs[0]['sourceTextureSha256'], 'sourcePixelSha256': refs[0]['sourcePixelSha256'],
            'mapSize': [1024, 1024], 'imageYEqualsUVv': True, 'textureReferences': refs, 'mapAndShadeSameImage': True,
            'protectedMask': {'url': prefix+'protected.png', 'sha256': sha(plan[prefix+'protected.png'])}, 'layers': layers})
        attrs = primitive['attributes']
        traces.append({'bodyType': body_type, 'source': body, 'mesh': mi, 'primitive': pi, 'anatomy': trace,
            'positionSha256': sha(np.array(g.accessor(attrs['POSITION']), '<f4').tobytes()),
            'uvSha256': sha(np.array(g.accessor(attrs['TEXCOORD_0']), '<f4').tobytes()),
            'indexSha256': sha(np.array(g.accessor(primitive['indices']), '<u4').tobytes()),
            'sourceAlphaRange': [int(source_pixels[..., 3].min()), int(source_pixels[..., 3].max())]})
    manifest = {'schema': 'character-surface-layer-v1', 'id': spec['id'], 'version': spec['version'], 'license': 'CC0-1.0',
        'variants': variants, 'runtimeAccepted': False, 'composition': 'ordered source-over RGB only; preserve original source alpha; independent layers'}
    plan['manifest.json'], plan['build-report.json'] = json_bytes(manifest), json_bytes({'sourceParameters': spec, 'traces': traces, 'generatorSha256': sha(Path(__file__).read_bytes()), 'GPUUsed': False, 'runtimeAccepted': False})
    return plan


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--spec', default='assets-source/m2-surface-layer-v1/spec.json')
    ap.add_argument('--out', default='assets-source/m2-surface-layer-v1/generated'); ap.add_argument('--check', action='store_true'); args = ap.parse_args()
    out = local(ROOT, args.out)
    require(out == BASE/'generated' or (out.is_relative_to(BASE/'exports') and out != BASE/'exports'), 'Output must be generated or a new directory below this source package exports/')
    require(not out.exists() or out.is_dir(), 'Output is not a directory: '+args.out)
    spec = json.loads(local(ROOT, args.spec).read_text(encoding='utf-8')); plan = make_plan(spec)
    for name, data in plan.items():
        target = out/name
        require(not target.is_symlink(), 'Symlink output refused: '+name)
        require(not target.exists() or target.read_bytes() == data, 'Differing existing output '+args.out+'/'+name+'; choose a new --out directory')
    if not args.check:
        out.mkdir(parents=True, exist_ok=True)
        for name, data in plan.items():
            if not (out/name).exists(): (out/name).write_bytes(data)
    print(json.dumps({'status': 'checked' if args.check else 'exported', 'files': [{'file': n, 'sha256': sha(data), 'bytes': len(data)} for n, data in plan.items()]}))


if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(json.dumps({'status': 'invalid', 'error': str(error)})); sys.exit(2)
