import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import native_palette_compatibility as palette
from production_paths import project_output


class NativePaletteBatchTest(unittest.TestCase):
    def test_incremental_batch_and_corrupt_publication(self):
        batch = json.loads(palette.BATCH.read_bytes())
        with tempfile.TemporaryDirectory(dir=project_output(palette.ROOT / "output", palette.__file__)) as work, \
                patch.object(palette, "LOCK_DIR", Path(work) / "locks"):
            batch_file = Path(work) / "batch.json"
            destination = Path(work) / "package"
            batch_file.write_bytes(palette.json_bytes({**batch, "targets": batch["targets"][:1]}))
            first = palette.palette_files(palette.audit(batch_file))
            palette.stage(destination, first)
            old_manifest = destination / (batch["targets"][0]["bodyType"] + "/manifest.json")
            old_time = old_manifest.stat().st_mtime_ns

            complete = palette.palette_files(palette.audit())
            palette.stage(destination, complete)
            palette.check_stage(destination, complete)
            palette.check_stage(palette.PUBLIC, complete)
            registry = destination / palette.REGISTRY
            registry_time = registry.stat().st_mtime_ns
            palette.stage(destination, complete)
            self.assertEqual(old_manifest.stat().st_mtime_ns, old_time)
            self.assertEqual(registry.stat().st_mtime_ns, registry_time)
            with self.assertRaisesRegex(ValueError, "omits existing"):
                palette.stage(destination, first)

            old_manifest.write_bytes(b"wrong")
            with self.assertRaisesRegex(ValueError, "identity differs"):
                palette.stage(destination, complete)
            self.assertEqual(registry.stat().st_mtime_ns, registry_time)
            self.assertEqual(old_manifest.read_bytes(), b"wrong")

    def test_batch_rejects_wrong_body_and_duplicate_target(self):
        batch = json.loads(palette.BATCH.read_bytes())
        with tempfile.TemporaryDirectory(dir=project_output(palette.ROOT / "output", palette.__file__)) as work:
            file = Path(work) / "batch.json"
            file.write_bytes(palette.json_bytes({**batch, "targets": batch["targets"][:1] * 2}))
            with self.assertRaisesRegex(ValueError, "Duplicate iris target"):
                palette.audit(file)
            batch["targets"][0]["bodySha256"] = "0" * 64
            file.write_bytes(palette.json_bytes(batch))
            with self.assertRaisesRegex(ValueError, "Wrong body provenance"):
                palette.audit(file)


if __name__ == "__main__":
    unittest.main()
