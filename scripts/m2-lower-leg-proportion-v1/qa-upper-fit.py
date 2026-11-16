"""Exact upper-body reuse and refusal fixtures. No original/public file writes."""
import copy
import json
from pathlib import Path
import struct
import sys
import tempfile

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build
import upper_fit
from flow import require

spec = json.loads((build.BASE/'spec.json').read_text(encoding='utf-8'))
out = build.BASE/'generated'
source = build.load(build.checked(spec['sourceBody'])); candidate = build.load(out/'avatar.vrm')
profile = json.loads(build.checked(spec['forearmProfile']).read_text(encoding='utf-8'))
entries = json.loads((out/'equipment.json').read_text(encoding='utf-8'))['items']
entry = next(e for e in entries if e['slot'] == 'top'); top = build.load(out/entry['url'])
original_top = next(ref for ref in spec['equipment'] if ref['id'] == 'm1b-uniform-top')
require(build.sha(top.path.read_bytes()) == original_top['sha256'], 'Top should retain exact source bytes')
evidence = upper_fit.prove(source, candidate, profile, top)
derived = json.loads((out/'forearm-profile.json').read_text(encoding='utf-8'))
require(derived['profiles'] == profile['profiles'] and derived['primitive'] == profile['primitive'], 'Measured forearm profile data changed')
require(derived['bodySHA256'] == entry['compatibleAvatarSha256'] == build.sha(candidate.path.read_bytes()), 'Derived exact body identity mismatch')
require(derived['adaptationEvidence']['evidenceSha256'] == build.sha((out/'upper-body-fit.json').read_bytes()), 'Derived evidence SHA mismatch')
rejected = []


def rejects(label, operation, expected):
    try: operation()
    except ValueError as error:
        require(expected in str(error), 'Unexpected failure: '+str(error)); rejected.append(label)
    else: raise AssertionError('Accepted '+label)


bad = copy.deepcopy(profile); bad['bodySHA256'] = '0'*64
rejects('wrong source body identity', lambda: upper_fit.prove(source, candidate, bad, top), 'Forearm source body identity')
bad = copy.deepcopy(profile); bad['profiles'][0]['sourceFaceIndices'].pop()
rejects('incomplete measured source selection', lambda: upper_fit.prove(source, candidate, bad, top), 'Forearm measured selection')
bad = build.load(candidate.path)
node = next(n for n in bad.doc['nodes'] if n['name'] == 'J_Bip_C_Head'); node['translation'][0] += .001
rejects('changed head rest', lambda: upper_fit.prove(source, bad, profile, top), 'Upper-body raw rest/bind differs')
raw = bytearray(candidate.path.read_bytes())
position = candidate.doc['meshes'][0]['primitives'][0]['attributes']['POSITION']
accessor = candidate.doc['accessors'][position]; view = candidate.doc['bufferViews'][accessor['bufferView']]
vertex = profile['profiles'][0]['sourceVertexIndices'][0]
offset = 28+struct.unpack_from('<I', raw, 12)[0]+view.get('byteOffset', 0)+accessor.get('byteOffset', 0)+vertex*12
struct.pack_into('<f', raw, offset, struct.unpack_from('<f', raw, offset)[0]+.001)
with tempfile.TemporaryDirectory(prefix='upper-body-fit-') as folder:
    path = Path(folder)/'altered-forearm.vrm'; path.write_bytes(raw)
    altered = build.load(path)
    rejects('changed selected forearm coordinate', lambda: upper_fit.prove(source, altered, profile, top), 'Forearm source measurement inputs differ')
build.write(out/'upper-body-qa.json', {'passed': True, 'sourceAndTopByteIdentity': True, 'measuredProfilesExactlyPreserved': True,
    'avatarSha256': build.sha(candidate.path.read_bytes()), 'topSha256': entry['sha256'],
    'forearmProfileSha256': build.sha((out/'forearm-profile.json').read_bytes()),
    'selectedArmCounts': [{'side': p['side'], 'faces': p['selectedFaces'], 'vertices': p['selectedVertices']} for p in evidence['forearms']],
    'negativeChecks': rejected, 'temporaryCorruptFixtureRemoved': True, 'runtimeAccepted': False})
print(json.dumps({'passed': True, 'negativeChecks': rejected, 'runtimeAccepted': False}))
