"""Compare the two fixed WebGL release-order cases and their captured PNGs."""

import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageChops


EVIDENCE = Path(__file__).resolve().parent
OLD_BUILD = 'fe2e58489bbb'
OLD_HANDLE_TRACE = EVIDENCE.parent / 'm2-native-short-socks-room-v1/browser-budget/report.json'
ACTORS = ('native-male-7586-v1-record-a', 'native-crew-7586')
SCENES = ('pair', 'before', 'after', 'face-0', 'face-1')
RGBA8 = 0x8058


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path):
    try:
        return path.read_bytes()
    except FileNotFoundError as error:
        raise ValueError(f'Missing comparison input: {path}') from error


def read_document(path):
    raw = read(path)
    return json.loads(raw), digest(raw)


def old_face_handle_check():
    """Confirm both old-build face uploads in its existing fixed record probe."""
    trace, sha256 = read_document(OLD_HANDLE_TRACE)
    matches = [c for c in trace['cases'] if c['build'] == OLD_BUILD and tuple(c['ids']) == ACTORS]
    if len(matches) != 1:
        raise ValueError('Expected the exact dual 7586 build in the old face-handle probe')
    bindings = matches[0]['handleProbe']['bindings']
    handles = []
    for actor in ACTORS:
        found = [b for b in bindings if b['actor'] == actor and b['slot'] == 'normalMap' and '_Face_00_SKIN' in b['material']]
        if not found or any(not b['live'] or (b['width'], b['height']) != (1024, 1024) for b in found):
            raise ValueError(f'Old face normal upload was not verified for {actor}')
        distinct = {b['handle'] for b in found}
        if len(distinct) != 1 or None in distinct:
            raise ValueError(f'Old face normal has ambiguous WebGL handle for {actor}')
        handles.append(distinct.pop())
    if handles[0] == handles[1]:
        raise ValueError('Expected independently uploaded old-build face normals')
    return {'path': str(OLD_HANDLE_TRACE.relative_to(EVIDENCE.parent).as_posix()), 'reportSha256': sha256, 'handles': handles}


def rgba8_storage_size(allocation, dimension):
    if (allocation.get('format'), allocation.get('levels'), allocation.get('width'), allocation.get('height')) != (RGBA8, 1, dimension, dimension):
        raise ValueError(f'Expected measured RGBA8 texStorage2D {dimension}×{dimension}, 1 level, got {allocation}')
    return allocation['width'] * allocation['height'] * 4


def summarize_storage(case, face_dimension, same_face_handle):
    rows = case.get('storage', [])
    if len(rows) != len(ACTORS) or any(set(row) != {'face', 'body'} for row in rows):
        raise ValueError(f'Missing face/body texStorage2D observations for {case.get("removed")}')
    face_bytes = [rgba8_storage_size(row['face'], face_dimension) for row in rows]
    body_bytes = [rgba8_storage_size(row['body'], 2048) for row in rows]
    face = face_bytes[0] if same_face_handle else sum(face_bytes)
    body = body_bytes[0] if case['sameHandle'] else sum(body_bytes)
    return {'faceHandles': 1 if same_face_handle else 2, 'faceRgba8Bytes': face,
            'bodyHandles': 1 if case['sameHandle'] else 2, 'bodyRgba8Bytes': body,
            'observedNormalRgba8Bytes': face + body, 'texStorage2D': rows}


def read_capture(folder, build, mode):
    report, sha256 = read_document(folder / 'report.json')
    if report.get('build') != build or report.get('mode') != mode:
        raise ValueError(f'Unexpected build or mode in {folder / "report.json"}')
    cases = report.get('cases', [])
    if report.get('errors') != [] or tuple(case.get('removed') for case in cases) != ACTORS:
        raise ValueError(f'Missing or failed fixed release-order cases in {folder / "report.json"}')
    shared = mode == 'shared'
    for case in cases:
        if (case.get('sameHandle') is not shared or case.get('sameTexture') is not False or
                case.get('removedStillLive') is not shared or case.get('survived') is not True or
                case.get('finalReleased') is not True or case.get('restored') is not True or
                case.get('released') != case.get('baseline') or case.get('changedPixels') != 0):
            raise ValueError(f'Failed texture lifetime or record restoration in {folder}: {case.get("removed")}')
    return cases, sha256


def compare_png(old_path, new_path):
    old_raw, new_raw = read(old_path), read(new_path)
    with Image.open(io.BytesIO(old_raw)) as old_source, Image.open(io.BytesIO(new_raw)) as new_source:
        if old_source.format != 'PNG' or new_source.format != 'PNG' or old_source.size != new_source.size:
            raise ValueError(f'PNG content or dimensions differ for {old_path.name}')
        if old_source.is_animated or new_source.is_animated:
            raise ValueError(f'Expected a single frame for {old_path.name}')
        delta = ImageChops.difference(old_source.convert('RGBA'), new_source.convert('RGBA'))
        red, green, blue, alpha = delta.split()
        max_delta = ImageChops.lighter(ImageChops.lighter(red, green), ImageChops.lighter(blue, alpha))
        histogram = max_delta.histogram()
        return {'filename': old_path.name, 'width': delta.width, 'height': delta.height,
                'oldPngSha256': digest(old_raw), 'newPngSha256': digest(new_raw),
                'changedPixels': delta.width * delta.height - histogram[0],
                'maxChannelDelta': max_delta.getextrema()[1]}


def compare(old_folder, new_folder, new_build):
    if new_build == OLD_BUILD:
        raise ValueError('Expected a distinct candidate build')
    old_cases, old_sha = read_capture(old_folder, OLD_BUILD, 'separate')
    new_cases, new_sha = read_capture(new_folder, new_build, 'shared')
    trace = old_face_handle_check()
    cases = []
    for order, (old, new) in enumerate(zip(old_cases, new_cases)):
        if type(new.get('sameFaceHandle')) is not bool:
            raise ValueError(f'Missing actual WebGL face handle identity for release order {order}')
        if old.get('sameFaceHandle', False) is not False:
            raise ValueError(f'Old face handles conflict with the fixed independent trace for release order {order}')
        images = [compare_png(old_folder / f'{order}-{scene}.png', new_folder / f'{order}-{scene}.png') for scene in SCENES]
        old_storage = summarize_storage(old, 1024, False)
        new_storage = summarize_storage(new, 1, new['sameFaceHandle'])
        cases.append({'order': order, 'actorRemovedFirst': old['removed'], 'frames': images,
                      'oldNormalStorage': old_storage, 'newNormalStorage': new_storage,
                      'normalRgba8BytesSaved': old_storage['observedNormalRgba8Bytes'] - new_storage['observedNormalRgba8Bytes']})
    return {'schema': 'native-7586-fixed-normal-comparison-v1',
            'status': 'pixel-identical' if all(frame['changedPixels'] == 0 for case in cases for frame in case['frames']) else 'pixels-differ',
            'old': {'build': OLD_BUILD, 'reportSha256': old_sha, 'faceHandleEvidence': trace},
            'new': {'build': new_build, 'reportSha256': new_sha}, 'cases': cases,
            'storageScope': 'Logical texel bytes for observed live face and body normal WebGL texture handles only, based on RGBA8 texStorage2D allocations. Driver overhead, padding, other textures and total VRAM are excluded.',
            'caseScope': 'The two removal orders use independent scenes with the same pair. Compare each order individually without summing its storage savings.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--old', type=Path, default=EVIDENCE / 'old')
    parser.add_argument('--new', type=Path, default=EVIDENCE / 'new')
    parser.add_argument('--new-build', required=True, help='fixed short build ID of the candidate')
    parser.add_argument('--write-new', type=Path, help='write new JSON evidence at this path')
    args = parser.parse_args()
    if args.write_new and not args.write_new.resolve().is_relative_to(EVIDENCE.parents[1]):
        parser.error('Comparison output must stay within the project')
    try:
        report = compare(args.old, args.new, args.new_build)
    except (ValueError, OSError, KeyError) as error:
        raise SystemExit(str(error)) from error
    raw = (json.dumps(report, indent=2, ensure_ascii=False) + '\n').encode('utf-8')
    if args.write_new:
        with args.write_new.open('xb') as output:
            output.write(raw)
    else:
        print(raw.decode('utf-8'), end='')
    if report['status'] != 'pixel-identical':
        raise SystemExit('Fixed candidate contains changed pixels')


if __name__ == '__main__':
    main()
