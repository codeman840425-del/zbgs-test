"""Compare a signed record's static palette estimate with its fixed-game Chrome trace."""
import argparse
import hashlib
import json
from pathlib import Path
import sys


PARTS = {'hair': 'hair', 'brow': 'eyebrow', 'iris': 'iris', 'lips': 'lips'}


def require(ok, message):
    if not ok:
        raise ValueError(message)


def slot_ids(snapshot, part):
    return {texture for m in snapshot['materials'] if m['part'] == part
            for texture in m['slots'].values() if texture}


def compare(cpu, chrome, records, input_digest):
    require(chrome['status'] == 'measured' and not chrome['errors'], 'Incomplete browser capture')
    check = chrome['readback']
    obs = chrome['observed']
    require(check['status'] == 'verified' and check['runtime']['sourceCommit'] == cpu['sourceCommit'] and
            check['runtime']['buildId'] == obs['build'], 'Different runtime identities')
    require(cpu['inputSha256'] == input_digest, 'Different signed input bytes')
    ids = [(r['identity']['id'], r['integrity']['recordSha256']) for r in records]
    for rows in [cpu['records'], check['records'], [obs['first'], obs['maleControl']]]:
        require([(r['id'], r['recordSha256']) for r in rows] == ids, 'Different signed actors')
    cache = cpu['records'][0]['reviewedLegacyAppearanceCache']
    first, control = obs['first'], obs['maleControl']
    require(cache['recordSha256'] == first['recordSha256'] and set(cache['groups']) == set(PARTS),
            'Incomplete per-record palette estimate')
    require(control['cacheEntries'] == control['facialCacheEntries'] == 0 and
            'reviewedLegacyAppearanceCache' not in cpu['records'][1], 'Original-color control mismatch')
    observed_ids = set()
    parts = {}
    for name, part in PARTS.items():
        estimate = cache['groups'][name]
        require(estimate['selection'] == records[0]['appearanceRecipe']['appearance'][estimate['field']] ==
                first[estimate['field']], f'{name}: different look')
        textures = slot_ids(first, part)
        require(textures and textures == slot_ids(obs['again'], part) == slot_ids(obs['skinControl'], part) and
                not textures.intersection(slot_ids(obs['restored'], part)), f'{name}: switch or reuse differs')
        require(textures.isdisjoint(observed_ids), f'{name}: cross-part duplicate')
        observed_ids.update(textures)
        rows = [first['textures'][uid] for uid in textures]
        for row in rows:
            require(row['imageKind'] == 'HTMLCanvasElement' and row['live'] and row['format'] == 1023 and
                    row['type'] == 1009 and row['minFilter'] == 1006 and not row['generateMipmaps'] and
                    row['explicitMipLevels'] == 0, f'{name}: different format, upload or mip policy')
            require((row['width'], row['height']) == (estimate['width'], estimate['height']),
                    f'{name}: different dimensions')
        size = sum(r['width'] * r['height'] * 4 for r in rows)
        require(len(textures) == estimate['distinctDerivedTextures'] and
                size == estimate['logicalTextureRgba8Bytes'] == estimate['derivedCanvasRgba8Bytes'] and
                estimate['generateMipmaps'] is False, f'{name}: estimated cost differs')
        parts[name] = {'textureObjects': len(rows), 'rgba8PixelBytes': size}
    total = sum(v['rgba8PixelBytes'] for v in parts.values())
    require(total == cache['totals']['derivedCanvasRgba8Bytes'] and
            len(observed_ids) == cache['totals']['distinctDerivedTextures'], 'Different estimate totals')
    for key in ['source', 'image', 'webglTexture']:
        require(len({first['textures'][uid][key] for uid in observed_ids}) == len(observed_ids),
                f'Derived views alias the same {key}')
    twin_sets = []
    for actor in [obs['twins']['primary'], obs['twins']['peer']]:
        part_sets = [slot_ids(actor, part) for part in PARTS.values()]
        require([len(s) for s in part_sets] == [row['textureObjects'] for row in parts.values()],
                'Different per-instance cost')
        twin_sets.append(set.union(*part_sets))
    require(twin_sets[0].isdisjoint(twin_sets[1]), 'Cached texture reused across actors')
    require(obs['disposePeer']['memory'] == obs['baseline'] and obs['disposePeer']['handles'] and
            not any(row['live'] for row in obs['disposePeer']['handles']), 'Disposal differs')
    return {'schema':'signed-record-palette-cost-check-v1', 'status':'matched',
            'buildId':obs['build'], 'inventorySha256':check['inventorySha256'], 'recordsSha256':input_digest,
            'recordIds':[r[0] for r in ids], 'groups':parts, 'derivedTextureObjects':len(observed_ids),
            'derivedCanvasRgba8Bytes':total, 'staticBudget':cpu['status'], 'runtimeAdmission':False,
            'ordinaryPCPerformance':'unmeasured', 'gpuAllocationBytes':None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['records', 'cpu', 'chrome']:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    inputs = {name:path.read_bytes() for name, path in vars(args).items()}
    pins = {name:hashlib.sha256(data).hexdigest() for name, data in inputs.items()}
    report = compare(*(json.loads(inputs[name]) for name in ['cpu','chrome','records']), pins['records'])
    print(json.dumps({**report, 'inputDigests':pins}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (KeyError, ValueError, TypeError, IndexError, OSError) as error:
        print(json.dumps({'status':'mismatch', 'error':str(error)}))
        sys.exit(2)
