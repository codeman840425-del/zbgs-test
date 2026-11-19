"""Compare check-cold.cjs --published reports for the same original signed pair."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
from production_paths import main_checkout, project_output


def require(value, reason):
    if not value:
        raise ValueError(reason)


def read(path):
    data = path.read_bytes()
    return json.loads(data), sha256(data).hexdigest()


def counts(rows):
    return {field: sum(row[field] for row in rows)
            for field in ('requests', 'payloadBytes', 'cdpTransferBytes')}


def inspect_session(session, records):
    ids = [r['identity']['id'] for r in records]
    require(session['errors'] == session['unexpectedRequests'] == [] and
            session['batch'] == [[i, 'completed'] for i in ids], 'Incomplete or unexpected game load')
    actors = session['actors']
    require([a['id'] for a in actors] == ids, 'Actor selection changed')
    publication = session['publication']
    old = next(a for a in actors if a['id'] == publication['oldId'])
    fresh = next(a for a in actors if a is not old)
    require(old['recordSha256'] == publication['oldRecordSha256'] and
            fresh['bodyType'] == publication['bodyType'], 'Published actor or companion changed')

    # Each URL represents one observed stream even when both signed actors selected it.
    assets = {}
    def use(url, group, owner, digest=None, size=None):
        entry = assets.setdefault(url, {'group':group, 'owners':[], 'expected':digest, 'size':size})
        require((entry['group'], entry['expected'], entry['size']) == (group, digest, size),
                'Conflicting actor dependencies at ' + url)
        entry['owners'].append(owner)

    for actor, record in zip(actors, records):
        recipe = record['appearanceRecipe']
        require(actor['attached'] is True and actor['recordSha256'] == record['integrity']['recordSha256'] and
                actor['restored'] == recipe and actor['bodyType'] == recipe['base']['bodyType'] and
                actor['bodySha256'] == recipe['base']['sha256'], 'Wrong restored actor: ' + actor['id'])
        use(actor['bodyUrl'], 'body', actor['id'], actor['bodySha256'])
        outfit = recipe['equipment']
        require(actor['manifestUrl'] == outfit['manifestUrl'], 'Wrong equipment manifest')
        use(actor['manifestUrl'], 'equipmentManifest', actor['id'])
        selected = actor['selected']
        require(sorted(item['slot'] for item in selected) == ['bottom','shoes','top'] and
                sorted(item['id'] for item in selected) == sorted(actor['visible']), 'Missing worn item')
        by_slot = {item['slot']:item for item in outfit['resources'].values()}
        require(len(by_slot) == len(outfit['resources']) == 3, 'Unexpected signed equipment slots')
        for item in selected:
            signed = by_slot[item['slot']]
            require(all(signed[key] == item[key] for key in ('id','url','sha256','compatibleAvatarSha256'))
                    and item['compatibleAvatarSha256'] == actor['bodySha256'], 'Wrong garment or binding')
            use(item['url'], 'garment', actor['id'], item['sha256'], signed['bytes'])
    for field in ('root', 'skeletonHead'):
        require(all(a[field] for a in actors) and len({a[field] for a in actors}) == len(actors),
                'Actors must own different ' + field)
    motions = session['motions']
    require([m['id'] for m in motions] == ids, 'Missing actual gesture')
    for m in motions:
        require(m['gesture']['status'] == 'completed' and m['gesture']['error'] is None and
                m['drawFrames'] >= 10 and m['peakWristDisplacementM'] > .08 and m['maximumWeight'] > .95,
                'Gesture did not complete: ' + m['id'])
    require(len({m['gesture']['sha256'] for m in motions}) == 1, 'Motion assets differ between actors')
    gesture_sha = motions[0]['gesture']['sha256']

    survivor = session.get('oldSurvivor')
    if session['phase'] == 'first':
        require(survivor['id'] == old['id'] and survivor['root'] == old['root'] and
                survivor['recordSha256'] == old['recordSha256'] and survivor['renderedFrames'] > 0,
                'Companion did not survive disposal')
        reselected = session['reselected']
        require([(a['id'], a['recordSha256']) for a in reselected] ==
                [(a['id'], a['recordSha256']) for a in actors] and
                len({a['root'] for a in actors + reselected}) == 4, 'Group did not respawn independently')

    streams = {}
    for response in session['responses']:
        url, attempts = response['url'], response['transfer']
        require(url not in streams and len(attempts) > 0, 'Missing or repeated response row: ' + url)
        first = attempts[0]
        digest, size = first['sha256'], first['bytes']
        require(re.fullmatch('[a-f0-9]{64}', digest) and type(size) is int and size > 0 and
                all(a['status'] == 200 and a['sha256'] == digest and a['bytes'] == size and
                    type(a['transferBytes']) is int and a['transferBytes'] >= size for a in attempts),
                'Invalid or unequal measured response: ' + url)
        source = assets.get(url)
        if source:
            require(source['expected'] in (digest, None) and source['size'] in (size, None), 'Wrong bytes: ' + url)
        group = source['group'] if source else ('gesture' if digest == gesture_sha else 'publication')
        streams[url] = {'group':group, 'owners':source['owners'] if source else [], 'sha256':digest,
                        'bytesPerResponse':size, 'requests':len(attempts), 'payloadBytes':size * len(attempts),
                        'cdpTransferBytes':sum(a['transferBytes'] for a in attempts)}
    require(set(assets).union(publication['urls']) <= streams.keys() and
            any(s['group'] == 'gesture' for s in streams.values()), 'Missing measured dependency')
    require(streams['/character-data/' + fresh['bodyType'] + '/index.json']['sha256'] == publication['indexSha256'],
            'Published data index differs')
    return {'phase':session['phase'], 'browser':session['browser'], 'streams':streams,
            'motions':[{k:m[k] for k in ('id','drawFrames','maximumWeight','peakWristDisplacementM')}
                       for m in motions], 'gestureSha256':gesture_sha,
            'companionSurvivedFrames':survivor['renderedFrames'] if survivor else None}


def same_inputs(left, right):
    require((left['browser'], left['gestureSha256']) == (right['browser'], right['gestureSha256']),
            'Browser or gesture changed')
    def pins(session):
        return {url: tuple(row[k] for k in ('sha256','bytesPerResponse','group','owners'))
                for url, row in session['streams'].items()}
    require(pins(left) == pins(right), 'Observed URL, content, selection or signed record bytes changed')


def inspect_report(path, records):
    report, digest = read(path)
    require(report['status'] == 'technical-pass' and [s['phase'] for s in report['sessions']] == ['first','cold'],
            'Expected two completed independent browser launches')
    left, right = report['sessions']
    for field in ('root','skeletonHead'):
        require(len({a[field] for s in (left, right) for a in s['actors']}) == 4,
                'Actor instances reused across launches')
    sessions = [inspect_session(s, records) for s in (left,right)]
    same_inputs(*sessions)
    return {'reportSha256':digest, 'runtime':report['runtime'], 'manifestSha256':report['manifestSha'],
            'sessions':sessions}


def differences(before, after):
    require(before['reportSha256'] != after['reportSha256'] and before['runtime']['sourceDigest'] != after['runtime']['sourceDigest'],
            'Expected independent reports from different fixed builds')
    require(before['runtime']['entryUrl'] == after['runtime']['entryUrl'], 'Different game entry')
    output = []
    for left, right in zip(before['sessions'], after['sessions']):
        same_inputs(left, right)
        rows = {}
        for url, original in left['streams'].items():
            current = right['streams'][url]
            rows[url] = {'group':current['group'], **{key:original[key] - current[key]
                         for key in ('requests','payloadBytes','cdpTransferBytes')}}
        output.append({'phase':left['phase'], 'savedByUrl':rows,
                       'savedBodyAndGarments':counts([r for r in rows.values() if r['group'] in ('body','garment')]),
                       'savedEquipmentManifests':counts([r for r in rows.values() if r['group'] == 'equipmentManifest']),
                       'savedAcrossAllReportedUrls':counts(rows.values())})
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('before','records','out','after'):
        parser.add_argument('--'+key, type=Path, required=key != 'after')
    args = parser.parse_args()
    root = main_checkout(__file__)
    target = root / args.out
    out = project_output(target, __file__)
    require(target == out and '..' not in target.parts and out.suffix == '.json' and
            (root / 'evidence/m2-frozen-rule-byte-reuse-v1') in out.parents, 'Choose a new comparison evidence JSON')
    records, pin = read(args.records)
    require(len(records) == 2 and len({r['identity']['id'] for r in records}) == 2, 'Expected two signed identities')
    before = inspect_report(args.before, records)
    result = {'schema':'published-rule-cold-transfers-v1', 'phaseScope':
              'Fresh browser navigation through both gestures, before actor removal or manual reselection. Each URL counted once per response. Only observed report URLs included.',
              'recordsFileSha256':pin, 'actors':[{ 'id':r['identity']['id'], 'recordSha256':r['integrity']['recordSha256']}
                                                for r in records], 'before':before}
    if args.after:
        after = inspect_report(args.after, records)
        result.update(after=after, savings=differences(before,after))
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('x', encoding='utf-8', newline='\n') as file:
        file.write(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(out)


if __name__ == '__main__':
    main()
