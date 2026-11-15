"""Adapt existing no-recording substep timers; preserve their accumulation."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parents[1]
src=R/'assets-source/forearm-collision-v2/scripts/qa-unrecorded-perf.cjs';original=src.read_text(encoding='utf8');s=original
edits=[
(" const profiling=process.env.QA_FOREARM_PROFILE==='1';"," const profiling=process.env.QA_FOREARM_PROFILE==='1';\n const handMode=process.env.QA_HAND_SKIN_MODE||'actual',outfit=Number(process.env.QA_HAND_OUTFIT||1);if(!['actual','legacy'].includes(handMode)||![0,1].includes(outfit))throw Error('Invalid hand/outfit mode');"),
("'output/playwright/forearm-'+expected.build,profiling?'internal-profile':'unrecorded-perf'", "'output/playwright/hand-contact-'+expected.build,(profiling?'internal-profile':'unrecorded-perf')+'-'+handMode+'-outfit'+outfit"),
("+(profiling?'&forearmTiming=1':'')", "+'&handSkin='+handMode+(profiling?'&forearmTiming=1':'')"),
("await page.evaluate(camera=>{", "await page.evaluate(({camera,outfit})=>{"),
("d.setOutfit(1);", "d.setOutfit(outfit);"),
("  },camera);", "  },{camera,outfit});"),
("f.sitProgress=q.lastMetric?.sitProgress;", "f.sitProgress=q.lastMetric?.sitProgress;f.handSurfaceActive=(q.lastMetric?.handContacts||[]).some(h=>h.handSurfaceMetrics?.railCount>0);f.handRailQueries=(q.lastMetric?.handContacts||[]).reduce((n,h)=>n+(h.handNarrowPhasePairs||0),0);"),
("  if(capture.frames.length<100)", "  if(capture.frames.some(f=>f.handSurfaceActive)!==(handMode==='actual'&&outfit===1))throw Error('Requested hand contact activation/empty-surface short circuit mismatch');\n  if(capture.frames.length<100)"),
("const result={camera,mode,identity,", "const result={handMode,outfit,camera,mode,identity,"),
("reports.push({camera,mode,errors,", "reports.push({handMode,outfit,camera,mode,errors,"),
("{build:expected.build,viewport:", "{build:expected.build,handMode,outfit,viewport:"),
]
for old,new in edits:
 if s.count(old)!=1:raise RuntimeError('QA adaptation anchor changed: '+old)
 s=s.replace(old,new)
(O/'scripts/qa-hand-unrecorded-perf.cjs').write_text(s,encoding='utf8',newline='\n')
(O/'scripts/perf-source.json').write_text(json.dumps({'source':str(src.relative_to(R)),'sourceNormalizedLFSHA256':hashlib.sha256(original.encode()).hexdigest(),'adaptedRawSHA256':hashlib.sha256(s.encode()).hexdigest(),'scope':'hand query/outfit/output and activation assertion only; real-substep timer accumulation unchanged'},indent=2)+'\n',encoding='utf8')
print(O/'scripts/qa-hand-unrecorded-perf.cjs')
