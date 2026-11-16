"""Publish the explicit derived body and its proven equipment fits only."""
import hashlib
import json
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets-source/m2-lower-leg-proportion-v1/generated'
DEST = ROOT / 'prototype/public/assets/m2-lower-leg-proportion-v1'
PREFIX = '/assets/m2-lower-leg-proportion-v1/'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    inventory=json.loads((SOURCE/'package-files.json').read_text(encoding='utf-8'))['files']
    for entry in inventory:
        candidate=(ROOT/entry['path']).resolve()
        assert candidate.is_relative_to(ROOT.resolve()), 'Source inventory escaped repository'
        data=candidate.read_bytes()
        assert len(data)==entry['bytes'] and sha(data)==entry['sha256'], 'Source inventory mismatch: '+entry['path']
    for name in ['qa-report.json','upper-body-qa.json','vrm-loader-qa.json']:
        assert json.loads((SOURCE/name).read_text(encoding='utf-8'))['passed'] is True, 'Source QA incomplete: '+name
    fit = json.loads((SOURCE / 'fit.json').read_text(encoding='utf-8'))
    manifest = json.loads((SOURCE / 'equipment.json').read_text(encoding='utf-8'))
    avatar = (SOURCE / 'avatar.vrm').read_bytes()
    assert sha(avatar) == fit['avatarSha256'], 'Derived body identity mismatch'
    assert len(manifest['items']) == 3, 'Expected separately audited top, shoes and shorts'
    pending = {'avatar.vrm': avatar, 'fit.json': (SOURCE / 'fit.json').read_bytes()}
    for item in manifest['items']:
        name = item['url']
        assert Path(name).name == name, 'Expected local exported equipment filename'
        data = (SOURCE / name).read_bytes()
        assert sha(data) == item['sha256'], 'Equipment digest mismatch: ' + item['id']
        assert item['compatibleAvatarSha256'] == fit['avatarSha256']
        pending[name] = data
        item['url'] = PREFIX + name
    forearm = (SOURCE / 'forearm-profile.json').read_bytes()
    assert json.loads(forearm)['bodySHA256'] == fit['avatarSha256']
    pending['forearm-profile.json'] = forearm
    pending['equipment.json'] = (json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    # Exact same source may be republished; a different candidate needs a new identity.
    for name,data in pending.items():
        target = DEST / name
        assert not target.exists() or target.read_bytes() == data, 'Refuse differing existing asset: ' + name
    DEST.mkdir(parents=True,exist_ok=True)
    for name,data in pending.items():
        target=DEST/name
        if not target.exists():
            tmp=target.with_suffix(target.suffix+'.tmp');tmp.write_bytes(data);os.replace(tmp,target)
    print(json.dumps({'published':True,'avatarSha256':sha(avatar),'forearmSha256':sha(forearm),'files':len(pending)}))

if __name__ == '__main__': main()
