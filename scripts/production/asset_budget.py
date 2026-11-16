"""Read-only cost admission for this project's uncompressed GLB/VRM assets."""
import argparse
import hashlib
import io
import json
import math
import pathlib
import struct
import sys
from urllib.parse import unquote, urlsplit

from flow import GLB, ROOT, local, read_json, require


METRICS = {
    'fileBytes', 'externalImageBytes', 'uniquePositionVertices',
    'primitiveVertices', 'triangles', 'nodeTriangles', 'primitives',
    'skins', 'jointSlots', 'maxJointsPerSkin', 'maxInfluences',
    'morphTargetsPerPrimitive', 'morphAccessorBytes', 'materials',
    'textures', 'images', 'maxImageDimension', 'rgba8MipBytes',
    'springJoints', 'colliders',
}
COMPONENTS = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2),
              5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
DIMENSIONS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def integer(value, label, minimum=0):
    require(type(value) is int and value >= minimum, label+' must be an integer >= '+str(minimum))
    return value


def ref(rows, index, label):
    integer(index, label)
    require(index < len(rows), label+' index out of range: '+str(index))
    return rows[index]


class AssetCost:
    def __init__(self, path):
        self.path = pathlib.Path(path).resolve()
        require(self.path.suffix.lower() in ['.glb', '.vrm'], 'asset: expected .glb or .vrm')
        self.raw = self.path.read_bytes()
        # Reuse the production reader, with strict chunk framing before parsing.
        offset = 12
        kinds = []
        while offset < len(self.raw):
            require(offset+8 <= len(self.raw), 'GLB: truncated chunk header')
            size, kind = struct.unpack_from('<II', self.raw, offset)
            require(size % 4 == 0 and offset+8+size <= len(self.raw), 'GLB: invalid chunk size')
            kinds.append(kind)
            offset += 8+size
        require(kinds in [[0x4E4F534A], [0x4E4F534A, 0x004E4942]], 'GLB: expected JSON then optional BIN chunk')
        self.glb = GLB(self.raw)
        self.doc = self.glb.doc
        require(isinstance(self.doc, dict), 'GLB JSON: expected object')
        require(self.doc.get('asset', {}).get('version') == '2.0', 'asset.version: expected glTF 2.0')
        for i, node in enumerate(self.doc.get('nodes', [])):
            extensions = node.get('extensions', {})
            require(isinstance(extensions, dict), 'nodes[%d].extensions: expected object' % i)
            require(not extensions, 'nodes[%d].extensions: unsupported %s' % (i, sorted(extensions)))
        required = set(self.doc.get('extensionsRequired', []))
        unsupported = required - {'VRM', 'VRMC_vrm', 'VRMC_springBone', 'VRMC_materials_mtoon',
                                   'KHR_materials_unlit', 'KHR_texture_transform'}
        require(not unsupported, 'extensionsRequired: unsupported '+str(sorted(unsupported)))
        buffers = self.doc.get('buffers', [])
        require(len(buffers) <= 1, 'buffers: only embedded BIN supported')
        if buffers:
            length = integer(buffers[0]['byteLength'], 'buffers[0].byteLength')
            require(length <= len(self.glb.binary) <= length+3, 'buffers[0]: BIN length mismatch')
        self.buffer_length = buffers[0]['byteLength'] if buffers else 0
        for i, view in enumerate(self.doc.get('bufferViews', [])):
            require(view.get('buffer', 0) == 0 and buffers, 'bufferViews[%d]: missing embedded buffer' % i)
            start = integer(view.get('byteOffset', 0), 'bufferViews[%d].byteOffset' % i)
            size = integer(view['byteLength'], 'bufferViews[%d].byteLength' % i)
            require(start+size <= self.buffer_length, 'bufferViews[%d]: exceeds buffer' % i)
            require(not view.get('extensions'), 'bufferViews[%d]: compressed/extended view unsupported' % i)
        self.accessors = {}
        for i in range(len(self.doc.get('accessors', []))):
            self.accessor(i)

    def view_bytes(self, index):
        view = ref(self.doc.get('bufferViews', []), index, 'bufferView')
        start = view.get('byteOffset', 0)
        return self.glb.binary[start:start+view['byteLength']]

    def accessor(self, index):
        integer(index, 'accessor index')
        if index in self.accessors:
            return self.accessors[index]
        label = 'accessors[%s]' % index
        a = ref(self.doc.get('accessors', []), index, label)
        require('sparse' not in a, label+': sparse unsupported')
        require(a.get('componentType') in COMPONENTS and a.get('type') in DIMENSIONS, label+': unsupported type')
        count = integer(a['count'], label+'.count', 1)
        view = ref(self.doc.get('bufferViews', []), a.get('bufferView'), label+'.bufferView')
        component, size = COMPONENTS[a['componentType']]
        width = size*DIMENSIONS[a['type']]
        stride = integer(view.get('byteStride', width), label+'.stride', width)
        start = integer(a.get('byteOffset', 0), label+'.byteOffset')
        require(stride % size == 0 and start % size == 0, label+': misaligned accessor')
        require(start+(count-1)*stride+width <= view['byteLength'], label+': exceeds bufferView')
        start += view.get('byteOffset', 0)
        fmt = '<'+component*DIMENSIONS[a['type']]
        values = [struct.unpack_from(fmt, self.glb.binary, start+n*stride) for n in range(count)]
        require(all(math.isfinite(v) for row in values for v in row), label+': nonfinite value')
        self.accessors[index] = values
        return values

    def images(self):
        from PIL import Image
        rows = []
        external = {}
        for i, entry in enumerate(self.doc.get('images', [])):
            label = 'images[%d]' % i
            require(('uri' in entry) != ('bufferView' in entry), label+': expected exactly one source')
            if 'uri' in entry:
                uri = entry['uri']
                require(isinstance(uri, str) and uri and '\\' not in uri, label+': invalid URI')
                parsed = urlsplit(uri)
                require(not any([parsed.scheme, parsed.netloc, parsed.query, parsed.fragment]) and not parsed.path.startswith('/'), label+': only relative image paths supported')
                relative = unquote(parsed.path)
                require('%' not in relative, label+': ambiguous URI encoding')
                path = local(self.path.parent, relative)
                require(path != self.path, label+': image references GLB itself')
                data = path.read_bytes()
                external[str(path)] = len(data)
                source = relative
            else:
                data = self.view_bytes(entry['bufferView'])
                source = 'bufferView:'+str(entry['bufferView'])
            try:
                with Image.open(io.BytesIO(data)) as image:
                    require(image.format in ['PNG', 'JPEG'], label+': only PNG/JPEG supported')
                    require(not getattr(image, 'is_animated', False), label+': animated images unsupported')
                    actual_mime = {'PNG': 'image/png', 'JPEG': 'image/jpeg'}[image.format]
                    require(entry.get('mimeType', actual_mime) == actual_mime, label+': MIME/type mismatch')
                    width, height = image.size
                    require(width > 0 and height > 0, label+': invalid image dimensions')
                    image.verify()
            except (OSError, Image.DecompressionBombError) as error:
                raise ValueError(label+': invalid image '+source+' ('+str(error)+')') from error
            mip = 0
            w, h = width, height
            while True:
                mip += w*h*4
                if w == h == 1:
                    break
                w, h = max(1, w//2), max(1, h//2)
            rows.append({'index': i, 'source': source, 'sha256': hashlib.sha256(data).hexdigest(),
                         'encodedBytes': len(data), 'width': width, 'height': height,
                         'rgba8Bytes': width*height*4, 'rgba8MipBytes': mip})
        return rows, sum(external.values())

    def measure(self):
        d = self.doc
        metrics = dict.fromkeys(METRICS, 0)
        metrics['fileBytes'] = len(self.raw)
        meshes, nodes, skins = d.get('meshes', []), d.get('nodes', []), d.get('skins', [])
        positions, morphs = set(), set()
        mesh_triangles = []
        max_influences = 0
        skin_rows = []
        for i, skin in enumerate(skins):
            joints = skin['joints']
            require(joints and len(set(joints)) == len(joints), 'skins[%d]: empty/duplicate joints' % i)
            for joint in joints:
                ref(nodes, joint, 'skins[%d].joints' % i)
            if 'inverseBindMatrices' in skin:
                a = d['accessors'][skin['inverseBindMatrices']]
                require(a['type'] == 'MAT4' and len(self.accessor(skin['inverseBindMatrices'])) == len(joints), 'skins[%d]: inverse bind count/type' % i)
            skin_rows.append({'index': i, 'joints': len(joints)})
        for mi, mesh in enumerate(meshes):
            triangles = 0
            require(mesh.get('primitives'), 'meshes[%d]: no primitives' % mi)
            for pi, primitive in enumerate(mesh['primitives']):
                label = 'meshes[%d].primitives[%d]' % (mi, pi)
                require(primitive.get('mode', 4) == 4, label+': only TRIANGLES supported')
                require(not primitive.get('extensions'), label+': extended/compressed primitive unsupported')
                attrs = primitive['attributes']
                pos = attrs['POSITION']
                require(d['accessors'][pos]['type'] == 'VEC3', label+': POSITION must be VEC3')
                count = len(self.accessor(pos))
                positions.add(pos)
                metrics['primitiveVertices'] += count
                metrics['primitives'] += 1
                for name, index in attrs.items():
                    require(len(self.accessor(index)) == count, label+'.'+name+': attribute count mismatch')
                if 'indices' in primitive:
                    index = primitive['indices']
                    a = ref(d['accessors'], index, label+'.indices')
                    require(a['type'] == 'SCALAR' and a['componentType'] in [5121, 5123, 5125], label+': invalid index type')
                    indices = [row[0] for row in self.accessor(index)]
                    require(all(0 <= value < count for value in indices), label+': index exceeds POSITION')
                    index_count = len(indices)
                else:
                    index_count = count
                require(index_count % 3 == 0, label+': triangle index count not divisible by 3')
                triangles += index_count//3
                if 'material' in primitive:
                    ref(d.get('materials', []), primitive['material'], label+'.material')
                targets = primitive.get('targets', [])
                metrics['morphTargetsPerPrimitive'] = max(metrics['morphTargetsPerPrimitive'], len(targets))
                for target in targets:
                    for name, index in target.items():
                        require(name in ['POSITION', 'NORMAL', 'TANGENT'], label+': unknown morph attribute')
                        require(len(self.accessor(index)) == count and d['accessors'][index]['type'] == 'VEC3', label+': morph count/type mismatch')
                        morphs.add(index)
                joint_sets = {name[7:] for name in attrs if name.startswith('JOINTS_')}
                weight_sets = {name[8:] for name in attrs if name.startswith('WEIGHTS_')}
                require(joint_sets == weight_sets, label+': JOINTS/WEIGHTS sets differ')
                weights = []
                for suffix in sorted(weight_sets):
                    wi, ji = attrs['WEIGHTS_'+suffix], attrs['JOINTS_'+suffix]
                    wa, ja = d['accessors'][wi], d['accessors'][ji]
                    require(wa['type'] == ja['type'] == 'VEC4' and ja['componentType'] in [5121, 5123], label+': skin attributes must be VEC4')
                    require(wa['componentType'] in [5121, 5123, 5126], label+': invalid weight type')
                    divisor = 1 if wa['componentType'] == 5126 else {5121: 255, 5123: 65535}[wa['componentType']]
                    require(divisor == 1 or wa.get('normalized') is True, label+': integer weights must be normalized')
                    weights.append([tuple(v/divisor for v in row) for row in self.accessor(wi)])
                for vertex in range(count) if weights else []:
                    values = [v for group in weights for v in group[vertex]]
                    require(all(v >= 0 for v in values) and abs(sum(values)-1) <= .002, label+': invalid weights at vertex '+str(vertex))
                    max_influences = max(max_influences, sum(v > 0 for v in values))
            mesh_triangles.append(triangles)
        for ni, node in enumerate(nodes):
            if 'mesh' not in node:
                continue
            mesh = ref(meshes, node['mesh'], 'nodes[%d].mesh' % ni)
            metrics['nodeTriangles'] += mesh_triangles[node['mesh']]
            if 'skin' in node:
                skin = ref(skins, node['skin'], 'nodes[%d].skin' % ni)
                for primitive in mesh['primitives']:
                    attrs = primitive['attributes']
                    require('JOINTS_0' in attrs, 'nodes[%d]: skinned mesh lacks weights' % ni)
                    for name, index in attrs.items():
                        if name.startswith('JOINTS_'):
                            require(all(0 <= v < len(skin['joints']) for row in self.accessor(index) for v in row), 'nodes[%d]: joint index outside skin' % ni)
        images, external_bytes = self.images()
        textures = d.get('textures', [])
        texture_rows = []
        for ti, texture in enumerate(textures):
            require(not texture.get('extensions'), 'textures[%d]: extended/compressed texture unsupported' % ti)
            image = ref(images, texture.get('source'), 'textures[%d].source' % ti)
            if 'sampler' in texture:
                ref(d.get('samplers', []), texture['sampler'], 'textures[%d].sampler' % ti)
            texture_rows.append({'index': ti, 'image': image['index'], 'rgba8MipBytes': image['rgba8MipBytes']})
        # Validate texture references in both glTF and VRM0 material properties.
        material_textures = set()
        def texture_refs(value):
            if isinstance(value, dict):
                for name, child in value.items():
                    if name.endswith('Texture') and isinstance(child, dict) and 'index' in child:
                        ref(textures, child['index'], 'materials.'+name)
                        material_textures.add(child['index'])
                    texture_refs(child)
            elif isinstance(value, list):
                for child in value:
                    texture_refs(child)
        texture_refs(d.get('materials', []))
        ext = d.get('extensions', {})
        vrm = ext.get('VRM', {})
        for material in vrm.get('materialProperties', []):
            for name, index in material.get('textureProperties', {}).items():
                if index != -1:
                    ref(textures, index, 'VRM.textureProperties.'+name)
                    material_textures.add(index)
        secondary = vrm.get('secondaryAnimation', {})
        springs = ext.get('VRMC_springBone', {})
        legacy_bones = [bone for group in secondary.get('boneGroups', []) for bone in group.get('bones', [])]
        modern_bones = [joint['node'] for spring in springs.get('springs', []) for joint in spring.get('joints', [])]
        for bone in legacy_bones+modern_bones:
            ref(nodes, bone, 'spring joint')
        # VRM0 entries are roots whose descendants are also simulated.
        dynamic_nodes = set(modern_bones)
        def descendants(index, visiting):
            require(index not in visiting, 'nodes: cyclic spring hierarchy')
            dynamic_nodes.add(index)
            for child in ref(nodes, index, 'spring node').get('children', []):
                descendants(child, visiting | {index})
        for bone in legacy_bones:
            descendants(bone, set())
        colliders = sum(len(group.get('colliders', [])) for group in secondary.get('colliderGroups', []))+len(springs.get('colliders', []))
        metrics.update({
            'uniquePositionVertices': sum(len(self.accessor(i)) for i in positions),
            'triangles': sum(mesh_triangles), 'skins': len(skins),
            'jointSlots': sum(len(s['joints']) for s in skins),
            'maxJointsPerSkin': max([len(s['joints']) for s in skins], default=0),
            'maxInfluences': max_influences,
            'morphAccessorBytes': sum(len(self.accessor(i))*DIMENSIONS[d['accessors'][i]['type']]*COMPONENTS[d['accessors'][i]['componentType']][1] for i in morphs),
            'materials': len(d.get('materials', [])), 'textures': len(textures), 'images': len(images),
            'externalImageBytes': external_bytes,
            'maxImageDimension': max([max(i['width'], i['height']) for i in images], default=0),
            'rgba8MipBytes': sum(t['rgba8MipBytes'] for t in texture_rows),
            'springJoints': len(dynamic_nodes), 'colliders': colliders,
        })
        return {'metrics': metrics, 'images': images, 'textureObjects': texture_rows, 'skins': skin_rows,
                'meshDefinitions': len(meshes), 'meshNodes': sum('mesh' in n for n in nodes),
                'positionAccessors': len(positions),
                'uniqueImagePayloads': len({i['sha256'] for i in images}),
                'uniqueImageRgba8MipBytes': sum({i['sha256']: i['rgba8MipBytes'] for i in images}.values()),
                'imagesWithoutTextureObject': sorted(set(range(len(images)))-{t['image'] for t in texture_rows}),
                'texturesWithoutMaterialReference': sorted(set(range(len(textures)))-material_textures),
                'dynamicConfiguration': {'embeddedVRM0': bool(secondary), 'embeddedVRM1': bool(springs),
                                         'vrm0RootEntries': len(legacy_bones), 'descriptorPhysics': 'not supplied'},
                'sha256': hashlib.sha256(self.raw).hexdigest()}


def budget_config(path, version):
    config = read_json(path)
    require(isinstance(config, dict), 'budget: expected object')
    require(config.get('schema') == 'zbgs-asset-budget-v1', 'budget.schema: unsupported')
    require(isinstance(version, str) and version and config.get('version') == version, 'budget.version: exact version required')
    require(set(config.get('classes', {})) == {'body', 'garment', 'hair', 'accessory'}, 'budget.classes: expected body/garment/hair/accessory')
    for name, limits in config['classes'].items():
        require(set(limits) == METRICS, 'budget.'+name+': missing/unknown metrics')
        for metric, value in limits.items():
            integer(value, 'budget.'+name+'.'+metric)
    return config


def check(path, asset_class, config, descriptor=None):
    require(asset_class in config['classes'], 'asset class: unsupported')
    result = AssetCost(path).measure()
    if descriptor:
        data = read_json(descriptor)
        require(isinstance(data, dict), 'descriptor: expected object')
        require(asset_class == 'hair', 'descriptor: only hair supported')
        require(data.get('schema') == 'character-hairstyle-v1', 'descriptor: only current hair schema supported')
        require(data.get('sha256') == result['sha256'], 'descriptor: asset SHA mismatch')
        require(data.get('physics') == 'rigid', 'descriptor.physics: unsupported dynamic config')
        require(result['metrics']['springJoints'] == 0, 'descriptor.physics: rigid conflicts with embedded springs')
        result['dynamicConfiguration']['descriptorPhysics'] = data['physics']
    failures = [{'metric': metric, 'actual': result['metrics'][metric], 'limit': limit}
                for metric, limit in config['classes'][asset_class].items() if result['metrics'][metric] > limit]
    result.update({'schema': 'zbgs-asset-budget-result-v1', 'readOnly': True, 'asset': str(path),
                   'assetClass': asset_class, 'budgetVersion': config['version'],
                   'budgetSha256': hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest(),
                   'status': 'rejected' if failures else 'admitted', 'violations': failures,
                   'ordinaryPCPerformance': 'unmeasured'})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['check'])
    parser.add_argument('asset')
    parser.add_argument('--class', dest='asset_class', required=True)
    parser.add_argument('--budget-version', required=True)
    parser.add_argument('--budget', default='scripts/production/asset-budgets-v1.json')
    parser.add_argument('--descriptor')
    args = parser.parse_args()
    try:
        config = budget_config(local(ROOT, args.budget), args.budget_version)
        result = check(local(ROOT, args.asset), args.asset_class, config,
                       local(ROOT, args.descriptor) if args.descriptor else None)
    except (ValueError, KeyError, IndexError, TypeError, AttributeError, OSError, struct.error, ImportError, RecursionError) as error:
        print(json.dumps({'schema': 'zbgs-asset-budget-result-v1', 'readOnly': True,
                          'asset': args.asset, 'assetClass': args.asset_class,
                          'budgetVersion': args.budget_version, 'status': 'invalid',
                          'error': str(error)}, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result['status'] == 'rejected' else 0


if __name__ == '__main__':
    sys.exit(main())
