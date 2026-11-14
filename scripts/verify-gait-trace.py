"""Regression on actual browser records, including CPU-deformed shoe vertices."""
import json,pathlib
folder=pathlib.Path(__file__).resolve().parents[1]/'output/playwright/gait-trace'
summary={r['scenario']:r for r in json.loads((folder/'summary.json').read_text())}
for name in ['path-full','in-place-full']:
 r=summary[name]
 assert abs(r['stride']-1.2877704568287553)<1e-6, (name,'official root travel mismatch')
 assert r['maxPhaseError']<1e-10,(name,'phase wrap discontinuity')
 assert r['worstFootCorrectionStep']['metres']<.008,(name,'foot correction discontinuity')
 assert .45<r['contactFraction']<.70,(name,'insufficient or excessive support coverage')
 assert r['maxPatchSlip']<.005 and r['maxPatchTravel']<.005,(name,'shoe patch drift')
 assert r['actualShoe']['minY']>-.004 and r['actualShoe']['maxY']<.004,(name,'actual shoe floor mismatch')
 assert r['actualShoe']['maxContinuousSupportVertexStep']<.005,(name,'actual shoe support displacement')
for name in ['path-raw','in-place-raw']:
 assert summary[name]['worstFootCorrectionStep']['metres']<1e-8,(name,'raw mode changes authored pose')
print('PASS actual browser gait regression; visual acceptance remains separate.')
