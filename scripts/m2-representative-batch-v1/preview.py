"""CPU orthographic texture preview of fixed batch resources, without changing them."""
import io
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from deform import GLB, ROOT, sha, source_context

BASE = ROOT/'assets-source/m2-representative-batch-v1'
OUT = ROOT/'evidence/m2-representative-batch-preview-v1'


def triangles(path, avatar=False):
    g = GLB(path.read_bytes()); result = []; images = {}
    for mesh in g.doc['meshes']:
        for p in mesh['primitives']:
            material = g.doc['materials'][p['material']]; name = material['name']
            if avatar and not any(t in name for t in ['SKIN', 'HAIR', '_FACE', '_EYE']):
                continue
            a = p['attributes']; index = np.array(g.accessor(p['indices'])).reshape(-1, 3)
            P = np.array(g.accessor(a['POSITION'])); N = np.array(g.accessor(a['NORMAL']))
            uv = np.array(g.accessor(a['TEXCOORD_0'])) if 'TEXCOORD_0' in a else np.zeros((len(P), 2))
            pbr = material.get('pbrMetallicRoughness', {}); texture = None
            if 'baseColorTexture' in pbr:
                image_index = g.doc['textures'][pbr['baseColorTexture']['index']]['source']
                if image_index not in images:
                    view = g.doc['bufferViews'][g.doc['images'][image_index]['bufferView']]
                    offset = view.get('byteOffset', 0)
                    images[image_index] = np.asarray(Image.open(io.BytesIO(g.binary[offset:offset+view['byteLength']])).convert('RGBA'))/255.
                texture = images[image_index]
            result.append((P[index], N[index], uv[index], texture, np.array(pbr.get('baseColorFactor', [1, 1, 1, 1])), material.get('alphaMode', 'OPAQUE'), material.get('alphaCutoff', .5)))
    return result


def render(parts, center, span, angle, size):
    width, height = size; scale = height/span
    right = np.array([np.cos(angle), 0, np.sin(angle)])
    toward = np.array([np.sin(angle), 0, -np.cos(angle)])
    image = np.ones((height, width, 3))*.94; depth = np.full((height, width), -np.inf)
    light = np.array([-.4, .6, -.7]); light /= np.linalg.norm(light)
    for P, N, UV, texture, factor, alpha_mode, cutoff in parts:
        local = P-center
        xy = np.stack([local@right*scale+width/2, height/2-local[:, :, 1]*scale], axis=2)
        z = local@toward
        for i, points in enumerate(xy):
            lo = np.maximum(np.floor(points.min(0)).astype(int), 0)
            hi = np.minimum(np.ceil(points.max(0)).astype(int), [width-1, height-1])
            if (lo > hi).any():
                continue
            A, B, C = points; det = (B[1]-C[1])*(A[0]-C[0])+(C[0]-B[0])*(A[1]-C[1])
            if abs(det) < 1e-8:
                continue
            yy, xx = np.mgrid[lo[1]:hi[1]+1, lo[0]:hi[0]+1]; xx = xx+.5; yy = yy+.5
            u = ((B[1]-C[1])*(xx-C[0])+(C[0]-B[0])*(yy-C[1]))/det
            v = ((C[1]-A[1])*(xx-C[0])+(A[0]-C[0])*(yy-C[1]))/det
            w = 1-u-v; bary = np.stack([u, v, w], axis=2)
            Z = bary@z[i]; target = depth[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
            visible = (bary.min(2) >= -1e-8)&(Z > target)
            if not visible.any():
                continue
            rgba = np.ones((*u.shape, 4))*factor
            if texture is not None:
                uv = bary@UV[i]
                tx = np.clip((uv[:, :, 0]*texture.shape[1]).astype(int), 0, texture.shape[1]-1)
                ty = np.clip((uv[:, :, 1]*texture.shape[0]).astype(int), 0, texture.shape[0]-1)
                rgba *= texture[ty, tx]
            if alpha_mode == 'OPAQUE':
                rgba[:, :, 3] = 1
            visible &= rgba[:, :, 3] >= (cutoff if alpha_mode == 'MASK' else .2)
            normal = bary@N[i]; normal /= np.maximum(np.linalg.norm(normal, axis=2), 1e-10)[:, :, None]
            shade = .72+.28*np.maximum(0, normal@light)
            colour = np.clip(rgba[:, :, :3]*shade[:, :, None], 0, 1)
            block = image[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
            block[visible] = colour[visible]; target[visible] = Z[visible]
    return Image.fromarray((image*255).astype('uint8'))


def main():
    started = time.perf_counter(); OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = BASE/'generated/manifest.json'; manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes); inputs = []; summaries = []
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
    for sex in ['female', 'male']:
        rows = [v for v in manifest['variants'] if v['sex'] == sex]
        full = Image.new('RGB', (2000, 1140), '#f0f0f0'); heads = Image.new('RGB', (1600, 880), '#f0f0f0')
        for column, row in enumerate(rows):
            folder = ROOT/row['avatar']['path']; inputs.append(row['avatar'])
            g = GLB(folder.read_bytes()); head = source_context(g)['joints']['head']
            parts = triangles(folder, True)
            equipment = json.loads((folder.parent/'equipment.json').read_bytes())
            for item in equipment['items']:
                path = folder.parent/item['url']; parts += triangles(path)
                inputs.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(path.read_bytes())})
            for view, angle in enumerate([0., .45]):
                full.paste(render(parts, np.array([0, .85, 0]), 1.9, angle, (500, 530)), (column*500, 40+view*550))
                heads.paste(render(parts, head+np.array([0, .055, -.015]), .34, angle, (400, 400)), (column*400, 40+view*420))
            ImageDraw.Draw(full).text((column*500+8, 12), row['id'], fill='#222222', font=font)
            ImageDraw.Draw(heads).text((column*400+8, 12), row['id'], fill='#222222', font=font)
            report = json.loads((ROOT/row['report']['path']).read_bytes())
            summaries.append({'id': row['id'], 'avatarSha256': row['avatar']['sha256'], 'sourceFloorY': report['sourceFloorY'],
                'regions': [{'material': p['material'], 'maxDisplacementM': p['maxDisplacementM'], 'before': p['boundsBefore'], 'after': p['boundsAfter']} for p in report['primitives'] if p['maxDisplacementM'] > 0]})
        full.save(OUT/(sex+'-full.png')); heads.save(OUT/(sex+'-heads.png'))
    report = {'schema': 'representative-batch-cpu-preview-v1', 'manifestSha256': sha(manifest_bytes), 'inputs': inputs,
        'views': ['front', 'three-quarter 0.45 radians'], 'units': 'metres', 'fullBodyVerticalSpanM': 1.9, 'headVerticalSpanM': .34,
        'method': 'CPU orthographic z-buffer, interpolated original UV and normals, base-colour texture sampling and simple light. Neutral bind/rest pose. Full image uses original Body/Face/HAIR plus exact independent matching clothes, omitting embedded clothing primitives.',
        'limits': ['Approximate base-colour raster, without MToon/outline/expression/game lighting. Alpha uses thresholding. These images do not establish runtime or pose acceptance.', 'Identical camera scales and view angles across sexes/presets. Clothing may conceal some body-volume change.'],
        'seconds': time.perf_counter()-started, 'variants': summaries, 'runtimeAccepted': False}
    (OUT/'report.json').write_bytes((json.dumps(report, indent=2)+'\n').encode())
    print(json.dumps({'images': 4, 'seconds': report['seconds'], 'resourcesUnmodified': manifest_bytes == manifest_path.read_bytes()}))


if __name__ == '__main__':
    main()
