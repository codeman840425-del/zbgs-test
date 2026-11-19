"""Restore exactly four pinned MPFB reference files for a fresh checkout."""
import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from flow import ROOT, require
from production_paths import project_output, publish_new_directory


def main():
    source = ROOT / "assets-source/ankle-boot-fit-v1"
    output = project_output(source / ".reference-cache", __file__)
    require(output == source / ".reference-cache", "Redirected MPFB cache")
    relative, checksum = json.loads((source / "recipe.json").read_bytes())["donorReference"]
    raw = (ROOT / relative).read_bytes()
    require(hashlib.sha256(raw).hexdigest() == checksum, "Donor receipt changed")
    reference = json.loads(raw)
    revision = reference["upstreamRevision"]
    base = Path("experiments/tools/mpfb-author-study/source")
    rows = [(Path(r["path"]).relative_to(base), r) for r in reference["referenceInputs"]]

    def verify(row, data):
        require(len(data) == row["bytes"] and hashlib.sha256(data).hexdigest() == row["sha256"],
                "Unexpected MPFB bytes: " + row["path"])

    if not output.exists():
        with TemporaryDirectory(dir=source, prefix=".mpfb-") as tmp:
            fresh = Path(tmp) / "reference"
            fresh.mkdir()
            for name, row in rows:
                url = f"https://raw.githubusercontent.com/makehumancommunity/mpfb2/{revision}/{name.as_posix()}"
                with urlopen(url, timeout=45) as stream:
                    data = stream.read(row["bytes"] + 1)
                verify(row, data)
                (fresh / name.name).write_bytes(data)
            try:
                publish_new_directory(fresh, output)
            except FileExistsError:
                pass
    require({p.name for p in output.iterdir()} == {p.name for p, _ in rows}, "Incomplete MPFB cache")
    for name, row in rows:
        expected = output / name.name
        require(project_output(expected, __file__) == expected, "Redirected MPFB file")
        verify(row, expected.read_bytes())
    print(f"{revision} -- {len(rows)} exact reference files")


if __name__ == "__main__":
    main()
