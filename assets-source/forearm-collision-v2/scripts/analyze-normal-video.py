"""Offline, saved normal-video traces only. No browser or renderer."""
import json, pathlib, statistics, math, sys

root = pathlib.Path(sys.argv[1])
def stats(values):
    a = sorted(values)
    return dict(n=len(a), mean=statistics.mean(a), p95=a[math.ceil(.95*len(a))-1],
                p99=a[math.ceil(.99*len(a))-1], max=a[-1], over33=sum(x>33.334 for x in a),
                over50=sum(x>50 for x in a)) if a else None

for mode in ['lap', 'authored']:
    p = json.loads((root/(mode+'.json')).read_text(encoding='utf8'))
    events = {e['action']: e['t'] for e in p['events']}
    frames = p['frames']
    seated_at = next(f['t'] for f in frames if f['t']>events['sit'] and f['sitProgress']>=.999)
    standing_at = next(f['t'] for f in frames if f['t']>events['stand'] and f['sitProgress']<=.001)
    groups = {}
    for f in frames:
        t = f['t']
        phase = ('startup' if t<500 else 'preSit' if t<events['sit'] else
                 'sit' if t<seated_at else 'seated' if t<events['stand'] else
                 'rise' if t<standing_at else 'postStand')
        f['analysisPhase'] = phase
        f['fitLastStepMs'] = max([h.get('fitElapsedMs',0) for h in f['handContacts']] or [0])
        groups.setdefault(phase,[]).append(f)
    result = dict(mode=mode, events=events, seatedAt=seated_at, standingAt=standing_at,
        phases={k:dict(raf=stats([f['frameMs'] for f in v if f['frameMs'] is not None]),
            lastStepFit=stats([f['fitLastStepMs'] for f in v]), start=v[0]['t'], end=v[-1]['t'])
            for k,v in groups.items()},
        longest=[{k:f[k] for k in ['t','frameMs','analysisPhase','fitLastStepMs','sitProgress']}
            for f in sorted([f for f in frames if f['frameMs']],key=lambda f:f['frameMs'],reverse=True)[:12]],
        limits='First rAF timestamp predates recorder.start. Separate startup; not an ongoing 320ms stall. fitElapsedMs is cumulative whole fit function at final arm: max, not sum. Only final simulation substep captured. Actual per-frame substep count, encoder, observer and render costs were not recorded; causal attribution requires an unrecorded run.')
    (root/(mode+'-performance.json')).write_text(json.dumps(result,indent=2),encoding='utf8')
    print(mode, json.dumps(result['phases']['seated']))
