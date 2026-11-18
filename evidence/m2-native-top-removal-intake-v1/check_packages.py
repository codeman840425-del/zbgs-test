"""Check two private rebuilds against their older fixed runtime assets. Emits facts only."""
import copy
import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/production"))
import native_import
import register_native_packages as registrar
from production_paths import project_output


def read(path):
    return json.loads(path.read_bytes())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(batch_path, group, older_assets, temp):
    batch = read(batch_path)
    row, = batch["items"]
    stage = temp / group
    states = []
    for _ in range(2):
        result = native_import.execute(batch, ROOT, stage)
        if not result["passed"]:
            raise ValueError(result)
        state, = result["items"]
        states.append(state["state"])
    assert states == ["prepared", "reused-identical"]
    _, actual = registrar.registration(row, state, group, prepared_root=stage)
    package = stage / row["package"]
    manifest = read(package / "manifest.json")
    spec_path = ROOT / row["spec"]
    spec = read(spec_path)
    meta = read(spec_path.parent / "provenance.json")
    asset_hashes = {name: digest(package / name) for name in spec["files"]}
    same = [name for name, sha in asset_hashes.items() if digest(older_assets / row["package"] / name) == sha]
    assert sorted(set(asset_hashes) - set(same)) == ["manifest.json"]
    rejected = []
    for fault in ("wrong source group", "missing removal recipe", "different selected primitive"):
        damaged = copy.deepcopy(meta)
        if fault == "missing removal recipe":
            del damaged["inputs"]["topRemovalRecipe"]
        elif fault == "wrong source group":
            damaged["topRemovalReadback"]["groupId"] = "unrelated-garment"
        else:
            damaged["topRemovalReadback"]["members"][0]["primitive"] += 1
        try:
            registrar.coverage_entry(spec_path.parent, package, spec, ROOT / damaged["native"]["path"], damaged)
        except ValueError as failure:
            rejected.append({"case": fault, "reason": str(failure)})
        else:
            raise AssertionError("Accepted " + fault)
    return {"id": row["id"], "genderGroup": group, "preparations": states,
            "bodySha256": actual["avatarSha256"], "manifestSha256": actual["manifestSha256"],
            "previousManifestSha256": digest(older_assets / row["package"] / "manifest.json"),
            "byteIdenticalToPreviousRuntime": sorted(same), "registeredCoverage": manifest["sourceMaskLineage"],
            "nativeSurfaceCheck": meta["topRemovalReadback"], "refusedAlterations": rejected,
            "assetPublication": "private source verification only"}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--female", type=Path, required=True)
    parser.add_argument("--male", type=Path, required=True)
    parser.add_argument("--previous-assets", type=Path, required=True)
    args = parser.parse_args()
    private = project_output(ROOT / "output/character-work-temp", __file__)
    private.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=private) as folder:
        print(json.dumps([check(batch, group, args.previous_assets, Path(folder))
                          for group, batch in (("female", args.female), ("male", args.male))], indent=2))
