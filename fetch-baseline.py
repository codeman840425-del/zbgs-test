import concurrent.futures, hashlib, json, pathlib, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent
COMMIT = '92c1ee2b666288526e4ca974187f8b4fc5efb376'
tree = json.loads((ROOT / 'upstream-tree.json').read_text(encoding='utf-8-sig'))
items = [x for x in tree if x.get('size') is not None and (x['path'].startswith('packs/present_motion_v1_1111_MT/') or x['path'].startswith('status/'))]
def fetch(x):
    path = ROOT / 'baseline' / x['path']
    path.parent.mkdir(parents=True, exist_ok=True)
    data = urllib.request.urlopen(f'https://raw.githubusercontent.com/codeman840425-del/zbgs-test/{COMMIT}/{x["path"]}', timeout=90).read()
    path.write_bytes(data)
    return {'path':x['path'], 'bytes':len(data), 'sha256':hashlib.sha256(data).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    files = list(pool.map(fetch, items))
(ROOT / 'baseline' / 'manifest.json').write_text(json.dumps({'commit':COMMIT,'files':files}, indent=2), encoding='utf-8')
print(f'Downloaded {len(files)} files')
