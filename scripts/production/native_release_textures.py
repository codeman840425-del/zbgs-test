"""Derive and verify the two-image texture release candidate for the pinned 7586 mesh."""

import argparse
import base64
import copy
import io
import json
from pathlib import Path
import platform
import tempfile
import zlib

from PIL import Image, __version__ as pillow_version

from asset_budget import budget_config, check
from native_mesh_budget import BUDGET, SOURCE_SHA, encode, fixed_input
from native_uniform_normal import ROOT, digest, embedded_glb, entries, pins_for_body, usages


PREFIX_DIR = ROOT / 'evidence/m2-native-body-cost-v1/mesh'
PREFIX = PREFIX_DIR / 'prefix-body.vrm'
PREFIX_SHA = 'ca4ab17f4a8afebd5ac796387491cc4a23e966f12dc57916deb8ce97684f1756'
PREFIX_REPORT_SHA = '2e6f28fa5bdcfc0ee4dd04309544ef69f5bac6974d6cb5e90e3fca5a7c351af2'
THUMBNAIL_SHA = 'ef32d5955e4b24f9af73f1bf5f9769ae0b217b5f30364dfe0c4a6102061de953'
THUMBNAIL_SIZE = (512, 512)
OUTPUT = ROOT / 'evidence/m2-native-mesh-room-v1/texture-export'
ASSET = OUTPUT / 'release-body.vrm'
REPORT = OUTPUT / 'report.json'


def read_pinned(path, sha256):
    raw = path.read_bytes()
    if digest(raw) != sha256:
        raise ValueError(f'Pinned input SHA256 mismatch: {path}')
    return raw


def view_range(view):
    start = view.get('byteOffset', 0)
    return start, start + view['byteLength']


def view_payload(binary, view):
    start, end = view_range(view)
    return binary[start:end]


def derive_thumbnail(raw):
    if digest(raw) != THUMBNAIL_SHA:
        raise ValueError('The pinned thumbnail PNG identity changed')
    with Image.open(io.BytesIO(raw)) as image:
        if image.format != 'PNG' or image.mode != 'RGBA' or image.size != (2048, 2048) or image.is_animated or image.info:
            raise ValueError('Unexpected source thumbnail format, size or metadata')
        thumbnail = image.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
    output = io.BytesIO()
    thumbnail.save(output, format='PNG', compress_level=9)
    png = output.getvalue()
    with Image.open(io.BytesIO(png)) as decoded:
        if decoded.size != THUMBNAIL_SIZE or decoded.mode != thumbnail.mode or decoded.tobytes() != thumbnail.tobytes():
            raise ValueError('Reduced thumbnail PNG failed exact resized-pixel readback')
    return png, digest(thumbnail.tobytes())


def splice(doc, binary, replacements):
    """Keep all other BIN bytes, including gaps and existing alignment padding."""
    old_views = doc['bufferViews']
    new_doc = copy.deepcopy(doc)
    ranges = sorted((*view_range(old_views[index]), index, png) for index, png in replacements.items())
    new_binary = bytearray()
    cursor, shift = 0, 0
    for start, end, index, png in ranges:
        if not cursor <= start < end <= doc['buffers'][0]['byteLength'] or start % 4:
            raise ValueError(f'Invalid or overlapping replacement bufferView {index}')
        if any(other != index and max(start, a) < min(end, b)
               for other, (a, b) in enumerate(map(view_range, old_views))):
            raise ValueError(f'Replacement bufferView {index} overlaps another bufferView')
        new_binary.extend(binary[cursor:start])
        new_binary.extend(png)
        alignment = (end - start - len(png)) % 4
        new_binary.extend(b'\0' * alignment)
        new_doc['bufferViews'][index]['byteLength'] = len(png)
        shift += len(png) + alignment - (end - start)
        cursor = end
    new_binary.extend(binary[cursor:])
    for index, view in enumerate(old_views):
        start, _ = view_range(view)
        offset = start + sum(len(png) + (end - a - len(png)) % 4 - (end - a)
                             for a, end, _, png in ranges if end <= start)
        if offset != start:
            new_doc['bufferViews'][index]['byteOffset'] = offset
    new_doc['buffers'][0]['byteLength'] += shift
    return new_doc, bytes(new_binary)


def verify_unchanged(old_doc, old_bin, new_doc, new_bin, replacements):
    structural = {'bufferViews', 'buffers'}
    if ({k: v for k, v in old_doc.items() if k not in structural} !=
            {k: v for k, v in new_doc.items() if k not in structural}):
        raise ValueError('glTF or VRM semantics changed beyond image storage ranges')
    old_views, new_views = old_doc['bufferViews'], new_doc['bufferViews']
    if len(old_views) != len(new_views):
        raise ValueError('The number of glTF buffer views changed')
    old_buffers, new_buffers = old_doc['buffers'], new_doc['buffers']
    old_length, new_length = old_buffers[0]['byteLength'], new_buffers[0]['byteLength']
    if (len(old_buffers) != len(new_buffers) or len(new_bin) - len(old_bin) != new_length - old_length or
            [{k: v for k, v in b.items() if k != 'byteLength'} for b in old_buffers] !=
            [{k: v for k, v in b.items() if k != 'byteLength'} for b in new_buffers]):
        raise ValueError('Unexpected buffer declaration change')
    stable_views = 0
    for index, (old, new) in enumerate(zip(old_views, new_views)):
        allowed = {'byteOffset', 'byteLength'} if index in replacements else {'byteOffset'}
        if ({k: v for k, v in old.items() if k not in allowed} !=
                {k: v for k, v in new.items() if k not in allowed}):
            raise ValueError(f'Unrelated bufferView {index} declaration changed')
        if index in replacements:
            if view_payload(new_bin, new) != replacements[index]:
                raise ValueError(f'Unexpected replacement payload at bufferView {index}')
            continue
        if view_payload(old_bin, old) != view_payload(new_bin, new):
            raise ValueError(f'Unrelated bufferView {index} changed bytes')
        stable_views += 1
    old_cursor, new_cursor, compared_bytes = 0, 0, 0
    for index in sorted(replacements, key=lambda i: view_range(old_views[i])[0]):
        old_start, old_end = view_range(old_views[index])
        new_start, new_end = view_range(new_views[index])
        preserved = old_bin[old_cursor:old_start]
        if preserved != new_bin[new_cursor:new_start]:
            raise ValueError(f'Unrelated BIN bytes preceding bufferView {index} changed')
        compared_bytes += len(preserved)
        padding = (old_end - old_start - (new_end - new_start)) % 4
        if new_bin[new_end:new_end + padding] != b'\0' * padding:
            raise ValueError(f'Invalid replacement alignment after bufferView {index}')
        old_cursor, new_cursor = old_end, new_end + padding
    if old_bin[old_cursor:] != new_bin[new_cursor:]:
        raise ValueError('Unrelated BIN bytes after the final replacement changed')
    compared_bytes += len(old_bin) - old_cursor
    return {'unmodifiedBufferViews': stable_views, 'unalteredBinBytesChecked': compared_bytes,
            'untouchedGltfRootFields': sorted(old_doc.keys() - structural)}


def derive_texture_release(source_raw, prefix_raw):
    source_doc, source_bin = embedded_glb(source_raw)
    prefix_doc, prefix_bin = embedded_glb(prefix_raw)
    geometry_fields = {'accessors', 'meshes'}
    if (source_bin != prefix_bin or
            {k: v for k, v in source_doc.items() if k not in geometry_fields} !=
            {k: v for k, v in prefix_doc.items() if k not in geometry_fields}):
        raise ValueError('Mesh prefix changed native source image bytes or unrelated fields')
    [normal] = pins_for_body(prefix_raw, PREFIX_SHA)['avatars'][PREFIX_SHA]
    if normal['rgba'] != [128, 128, 255, 255]:
        raise ValueError('Pinned uniform normal pixels changed')
    normal_png = base64.b64decode(normal.pop('png1x1Base64'), validate=True)

    texture_uses, view_uses = usages(prefix_doc)
    meta = prefix_doc['extensions']['VRMC_vrm']['meta']
    thumb_index = meta['thumbnailImage']
    thumb_paths = [path for path, value in entries(prefix_doc) if path[-1] == 'thumbnailImage' and value == thumb_index]
    thumb_textures = [i for i, texture in enumerate(prefix_doc['textures']) if texture['source'] == thumb_index]
    if thumb_paths != [('extensions', 'VRMC_vrm', 'meta', 'thumbnailImage')] or any(texture_uses[i] for i in thumb_textures):
        raise ValueError('Thumbnail also has a non-metadata consumer')
    thumbnail = prefix_doc['images'][thumb_index]
    thumb_view = thumbnail['bufferView']
    if ('uri' in thumbnail or 'extensions' in thumbnail or thumbnail.get('mimeType') != 'image/png' or
            view_uses[thumb_view] != [('images', thumb_index, 'bufferView')]):
        raise ValueError('Expected an exclusive embedded PNG for the metadata thumbnail')
    if thumb_view == normal['bufferView']:
        raise ValueError('Normal and thumbnail image bufferViews are aliased')
    original = view_payload(prefix_bin, prefix_doc['bufferViews'][thumb_view])
    thumb_png, thumb_pixel_sha = derive_thumbnail(original)
    replacements = {normal['bufferView']: normal_png, thumb_view: thumb_png}
    new_doc, new_bin = splice(prefix_doc, prefix_bin, replacements)
    candidate = encode(new_doc, new_bin)
    candidate_doc, candidate_bin = embedded_glb(candidate)
    checks = verify_unchanged(prefix_doc, prefix_bin, candidate_doc, candidate_bin, replacements)
    return candidate, {
        'normal': {**normal, 'oldBytes': prefix_doc['bufferViews'][normal['bufferView']]['byteLength'],
                   'releasePngSha256': digest(normal_png), 'releaseBytes': len(normal_png), 'releaseDimensions': [1, 1]},
        'thumbnail': {'image': thumb_index, 'bufferView': thumb_view, 'unreferencedTextureIndices': thumb_textures,
                      'sourceDimensions': [2048, 2048], 'sourcePngSha256': THUMBNAIL_SHA, 'oldBytes': len(original),
                      'releaseDimensions': list(THUMBNAIL_SIZE), 'releasePngSha256': digest(thumb_png), 'releaseBytes': len(thumb_png),
                      'releaseRgba8Sha256': thumb_pixel_sha, 'method': 'Pillow LANCZOS resize from original thumbnail, PNG lossless at 512×512'},
        'vrmMetadata': meta,
        'verification': {**checks, 'prefixBinSha256': digest(prefix_bin), 'releaseBinSha256': digest(new_bin),
                         'sourceBinEqualsPrefixBin': True, 'vrmMetadataUnchanged': True},
    }


def body_cost(path, config):
    result = check(path, 'body', config)
    return {key: result[key] for key in ('sha256', 'metrics', 'violations', 'status')}


def make_report(candidate, source_path, prefix_path, details, selected, prefix_record):
    budget = budget_config(BUDGET, selected['budgetVersion'])
    with tempfile.NamedTemporaryFile(dir=OUTPUT, suffix='.vrm', delete=False) as scratch:
        pending = Path(scratch.name)
        scratch.write(candidate)
    try:
        costs = {key: body_cost(path, budget) for key, path in (
            ('source', source_path), ('meshPrefix', prefix_path), ('textureRelease', pending))}
    finally:
        pending.unlink()

    old, prefix, release = (costs[key]['metrics'] for key in ('source', 'meshPrefix', 'textureRelease'))
    if (old != prefix_record['assetBudgetChecks']['source']['metrics'] or
            prefix != prefix_record['assetBudgetChecks']['derived']['metrics']):
        raise ValueError('Recalculated source/mesh metrics differ from the fixed earlier audit')
    if any(prefix[k] != release[k] for k in prefix.keys() - {'fileBytes', 'rgba8MipBytes'}):
        raise ValueError('Texture release changed other body asset metrics')
    source_delta = old['fileBytes'] - release['fileBytes']
    byte_delta = old['rgba8MipBytes'] - release['rgba8MipBytes']
    return {
        'schema': 'native-7586-texture-release-derivation-v1', 'sourceGameCommit': selected['sourceCommit'],
        'inputs': {'sourcePath': source_path.relative_to(ROOT).as_posix(), 'sourceSha256': SOURCE_SHA,
                   'meshPrefixPath': prefix_path.relative_to(ROOT).as_posix(), 'meshPrefixSha256': PREFIX_SHA,
                   'meshPrefixReportSha256': PREFIX_REPORT_SHA},
        'toolVersions': {'python': platform.python_version(), 'Pillow': pillow_version, 'zlib': zlib.ZLIB_RUNTIME_VERSION},
        'budgetVersion': budget['version'], 'budgetFileSha256': digest(BUDGET.read_bytes()), 'bodyBudgetChecks': costs,
        'releaseFile': ASSET.name, 'releaseSha256': digest(candidate), 'releaseFileBytes': len(candidate),
        'downloadIdentityPayloadOnly': {'oldBodyBytes': old['fileBytes'], 'prefixBodyBytes': prefix['fileBytes'],
                                        'derivedBodyBytes': release['fileBytes'], 'savedFromOldBodyBytes': source_delta,
                                        'savedFromPrefixBodyBytes': prefix['fileBytes'] - release['fileBytes']},
        'unchangedPackageWhatIf': {
            'scope': 'Exact old fixed closure with only the body file arithmetically substituted once. No signed record, dependency, transfer or runtime admission asserted.',
            'closureUnionSourceBytesBefore': selected['closureUnionSourceBytes'],
            'closureUnionSourceBytesAfter': selected['closureUnionSourceBytes'] - source_delta,
            'selectedStaticTextureBytesEachBefore': {r['id']: r['selectedCost']['totals']['rgba8MipBytes'] for r in selected['records']},
            'selectedStaticTextureBytesEachAfter': {r['id']: r['selectedCost']['totals']['rgba8MipBytes'] - byte_delta for r in selected['records']},
            'temporaryAggregateStaticTextureLimitBytes': selected['temporaryAggregateLimits']['rgba8MipBytes'],
            'temporaryAggregateStaticTextureBytesAfter': selected['sumAcrossSelectedActors']['rgba8MipBytes'] - len(selected['records']) * byte_delta,
        },
        **details,
        'scope': ['Local technical asset. VRM author, permissions and all extension values are preserved.',
                  'The original and derived identities cannot be substituted for signed character records, appearance pins or fit admissions.',
                  'No HTTP transfer, WebGL memory, rendering, ordinary-PC, license change or external release measured or performed.'],
    }


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--prefix', type=Path, default=PREFIX)
    mode = cli.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write-new', action='store_true', help='write missing outputs after verifying any existing ones')
    mode.add_argument('--check', action='store_true', help='rebuild and check the fixed asset and report byte for byte')
    args = cli.parse_args()
    prefix_path = args.prefix.resolve()
    if not prefix_path.is_relative_to(ROOT):
        cli.error('Expected an in-project prefix asset')
    if not all(path.resolve().is_relative_to(ROOT) for path in (OUTPUT, ASSET, REPORT)):
        cli.error('Texture release outputs must stay inside the project')
    selection, _, source_path, source_raw = fixed_input()
    prefix_record = json.loads(read_pinned(PREFIX_DIR / 'prefix-analysis.json', PREFIX_REPORT_SHA))
    prefix_raw = read_pinned(prefix_path, PREFIX_SHA)
    candidate, details = derive_texture_release(source_raw, prefix_raw)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = make_report(candidate, source_path, prefix_path, details, selection, prefix_record)
    raw_report = (json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True) + '\n').encode('utf-8')
    outputs = [(ASSET, candidate), (REPORT, raw_report)]
    for path, expected in outputs:
        if (args.check or path.exists()) and path.read_bytes() != expected:
            raise SystemExit(f'Fixed output did not rebuild byte for byte: {path}')
    if args.write_new:
        for path, expected in outputs:
            if not path.exists():
                with path.open('xb') as output:
                    output.write(expected)
    print(f'{ASSET.relative_to(ROOT)} {digest(candidate)} {len(candidate)} bytes')


if __name__ == '__main__':
    main()
