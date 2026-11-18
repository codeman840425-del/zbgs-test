"""Rebuild the stripped VRM0 and its three exact fits from the game's fixed source outfit profile."""

import argparse
import json
import subprocess
import sys

import stripped_outfit_body as body
import stripped_outfit_equipment as fit
from flow import ROOT, require
from native_import import digest

PROFILES = ROOT / 'prototype/src/source-outfit-profiles.json'
PUBLIC = ROOT / 'prototype/public'


def check_profile(row, body_receipt):
    require(row['id'] == fit.BODY_TYPE and row['embeddedClothing'] is False, 'Wrong derived outfit profile')
    require(
        row['url'] == '/' + body.TARGET.relative_to(PUBLIC).as_posix()
        and row['manifestUrl'] == '/' + (ROOT / fit.TARGET_MANIFEST).relative_to(PUBLIC).as_posix(),
        'Profile asset URL differs from production destination',
    )
    require(
        body.TARGET == ROOT / fit.TARGET
        and body_receipt['target'] == fit.TARGET
        and row['sha256'] == body_receipt['targetSha256'],
        'Profile and body recipe result disagree',
    )


def check_catalog(profile, catalog):
    require(digest(catalog) == profile['manifestSha256'], 'Generated catalog differs from profile SHA')
    ids = profile['ids']
    actual = [(row['slot'], row['id'], row['compatibleAvatarSha256']) for row in json.loads(catalog)['items']]
    expected = [
        (slot, ids[key], profile['sha256'])
        for slot, key in [('top', 'top'), ('bottom', 'pants'), ('shoes', 'shoes')]
    ]
    require(actual == expected, 'Generated outfit differs from profile slots, IDs or body SHA')


def run(check):
    body.check_checkout()
    profile = json.loads(body.physical(PROFILES).read_bytes())[fit.BODY_TYPE]
    check_profile(profile, json.loads(body.physical(body.REPORT).read_bytes()))
    manifest = body.physical(ROOT / fit.TARGET_MANIFEST)
    proof = body.physical(ROOT / fit.PROOF)
    target = body.physical(body.TARGET)
    for path, sha in [(target, profile['sha256']), (manifest, profile['manifestSha256'])]:
        if path.exists() or check:
            require(
                path.is_file() and digest(path.read_bytes()) == sha,
                f'Profile asset missing or changed: {path}',
            )

    command = [sys.executable, '-B', str(body.physical(ROOT / 'scripts/production/stripped_outfit_body.py'))]
    subprocess.run(command + (['--check'] if check else []), cwd=ROOT, check=True, stdout=subprocess.PIPE)
    require(
        digest(body.physical(target).read_bytes()) == profile['sha256'], 'Staged release body SHA differs'
    )

    files = fit.build(profile['sha256'])
    check_catalog(profile, files[fit.TARGET_MANIFEST])
    writer = body.load_script('source_outfit_release_output', 'scripts/native-vroid-equipment-extract.py')
    outputs = [(proof, files[fit.PROOF]), (manifest, files[fit.TARGET_MANIFEST])]
    for path, raw in outputs:
        if body.physical(path).exists() or check:
            writer.write_outputs({path.name: raw}, path.parent, check=True)
    if not check:
        for path, raw in outputs:
            writer.write_outputs({path.name: raw}, body.physical(path).parent)
    require(
        digest(body.physical(manifest).read_bytes()) == profile['manifestSha256'],
        'Staged catalog SHA differs',
    )
    return {
        'profile': fit.BODY_TYPE,
        'bodySha256': profile['sha256'],
        'manifestSha256': profile['manifestSha256'],
    }


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--check', action='store_true', help='Require all assets and receipts to already match')
    print(json.dumps(run(cli.parse_args().check)))
