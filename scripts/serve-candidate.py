"""Serve the pinned candidate, refusing a missing or mismatched build.

Run from any directory: python scripts/serve-candidate.py
Rebuild an absent candidate using the recorded commit and the same output path.
This does not build, alter assets, kill services, or promote a candidate.
"""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def candidate_directory():
    config = json.loads((ROOT / 'delivery/candidate.json').read_text(encoding='utf-8'))
    if config.get('schema') != 'zbgs-fixed-demo-pointer-v1':
        raise ValueError('Unknown candidate pointer schema')
    folder = (ROOT / config['directory']).resolve()
    if not folder.is_relative_to(ROOT):
        raise ValueError('Candidate must stay inside this checkout')
    identity = json.loads((folder / 'build-info.json').read_text(encoding='utf-8'))
    if identity.get('shortId') != config['build'] or identity.get('sourceDigest') != config['sourceDigest']:
        raise ValueError('Fixed build identity mismatch; refusing to serve')
    return folder, config


if __name__ == '__main__':
    folder, config = candidate_directory()
    class Handler(SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-ZBGS-Candidate', config['build'])
            super().end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', config['port']), partial(Handler, directory=str(folder)))
    print(f"Candidate {config['build']}: http://127.0.0.1:{config['port']}/", flush=True)
    server.serve_forever()
