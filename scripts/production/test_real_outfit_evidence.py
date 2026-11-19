"""Fail closed on missing or mismatched real outfit evidence without granting approval."""

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True

import outfit_admission as gate
from production_paths import project_output
from variant_batch import run as plan_variants


ROOT = gate.ROOT
ARCHIVE = Path('evidence/m2-first-rule-delivery-v1')
SCRATCH = Path('evidence/m2-frozen-rule-game-v1/formal')


def json_file(path):
    return json.loads(path.read_bytes())


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rejection(check, reason):
    try:
        check()
    except ValueError as error:
        if str(error) == reason:
            return {'status': 'rejected', 'reason': reason}
        raise
    raise AssertionError('Expected rejection: ' + reason)


def changed_outfit(record, alternative):
    changed = deepcopy(record)
    equipment = changed['appearanceRecipe']['equipment']['resources']
    slot = alternative['slot']
    key, = (key for key, item in equipment.items() if item['slot'] == slot)
    previous = equipment[key]
    assert previous['id'] != alternative['id'] and previous['sha256'] != alternative['sha256']
    equipment[key] = alternative
    return changed, {label: {key: item[key] for key in ('id', 'slot', 'sha256')}
                     for label, item in [('previous', previous), ('replacement', alternative)]}


def replacement_item(args):
    alternative = gate.exact_entry(json_file(args.replacement_manifest)['items'], 'id', args.replacement_id)
    asset = (ROOT / 'prototype/public' / alternative['url'].lstrip('/') if alternative['url'].startswith('/')
             else args.replacement_manifest.parent / alternative['url'])
    assert sha256(asset) == alternative['sha256'] and asset.stat().st_size == alternative['bytes']
    return alternative


def missing_restore_report(report, scratch):
    path = project_output(scratch / 'required-restore.json', __file__)
    with path.open('xb') as stream:
        stream.write(report.read_bytes())
    pin = gate.evidence_pin(path)
    assert pin['sha256'] == sha256(report) and gate.pinned_file(pin) == path
    path.unlink()
    missing = rejection(lambda: gate.pinned_file(pin), 'Evidence must be a repository file')
    return {**missing, 'report': 'recordAndRestore', 'reportSha256': pin['sha256'], 'removedIsolatedCopy': True}


def tampered_export(args, records, scratch):
    path = project_output(scratch / 'altered-record-array.json', __file__)
    path.write_text(json.dumps(records, ensure_ascii=False), encoding='utf-8')
    destination = project_output(scratch / 'unexpected-release', __file__)
    command = ['node', ROOT / 'scripts/runtime-package/game-record-cli.mjs', 'export',
               '--dist', args.dist, '--source-root', args.runtime_root, '--records', path,
               '--inventory', args.inventory, '--out', destination]
    for directory in args.shape_pack:
        command.extend(['--shape-pack', directory])
    result = subprocess.run([str(arg) for arg in command], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    assert result.returncode == 1, result.stdout + result.stderr
    receipt = json.loads(result.stderr)
    assert receipt['code'] == 'recipe-hash-mismatch', receipt
    assert not destination.exists()
    return {'exit': result.returncode, 'receipt': receipt, 'destinationCreated': False}


def verify(args):
    original = (args.records, args.inventory, args.restore, args.guards, args.room, args.replacement_manifest,
                args.matrix, args.request, gate.INDEX)
    before = {path: sha256(path) for path in original}
    records, inventory, restore, guards, room = (json_file(path) for path in original[:5])
    runtime = {key: inventory['runtime'][key] for key in ('sourceCommit', 'sourceDigest', 'buildId')}
    record = records[args.record_index]
    gate.verify_room_report(room, record, runtime)
    gate.verify_runtime_readback(restore, inventory, record, runtime)
    gate.verify_guard_report(guards, record, runtime)

    changed, change = changed_outfit(record, replacement_item(args))

    parent = project_output(ROOT / SCRATCH, __file__)
    parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='.real-outfit-evidence-', dir=parent) as directory:
        scratch = project_output(directory, __file__)
        missing = missing_restore_report(args.restore, scratch)

        mismatch = rejection(lambda: gate.verify_runtime_readback(restore, inventory, changed, runtime),
                             'Game package does not pin the complete reviewed outfit')
        failed_guard = rejection(lambda: gate.verify_guard_report(guards, changed, runtime),
                                 'Guard proof belongs to a different outfit or dependency set')
        mismatch.update(change=change, originalReportReused=True, guard=failed_guard)

        outplan = project_output(scratch / 'formal-plan', __file__)
        plan = plan_variants(args.matrix, args.request, outplan, args.planner_root, input_root=ROOT)
        assert plan['acceptedCount'] == 0 and plan['rejectedCount'] >= 1 and plan['creationBatches'] == []
        assert all(item['reason'] == 'Whole-outfit runtime admission evidence is required from the reviewed index'
                   for item in plan['items'])
        emitted = sorted(file.relative_to(outplan).as_posix() for file in outplan.rglob('*') if file.is_file())
        assert emitted == ['plan.json']
        envelope = None
        if args.dist:
            altered = list(records)
            altered[args.record_index] = changed
            envelope = tampered_export(args, altered, scratch)

    gate.verify_runtime_readback(restore, inventory, record, runtime)
    gate.verify_guard_report(guards, record, runtime)
    assert {path: sha256(path) for path in original} == before
    return {
        'schema': 'real-outfit-evidence-rejection-v1', 'runtime': runtime,
        'originalRecordSha256': record['integrity']['recordSha256'],
        'realBaselineVerified': ['normalSpeedMotion', 'recordAndRestore', 'selectionGuards'],
        'missingRequiredEvidence': missing, 'changedOneEquipment': mismatch,
        'unreviewedFormalPlanner': {'mode': plan['mode'], 'items': plan['items'], 'createdRequests': 0, 'files': emitted},
        'independentExportEnvelopeGuard': envelope,
        'originalRecordInventoryEvidenceAndAuthorityIndexUnchanged': True,
        'releaseArtifactsCreated': 0,
        'scope': 'Real evidence-level negative controls and actual unreviewed formal planner; no authority fixture.'
    }


def verify_current_export(args):
    """Use the current signed package while its formal room/guard proof is pending."""
    assert args.dist, '--previous-restore requires --dist'
    paths = (args.records, args.inventory, args.restore, args.previous_restore)
    original = {path: sha256(path) for path in paths}
    records, inventory, cold, previous = map(json_file, paths)
    runtime = {key: inventory['runtime'][key] for key in ('sourceCommit', 'sourceDigest', 'buildId')}
    assert cold['runtime'] == inventory['runtime'] and cold['status'] == 'technical-pass'
    previous_ids = {row['id'] for row in previous['first']}
    retained = next(record for record in records if record['identity']['id'] in previous_ids)
    retained_sha = retained['integrity']['recordSha256']
    item = gate.exact_entry(inventory['records'], 'recordSha256', retained_sha)
    assert item['bodyType'] == retained['appearanceRecipe']['base']['bodyType']
    cross = rejection(lambda: gate.verify_runtime_readback(previous, inventory, retained, runtime),
                      'Evidence came from a different fixed build')
    record = records[args.record_index]
    record_sha = record['integrity']['recordSha256']
    gate.exact_entry(inventory['records'], 'recordSha256', record_sha)
    altered = list(records)
    altered[args.record_index], change = changed_outfit(record, replacement_item(args))
    parent = project_output(ROOT / SCRATCH, __file__)
    parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='.current-formal-guard-', dir=parent) as directory:
        exported = tampered_export(args, altered, project_output(directory, __file__))
    assert {path: sha256(path) for path in paths} == original
    return {
        'schema': 'real-outfit-current-runtime-rejection-v1', 'runtime': runtime,
        'inventorySha256': original[args.inventory], 'recordSha256': record_sha,
        'retainedRecordSha256': retained_sha, 'soleEquipmentChange': change,
        'sameSignedRecordWithPreviousRestoreEvidence': cross,
        'currentCold': {'status': cold['status'], 'reportSha256': original[args.restore],
                        'sessions': [session['phase'] for session in cold['sessions']],
                        'format': 'runtime/sessions technical report; distinct from formal build/first/reopened evidence schema'},
        'independentExportEnvelopeGuard': exported, 'originalRecordsInventoryAndColdReportsUnchanged': True,
        'releaseArtifactsCreated': 0,
    }


def verify_restore_only(args):
    paths = (args.records, args.inventory, args.restore, gate.INDEX)
    if args.guards:
        paths += (args.guards,)
    original = {path: sha256(path) for path in paths}
    records, inventory, restore = map(json_file, paths[:3])
    guards = json_file(args.guards) if args.guards else None
    runtime = {key: inventory['runtime'][key] for key in ('sourceCommit', 'sourceDigest', 'buildId')}

    def verify_record(record):
        gate.verify_runtime_readback(restore, inventory, record, runtime)
        if guards is not None:
            gate.verify_guard_report(guards, record, runtime)

    verified = []
    for record in records:
        verify_record(record)
        verified.append({'id': record['identity']['id'], 'recordSha256': record['integrity']['recordSha256'],
                         'bodyType': record['appearanceRecipe']['base']['bodyType']})
    changed, change = changed_outfit(records[args.record_index], replacement_item(args))
    parent = project_output(ROOT / SCRATCH, __file__)
    parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='.standard-restore-', dir=parent) as directory:
        scratch = project_output(directory, __file__)
        missing = missing_restore_report(args.restore, scratch)
        mismatch = rejection(lambda: gate.verify_runtime_readback(restore, inventory, changed, runtime),
                             'Game package does not pin the complete reviewed outfit')
        if guards is not None:
            mismatch['guard'] = rejection(lambda: gate.verify_guard_report(guards, changed, runtime),
                                          'Guard proof belongs to a different outfit or dependency set')
        assert not list(scratch.iterdir())
    for record in records:
        verify_record(record)
    assert {path: sha256(path) for path in paths} == original
    return {
        'schema': 'real-outfit-standard-restore-rejection-v1', 'runtime': runtime,
        'inventorySha256': original[args.inventory], 'reportSha256': original[args.restore],
        **({'guardReportSha256': original[args.guards], 'guardCases': len(guards['cases'])} if guards is not None else {}),
        'recordsVerifiedBeforeAndAfter': verified, 'missingRequiredEvidence': missing,
        'changedOneEquipment': {**mismatch, 'change': change, 'record': verified[args.record_index],
                                'originalReportReused': True},
        'originalRecordsInventoryReportAndAuthorityIndexUnchanged': True, 'releaseArtifactsCreated': 0,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for field, default in {
        'records': ARCHIVE / 'game/signed.json', 'inventory': ARCHIVE / 'build/inventory.json',
        'restore': ARCHIVE / 'restore/report.json', 'guards': None,
        'room': ARCHIVE / 'game/room-0625-01/report.json',
        'replacement-manifest': Path('prototype/public/assets/cc0-body-release-v1/equipment.json'),
        'matrix': ARCHIVE / 'request/inputs/matrix.json', 'request': ARCHIVE / 'request/inputs/request.json',
        'planner-root': Path('.'), 'runtime-root': Path('.'), 'dist': None, 'previous-restore': None,
    }.items():
        parser.add_argument('--' + field, type=lambda value: (ROOT / value).resolve(),
                            default=(ROOT / default).resolve() if default is not None else None)
    parser.add_argument('--replacement-id', default='cc0-texture-release-uniform-top-v1')
    parser.add_argument('--record-index', type=int, default=0)
    parser.add_argument('--shape-pack', type=Path, action='append', default=[])
    parser.add_argument('--restore-only', action='store_true', help='Verify every record against one standard restore report')
    args = parser.parse_args()
    if args.restore_only and args.previous_restore:
        parser.error('--restore-only cannot be combined with --previous-restore')
    if args.restore_only:
        result = verify_restore_only(args)
    elif args.previous_restore:
        result = verify_current_export(args)
    else:
        if args.guards is None:
            args.guards = ROOT / ARCHIVE / 'selection-guards/report.json'
        result = verify(args)
    print(json.dumps(result, ensure_ascii=True, indent=2))
