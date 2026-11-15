"""Reuse the established actual raw-skin/cloth gate with explicit hand mode.
Only QA identity/output wiring changes, no collision math changes.
"""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parents[1]
original=(R/'scripts/qa-variant-seat-arms.cjs').read_text(encoding='utf8')
s=original
edits=[
("const {chromium}=require('../prototype/node_modules/playwright');", "const QA_ROOT=require('node:path').resolve(__dirname,'../../..');\nconst {chromium}=require(require('node:path').join(QA_ROOT,'prototype/node_modules/playwright'));\nconst qaHandMode=process.argv.find(x=>x.startsWith('--handSkin='))?.slice(11)||'actual';if(!['actual','legacy'].includes(qaHandMode))throw Error('Unknown hand diagnostic');"),
("require('./qa-m1-common.cjs')", "require(require('node:path').join(QA_ROOT,'scripts/qa-m1-common.cjs'))"),
("'variant-seat-arms-'+forearm+'-'+Date.now()", "'hand-surface-'+qaHandMode+'-'+Date.now()"),
("+'&forearm='+forearm,base)","+'&forearm='+forearm+'&handSkin='+qaHandMode,base)"),
("return{rows,maxHits,shots,actualBodyIndices:","return{handSurfaceObserved:rows.some(r=>r.handContacts.some(h=>h.handSurfaceMetrics?.railCount>0)),rows,maxHits,shots,actualBodyIndices:"),
("maxHits:result.maxHits,samples:","handSurfaceObserved:result.handSurfaceObserved,maxHits:result.maxHits,samples:"),
("reports.some(r=>r.maxHits))process.exitCode=1", "reports.some(r=>r.maxHits||r.handSurfaceObserved!==(qaHandMode==='actual')))process.exitCode=1"),
("passed:!errors.length&&reports.every(r=>r.maxHits===0)","handMode:qaHandMode,passed:!errors.length&&reports.every(r=>r.maxHits===0&&r.handSurfaceObserved===(qaHandMode==='actual'))"),
]
for old,new in edits:
 if s.count(old)!=1:raise RuntimeError('QA adaptation anchor changed; review: '+old)
 s=s.replace(old,new)
(O/'scripts/qa-hand-surface-gate.cjs').write_text(s,encoding='utf8',newline='\n')
(O/'scripts/qa-variant-seat-arms.reference.cjs').write_text(original,encoding='utf8',newline='\n')
(O/'scripts/surface-gate-source.json').write_text(json.dumps({'source':'scripts/qa-variant-seat-arms.cjs','sourceNormalizedLFSHA256':hashlib.sha256(original.encode()).hexdigest(),'adaptedRawSHA256':hashlib.sha256(s.encode()).hexdigest(),'scope':'QA imports/output/URL/sampling-active gate only; actual finite edge-triangle+alpha math preserved'},indent=2)+'\n',encoding='utf8')
print(O/'scripts/qa-hand-surface-gate.cjs')
