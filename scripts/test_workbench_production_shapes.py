"""Exercise the real 4196 HTTP handler without opening a listener or browser."""
from email.parser import BytesHeaderParser
from html.parser import HTMLParser
from importlib import util
from io import BytesIO
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.parse import urljoin

sys.dont_write_bytecode = True
spec = util.spec_from_file_location('workbench', Path(__file__).with_name('serve-appearance-workbench.py'))
workbench = util.module_from_spec(spec)
spec.loader.exec_module(workbench)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.videos = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'video':
            self.videos.append(dict(attrs)['src'])
        if tag == 'a':
            self.links.append(dict(attrs)['href'])


def handler(config):
    with patch.object(workbench, 'ThreadingHTTPServer', side_effect=lambda address, factory: factory):
        return workbench.make_server(config)


def request(factory, url, method='GET'):
    sent = bytearray()

    class Connection:
        def makefile(self, *args):
            return BytesIO(f'{method} {url} HTTP/1.0\r\nHost: localhost\r\n\r\n'.encode())

        def sendall(self, data):
            sent.extend(data)

    factory(Connection(), ('127.0.0.1', 0), None)
    headers, body = bytes(sent).split(b'\r\n\r\n', 1)
    status, rest = headers.split(b'\r\n', 1)
    return int(status.split()[1]), BytesHeaderParser().parsebytes(rest), body


class ProductionShapePages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # A tracked fixed build can exercise the handler in a clean checkout.
        folder = 'evidence/66a09d34d8fe'
        build = json.loads((workbench.ROOT / folder / 'build-info.json').read_bytes())
        cls.config = dict(port=4196, directory=folder, build=build['shortId'], sourceDigest=build['sourceDigest'],
                          evidence=folder, ruleBodyReview=True)

    def test_new_and_archived_links_return_original_media(self):
        serve = handler(self.config)
        root = workbench.RULE_REVIEW
        batch = workbench.ROOT / 'evidence/m2-rule-batch-delivery-v1'
        archive = workbench.ROOT / 'evidence/m2-first-rule-delivery-v1'
        for page, folder, prefix, files in [
            (root, batch, 'batch/', ['cold/dual-external-cold-1x.webm', 'seat/room-1x.webm']),
            (root+'index.html', archive, '', ['game/ordinary-cold-02/two-rule-bodies-1x.webm',
              'game/room-0625-01/room-produced-1x.webm', 'game/room-0375-01/room-produced-1x.webm']),
        ]:
            status, headers, data = request(serve, page)
            self.assertEqual((status, headers['X-ZBGS-Candidate']), (200, self.config['build']))
            self.assertEqual(data, (folder/'index.html').read_bytes())
            parser = Links()
            parser.feed(data.decode())
            self.assertEqual(parser.videos, [prefix+name for name in files])
            if folder == batch:
                self.assertIn('index.html', parser.links)
            for src, name in zip(parser.videos, files):
                status, headers, data = request(serve, urljoin(page, src))
                self.assertEqual((status, headers['Content-Type']), (200, 'video/webm'))
                self.assertEqual(data, (folder/name).read_bytes())

    def test_disabled_review_aliases_and_unlisted_evidence_are_rejected(self):
        root = workbench.RULE_REVIEW
        serve = handler(self.config)
        for url in [root+'batch/', root+'batch/cold/report.json', root+'batch/seat/seated-1.png',
                    root+'../build-info.json', root+'batch/%63old/dual-external-cold-1x.webm',
                    '/Reviews/Production-Shapes/index.html', root+'index.html/']:
            self.assertEqual(request(serve, url)[0], 404, url)
        disabled = handler({**self.config, 'ruleBodyReview':False})
        for url in workbench.RULE_MEDIA:
            self.assertEqual(request(disabled, url, 'HEAD')[0], 404, url)


if __name__ == '__main__':
    unittest.main()
