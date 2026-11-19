"""Serve the independent appearance candidate; preserve the accepted M1 entry."""
import json
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qsl, unquote, urlencode

ROOT = Path(__file__).resolve().parents[1]
RULE_REVIEW = '/reviews/production-shapes/'
RULE_MEDIA = {
    RULE_REVIEW: ROOT / 'evidence/m2-rule-batch-delivery-v1/index.html',
    **{RULE_REVIEW + 'batch/' + name: ROOT / 'evidence/m2-rule-batch-delivery-v1' / name for name in (
        'cold/dual-external-cold-1x.webm', 'seat/room-1x.webm',
    )},
    **{RULE_REVIEW + name: ROOT / 'evidence/m2-first-rule-delivery-v1' / name for name in (
        'index.html', 'game/ordinary-cold-02/two-rule-bodies-1x.webm',
        'game/room-0625-01/room-produced-1x.webm', 'game/room-0375-01/room-produced-1x.webm',
    )},
}
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
PAIRED_EAR_PREFIX = '/reviews/paired-ear-style/'
PAIRED_EAR_FILES = {
    PAIRED_EAR_PREFIX: 'index.html',
    **{PAIRED_EAR_PREFIX + file: file for file in (
        'index.html', 'README.md',
        'workbench-01/preview-1x.webm', 'cold-01/reopened-1x.webm', 'cold-01/cold-1x.webm',
        'workbench-01/female-side.png', 'workbench-01/male-side.png',
    )},
}
PAIRED_EAR_EVIDENCE = ROOT / 'evidence/m2-paired-ear-game-v1'
NORMAL_REVIEW = '/reviews/native-body-cost/'
RAW_OUTFIT_REVIEW = '/reviews/raw-source-outfit/'
RAW_OUTFIT_FILES = {'index.html', 'room-1x/room-produced-1x.webm', 'posed-check/seated.png'}
RELEASE_REVIEW = '/reviews/source-outfit-release/'
UNIFORM_REVIEW = '/reviews/uniform-texture/'
UNIFORM_FILES = {'index.html', *(
    f'room/{gender}-{pose}-{view}-near-left-far-right.png'
    for gender in ('male', 'female') for pose in ('standing', 'seated') for view in ('front', 'room')
), *(
    f'film-{gender}-{tier}/room-produced-1x.webm'
    for gender in ('female', 'male') for tier in ('near', 'far')
)}
RELEASE_FILES = {'index.html', 'room-fixed/room-produced-1x.webm', 'room-original-fixed/room-produced-1x.webm',
                 'comparison-v2/report.json',
                 'comparison-v2/standing-dressed-front-figure-source-left-release-right.png',
                 'comparison-v2/seated-dressed-side-figure-source-left-release-right.png'}
NORMAL_MEDIA = {
    **{'/reviews/m2-native-mesh-room-v1/' + f: 'm2-native-mesh-room-v1/' + f for f in (
        'index.html', 'pixel-boundaries/speech-1x.webm', 'pixel-boundaries/open-mouth.png',
        'pixel-boundaries/report.json', 'texture-export/report.json')},
    NORMAL_REVIEW: 'm2-native-body-cost-v1/index.html',
    **{NORMAL_REVIEW + f: 'm2-native-body-cost-v1/' + f for f in (
        'index.html', 'room/room-produced-1x.webm', 'game/produced-pair-1x.webm',
        'old/0-face-1.png', 'new/0-face-1.png', 'comparison.json')},
    '/reviews/m2-native-short-socks-room-v1/room/room-produced-1x.webm':
        'm2-native-short-socks-room-v1/room/room-produced-1x.webm',
}

def is_review_path(name, directory, *, ignore_case=False):
    parts = []
    decoded = unquote(name).replace('\\', '/')
    for part in (decoded.casefold() if ignore_case else decoded).split('/'):
        if part == '..':
            del parts[-1:]
        elif part not in ('', '.'):
            parts.append(part)
            if parts == ['reviews', directory]:
                return True
    return False


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
            if is_review_path(name, 'production-shapes', ignore_case=True):
                file = RULE_MEDIA.get(name)
                if (config.get('ruleBodyReview') is not True or file is None or
                        file.resolve() != file or not file.is_file()):
                    self.send_error(404)
                    return None
            if is_review_path(name, 'paired-ear-style'):
                member = PAIRED_EAR_FILES.get(name)
                file = PAIRED_EAR_EVIDENCE / member if member is not None else None
                if (config.get('pairedEarStyleReview') is not True or file is None or
                        not file.is_file() or file.resolve() != file):
                    self.send_error(404)
                    return None
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
            if config.get('ruleBodyReview') and name in RULE_MEDIA:
                return str(RULE_MEDIA[name])
            if config.get('pairedEarStyleReview') is True and name in PAIRED_EAR_FILES:
                return str(PAIRED_EAR_EVIDENCE / PAIRED_EAR_FILES[name])
            if config.get('cc0BodyTextureReview') and name.startswith('/reviews/cc0-body-texture/'):
                member = name.removeprefix('/reviews/cc0-body-texture/')
                recording = 'room-produced-1x.webm'
                if member in ('', 'index.html', recording, 'room/' + recording, 'room-original/' + recording):
                    file = member or 'index.html'
                    if file == recording:
                        file = 'room/' + recording
                    return str(ROOT / 'evidence/m2-cc0-body-release-game-v1' / file)
            personal_look_film = 'm2-uniform-agent-handoff-v1/game/produced-pair-1x.webm'
            if config.get('uniformTextureReview') and name == '/reviews/' + personal_look_film:
                return str(ROOT / 'evidence' / personal_look_film)
            if config.get('uniformTextureReview') and name.startswith(UNIFORM_REVIEW):
                member = name[len(UNIFORM_REVIEW):] or 'index.html'
                if member in UNIFORM_FILES:
                    return str(ROOT / 'evidence/m2-garment-texture-game-v1' / member)
            if config.get('sourceOutfitReleaseReview') and name.startswith(RELEASE_REVIEW):
                member = name[len(RELEASE_REVIEW):] or 'index.html'
                if member in RELEASE_FILES:
                    return str(ROOT / 'evidence/m2-source-outfit-release-v1' / member)
            if config.get('rawSourceOutfitReview') and name.startswith(RAW_OUTFIT_REVIEW):
                member = name[len(RAW_OUTFIT_REVIEW):] or 'index.html'
                if member in RAW_OUTFIT_FILES:
                    return str(ROOT / 'evidence/m2-raw-male-equipment-v1' / member)
            if config.get('nativeNormalReview') and name in NORMAL_MEDIA:
                return str(ROOT / 'evidence' / NORMAL_MEDIA[name])
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
