from pathlib import Path
import hashlib,json
P=Path(__file__).resolve().parents[1];src=P/'scripts/qa-hand-unrecorded-perf.cjs';s=src.read_text();original=s
edits=[
(" const profiling=process.env.QA_FOREARM_PROFILE==='1';", " const profiling=process.env.QA_FOREARM_PROFILE==='1';\n const proofMode=process.env.QA_HAND_ALPHA||'actual';if(!['actual','legacy'].includes(proofMode))throw Error('Invalid proof mode');"),
("+'-'+handMode+'-outfit'+outfit)", "+'-'+handMode+'-outfit'+outfit+'-alpha-'+proofMode)"),
("+'&handSkin='+handMode", "+'&handSkin='+handMode+'&handAlpha='+proofMode"),
("const result={handMode,outfit,", "const result={proofMode,handMode,outfit,"),
("{build:expected.build,handMode,", "{build:expected.build,proofMode,handMode,"),
]
for a,b in edits:
 assert s.count(a)==1,a
 s=s.replace(a,b)
(P/'scripts/qa-alpha-perf.cjs').write_text(s,encoding='utf8',newline='\n')
(P/'alpha-proof/perf-adapter.json').write_text(json.dumps({'source':str(src),'sourceNormalizedLFSHA256':hashlib.sha256(original.encode()).hexdigest(),'scope':'proof query/label/output only; same no-recording real-substep timing'},indent=2)+'\n',encoding='utf8')
