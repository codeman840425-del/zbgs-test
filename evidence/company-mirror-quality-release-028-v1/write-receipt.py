import hashlib
import json
from pathlib import Path

out = Path(__file__).resolve().parent
repo = out.parent.parent
source = 'be2273cb849b107907e0c8841a7c9371f3d8e4a7'
build = '028e9e44db24'
record = repo/'evidence/company-mirror-quality-recording-028-v1'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
def write(name, value):
    (out/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

fixed = read(repo/'evidence/company-mirror-quality-browser-fixed-v1/report.json')
wall = read(repo/'evidence/company-mirror-quality-wall-browser-fixed-v1/report.json')
handoff = read(repo/'evidence/company-mirror-quality-handoff-028-v1/report.json')
recording = read(record/'recording.json')
assert all(r['status']=='passed' for r in [fixed,wall,handoff])
assert recording['status']=='recorded' and recording['sourceCommit']==source and recording['build']==build
media = dict(durationSeconds=36.32, width=1440, height=1000, fps=25, speed=1, sha256=hashlib.sha256((record/'mirror-quality-normal1x.webm').read_bytes()).hexdigest(), contactSheetTimesSeconds=[1,4,7,10,13,16,19,22,25,28,31,34,36])
write('identity.json', dict(sourceCommit=source, build=build, fixedTree='F:/gamemake-company-mirror-quality-fixed-v1', package='F:/gamemake-company-mirror-quality-delivery-028', preview='http://127.0.0.1:60880/?sample=floor-mirror&look=1', video='evidence/company-mirror-quality-recording-028-v1/mirror-quality-normal1x.webm', media=media))
write('cost.json', dict(profile='detail-1024-msaa4-v1', targetSize=[1024,1024], samples=4, activeMirrorLimit=1, maxReflectionHz=30, measured=fixed['cost'], limits=['SwiftShader CPU submission and object counts, not GPU completion time or measured VRAM','1024 squared has four times the texels of 512 squared; MSAA storage/fill cost is additional','Old and candidate targets may coexist at preflight; count alone does not establish equal memory cost','Ordinary-PC performance untested']))
write('visual-review.json', dict(reviewed=['full-resolution floor before/after','full-resolution wall before/after','13 actual video frames covering 1s through 36s'], observed=['Both mirrors have visibly smoother reflected plant and pot silhouettes at 1024/4 than 512/0','The mirrored wall and floor follow the same scene; before/after keeps camera and document unchanged','Restart restores the room overview; reflection is view dependent'], remaining=['Reflected shadow boundaries remain rough','Plant is a simple geometry test asset, not finished production art','Frame inspection is not human continuous final acceptance','No ordinary-PC or C3 character acceptance'], video=media))
write('CAP-INCREMENT.json', dict(kind='company-platform-capability-increment-for-chief', scope='mirror-host-quality', source=source, build=build, status='company-side-fixed-delivery-awaiting-chief-integration-and-user-review', proved=['Explicit host quality selection with legacy default preserved','Actual framebuffer completeness, sample-count and GL-error admission gates','Four wall and four floor appearances retain actual reflection, save/restart and failure recovery','Display-only quality changes invalidate stale prepared candidates without changing saved document','Full standalone package rebuild without file exclusions'], evidence=dict(cpuQualityChecks=38, cpuTargetChecks=9, wallCpuRegression=23, floorCpuRegression=26, floorBrowserGroups=len(fixed['checks']), wallBrowserGroups=len(wall['checks']), handoffGroups=len(handoff['checks']),manifestFiles=754,runtimeRebuiltFiles=264,videoSeconds=36.32), remaining=['Other confirmed C1 branches including vanity table','Remaining C2 packages','Chief-owned real-character C3 integration','User final viewing acceptance','Ordinary-PC performance']))
print('Quality release receipts written')
