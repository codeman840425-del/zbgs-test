"""Recheck the three fixed-build films for human review, without an approval."""

import argparse
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import sys

import av

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'scripts/production'))
from outfit_admission import require, runtime_pin, verify_room_report
from production_paths import project_output

GAME = ROOT / 'output/m2-rule-image-release-build-v1/game'
BATCH = HERE.parent / 'm2-rule-batch-delivery-v1'
PLAYLIST = HERE / 'visual-review-playlist.json'
SIGNED_IDS = ('public-batch-a', 'public-batch-b')


def read(path):
    real = path.resolve(strict=True)
    require(real == path and real.is_relative_to(ROOT) and real.is_file(), 'Unexpected evidence path: ' + str(path))
    data = real.read_bytes()
    return data, {'path': path.relative_to(ROOT).as_posix(), 'realPath': real.as_posix(),
                  'bytes': len(data), 'sha256': sha256(data).hexdigest()}


def match_pin(actual, expected, label):
    require(actual['sha256'] == expected['sha256'], label + ' SHA-256 differs')
    require(actual['bytes'] == expected['bytes'], label + ' byte length differs')


def original_pin(record):
    base = record['appearanceRecipe']['base']
    return {'id': record['identity']['id'], 'recordSha256': record['integrity']['recordSha256'],
            'bodyType': base['bodyType'], 'bodySha256': base['sha256']}


def check_cold(report, runtime, signatures):
    require(report['status'] == 'functional-pass' and report['mode'] == 'dual-external', 'Missing dual cold game evidence')
    sessions = report['sessions']
    require([row['phase'] for row in sessions] == ['first', 'cold'], 'Unexpected cold session order')
    require(all(row['build'] == runtime['sourceDigest'] for row in sessions), 'Cold session runtime digest differs')
    require(report['selection']['records'] == signatures, 'Cold game original record signature differs')
    for session in sessions:
        drawn = [{key: actor[field] for key, field in (('id','id'), ('recordSha256','sha'),
                  ('bodyType','bodyType'), ('bodySha256','body'))} for actor in session['first']]
        require(drawn == signatures and all(actor['attached'] for actor in session['first']), 'Cold game did not draw the exact signed pair')
        require([motion['id'] for motion in session['motions'] if motion['after']['status'] == 'completed'] == list(SIGNED_IDS),
                'Both signed actors did not finish their recorded gestures')
    video = sessions[-1]['video']
    require(video['file'] == 'dual-external-cold-1x.webm' and video['normalSpeed'] is True, 'Wrong cold recording')
    return video


def media(path, actual, expected):
    match_pin(actual, expected, 'Video')
    with av.open(str(path), mode='r') as container:
        require('webm' in container.format.name.split(',') and len(container.streams.video) == 1 and
                container.duration and container.duration > 0, 'Expected one timed WebM video stream')
        stream = container.streams.video[0]
        frame = next(container.decode(stream), None)
        require(frame is not None and frame.width == stream.width and frame.height == stream.height,
                'The first video frame could not be decoded')
        return {**actual, 'container': 'webm', 'codec': stream.codec_context.name,
                'durationSeconds': container.duration / av.time_base, 'width': frame.width, 'height': frame.height,
                'playbackRate': 1, 'firstFrameDecoded': True}


def denied(name, reason, check, *args):
    try:
        check(*args)
    except ValueError as error:
        require(str(error) == reason, 'Unexpected rejection for ' + name + ': ' + str(error))
        return {'case': name, 'result': 'rejected', 'reason': str(error)}
    raise ValueError('Mismatched input was accepted: ' + name)


def collect():
    release_bytes, release_pin = read(HERE / 'build-and-package.json')
    release = json.loads(release_bytes)
    runtime = runtime_pin({key: release['runtime'][key] for key in ('sourceCommit', 'sourceDigest', 'buildId')})
    indexed_bytes, index = read(HERE / 'inventory.json')
    package_bytes, package_pin = read(GAME / 'runtime-package.json')
    expected_package = release['ordinaryPackage']['manifestSha256']
    require(package_pin['sha256'] == expected_package and package_bytes == indexed_bytes, 'Ordinary package manifest differs')
    package = json.loads(package_bytes)
    require(package['runtime'] == release['runtime'], 'Ordinary package runtime differs')
    files = {row['path']: row for row in package['files']}
    build_bytes, build_pin = read(GAME / 'build-info.json')
    match_pin(build_pin, files['build-info.json'], 'Ordinary package build-info')
    build = json.loads(build_bytes)
    require(build['sourceDigest'] == runtime['sourceDigest'] and build['shortId'] == runtime['buildId'], 'Build metadata differs')

    records_bytes, records_pin = read(BATCH / 'records.json')
    issuance = json.loads(read(BATCH / 'receipt.json')[0])['issuance']
    require(records_pin['sha256'] == issuance['recordsFileSha256'], 'D02 original records SHA-256 differs')
    records = json.loads(records_bytes)
    signatures = [original_pin(record) for record in records]
    require(tuple(row['id'] for row in signatures) == SIGNED_IDS, 'Unexpected signed pair')
    require([(row['id'], row['recordSha256']) for row in signatures] ==
            [(row['id'], row['hash']) for row in issuance['items']] ==
            [(row['id'], row['recordSha256']) for row in package['records']], 'D02 and package signatures differ')

    rooms_bytes, rooms_pin = read(HERE / 'two-rooms.json')
    rooms = json.loads(rooms_bytes)
    require(rooms['runtime'] == runtime and rooms['status'] == 'passed', 'Single-room verification runtime differs')
    match_pin(build_pin, rooms['buildInfo'], 'Single-room build-info')
    clips, room_reports = [], []
    for record, signature, room in zip(records, signatures, rooms['records'], strict=True):
        ident = signature['id']
        require(room['id'] == ident and room['recordSha256'] == signature['recordSha256'], 'Wrong single-room original signature')
        record_relative = f'records/{ident}.json'
        packed_record, packed_pin = read(GAME / record_relative)
        match_pin(packed_pin, files[record_relative], 'Ordinary package record')
        room_input, input_pin = read(HERE / ident / 'input-record.json')
        match_pin(input_pin, room['capturedInput'], 'Single-room input')
        require(packed_record == room_input and json.loads(packed_record) == record, 'Record differs across D02, room and ordinary package')
        raw, room_report_pin = read(HERE / ident / 'report.json')
        match_pin(room_report_pin, room['report'], 'Single-room report')
        room_report = json.loads(raw)
        verify_room_report(room_report, record, runtime)
        room_reports.append(room_report)
        video_path = HERE / ident / 'room-produced-1x.webm'
        clips.append({'id': ident + '-room', 'entry': 'workbench-room', 'records': [signature],
                      'scope': '该原签穿着三件制服走近、坐稳、起身并走离。检查动作连贯、座位接触和衣物遮挡。',
                      'evidence': room_report_pin, 'video': media(video_path, read(video_path)[1], room['video'])})

    raw, cold_pin = read(HERE / 'game-cold/report.json')
    require(cold_pin['sha256'] == release['ordinaryPackage']['coldReportSha256'], 'Ordinary cold report SHA-256 differs')
    cold = json.loads(raw)
    video_pin = check_cold(cold, runtime, signatures)
    video_path = HERE / 'game-cold' / video_pin['file']
    clips.append({'id': 'signed-pair-game', 'entry': 'ordinary-game', 'records': signatures,
                  'scope': '同一普通包内两名原签同时出场并逐人招手。检查同屏呈现以及招手和回落。',
                  'evidence': cold_pin, 'video': media(video_path, read(video_path)[1], video_pin)})

    previous = deepcopy(cold)
    previous['sessions'][1]['build'] = release['beforeBuild']['sourceDigest']
    old_package = read(ROOT / 'output/m2-rule-batch-delivery-v1/pair/game/runtime-package.json')[1]
    negatives = [
        denied('other-original-room-report', 'Room used a different record or an incomplete action chain',
               verify_room_report, room_reports[1], records[0], runtime),
        denied('previous-runtime-digest', 'Cold session runtime digest differs', check_cold, previous, runtime, signatures),
        denied('previous-ordinary-package', 'Package SHA-256 differs', match_pin, old_package, package_pin, 'Package'),
        denied('other-valid-room-video', 'Video SHA-256 differs', match_pin, clips[1]['video'], clips[0]['video'], 'Video'),
    ]
    return {'schema': 'pending-visual-playlist-v1', 'status': 'pending-user-review', 'runtime': runtime,
            'buildEvidence': release_pin, 'workbenchVerification': rooms_pin,
            'ordinaryPackage': {'manifestSha256': expected_package, 'manifest': package_pin, 'archivedManifest': index},
            'signedOriginals': {'file': records_pin, 'records': signatures}, 'clips': clips, 'negativeControls': negatives,
            'mediaInspector': {'method': 'PyAV container metadata and first video frame', 'version': av.__version__}}


def portable(value):
    if isinstance(value, dict):
        return {key: portable(item) for key, item in value.items() if key != 'realPath'}
    if isinstance(value, list):
        return [portable(item) for item in value]
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Create the initial playlist only')
    args = parser.parse_args()
    result = collect()
    if args.write:
        with project_output(PLAYLIST, __file__).open('x', encoding='utf-8', newline='\n') as output:
            output.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    else:
        stored = json.loads(read(PLAYLIST)[0])
        require(portable(stored) == portable(result), 'Saved playlist differs from the verified source files')
    print(json.dumps({'status': result['status'], 'build': result['runtime']['buildId'],
                      'clips': len(result['clips']), 'rejected': len(result['negativeControls'])}))


if __name__ == '__main__':
    main()
