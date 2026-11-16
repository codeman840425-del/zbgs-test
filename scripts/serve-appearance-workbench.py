"""Serve the independent appearance candidate; preserve the accepted M1 entry."""
import json
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qsl, urlencode

ROOT = Path(__file__).resolve().parents[1]

if __name__ == '__main__':
    config = json.loads((ROOT / 'delivery/appearance-workbench.json').read_text(encoding='utf-8'))
    if config['port'] != 4196:
        raise ValueError('The character workbench uses the fixed user entry 4196')
    folder = (ROOT / config['directory']).resolve()
    if not folder.is_relative_to(ROOT):
        raise ValueError('Candidate path must be inside checkout')
    identity = json.loads((folder / 'build-info.json').read_text(encoding='utf-8'))
    if identity['sourceDigest'] != config['sourceDigest'] or identity['shortId'] != config['build']:
        raise ValueError('Build identity mismatch; rebuild the recorded source first')

    class Handler(SimpleHTTPRequestHandler):
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

    print(f"Appearance {config['build']}: http://127.0.0.1:{config['port']}/?workbench=appearance", flush=True)
    ThreadingHTTPServer(('127.0.0.1', config['port']), partial(Handler, directory=str(folder))).serve_forever()
