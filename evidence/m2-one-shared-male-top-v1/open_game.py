"""Open the packaged two-character game on a temporary loopback port."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from hashlib import sha256
from pathlib import Path
import sys
import webbrowser


if __name__ == '__main__':
    game = Path(__file__).resolve().parent / 'game'
    manifest = game / 'facility-package.json'
    if not manifest.is_file():
        sys.exit('Extract the delivery ZIP before opening the game.')
    handler = partial(SimpleHTTPRequestHandler, directory=str(game))
    # Same game release, same localStorage origin on the next manual launch.
    # The listener only exists while this console is open.
    port = 49152 + int(sha256(manifest.read_bytes()).hexdigest()[:4], 16) % 16384
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), handler)
    except OSError as error:
        sys.exit(f'Cannot open this delivery at 127.0.0.1:{port}. Close its previous instance and try again. {error}')
    with server:
        url = f'http://127.0.0.1:{server.server_port}/facility-room.html?room=plant-home'
        print(url, flush=True)
        webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
