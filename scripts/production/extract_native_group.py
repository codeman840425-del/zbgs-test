"""Extract and verify explicit native garment groups into a private diagnostic package."""
import argparse
import json
import os
from pathlib import Path
import re
from tempfile import TemporaryDirectory

import native_body_package as body
from production_paths import project_output


def build(recipe, destination):
    dest = project_output(destination, __file__)
    private = body.ROOT / "output"
    body.verify(dest != private and dest.is_relative_to(private) and dest == Path(os.path.abspath(destination)),
                "Use a dedicated directory in project output/")
    spec = json.loads(recipe.read_bytes())
    body.verify("primitiveGroups" in spec and re.fullmatch(r"[a-z0-9][a-z0-9-]*", spec["idPrefix"]),
                "Expected explicit native groups and a local asset ID prefix")
    selections = {group["slot"]: [member["primitive"] for member in group["members"]]
                  for group in spec["primitiveGroups"]}
    files = body.equipment.extract(spec, dest)
    source_path = body.pinned({"path": spec["sourcePath"], "sha256": spec["sourceSha256"]})
    source = body.GLB(source_path)
    items = json.loads(files["equipment.json"])["items"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".garment-", dir=dest.parent) as tmp:
        stage = Path(tmp) / "package"
        body.equipment.write_outputs(files, stage)
        for item in items:
            body.bindings_and_buffers(source, body.GLB(stage / item["url"]), item,
                                      expected_primitives=selections[item["slot"]])
        if dest.exists():
            body.importer.exact_directory(dest, files)
            state = "reused-identical"
        else:
            try:
                stage.rename(dest)
                state = "extracted"
            except FileExistsError:
                body.importer.exact_directory(dest, files)
                state = "reused-identical"
    return {"state": state, "sourceSha256": spec["sourceSha256"], "items": [
        {"id": item["id"], "slot": item["slot"], "sha256": item["sha256"],
         "sourcePrimitives": selections[item["slot"]]} for item in items],
        "groupOwnershipVerified": False, "runtimeAdmission": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recipe", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.recipe, args.output), indent=2))
    except (ValueError, OSError, KeyError, TypeError) as error:
        parser.exit(1, f"Native garment extraction failed: {error}\n")
