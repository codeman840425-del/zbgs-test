"""Read-only remaining-support diagnosis; no new roll or motion candidate."""
from pathlib import Path
import csv,hashlib,json
import numpy as np
from scipy.interpolate import BSpline
from scipy.optimize import linprog
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'evidence/video-motion-room-8266c5084516'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
result={'scope':'source148 remaining right-support defect; read-only, no next candidate generated',
 'manualSourceObservation':'148 right shoe visibly near floor during cross-step landing. Left shoe still raised/transitioning. Existing observation has right apparent_contact and left airborne_to_forefoot_contact_unknown. Unlike205 push-off,148 heel/forefoot partition and exact foot pitch are not sufficiently established to mandate a new toe-roll event.',
 'knownContactIsNotPhysicalMeasurement':True,'automaticContactLabelsUsed':False,'bodies':[]}
for body in ('female','male'):
 base=read(ROOT/f'assets-source/video-dance-ground-decomposition-v1/{body}-decomposition.json');v3=read(ROOT/f'assets-source/video-dance-support-v3/{body}-cleanup-report.json');v4=read(ROOT/f'assets-source/video-dance-forefoot-v4/{body}-actual-vrm-ground-check.json')
 b=next(r for r in base['sourceRows'] if r['sourceFrame']==148);c=next(r for r in v3['rows'] if r['sourceFrame']==148);r=next(r for r in v4['sourceRows'] if r['sourceFrame']==148)
 csvrows=list(csv.DictReader((ROOT/f'assets-source/video-dance-ground-decomposition-v1/{body}-per-time.csv').open(encoding='utf-8')));reach=next(x for x in csvrows if x['sourceFrame']=='148');fullDrop=-float(reach['right_rootDeltaYUpperReachBound']);T=4*1001/24000
 result['bodies'].append({'body':body,'sourceFrame':148,'sourcePTS':148148,'timeBase':'1/24000',
 'v2RightSoleHeight':b['feet']['right']['minimumY'],'v3RootDeltaY':c['rootDeltaY'],'v3RightAnkleDeltaY':c['feet']['right']['ankleDeltaY'],'v4ExtraRollAt148':0,
 'v4RightSoleBeforeLift':r['feet']['right']['minimumY'],'v4RuntimeLift':v4['runtimeGroundLift'],'v4RightSoleAfterLift':r['feet']['right']['afterRuntimeLiftMinimumY'],
 'fixedLevelFootNecessaryRootDropFor148Support':fullDrop,'additionalRootDropBeyondV3ToReachGroundNecessary':fullDrop+c['rootDeltaY'],
 'protectedFlight144ToSupport148Seconds':T,'requiredCorrectionAverageDownwardVelocityFromProtected144':fullDrop/T,
 'correctionPeakAccelerationLowerBoundIfZeroCorrectionVelocityAt144':2*fullDrop/T**2,
 'v3LeftSoleStillRaisedBeforeLift':c['feet']['left']['soleMinimumY'],
 'interpretation':'A known support was a soft objective and was not met; actual normalized loading is not the cause. Stronger flat-foot landing would need extra root/leg adjustment and event-appropriate timing. This is a necessary reach bound, not a solved temporally consistent motion. Root/pose prediction and level-foot assumptions cannot be uniquely separated using monocular data.'})
# One analytic relaxation of the existing representation; this exports no motion
# or alternative coefficients and does not try weights, knots, or detector labels.
cfg=read(ROOT/'assets-source/video-dance-support-v3/fixed-cleanup.json');frames=np.arange(138,211)
central=BSpline.design_matrix(np.clip(frames,144,207),cfg['centralKnotVector'],3).toarray()[:,2:-2];central[(frames<=144)|(frames>=207)]=0
u=np.clip((frames-138)/3,0,1);B=np.column_stack((1-3*u*u+2*u*u*u,central))
affine=[]
for body in read(ROOT/'assets-source/video-dance-forefoot-v4/acceptance.json')['results']:
 for side in ('left','right'):
  rows=[x for x in body['allKnownSupportRows'] if x['side']==side];bb=B[[x['sourceFrame']-138 for x in rows]];height=np.array([x['beforeRuntimeLiftHeight'] for x in rows])
  mat=np.vstack((np.column_stack((bb,-np.ones(len(rows)))),np.column_stack((-bb,-np.ones(len(rows))))));bounds=np.r_[-height,height]
  res=linprog(np.r_[np.zeros(B.shape[1]),1],A_ub=mat,b_ub=bounds,bounds=[(None,None)]*B.shape[1]+[(0,None)],method='highs')
  assert res.success
  residual=height+bb@res.x[:-1]
  affine.append({'body':body['body'],'side':side,'knownSupportConstraints':len(rows),'basisRankOnKnownSupports':int(np.linalg.matrix_rank(bb)),'minimumMaximumAbsoluteSupportResidualM':float(res.fun),'mostRestrictiveFrames':[rows[i]['sourceFrame'] for i in range(len(rows)) if abs(abs(residual[i])-res.fun)<1e-6]})
result['existingBasisAffineFeasibilityRelaxation']={'method':'One Chebyshev linear program per body/side, existing13-coefficient basis, all existing known supports. Affine height=current v4 contact height + B*ankleY coefficient delta; coefficients unbounded, reach/floor/smoothness relaxed. No coefficients exported, no clips generated.','results':affine,'limits':'This is a certificate only for the frozen linearized height model. Changing IK/foot rotations changes shoe skin nonlinearly; not a proof that every exact global solver is infeasible. A right-side lower bound above10mm in this relaxed model means merely raising the old soft weight is not a sufficient demonstrated solution.'}
result['nextRepresentationAdmission']=['All existing clearly observed support intervals, both protected flight intervals and unknown boundaries enter one consistent feasibility problem. Do not optimize only148 or add unsupported roll labels.','Known support geometry is a hard stated authoring condition with a declared contact patch, distinct from detection certainty. Unknown regions receive nonpenetration/reach only, not invented contact.','RootXZ, whole turn, target bone lengths and true flight timing remain constraints; check source-clock preservation.','Contact event boundaries carry unknown velocities unless evidence fixes them; do not use uniform-coefficient soft penalties to silently sacrifice contact.','Accept only if all support residuals, flight clearances, angular continuity, toe/heel geometry and actual runtime-interpolated shoe skin jointly meet gates. Infeasible means report conflicting constraints, not scan weights or relabel source.']
OUT.mkdir(exist_ok=True);(OUT/'148-diagnosis.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
