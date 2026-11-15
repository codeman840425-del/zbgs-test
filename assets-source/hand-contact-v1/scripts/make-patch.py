"""Generate an isolated motion hunk; never writes prototype/src or fixed dist."""
from pathlib import Path
import hashlib,json,difflib
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parents[1]
source=OUT/'source/motion.base.js'
if not source.exists():source=ROOT/'prototype/src/motion.js'
source_bytes=source.read_bytes()
raw_sha=hashlib.sha256(source_bytes).hexdigest()
assert raw_sha in ['d6c5c9a9ffbbd01bc45bde575e2824499f09194acc9ab4200b8bf0c9bef5700c','3851f2e3b3bc8bd64323d1dc6ed29d869bb2d04f0869927aa39647d55c6cefa2'],'Unrecognized source bytes'
normalized=source_bytes.replace(b'\r\n',b'\n');assert b'\r' not in normalized,'Only CRLF->LF equivalence is allowed'
original=normalized.decode('utf8');candidate=original
assert hashlib.sha256(original.encode()).hexdigest()=='d6c5c9a9ffbbd01bc45bde575e2824499f09194acc9ab4200b8bf0c9bef5700c','Baseline motion changed; review and repin instead of applying to unknown code'
candidate='import { createHandContourWorkspace } from "./hand-contour-workspace.mjs";\n'+candidate
edits=[
('  const contactTriangles = [];','  const contactTriangles = [];\n  const handSurfaceWorkspace = profile?.handSurfaceContact ? createHandContourWorkspace(THREE,vrm,root,{bodySHA256:profile.forearmCollisionBodySHA256,expectedSHA256:profile.handSurfaceContact.bodySHA256}) : null;'),
('      !calibratedForearms &&','      !calibratedForearms && !handSurfaceWorkspace &&'),
('    const surfaces = profile.seatHandSurfaces?.(true) || [];','    const surfaces = profile.seatHandSurfaces?.(true) || [];\n    const activeHandSurface = surfaces.length ? handSurfaceWorkspace : null;\n    const handSkinStarted = timing ? performance.now() : 0;\n    activeHandSurface?.refresh(); // callback above owns current raw-pose sync\n    if(timing)timing.handSkinMs=performance.now()-handSkinStarted;'),
('      const forearmProfile = calibratedForearms?.find(p => p.side === arm.side);','      const forearmProfile = calibratedForearms?.find(p => p.side === arm.side);\n      const handContourStarted = timing ? performance.now() : 0;\n      const handSurfaceMetrics = activeHandSurface?.project(arm.side,gridU,gridV,outward,original);\n      if(timing)timing.handContourMs=(timing.handContourMs||0)+performance.now()-handContourStarted;'),
('      let narrowPhasePairs = 0;','      let narrowPhasePairs = 0, handNarrowPhasePairs = 0;'),
('        // Palm stays unchanged. Missing/unmatched profiles retain explicit legacy path.','        if(activeHandSurface){\n          measurement.part="actual-hand-contours";\n          for(const [a,b] of activeHandSurface.railsAt(arm.side,wrist)){palmCorrection=Math.max(palmCorrection,railClearance(a,b,outward));handNarrowPhasePairs++;}\n        }\n        // Missing explicit opt-in retains the existing fixed-width palm path.'),
('          ["hand", wrist, wrist.clone().add(handOffset), 0.016],','          ...(!activeHandSurface ? [["hand", wrist, wrist.clone().add(handOffset), 0.016]] : []),'),
('        finalPalmClearance: finalClearance.palmCorrection,','        finalPalmClearance: finalClearance.palmCorrection,\n        handSurfaceMetrics: handSurfaceMetrics || null,\n        handNarrowPhasePairs,\n        handClearanceBasis: activeHandSurface ? "predicted-wrist-translated-authored-skin-contours-not-final-raw-skin" : "legacy-five-rails",'),
('timing.otherMs=timing.totalMs-timing.skinMs-timing.alphaSetupMs-timing.gridMs-timing.contourMs-timing.railAlphaMs-timing.diagnosticMs;', 'timing.otherMs=timing.totalMs-timing.skinMs-timing.alphaSetupMs-timing.gridMs-timing.contourMs-timing.railAlphaMs-timing.diagnosticMs-(timing.handSkinMs||0)-(timing.handContourMs||0);'),
]
for old,new in edits:
 if candidate.count(old)!=1:raise RuntimeError('Hunk anchor changed; review instead of overwriting: '+old)
 candidate=candidate.replace(old,new)
(OUT/'patch').mkdir(exist_ok=True)
(OUT/'patch/motion-hand-contours.patch').write_text(''.join(difflib.unified_diff(original.splitlines(True),candidate.splitlines(True),fromfile='a/prototype/src/motion.js',tofile='b/prototype/src/motion.js')),encoding='utf8',newline='\r\n')
(OUT/'patch/motion.candidate.js').write_text(candidate,encoding='utf8',newline='\r\n')
(OUT/'patch/manifest.json').write_text(json.dumps({'source':source.relative_to(ROOT).as_posix(),'sourceRawSHA256':raw_sha,'sourceNormalizedLFSHA256':hashlib.sha256(normalized).hexdigest(),'knownCheckoutRawSHA256':'3851f2e3b3bc8bd64323d1dc6ed29d869bb2d04f0869927aa39647d55c6cefa2','candidateRawSHA256':hashlib.sha256((OUT/'patch/motion.candidate.js').read_bytes()).hexdigest(),'candidateNormalizedLFSHA256':hashlib.sha256(candidate.encode()).hexdigest(),'normalization':'Only CRLF->LF for text patch equivalence; body/resource hashes always exact original bytes','status':'isolated untested hand contour candidate; no runtime integration','optIn':{'handSurfaceContact':{'bodySHA256':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'}},'needs':['copy helper next to isolated motion only','apply opt-in only to exact current female profile','actual final raw skin triangles and real unrecorded cost']} ,indent=2)+'\n',encoding='utf8',newline='\n')
print(OUT/'patch/motion-hand-contours.patch')
