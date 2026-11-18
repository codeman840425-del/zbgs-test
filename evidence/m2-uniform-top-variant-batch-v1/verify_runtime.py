"""Recheck every 5859 build input and the authority for its build-info pin."""

import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/production'))
from outfit_admission import evidence_pin, pinned_file, require, source_commit, verify_runtime_source

BUILD_ID = '5859bd00da8b'
BUILD_DIGEST = '5859bd00da8bcba953c70df771de6c2c1d294f0228e23867d071ec332a3f0fa7'
BUILD_COMMIT = '80fb16b7c6df3a7c85724c757969c6e3e6fb2b2c'


def read(path):
    return json.loads(path.read_bytes())


def verify(operator, fixed_build):
    require(operator.is_relative_to(ROOT / 'experiments/worktrees'), 'Expected an in-project operator worktree')
    require(fixed_build.is_relative_to(ROOT / 'experiments/worktrees') and fixed_build.name == 'build-info.json',
            'Expected the in-project fixed runtime build-info.json')
    registry = ROOT / 'scripts/runtime-package'
    descriptor = read(registry / 'game-runtime-reviews.json')['externalRecords'][BUILD_DIGEST]
    review_pin = evidence_pin(registry / descriptor['file'])
    require(review_pin['sha256'] == descriptor['sha256'], 'Reviewed game runtime SHA differs')
    review = read(pinned_file(review_pin))
    require(review['sourceCommit'] == BUILD_COMMIT and review['sourceDigest'] == BUILD_DIGEST,
            'Review does not identify the fixed source and build')
    build_pin = evidence_pin(fixed_build)
    require({k: build_pin[k] for k in ('sha256', 'bytes')} == review['files']['build-info.json'],
            'Fixed build-info differs from its reviewed pin')
    meta = read(pinned_file(build_pin))
    require(meta['sourceDigest'] == BUILD_DIGEST and meta['shortId'] == BUILD_ID, 'Build identity differs')
    fixed_source = fixed_build.parents[2]
    require(source_commit(fixed_source) == BUILD_COMMIT and source_commit(operator) == BUILD_COMMIT,
            'Expected both source trees at the pinned runtime commit')
    authority = {'buildInfo': build_pin, 'runtime': {'sourceDigest': BUILD_DIGEST}}
    for tree in (fixed_source, operator):
        verify_runtime_source(tree, authority)
    operator_helpers = []
    for name in ('scripts/production/variant_batch_query.mjs', 'scripts/headless-avatar-node.mjs',
                 'scripts/character-production-cli.cjs'):
        tracked = subprocess.check_output(['git', '-C', str(operator), 'show', BUILD_COMMIT + ':' + name])
        require((operator / name).read_bytes() == tracked, 'Operator helper differs from the pinned commit: ' + name)
        operator_helpers.append(evidence_pin(operator / name))
    return {
        'buildId': BUILD_ID,
        'sourceDigest': BUILD_DIGEST,
        'sourceCommit': BUILD_COMMIT,
        'operatorWorktree': operator.relative_to(ROOT).as_posix(),
        'buildInfo': build_pin,
        'gameRuntimeReview': review_pin,
        'sourceInputsCheckedPerTree': len(meta['inputs']),
        'operatorHelpers': operator_helpers,
    }


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: verify_runtime.py OPERATOR_SOURCE_ROOT FIXED_BUILD_INFO')
    print(json.dumps(verify(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()), indent=2))
