"""Exercise writer boundaries without creating files outside the main project's output/."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import build
import fit_layers
import restore_reference
from production_paths import project_output


ROOT = Path(__file__).resolve().parents[3]


class OutputPaths(unittest.TestCase):
    def setUp(self):
        parent = project_output(ROOT / "output", __file__)
        self.assertEqual(parent, ROOT / "output")
        parent.mkdir(exist_ok=True)
        temp = TemporaryDirectory(dir=parent, prefix="ankleboot-paths-")
        self.addCleanup(temp.cleanup)
        self.area = Path(temp.name)
        self.main = self.area / "main"
        self.other = self.area / "outside-fixture-project"
        self.main.mkdir()
        self.other.mkdir()
        subprocess.run(["git","init","-q",str(self.main)], check=True)

    def link(self, location, to):
        if os.name == "nt":
            subprocess.run(["cmd.exe","/d","/c","mklink","/j",str(location),str(to)], check=True,capture_output=True)
        else:
            location.symlink_to(to, target_is_directory=True)

    def test_asset_id_is_rejected_before_model_reads_and_staging(self):
        package = self.main / "asset"
        package.mkdir()
        bad_ids = ["../outside",str(self.other / "outside")]
        if os.name == "nt":
            bad_ids += ["aux","new:file"]
        for name in bad_ids:
            (package / "recipe.json").write_text(json.dumps({"id":name}),encoding="utf8")
            with self.subTest(id=name), patch.object(build,"SOURCE",package), self.assertRaises(ValueError):
                build.build()
        (package / "recipe.json").write_text(json.dumps({"id":"valid-boot"}),encoding="utf8")
        self.link(package / "generated", self.other)
        with patch.object(build,"SOURCE",package), self.assertRaisesRegex(ValueError,"Redirected"):
            build.build()
        recipe = {"schema":"ankleboot-covered-by-straight-trousers-v2","outerLayer":"pants",
                  "boot":{"id":"valid-boot"},"pants":{"id":"valid-pants"}}
        (package / "recipe.json").write_text(json.dumps(recipe),encoding="utf8")
        with patch.object(fit_layers,"PACKAGE",package), self.assertRaisesRegex(ValueError,"Redirected"):
            fit_layers.run()
        self.assertEqual(list(self.other.iterdir()),[])

    @unittest.skipUnless(os.name=="nt","Windows device path")
    def test_paired_asset_rejects_reserved_filename_before_reads(self):
        recipe={"schema":"ankleboot-covered-by-straight-trousers-v2","outerLayer":"pants",
                "boot":{"id":"valid-boot"},"pants":{"id":"con"}}
        (self.main/"recipe.json").write_text(json.dumps(recipe),encoding="utf8")
        with patch.object(fit_layers,"PACKAGE",self.main), self.assertRaisesRegex(ValueError,"Windows output path"):
            fit_layers.run()
        self.assertFalse((self.main/"generated").exists())

    def test_reference_cache_rejects_invalid_name_before_fetch_and_retries(self):
        package = self.main / "assets-source/ankle-boot-fit-v1"
        package.mkdir(parents=True)
        data = b"pinned offline input"
        def source(name):
            descriptors = [{"path":"experiments/tools/mpfb-author-study/source/"+file,
                            "bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
                           for file in ("weights.game_engine.json","rig.game_engine.json","clothesservice.py",name)]
            manifest = json.dumps({"upstreamRevision":"fixture","referenceInputs":descriptors}).encode()
            (self.main/"receipt.json").write_bytes(manifest)
            (package/"recipe.json").write_text(json.dumps({"donorReference":["receipt.json",hashlib.sha256(manifest).hexdigest()]}))
        with patch.object(restore_reference,"ROOT",self.main), patch.object(restore_reference,"urlopen") as fetch:
            source("folder/..")
            with self.assertRaisesRegex(ValueError,"cache filename"):restore_reference.main()
            if os.name=="nt":
                source("folder/nul.json")
                with self.assertRaisesRegex(ValueError,"Windows output path"):restore_reference.main()
            fetch.assert_not_called()
            self.assertFalse((package/".reference-cache").exists())
            source("folder/base.obj")
            fetch.side_effect = lambda *args, **kwargs: io.BytesIO(data)
            restore_reference.main()
            self.assertEqual((package/".reference-cache/base.obj").read_bytes(),data)

    def test_actual_qa_clis_refuse_root_traversal_and_missing_junction_child(self):
        scripts=self.main/"scripts"
        scripts.mkdir()
        tools=["qa-ankleboot-poses.cjs","qa-footwear-room.cjs","qa-record-outfit-refusal.cjs"]
        for name in tools+["project-output.cjs","qa-browser-workspace.cjs"]:
            shutil.copyfile(ROOT/"scripts"/name,scripts/name)
        shutil.copyfile(ROOT/"scripts/qa-ankleboot-visible.cjs",scripts/"qa-ankleboot-visible.cjs")
        py=scripts/"production";py.mkdir()
        shutil.copyfile(ROOT/"scripts/production/production_paths.py",py/"production_paths.py")
        shutil.copyfile(ROOT/"scripts/qa-ankleboot-cuff-mask.py",scripts/"qa-ankleboot-cuff-mask.py")
        self.link(self.main/"junction",self.other)
        targets=[str(self.main.anchor),str(self.main/".."/self.other.name/"missing"/"leaf"),str(self.main/"junction/missing/leaf")]
        missing=str(self.main/"missing-input.json")
        for destination in targets:
            arguments=[["node",str(scripts/tools[0]),"http://127.0.0.1","1"*64,missing,missing,destination],
                       ["node",str(scripts/tools[1]),"http://127.0.0.1","1"*64,missing,destination],
                       ["node",str(scripts/tools[2]),"http://127.0.0.1","1"*64,missing,missing,destination],
                       [sys.executable,"-B",str(scripts/"qa-ankleboot-cuff-mask.py"),missing,destination]]
            for cmd in arguments:
                result=subprocess.run(cmd,cwd=self.main,env={**os.environ,"TEMP":str(self.area),"TMP":str(self.area),
                                      "TMPDIR":str(self.area)},capture_output=True,text=True)
                with self.subTest(script=cmd[1:3],destination=destination):
                    self.assertNotEqual(result.returncode,0)
                    self.assertRegex(result.stderr,r"inside the (?:production tool main checkout|project)")
        self.assertEqual(list(self.other.iterdir()),[])


if __name__=="__main__":
    unittest.main()
