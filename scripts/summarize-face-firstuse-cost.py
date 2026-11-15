"""Compare complete request-to-first-draw intervals; never rewrites raw evidence."""
import argparse, json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--baseline', required=True)
p.add_argument('--candidate', required=True)
p.add_argument('--out', required=True)
a = p.parse_args()
out = Path(a.out)
out.mkdir(exist_ok=False)


def summarize(folder):
    folder = Path(folder)
    report = json.loads((folder / 'report.json').read_text(encoding='utf-8'))
    assert report['status'] == 'measured'
    rows = []
    for case in report['cases']:
        raw = json.loads((folder / case['raw']).read_text(encoding='utf-8'))
        for command in raw['commands']:
            label = command['label']
            draws = [r for r in raw['renders'] if r['label'] == label and r['start'] >= command['end']]
            assert draws, 'Missing actual post-commit draw'
            first = draws[0]
            preparations = [c for c in raw['compiles'] if c['label'] == label]
            staged = {program['glID'] for c in preparations for program in c['programs']}
            rendered = {g['glID'] for g in raw['gl'] if g['label'] == label and g['name'] == 'useProgram' and g['inRender'] and g['start'] >= command['end']}
            logs = [g for g in raw['gl'] if g['label'] == label and g['name'] == 'getProgramInfoLog']
            inputs = [e for e in raw['events'] if e['label'] == label and command['start'] <= e['stamp'] <= first['end']]
            summary = next(s for s in case['summary'] if s['label'] == label)
            rows.append({
                'body': case['body'], 'label': label,
                'requestMs': command['end'] - command['start'],
                'firstPostCommitDrawMs': first['end'] - first['start'],
                'requestThroughFirstDrawMs': first['end'] - command['start'],
                'maxFrameMs': summary['maxFrame'], 'maxHeartbeatMs': summary['maxHeartbeat'],
                'oldSceneFramesWhilePending': summary['oldSceneFramesWhilePending'],
                'compileSyncMs': [c['syncEnd'] - c['start'] for c in preparations],
                'uniformCalls': summary['uniformFirstCalls'],
                'stagedGLPrograms': sorted(staged), 'stagedUsedByActualRender': sorted(staged & rendered),
                'stagedMissingFromRender': sorted(staged - rendered),
                'stagedInfoLogDuringDrawMs': sum(g['end'] - g['start'] for g in logs if g['glID'] in staged and g['inRender']),
                'otherInfoLogDuringDrawMs': sum(g['end'] - g['start'] for g in logs if g['glID'] not in staged and g['inRender']),
                'realInputsRequestedBeforeFirstDraw': len(inputs),
                'maxObservedInputProcessingDelayMs': max((e['t'] - e['stamp'] for e in inputs), default=None),
                'allInputsTrusted': all(e['trusted'] for e in inputs),
            })
    return {'build': report['build'], 'scope': report['scope'], 'rows': rows}


baseline, candidate = summarize(a.baseline), summarize(a.candidate)
result = {'baseline': baseline, 'candidate': candidate, 'limits': [
    'Timing instrumentation and headless development environment are identical; OS/GPU caches are not cleared.',
    'Task splitting does not make a single GL driver call interruptible; full request and final draw remain included.',
    'A few real clicks cannot prove a worst-case input bound. No ordinary-PC, long-running or user naturalness acceptance.',
]}
(out / 'report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
lines = ['# Main-program first-use preparation comparison', '',
         '| Body / command | Max frame old → new ms | Whole request + first draw old → new ms | First post-commit draw old → new ms |',
         '|---|---:|---:|---:|']
for before in baseline['rows']:
    after = next(r for r in candidate['rows'] if (r['body'], r['label']) == (before['body'], before['label']))
    lines.append(f"| {before['body']} / {before['label']} | {before['maxFrameMs']:.1f} → {after['maxFrameMs']:.1f} | {before['requestThroughFirstDrawMs']:.1f} → {after['requestThroughFirstDrawMs']:.1f} | {before['firstPostCommitDrawMs']:.1f} → {after['firstPostCommitDrawMs']:.1f} |")
lines += ['', *result['limits'], '', 'This generated table is measurement, not a pass. Inspect raw program identity, live-input traces, failure tests and visual checks separately.']
(out / 'RESULT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps({'out': str(out), 'baseline': baseline['build'], 'candidate': candidate['build']}))
