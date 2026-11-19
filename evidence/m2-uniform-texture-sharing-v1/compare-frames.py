"""Compare the four fixed-camera images from the signed game records. Prints JSON."""
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
from PIL import Image

here = Path(__file__).resolve().parent
folders = [here.parent / "m2-uniform-skin-v1" / "continuity", here / "continuity"]
reports = [json.loads((folder / "report.json").read_bytes()) for folder in folders]
before, after = reports
assert before["passed"] and after["passed"] and before["viewport"] == after["viewport"]
rows = []
for tone in ("original", "warm"):
    record = before["records"][tone]["recordSha256"]
    assert record == after["records"][tone]["recordSha256"]
    for view in ("face", "half"):
        frame = before["frames"][view][tone]
        assert frame == after["frames"][view][tone], "Camera, time or filename changed"
        images = []
        for folder in folders:
            with Image.open(folder / frame["file"]) as image:
                images.append(np.asarray(image.convert("RGBA")))
        old, new = images
        assert old.shape == new.shape
        delta = np.abs(new.astype(np.int16) - old.astype(np.int16))
        rows.append({"file": frame["file"], "recordSha256": record,
                     "simulationSeconds": frame["simulationTime"],
                     "decodedRgbaSha256": [sha256(image.tobytes()).hexdigest() for image in images],
                     "width": old.shape[1], "height": old.shape[0],
                     "changedPixels": int(np.count_nonzero(delta.any(axis=2))),
                     "maxChannelDifference": int(delta.max())})
print(json.dumps({"beforeBuild": before["build"], "afterBuild": after["build"], "frames": rows}, indent=2))
