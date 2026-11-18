"""Serve the independent appearance candidate; preserve the accepted M1 entry."""
import json
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qsl, urlencode

ROOT = Path(__file__).resolve().parents[1]
SHARED_LOOK_PREFIX = '/reviews/shared-looks/'
SHARED_LOOK_FILES = {
    SHARED_LOOK_PREFIX: 'index.html',
    **{SHARED_LOOK_PREFIX + file: file for file in (
        'index.html',
        'game/produced-pair-1x.webm',
        'room-pants-socks-female/room-produced-1x.webm',
        'room-pants-socks-male/room-produced-1x.webm',
    )},
}
CREW_PREFIX = '/reviews/native-crew/'
CREW_FILES = {'index.html', 'close/original.png', 'close/socks.png',
              'room/room-produced.png', 'room/room-produced-1x.webm',
              'game-restore/produced-pair.png', 'game-restore/produced-pair-1x.webm'}

def make_server(config, *, verification=False):
    if config['port'] != 4196:
        raise ValueError('The character workbench uses the fixed user entry 4196')
    folder = (ROOT / config['directory']).resolve()
    if not folder.is_relative_to(ROOT):
        raise ValueError('Candidate path must be inside checkout')
    identity = json.loads((folder / 'build-info.json').read_text(encoding='utf-8'))
    if identity['sourceDigest'] != config['sourceDigest'] or identity['shortId'] != config['build']:
        raise ValueError('Build identity mismatch; rebuild the recorded source first')

    class Handler(SimpleHTTPRequestHandler):
        def send_head(self):
            name = urlsplit(self.path).path
            if name == CREW_PREFIX.rstrip('/') or name.startswith(CREW_PREFIX):
                member = name[len(CREW_PREFIX):] or 'index.html'
                if not config.get('nativeCrewReview') or not name.startswith(CREW_PREFIX) or member not in CREW_FILES:
                    self.send_error(404)
                    return None
            if name == SHARED_LOOK_PREFIX.rstrip('/') or name.startswith(SHARED_LOOK_PREFIX):
                if not config.get('sharedLookReview') or name not in SHARED_LOOK_FILES:
                    self.send_error(404)
                    return None
            return super().send_head()

        def translate_path(self, path):
            # Review recordings stay outside the game build and its download budget.
            name = urlsplit(path).path
            if config.get('nativeCrewReview') and name.startswith(CREW_PREFIX):
                member = name[len(CREW_PREFIX):] or 'index.html'
                if member in CREW_FILES:
                    return str(ROOT / 'evidence/m2-native-short-socks-room-v1' / member)
            if name in SHARED_LOOK_FILES and config.get('sharedLookReview'):
                return str(ROOT / 'evidence/m2-shared-look-batch-v2' / SHARED_LOOK_FILES[name])
            review = '/reviews/native-hair-motion/'
            if config['evidence'] == 'evidence/m2-native-hair-record-v1' or config.get('nativeHairRecordReview'):
                current_files = {
                    review: 'index.html',
                    review + 'room.webm': 'room/room-produced-1x.webm',
                    review + 'roundness.json': 'contour-roundness-a.json',
                    review + 'cheek.json': 'contour-cheek-b.json',
                }
                if name in current_files:
                    return str(ROOT / 'evidence/m2-native-hair-record-v1' / current_files[name])
            surface = '/reviews/native-surfaces/'
            if config.get('nativeSurfaceReview') and name.startswith(surface):
                file = name[len(surface):] or 'index.html'
                bodies = ('native-contour-roundness-a-v1', 'native-contour-cheek-b-v1')
                media = ('neutral.png', 'mouth.png', 'back.png', 'room.png', 'half-light-diagnostic.png', 'speech-1x.webm')
                if file == 'index.html' or any(file == body + '/' + asset for body in bodies for asset in media):
                    return str(ROOT / 'evidence/m2-native-surface-room-v1' / file)
            iris = '/reviews/native-iris-batch/'
            if config.get('nativeIrisReview') and name.startswith(iris):
                file = name[len(iris):] or 'index.html'
                bodies = ('native-contour-roundness-a-v1', 'native-contour-cheek-b-v1')
                media = ('original.png', 'green.png', 'green.json', 'green-speech-1x.webm')
                if file == 'index.html' or any(file == body + '/' + asset for body in bodies for asset in media):
                    return str(ROOT / 'evidence/m2-native-batch-iris-room-v2' / file)
            skin = '/reviews/native-skin-tone/'
            if config.get('nativeSkinToneReview') and name.startswith(skin):
                file = name[len(skin):] or 'index.html'
                bodies = ('native-contour-roundness-a-v1', 'native-contour-cheek-b-v1')
                media = ('original-dressed.png', 'warm-dressed.png', 'warm-speech-1x.webm', 'warm.json')
                if file == 'index.html' or any(file == body + '/' + asset for body in bodies for asset in media):
                    return str(ROOT / 'evidence/m2-native-skin-room-v1' / file)
            lip = '/reviews/native-lip-color/'
            if config.get('nativeLipReview') and name.startswith(lip):
                file = name[len(lip):] or 'index.html'
                bodies = ('native-contour-roundness-a-v1', 'native-contour-cheek-b-v1')
                media = ('warm-lip-speech-1x.webm', 'warm-lip-open.png',
                         'original-plain-left-lip-right-open.png', 'warm-plain-left-lip-right-open.png')
                if file == 'index.html' or any(file == body + '/' + asset for body in bodies for asset in media):
                    return str(ROOT / 'evidence/m2-native-lip-room-v4' / file)
            files = {
                review: 'index.html',
                review + 'before-trial.mp4': 'before-trial.mp4',
                review + 'room.webm': 'room/room-produced-1x.webm',
            }
            if name in files:
                return str(ROOT / 'evidence/m2-native-hair-fit-preview-v1' / files[name])
            return super().translate_path(path)

        def do_GET(self):
            request = urlsplit(self.path)
            query = parse_qsl(request.query, keep_blank_values=True)
            if request.path in ('/', '/index.html') and not any(k == 'workbench' for k, _ in query):
                query.append(('workbench', 'appearance'))
                self.send_response(302)
                self.send_header('Location', '/?' + urlencode(query))
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            super().do_GET()

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-ZBGS-Candidate', config['build'])
            super().end_headers()

        def log_message(self, *args):
            pass

    return ThreadingHTTPServer(('127.0.0.1', 0 if verification else config['port']),
                               partial(Handler, directory=str(folder)))


if __name__ == '__main__':
    config = json.loads((ROOT / 'delivery/appearance-workbench.json').read_text(encoding='utf-8'))
    with make_server(config) as server:
        print(f"Appearance {config['build']}: http://127.0.0.1:{server.server_port}/?workbench=appearance", flush=True)
        server.serve_forever()
