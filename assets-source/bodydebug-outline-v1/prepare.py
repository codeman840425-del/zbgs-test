"""Prepare one exact-source patch; does not modify shared runtime."""
from pathlib import Path
import hashlib,json,difflib
P=Path(__file__).resolve().parent;R=P.parents[1];src=R/'prototype/src/foundation-avatar.js';raw=src.read_bytes();sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(raw)=='b925b23c1114ec77f5eb24409d5c021e3282c03875b5645a1124cf71149ca4c0','Shared source changed; review/rebase before generating'
text=raw.decode().replace('\r\n','\n');old='''        materials.map(
          () =>
            new THREE.MeshStandardMaterial({
              color: "#728e9b",
              roughness: 1,
              side: THREE.DoubleSide,
            }),
        ),''';new=old.replace('          () =>','          (sourceMaterial) =>').replace('              side: THREE.DoubleSide,','              side: THREE.DoubleSide,\n              // Keep the outline group, but do not redraw its unexpanded skin.\n              visible: sourceMaterial.isOutline !== true,')
assert text.count(old)==1;candidate=text.replace(old,new)
(P/'foundation-avatar.js.before').write_bytes(raw)
(P/'foundation-avatar.js.candidate').write_bytes(candidate.replace('\n','\r\n').encode())
(P/'foundation-avatar.js.patch').write_text(''.join(difflib.unified_diff(text.splitlines(True),candidate.splitlines(True),fromfile='a/prototype/src/foundation-avatar.js',tofile='b/prototype/src/foundation-avatar.js')),encoding='utf-8',newline='\r\n')
(P/'manifest.json').write_text(json.dumps({'status':'review-only; not applied; browser/GPU regression pending','baseBuild':'269a73423c97','baseRawSHA256':sha(raw),'baseNormalizedLFSHA256':sha(text.encode()),'candidateRawSHA256':sha((P/'foundation-avatar.js.candidate').read_bytes()),'patchSHA256':sha((P/'foundation-avatar.js.patch').read_bytes()),'change':'Only neutral bodydebug replacement materials sourced from isOutline=true become invisible. Geometry/groups/source materials/dressed path untouched.'},indent=2)+'\n',encoding='utf-8')
print(P)
