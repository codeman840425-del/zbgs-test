import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import imageio_ffmpeg
from PIL import Image
from production.production_paths import project_output


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = {
    'room': ('qa-room-filmstrip.py', 'room-review', '000.jpg', (1440, 1140)),
    'm1': ('qa-m1-filmstrip.py', 'review', 'chain-00.jpg', (1000, 1280)),
}


class FilmstripPaths(unittest.TestCase):
    def setUp(self):
        scratch = project_output(ROOT / 'output', __file__)
        scratch.mkdir(exist_ok=True)
        self.area = Path(self.enterContext(tempfile.TemporaryDirectory(prefix='filmstrip-test-', dir=scratch)))
        self.project = self.area / 'project'
        self.outside = self.area / 'outside'
        self.outside.mkdir()
        self.env = dict(os.environ, TEMP=str(self.outside), TMP=str(self.outside), TMPDIR=str(self.outside))
        scripts = self.project / 'scripts'
        (scripts / 'production').mkdir(parents=True)
        shutil.copyfile(ROOT / 'scripts/production/production_paths.py', scripts / 'production/production_paths.py')
        for name, *_ in SCRIPTS.values():
            shutil.copyfile(ROOT / 'scripts' / name, scripts / name)
        subprocess.run(['git', 'init', '--quiet', str(self.project)], check=True, capture_output=True)
        self.video = self.project / 'same-camera-chain.webm'

    def make_video(self):
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-f', 'lavfi', '-i',
                        'color=blue:s=864x900:r=4:d=1', '-c:v', 'libvpx-vp9', '-threads', '2', str(self.video)],
                       cwd=self.project, check=True, capture_output=True)

    def cli(self, kind, output=None):
        script, default, *_ = SCRIPTS[kind]
        path = output or self.project / default
        args = [str(self.video), '--output', str(path)] if kind == 'room' else [str(Path(path).parent)]
        return subprocess.run([sys.executable, '-B', str(self.project / 'scripts' / script), *args],
                              cwd=self.project, env=self.env, text=True, capture_output=True)

    def reject(self, result):
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('Output must be inside the production tool main checkout', result.stderr)

    def junction(self, link, target):
        if os.name == 'nt':
            subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/j', str(link), str(target)],
                           cwd=self.project, check=True, capture_output=True)
        else:
            link.symlink_to(target, target_is_directory=True)

        def detach():
            if link.is_symlink():
                link.unlink()
            elif link.is_junction():
                link.rmdir()

        self.addCleanup(detach)
        return detach

    def test_outside_destinations_are_rejected_before_missing_source(self):
        # Both roots are inside the real project but outside/inside the copied tools' Git checkout.
        for kind in SCRIPTS:
            self.reject(self.cli(kind, self.outside / 'review'))
            self.reject(self.cli(kind, self.project / '..' / 'outside' / 'review'))
        for kind, (_, output, _, _) in SCRIPTS.items():
            link = self.project / output
            self.junction(link, self.outside)
            self.reject(self.cli(kind))
        self.assertEqual(list(self.outside.iterdir()), [])

    def test_manifest_and_jpeg_junctions_cannot_redirect_a_run(self):
        for kind, (_, output, _, _) in SCRIPTS.items():
            review = self.project / output
            review.mkdir()
            detach = self.junction(review / 'manifest.json', self.outside)
            self.reject(self.cli(kind))
            detach()
        self.make_video()
        for kind, (_, output, sheet, _) in SCRIPTS.items():
            review = self.project / output
            self.junction(review / sheet, self.outside)
            self.reject(self.cli(kind))
            self.assertEqual([p.name for p in review.iterdir()], [sheet])
        self.assertEqual(list(self.outside.iterdir()), [])

    def test_successful_reruns_and_failed_decodes_clean_up_intermediate_frames(self):
        for kind, (_, output, _, _) in SCRIPTS.items():
            result = self.cli(kind)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(list((self.project / output).iterdir()), [])
        self.make_video()
        for kind, (_, output, sheet, size) in SCRIPTS.items():
            review = self.project / output
            for _ in range(2):
                result = self.cli(kind)
                self.assertEqual(result.returncode, 0, result.stderr)
                actual = json.loads((review / 'manifest.json').read_bytes())
                self.assertEqual(actual['frames'], 2)
                self.assertEqual(actual['sheets'], [sheet])
                self.assertEqual(sorted(p.name for p in review.iterdir()), sorted([sheet, 'manifest.json']))
                with Image.open(review / sheet) as image:
                    self.assertEqual(image.size, size)
        self.assertEqual(list(self.outside.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
