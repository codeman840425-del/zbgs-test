"""Light offline ground decomposition. Manual observations are explicit, not detection."""
from pathlib import Path
import csv, hashlib, json, math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets-source/video-dance-ground-decomposition-v1'
SUPPORT = ROOT / 'assets-source/video-dance-twist-study-v1/support-observations.json'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
observations = read(SUPPORT)['observations']
known = {'apparent_contact', 'apparent_contact_pivot', 'apparent_forefoot_contact_heel_raised'}
report = {'manualObservationSha256': hashlib.sha256(SUPPORT.read_bytes()).hexdigest(),
          'units': 'meters unless field suffix states otherwise',
          'automaticContactEstimatesUsed': False, 'bodies': {}}
fig, axes = plt.subplots(2, 2, figsize=(13, 7), sharex=True, sharey=True)
for bi, body in enumerate(('female', 'male')):
    data = read(OUT / f'{body}-decomposition.json')
    ref = read(ROOT / f'assets-source/video-dance-target-v2/{body}-world-reference.json')
    rig = read(ROOT / f'assets-source/video-target-adaptation-v1/{body}-normalized-rig.json')
    names = {n: i for i, n in enumerate(ref['names'])}
    rows = []
    for k, r in enumerate(data['sourceRows']):
        obs = next(o for o in observations if o['frames'][0] <= r['sourceFrame'] <= o['frames'][1])
        rr = {key: r[key] for key in ('sourceFrame', 'sourcePTS', 'timeBase', 'sourceSeconds', 'clipTime', 'restHipsY', 'source2DProjectedHipDeltaY', 'firstFramePlacementY', 'assetHipsY', 'runtimeGroundLift', 'afterFullRuntimeLiftHipsY')}
        heights = []
        for side in ('left', 'right'):
            foot = r['feet'][side]
            for key, value in foot.items():
                rr[f'{side}_{key}'] = value
            rr[f'{side}_manualObservation'] = obs[side]
            is_support = obs[side] in known
            rr[f'{side}_explicitSupportHypothesis'] = is_support
            # Toe patch for explicitly forefoot contact, all-vertex min otherwise.
            height = foot['toeSoftMinY'] if 'forefoot' in obs[side] and is_support else foot['minimumY']
            rr[f'{side}_selectedSupportHeight'] = height if is_support else None
            if is_support:
                heights.append(height)
                hip = np.array(ref['world'][k][names[side+'UpperLeg']])[:3, 3]
                ankle = np.array(ref['world'][k][names[side+'Foot']])[:3, 3]
                target = ankle.copy(); target[1] -= height
                reach = rig['lengths'][side]['thigh'] + rig['lengths'][side]['calf']
                horizontal2 = float(np.sum((target[[0,2]] - hip[[0,2]])**2))
                vertical_reach = math.sqrt(max(0, reach*reach-horizontal2))
                rr[f'{side}_verticalOnlyAnkleGoalY'] = float(target[1])
                rr[f'{side}_rootDeltaYUpperReachBound'] = float(target[1]+vertical_reach-hip[1])
                rr[f'{side}_reachExcessAtUnchangedRoot'] = max(0, float(np.linalg.norm(target-hip))-reach)
            else:
                for key in ('verticalOnlyAnkleGoalY','rootDeltaYUpperReachBound','reachExcessAtUnchangedRoot'):
                    rr[f'{side}_{key}'] = None
        rr['rootOnlyBilateralMinimaxResidual'] = abs(heights[0]-heights[1])/2 if len(heights)==2 else None
        rr['rootOnlyLeastSquaresShift'] = -sum(heights)/len(heights) if heights else None
        rows.append(rr)
    with (OUT / f'{body}-per-time.csv').open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    intervals = []
    for obs in observations:
        subset = [r for r in rows if obs['frames'][0] <= r['sourceFrame'] <= obs['frames'][1]]
        entry = {'frames': obs['frames'], 'left': obs['left'], 'right': obs['right'], 'support': {}}
        for side in ('left', 'right'):
            vals = [r[f'{side}_selectedSupportHeight'] for r in subset if r[f'{side}_explicitSupportHypothesis']]
            if vals:
                entry['support'][side] = {'count': len(vals), 'beforeLiftMin': min(vals), 'beforeLiftMax': max(vals), 'beforeLiftMedian': float(np.median(vals)), 'afterLiftMedian': float(np.median(vals))+data['recordedGroundLift'], 'maxReachExcessAtUnchangedRoot': max(r[f'{side}_reachExcessAtUnchangedRoot'] for r in subset), 'mostRestrictiveRootDeltaYUpperReachBound': min(r[f'{side}_rootDeltaYUpperReachBound'] for r in subset)}
        conflicts = [r['rootOnlyBilateralMinimaxResidual'] for r in subset if r['rootOnlyBilateralMinimaxResidual'] is not None]
        if conflicts:
            entry['rootOnlyBilateralMinimaxResidualRange'] = [min(conflicts), max(conflicts)]
        intervals.append(entry)
    worst = min(((r[f'{s}_minimumY'],r['sourceFrame'],s) for r in rows for s in ('left','right')))
    report['bodies'][body] = {'runtimeGroundLift': data['recordedGroundLift'], 'worstOfflineSole': {'height': worst[0], 'frame': worst[1], 'side': worst[2], 'afterLiftHeight': worst[0]+data['recordedGroundLift']}, 'intervals': intervals, 'frame153': next(r for r in rows if r['sourceFrame']==153), 'frame171': next(r for r in rows if r['sourceFrame']==171)}
    for ai, lifted in enumerate((False, True)):
        ax = axes[bi, ai]
        for side, color in (('left', '#1769aa'), ('right', '#d76c18')):
            key = 'afterFullRuntimeLiftMinimumY' if lifted else 'minimumY'
            ax.plot([r['sourceFrame'] for r in rows], [r[f'{side}_{key}']*1000 for r in rows], label=side, color=color)
        for lo, hi in ((141,144),(207,210)):
            ax.axvspan(lo-.5, hi+.5, color='#98d6a0', alpha=.35)
        ax.axhline(0, color='black', lw=.8)
        ax.set_title(f'{body}: '+('full runtime lift added' if lifted else 'frozen asset before runtime lift'))
        ax.set_ylabel('Shoe all-vertex minimum Y (mm)'); ax.grid(alpha=.2)
        ax.legend(loc='upper right')
        if bi == 1: ax.set_xlabel('Original source frame (PTS = frame * 1001 / 24000 s)')
fig.suptitle('Actual target shoe geometry; green = manually observed bilateral flight\nFull-mix projection for 73 frames, not entry/exit blend validation')
fig.tight_layout(); fig.savefig(OUT/'ground-decomposition.png', dpi=140); plt.close(fig)
report['reachBoundLimit'] = 'Necessary full-extension bound only, not an IK solution. Assumes unchanged ankle XZ and shoe orientation; ignores knee preference, collision and forefoot roll. Negative upper bound requires at least that root lowering. No rotations or keys changed.'
report['uniformShiftInvariant'] = 'For constant c: L(newAsset)=L(oldAsset)-c, so assetY+c+L(newAsset)=assetY+L(oldAsset), under the reproduced runtime calibration. A constant root offset alone cannot repair the final support hover.'
(OUT/'support-feasibility.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({b:{'worstOfflineSole':r['worstOfflineSole'], 'intervals':r['intervals']} for b,r in report['bodies'].items()}, indent=2))
