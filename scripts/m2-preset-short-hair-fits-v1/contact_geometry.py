"""Measure the two actual new short-hair contacts and sample source texture alpha."""
import io
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-preset-short-hair-fits-v1'


def intersection(a, b, face):
    edge1, edge2 = face[1]-face[0], face[2]-face[0]
    direction = b-a
    h = np.cross(direction, edge2)
    determinant = np.dot(edge1, h)
    if abs(determinant) < 1e-12:
        return None
    relative = a-face[0]
    u = np.dot(relative, h)/determinant
    q = np.cross(relative, edge1)
    v = np.dot(direction, q)/determinant
    t = np.dot(edge2, q)/determinant
    if min(u, v, t) < -1e-8 or u+v > 1+1e-8 or t > 1+1e-8:
        return None
    return a+t*direction


def barycentric(point, triangle):
    a, b = triangle[1]-triangle[0], triangle[2]-triangle[0]
    relative = point-triangle[0]
    aa, ab, bb = a@a, a@b, b@b
    ar, br = a@relative, b@relative
    denominator = aa*bb-ab*ab
    u, v = (bb*ar-ab*br)/denominator, (aa*br-ab*ar)/denominator
    return np.array([1-u-v, u, v])


def projected_overlap_depth(face, hair):
    axis = hair[1]-hair[0]; axis /= np.linalg.norm(axis)
    normal = np.cross(hair[1]-hair[0], hair[2]-hair[0]); normal /= np.linalg.norm(normal)
    perpendicular = np.cross(normal, axis)
    project = lambda p: np.array([(p-hair[0])@axis, (p-hair[0])@perpendicular])
    projected = np.array([project(p) for p in hair])
    polygon = list(face)
    for index in range(3):
        origin = projected[index]; edge = projected[(index+1)%3]-origin
        side = lambda p: edge[0]*(project(p)[1]-origin[1])-edge[1]*(project(p)[0]-origin[0])
        output = []
        for k, a in enumerate(polygon):
            b = polygon[(k+1)%len(polygon)]; da, db = side(a), side(b)
            if da >= -1e-12:
                output.append(a)
            if (da < 0) != (db < 0):
                output.append(a+(b-a)*(da/(da-db)))
        polygon = output
        if not polygon:
            return None, None, []
    distances = np.array([(p-hair[0])@normal for p in polygon])
    deepest = polygon[int(np.argmax(distances))]
    return float(distances.max()), deepest, polygon


def alpha_sample(image, uv, flip_v=False):
    u, v = uv
    if flip_v:
        v = 1-v
    x, y = u*image.width-.5, v*image.height-.5
    x0, y0 = int(np.floor(x)), int(np.floor(y))
    fx, fy = x-x0, y-y0
    samples = [image.getpixel((min(image.width-1,max(0,x0+dx)),min(image.height-1,max(0,y0+dy))))[3] for dy in [0,1] for dx in [0,1]]
    value = samples[0]*(1-fx)*(1-fy)+samples[1]*fx*(1-fy)+samples[2]*(1-fx)*fy+samples[3]*fx*fy
    return {'bilinearAlpha0To255':float(value),'texelAlphaRange':[min(samples),max(samples)]}


def texture_footprints(image, polygon_uv):
    result = []
    for flip in [False, True]:
        coordinates = [(float(tex[0]*image.width-.5), float((1-tex[1] if flip else tex[1])*image.height-.5)) for tex in polygon_uv]
        if not coordinates:
            return []
        require_uv = np.array(polygon_uv)
        if not np.isfinite(require_uv).all() or require_uv.min() < -1e-6 or require_uv.max() > 1+1e-6:
            raise ValueError('Contact UV exceeds supported embedded-texture domain')
        left = max(0, int(np.floor(min(x for x,y in coordinates)))-2)
        top = max(0, int(np.floor(min(y for x,y in coordinates)))-2)
        right = min(image.width, int(np.ceil(max(x for x,y in coordinates)))+3)
        bottom = min(image.height, int(np.ceil(max(y for x,y in coordinates)))+3)
        mask = Image.new('L', (right-left,bottom-top), 0)
        local = [(x-left,y-top) for x,y in coordinates]
        if len(local)>=3:
            ImageDraw.Draw(mask).polygon(local,fill=255)
        else:
            ImageDraw.Draw(mask).line(local,fill=255,width=1)
        mask = mask.filter(ImageFilter.MaxFilter(3))
        alpha = np.asarray(image.getchannel('A').crop((left,top,right,bottom)))
        values = alpha[np.asarray(mask)>0]
        result.append({'flipV':flip,'conservativeTexelFootprint':int(len(values)),'maxAlpha0To255':int(values.max()) if len(values) else None})
    return result


def measure_pair(h, source_face, face, triangle_uv, image, inverse):
    contacts = []
    for a,b in [(h,face),(face,h)]:
        for edge in range(3):
            point = intersection(a[edge],a[(edge+1)%3],b)
            if point is not None and all(np.linalg.norm(point-old)>1e-8 for old in contacts):
                contacts.append(point)
    depth, deepest, polygon = projected_overlap_depth(face,h)
    old_depth, _, _ = projected_overlap_depth(source_face,h)
    normal = np.cross(h[1]-h[0],h[2]-h[0]); normal /= np.linalg.norm(normal)
    positive = []
    for k,a in enumerate(polygon):
        b = polygon[(k+1)%len(polygon)]
        da,db = (a-h[0])@normal,(b-h[0])@normal
        if da >= 0: positive.append(a)
        if (da<0)!=(db<0): positive.append(a+(b-a)*da/(da-db))
    polygon_uv = [barycentric(point,h)@triangle_uv for point in positive]
    footprints = texture_footprints(image,polygon_uv)
    samples = []
    for label,point in [('intersection',p) for p in contacts]+([('max-projected-depth',deepest)] if deepest is not None else []):
        tex = barycentric(point,h)@triangle_uv
        head_local = (inverse@np.r_[point,1])[:3]
        samples.append({'kind':label,'worldBindPoint':point.tolist(),'headLocalPoint':head_local.tolist(),'uv':tex.tolist(),
                        'sourceAlphaV':alpha_sample(image,tex),'sourceAlphaFlippedV':alpha_sample(image,tex,True)})
    return {'targetProjectedPlaneDepthM':depth,'sourceProjectedPlaneDepthM':old_depth,
            'positiveDepthUVPolygon':[p.tolist() for p in polygon_uv],'positiveDepthTextureFootprints':footprints,'samples':samples}


def main():
    from build import GLB, family, diagnostic_bytes, sha
    batch_root = Path(sys.argv[1]).resolve()
    batch = json.loads((batch_root/'assets-source/m2-representative-batch-v1/generated/manifest.json').read_bytes())
    spec = json.loads((BASE/'spec.json').read_bytes())['families']['male']
    original, _, hair_triangles, _, inverse = family(spec)
    asset = GLB((ROOT/spec['asset']).read_bytes()); primitive = asset.doc['meshes'][0]['primitives'][0]
    uv = np.array(asset.accessor(primitive['attributes']['TEXCOORD_0']))
    triangles = np.array(asset.accessor(primitive['indices']),int).reshape(-1,3)
    material = asset.doc['materials'][primitive['material']]
    texture = asset.doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
    image_doc = asset.doc['images'][texture['source']]; view = asset.doc['bufferViews'][image_doc['bufferView']]
    image_bytes = asset.binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
    image = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
    rows = []
    for identifier in ['male-wide-muscular','male-round-stocky']:
        failure = json.loads((BASE/'ready'/identifier/'FAILED.json').read_bytes())
        row = next(r for r in batch['variants'] if r['id']==identifier)
        target_bytes = (batch_root/row['avatar']['path']).read_bytes(); assert sha(target_bytes)==row['avatar']['sha256']
        target = GLB(target_bytes)
        location = failure['primitives'][-1]
        source_face = original.doc['meshes'][location['mesh']]['primitives'][location['primitive']]
        target_face = target.doc['meshes'][location['mesh']]['primitives'][location['primitive']]
        indices = np.array(target.accessor(target_face['indices']),int).reshape(-1,3)
        before = np.array(original.accessor(source_face['attributes']['POSITION']))
        after = np.array(target.accessor(target_face['attributes']['POSITION']))
        pairs = []
        for hi, fi in failure['failure']['samplePairs']:
            h = hair_triangles[hi]; face = after[indices[fi]]
            measurement = measure_pair(h,before[indices[fi]],face,uv[triangles[hi]],image,inverse)
            pairs.append({'hairTriangle':hi,'faceTriangle':fi,**measurement})
        rows.append({'targetId':identifier,'targetBodySha256':row['avatar']['sha256'],'mesh':location['mesh'],'primitive':location['primitive'],'introducedPairs':len(pairs),'pairs':pairs,
                     'maxProjectedPlaneDepthM':max(p['targetProjectedPlaneDepthM'] for p in pairs),'maxPositiveDepthFootprintAlpha':max(f['maxAlpha0To255'] for p in pairs for f in p['positiveDepthTextureFootprints'])})
    report={'sourceAssetSha256':spec['assetSha256'],'textureSha256':sha(image_bytes),'textureDimensions':[image.width,image.height],
            'sourceMaterial':material,'rows':rows,'runtimeAccepted':False,
            'method':'Actual triangle edge intersection points with hair-triangle barycentric UV. Max skin protrusion into the oriented hair triangle plane is evaluated after clipping the skin triangle to the hair triangle normal-projection prism. It measures local planar surface crossing, without a closed-volume/continuous penetration claim.',
            'limits':['Neutral source bind pose only. Existing source intersection pairs retained separately in fit reports.','Alpha sampled bilinearly plus conservative rasterized positive-depth UV polygon dilated by 1 texel (bilinear-neighbor footprint) in both V orientations. Actual MToon draw/culling/outline and game view remain root checks.','Numeric alpha/depth supplies contact classification evidence. It does not establish visual acceptance.']}
    (BASE/'contact-classification.json').write_bytes(diagnostic_bytes(report))
    summary=[{'id':r['targetId'],'pairs':r['introducedPairs'],'maxPlaneDepthM':r['maxProjectedPlaneDepthM'],'maxFootprintAlpha':r['maxPositiveDepthFootprintAlpha'],
              'alphaVRange':[min(s['sourceAlphaV']['bilinearAlpha0To255'] for p in r['pairs'] for s in p['samples']),max(s['sourceAlphaV']['bilinearAlpha0To255'] for p in r['pairs'] for s in p['samples'])],
              'alphaFlippedVRange':[min(s['sourceAlphaFlippedV']['bilinearAlpha0To255'] for p in r['pairs'] for s in p['samples']),max(s['sourceAlphaFlippedV']['bilinearAlpha0To255'] for p in r['pairs'] for s in p['samples'])]} for r in rows]
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
