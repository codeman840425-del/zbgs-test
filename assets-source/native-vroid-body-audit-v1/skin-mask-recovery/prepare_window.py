"""CPU only: verify sealed preparation and add explicit male snapshot/restore requests."""
from pathlib import Path
import hashlib,json
from prepare import ROOT,OUT,REQUESTS,GENERATED,write
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sealed=OUT/'preparation-files.json'
assert sha(sealed)=='deade6864e7ae2125c2ea30502b0b6dfcb113f0883666f586b13c9c2603247a3'
manifest=json.loads(sealed.read_text(encoding='utf-8-sig'))
for row in manifest['files']:assert sha(Path(row['path']))==row['sha256'],row['path']
prepared=json.loads((OUT/'prepared.json').read_text(encoding='utf-8'))
assert len(prepared['requests'])==12
assert sha(Path(prepared['source']['path']))==prepared['source']['sha256']
male=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid'
assert sha(male)=='c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a'
snapshot=GENERATED/'male-before-skin-study.vroid'
assert not snapshot.exists()
calls=[('01b-save-current-male-snapshot','vroid_save',{'path':str(snapshot)}),
       ('03b-status-female','vroid_status',{}),
       ('13-menu-to-restore-male','vroid_main_menu',{}),
       ('14-open-male-snapshot','vroid_open',{'path':str(snapshot)}),
       ('15-status-restored-male','vroid_status',{})]
for name,tool,args in calls:write(REQUESTS/(name+'.json'),{'method':'tools/call','params':{'name':tool,'arguments':args}})
write(OUT/'window-preparation.json',dict(schema='native-skin-mask-recovery-window-preparation-v1',status='cpu-prepared-waiting-explicit-window',
 originalRequestsVerified=12,originalPreparationFilesVerified=len(manifest['files']),
 expectedInitialFile=str(male),expectedMaleDiskSha256=sha(male),maleSnapshot=str(snapshot),
 additionalRequests=[dict(path=str(REQUESTS/(name+'.json')),sha256=sha(REQUESTS/(name+'.json'))) for name,_,_ in calls],
 readbackScript=dict(path=str(Path(__file__).with_name('readback.py')),sha256=sha(Path(__file__).with_name('readback.py'))),
 readbackSourceSelfTest=dict(path=str(OUT/'source-self-readback/result.json'),sha256=sha(OUT/'source-self-readback/result.json'),note='Before adding active-zero-weight-lane diagnostic; identical geometry/alpha evaluation code'),
 nativeCalls=0,editorStarted=False,gpuCalls=0))
print('Verified 18 sealed preparation files and 12 requests; added 5 window/restore requests; NO native calls.')
