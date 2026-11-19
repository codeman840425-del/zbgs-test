"""Check the future publication with the real handler on a temporary port."""
from contextlib import contextmanager
import hashlib
from html.parser import HTMLParser
import http.client
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.parse import urljoin


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/production'))
from production_paths import project_output


def sha256(data):
    return hashlib.sha256(data).hexdigest()


@contextmanager
def serve(make_server, config):
    with make_server(config, verification=True) as server:
        assert server.server_address[0] == '127.0.0.1'
        assert server.server_port not in (4174, 4196)
        thread = Thread(target=server.serve_forever, kwargs={'poll_interval': .05}, daemon=True)
        thread.start()
        try:
            yield server.server_port
        finally:
            server.shutdown()
            thread.join()


def request(port, path, method='GET'):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    try:
        connection.request(method, path)
        response = connection.getresponse()
        metadata = {key: response.getheader(header) for key, header in
                    (('build', 'X-ZBGS-Candidate'), ('contentType', 'Content-Type'),
                     ('bytes', 'Content-Length'), ('location', 'Location'), ('cacheControl', 'Cache-Control'))}
        return {'status': response.status, **metadata}, response.read()
    finally:
        connection.close()


class Gallery(HTMLParser):
    def __init__(self):
        super().__init__()
        self.media = []
        self.links = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'video':
            self.media.append(attrs['src'])
        elif tag == 'a':
            self.links.append(attrs['href'])


def old_routes(module):
    routes = set(module['SHARED_LOOK_FILES']) | set(module['NORMAL_MEDIA'])
    for prefix, members in (
        ('CREW_PREFIX', 'CREW_FILES'), ('RAW_OUTFIT_REVIEW', 'RAW_OUTFIT_FILES'),
        ('RELEASE_REVIEW', 'RELEASE_FILES'), ('UNIFORM_REVIEW', 'UNIFORM_FILES'),
    ):
        routes.add(module[prefix])
        routes.update(module[prefix] + name for name in module[members])
    for prefix, members in {
        'cc0-body-texture': ('', 'index.html', 'room-produced-1x.webm', 'room/room-produced-1x.webm',
                             'room-original/room-produced-1x.webm'),
        'native-hair-motion': ('', 'room.webm', 'roundness.json', 'cheek.json', 'before-trial.mp4'),
        'native-surfaces': ('neutral.png', 'mouth.png', 'back.png', 'room.png', 'half-light-diagnostic.png', 'speech-1x.webm'),
        'native-iris-batch': ('original.png', 'green.png', 'green.json', 'green-speech-1x.webm'),
        'native-skin-tone': ('original-dressed.png', 'warm-dressed.png', 'warm-speech-1x.webm', 'warm.json'),
        'native-lip-color': ('warm-lip-speech-1x.webm', 'warm-lip-open.png', 'original-plain-left-lip-right-open.png',
                             'warm-plain-left-lip-right-open.png'),
    }.items():
        base = f'/reviews/{prefix}/'
        routes.add(base)
        if prefix in ('cc0-body-texture', 'native-hair-motion'):
            routes.update(base + name for name in members)
        else:
            routes.add(base + 'index.html')
            routes.update(f'{base}{body}/{name}' for body in
                          ('native-contour-roundness-a-v1', 'native-contour-cheek-b-v1') for name in members)
    routes.add('/reviews/m2-uniform-agent-handoff-v1/game/produced-pair-1x.webm')
    return sorted(routes)


def junction_denial(make_server, config, gallery_prefix):
    if sys.platform != 'win32':
        return None
    scratch = project_output(Path(__file__).resolve().parent, __file__)
    with TemporaryDirectory(prefix='gallery-junction-', dir=scratch) as fixture:
        gallery, unlisted = Path(fixture) / 'gallery', Path(fixture) / 'unlisted'
        gallery.mkdir()
        unlisted.mkdir()
        (unlisted / 'preview-1x.webm').write_bytes(b'junction negative control')
        junction = gallery / 'workbench-01'
        subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(junction), str(unlisted)],
                       check=True, capture_output=True)
        state = make_server.__globals__
        original = state['PAIRED_EAR_EVIDENCE']
        try:
            assert junction.is_junction() and junction.resolve() == unlisted
            state['PAIRED_EAR_EVIDENCE'] = gallery
            with serve(make_server, config) as port:
                row, _ = request(port, gallery_prefix + 'workbench-01/preview-1x.webm')
                assert row['status'] == 404
                return row['status']
        finally:
            state['PAIRED_EAR_EVIDENCE'] = original
            junction.rmdir()


def verify():
    publication_path = ROOT / 'scripts/serve-appearance-workbench.py'
    module = runpy.run_path(str(publication_path))
    make_server = module['make_server']
    pointer = (ROOT / 'delivery/appearance-workbench.json').read_bytes()
    current = json.loads(pointer)
    archived = (ROOT / current['rollbackPointer']).read_bytes()
    assert sha256(archived) == 'ab984702f10f78d3322e84ca5a4e3abbfcfb694c2a0d9db50c53f26175468a10'
    old = json.loads(archived)
    assert current['previousWorkbench'] == old['build'] == 'f4966554bcfc'
    assert current['build'] == '3c15a020d62a' and current['port'] == old['port'] == 4196
    routes = old_routes(module)
    gallery_prefix = '/reviews/paired-ear-style/'
    expected_files = ['index.html', 'README.md', 'workbench-01/preview-1x.webm', 'cold-01/reopened-1x.webm',
                      'cold-01/cold-1x.webm', 'workbench-01/female-side.png', 'workbench-01/male-side.png']
    with serve(make_server, old) as port:
        before = {url:request(port, url, 'HEAD')[0] for url in routes}
        assert request(port, gallery_prefix)[0]['status'] == 404

    negatives = [gallery_prefix + child for child in ('signed.json', 'workbench-01/report.json', 'workbench-01/',
                  'next-start/report.json', 'index.html/', '%69ndex.html', '../../build-info.json',
                  '%2e%2e/%2e%2e/build-info.json')]
    negatives += [gallery_prefix.rstrip('/'), '/reviews//paired-ear-style/../../build-info.json',
                  '/reviews/%70aired-ear-style/../../build-info.json',
                  '/assets/../reviews/paired-ear-style/../../build-info.json',
                  '/assets/../reviews/paired-ear-style/index.html',
                  '/reviews%5cpaired-ear-style%5cindex.html']
    with serve(make_server, current) as port:
        root, _ = request(port, '/')
        assert root['status'] == 302 and root['location'] == '/?workbench=appearance'
        redirect, _ = request(port, '/index.html?body=male')
        assert redirect['status'] == 302 and redirect['location'] == '/?body=male&workbench=appearance'
        page, html = request(port, current['entry'])
        assert page['status'] == 200 and b'id="appearance-workbench"' in html
        identity, build_data = request(port, '/build-info.json')
        assert identity['status'] == 200 and json.loads(build_data)['sourceDigest'] == current['sourceDigest']
        assert all(row['build'] == current['build'] and row['cacheControl'] == 'no-store' for row in
                   (root, redirect, page, identity))
        after = {url:request(port, url, 'HEAD')[0] for url in routes}
        for url, metadata in before.items():
            assert metadata['build'] == old['build']
            assert after[url] == {**metadata, 'build':current['build']}, url

        gallery, index = request(port, gallery_prefix)
        assert gallery['status'] == 200 and gallery['build'] == current['build']
        parser = Gallery()
        parser.feed(index.decode())
        assert len(parser.media) == 2 and len(parser.links) == 4
        assert set(parser.media + parser.links) == set(expected_files) - {'index.html'}
        files = {}
        for file in expected_files:
            url = urljoin(gallery_prefix, file)
            metadata, data = request(port, url)
            assert metadata['status'] == 200 and metadata['build'] == current['build'], url
            assert data == (ROOT / current['evidence'] / file).read_bytes()
            assert int(metadata['bytes']) == len(data)
            if file.endswith('.webm'):
                assert metadata['contentType'] == 'video/webm'
            files[url] = {'bytes':len(data), 'sha256':sha256(data), 'contentType':metadata['contentType']}
        denials = {url:request(port, url)[0]['status'] for url in negatives}
        assert all(status == 404 for status in denials.values()), denials
        assert request(port, gallery_prefix + 'signed.json', 'HEAD')[0]['status'] == 404

    with serve(make_server, {**current, 'pairedEarStyleReview':False}) as port:
        disabled = request(port, gallery_prefix)[0]['status']
        assert disabled == 404

    dist = ROOT / current['directory']
    frontend = [dist / 'index.html', *(dist / 'assets').glob('*.js')]
    direct_ui_link = any(gallery_prefix.encode() in file.read_bytes() or b'm2-paired-ear-game-v1' in file.read_bytes()
                         for file in frontend)
    assert not direct_ui_link
    return {'status':'passed', 'mode':'verification-only-loopback-ephemeral', 'build':current['build'],
            'sourceDigest':current['sourceDigest'], 'pointerSha256':sha256(pointer),
            'archiveSha256':sha256(archived), 'serverSha256':sha256(publication_path.read_bytes()),
            'root':root, 'redirectWithBody':redirect, 'entry':page, 'fixedBuildInfo':identity,
            'oldMediaRoutesCompared':len(routes),
            'oldMediaExisting404': [url for url, row in before.items() if row['status'] == 404],
            'earGallery':gallery, 'earGalleryFiles':files, 'earGalleryDenials':denials, 'earGalleryDisabled':disabled,
            'earGalleryJunctionStatus':junction_denial(make_server, current, gallery_prefix),
            'directWorkbenchGalleryLink':direct_ui_link, 'publicPortsAccessed':[], 'browserUsed':False}


if __name__ == '__main__':
    output = project_output(Path(sys.argv[1]), __file__)
    assert output.parent == Path(__file__).resolve().parent and not output.exists()
    result = verify()
    with output.open('x', encoding='utf-8') as receipt:
        json.dump(result, receipt, ensure_ascii=False, indent=2)
        receipt.write('\n')
    print(json.dumps({'status':result['status'], 'mediaRoutes':result['oldMediaRoutesCompared'], 'output':str(output)}))
