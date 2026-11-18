import json
import tempfile
import unittest
from pathlib import Path

from native_release_manifest import build


ROOT = Path(__file__).resolve().parents[2]
SIDECAR = ROOT / 'assets-source/m2-ktx-pilot-v1/native-facecontour-sidecar-v1/manifest.json'
PACKAGES = ROOT / 'assets-source/native-parameter-game-packages-v1'


class NativeReleaseManifestTests(unittest.TestCase):
    def test_build_binds_two_sources_and_fallbacks(self):
        result = build(SIDECAR, PACKAGES)
        self.assertEqual(result['schema'], 'native-release-sidecar-manifest-v1')
        self.assertFalse(result['runtimeAdmission'])
        self.assertEqual(len(result['entries']), 2)
        for entry in result['entries']:
            self.assertEqual(entry['admission'], 'candidate-only')
            self.assertEqual(len(entry['sourceModelSha256']), 64)
            self.assertEqual(len(entry['derivedTextureSha256']), 64)
            self.assertEqual(len(entry['fallbackPngSha256']), 64)

    def test_changed_sidecar_identity_is_rejected(self):
        source = json.loads(SIDECAR.read_text(encoding='utf8'))
        source['samples'][0]['sourceModelSha256'] = '0' * 64
        with tempfile.TemporaryDirectory(dir=ROOT / 'output') as temp:
            path = Path(temp) / 'sidecar.json'
            path.write_text(json.dumps(source), encoding='utf8')
            with self.assertRaises(ValueError):
                build(path, PACKAGES)


if __name__ == '__main__':
    unittest.main()
