"""Reproduce locomotion calibration from a pinned official ZIP or RM GLB, offline."""
import argparse
import hashlib
import io
import json
import math
import pathlib
import struct
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
ZIP_SHA = 'cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724'
RM_SHA = 'be684571ed655a1b892c2c07e6e2aeca053b606c442d34004adaf1d944090d01'
MEMBER = 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard_RM.glb'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', default='analysis/assets/UAL-Standard.zip')
parser.add_argument('--output', default='output/playwright/ual-root-motion-calibration.json')
parser.add_argument('--ratio', type=float, default=1.0, help='Actual target/source rest hip ratio; default reports native size')
args = parser.parse_args()
if not math.isfinite(args.ratio) or args.ratio <= 0:
    parser.error('--ratio must be finite and positive')
source = (ROOT / args.source).read_bytes()
source_sha = hashlib.sha256(source).hexdigest()
if source[:4] == b'glTF':
    data = source
else:
    assert source_sha == ZIP_SHA, 'Official ZIP hash mismatch: do not recalibrate a different release silently'
    data = zipfile.ZipFile(io.BytesIO(source)).read(MEMBER)
assert hashlib.sha256(data).hexdigest() == RM_SHA, 'Root-motion GLB hash mismatch'
magic, version, total = struct.unpack_from('<4sII', data)
assert magic == b'glTF' and version == 2 and total == len(data)
json_length, json_type = struct.unpack_from('<I4s', data, 12)
assert json_type == b'JSON'
gltf = json.loads(data[20:20 + json_length])
binary_length, binary_type = struct.unpack_from('<I4s', data, 20 + json_length)
assert binary_type == b'BIN\0'
binary = data[28 + json_length:28 + json_length + binary_length]

def accessor(index):
    a = gltf['accessors'][index]
    assert a['componentType'] == 5126 and 'sparse' not in a
    view = gltf['bufferViews'][a['bufferView']]
    width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
    fmt = '<' + 'f' * width
    stride = view.get('byteStride', width * 4)
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from(fmt, binary, start + i * stride) for i in range(a['count'])]

parents = {child: i for i, node in enumerate(gltf['nodes']) for child in node.get('children', [])}
root_node = next(i for i, node in enumerate(gltf['nodes']) if node.get('name') == 'root')
ancestors = []
node = root_node
while node in parents:
    node = parents[node]
    ancestors.append(node)
    assert not any(key in gltf['nodes'][node] for key in ['translation', 'rotation', 'scale', 'matrix']), 'Non-identity ancestor: general world transform evaluation required'

report = {'source': args.source, 'sourceSha256': source_sha, 'officialZipSha256': ZIP_SHA, 'member': MEMBER, 'rootMotionGlbSha256': RM_SHA, 'rootNode': root_node, 'ancestors': [gltf['nodes'][i] for i in ancestors], 'method': 'Pinned file; all root ancestors verified identity and unanimated. Root local translation therefore equals world translation. Its own rotation does not rotate its origin position.', 'targetToSourceHipRatio': args.ratio, 'clips': []}
for name in ['Walk_Loop', 'Walk_Formal_Loop']:
    animation = next(a for a in gltf['animations'] if a['name'] == name)
    assert not any(c['target']['node'] in ancestors for c in animation['channels']), 'Animated ancestor: evaluate its world transform first'
    channels = [c for c in animation['channels'] if c['target'] == {'node': root_node, 'path': 'translation'}]
    assert len(channels) == 1
    sampler = animation['samplers'][channels[0]['sampler']]
    assert sampler.get('interpolation', 'LINEAR') == 'LINEAR'
    times = accessor(sampler['input'])
    positions = accessor(sampler['output'])
    assert len(times) == len(positions)
    duration = max(accessor(s['input'])[-1][0] for s in animation['samplers'])
    delta = [b - a for a, b in zip(positions[0], positions[-1])]
    cycle = math.sqrt(sum(v*v for v in delta))
    path_length = sum(math.dist(a, b) for a, b in zip(positions, positions[1:]))
    assert abs(cycle - 1.3) < 1e-6 and abs(duration - 4/3) < 1e-6
    report['clips'].append({'name': name, 'duration': duration, 'sampleCount': len(times), 'sampler': sampler, 'start': positions[0], 'end': positions[-1], 'worldDelta': delta, 'nativeCycleDistance': cycle, 'nativePathLength': path_length, 'nativeSpeed': cycle / duration, 'targetCycleDistance': cycle * args.ratio, 'targetNativeSpeed': cycle * args.ratio / duration})
output = ROOT / args.output
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report['clips'], indent=2))
print('Evidence:', output)
