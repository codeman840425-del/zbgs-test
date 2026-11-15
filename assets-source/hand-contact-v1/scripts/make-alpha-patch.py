"""Build one isolated equivalent-alpha experiment from exact rejected 83 source."""
from pathlib import Path
import hashlib,json,difflib
P=Path(__file__).resolve().parents[1]
src=P/'patch/motion.candidate.js';raw=src.read_bytes()
assert hashlib.sha256(raw).hexdigest()=='f55293dc4d1e965084b43c28f939494a7c13de0d348d355f80f97bf6033b56ab'
old=raw.replace(b'\r\n',b'\n').decode();new=old
new='import { createOpaqueAlphaProof } from "./opaque-alpha-proof.mjs";\n'+new
edits=[
('  const contactTriangles = [];','  const contactTriangles = [];\n  const opaqueAlphaProof = profile?.handSurfaceContact && profile?.handOpaqueAlphaProof !== false ? createOpaqueAlphaProof() : null;'),
('    const ray = new THREE.Ray(),','    const alphaProofStarted = timing ? performance.now() : 0;\n    if(opaqueAlphaProof) for(const t of triangles) opaqueAlphaProof.prepare(t);\n    if(timing) timing.alphaProofMs = performance.now()-alphaProofStarted;\n    const ray = new THREE.Ray(),'),
('      alphaBarycentricPrepared(t,hit,bary);','      if(opaqueAlphaProof?.opaque(t,hit)) return true;\n      alphaBarycentricPrepared(t,hit,bary);'),
('        handSurfaceMetrics: handSurfaceMetrics || null,','        handSurfaceMetrics: handSurfaceMetrics || null,\n        alphaProof: opaqueAlphaProof ? {...opaqueAlphaProof.stats} : null,'),
('-(timing.handContourMs||0);','-(timing.handContourMs||0)-(timing.alphaProofMs||0);'),
]
for a,b in edits:
 assert new.count(a)==1, a
 new=new.replace(a,b)
out=P/'alpha-proof';out.mkdir(exist_ok=True)
(out/'motion.candidate.js').write_text(new,encoding='utf8',newline='\r\n')
(out/'motion-alpha.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/prototype/src/motion.js',tofile='b/prototype/src/motion.js')),encoding='utf8',newline='\r\n')
(out/'manifest.json').write_text(json.dumps({'baseRawSHA256':hashlib.sha256(raw).hexdigest(),'baseNormalizedLFSHA256':hashlib.sha256(old.encode()).hexdigest(),'candidateRawSHA256':hashlib.sha256((out/'motion.candidate.js').read_bytes()).hexdigest(),'candidateNormalizedLFSHA256':hashlib.sha256(new.encode()).hexdigest(),'helperSHA256':hashlib.sha256((P/'source/opaque-alpha-proof.mjs').read_bytes()).hexdigest(),'status':'unvalidated isolated alpha proof; 83 build retained; no main merge','foundationAvatarAddition':'handOpaqueAlphaProof: new URLSearchParams(location.search).get("handAlpha") !== "legacy",'},indent=2)+'\n',encoding='utf8')
print(out)
