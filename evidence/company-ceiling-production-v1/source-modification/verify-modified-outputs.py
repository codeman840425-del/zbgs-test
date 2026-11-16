from pathlib import Path
import json
import struct
from hashlib import sha256
from PIL import Image

ROOT = Path(__file__).resolve().parent
IDS = ["ceiling-panel-grid", "ceiling-perforated", "ceiling-woven", "ceiling-linear"]
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def digest(value: bytes) -> str:
    return sha256(value).hexdigest()


def glb_report(raw: bytes, expected_image_bytes: int) -> dict:
    magic, version, declared_length = struct.unpack_from("<4sII", raw, 0)
    json_length, json_type = struct.unpack_from("<II", raw, 12)
    json_start = 20
    document = json.loads(raw[json_start:json_start + json_length].decode("utf-8").rstrip(" "))
    bin_header = json_start + json_length
    binary_length, binary_type = struct.unpack_from("<II", raw, bin_header)
    binary_start = bin_header + 8
    views = document["bufferViews"]
    image_view = views[4]
    image_start = binary_start + image_view.get("byteOffset", 0)
    normal_view = views[1]
    normal_start = binary_start + normal_view.get("byteOffset", 0)
    normal = struct.unpack_from("<fff", raw, normal_start)
    return {
        "magic": magic.decode("ascii"),
        "version": version,
        "declaredLength": declared_length,
        "actualLength": len(raw),
        "jsonChunkType": json_type,
        "binChunkType": binary_type,
        "bufferByteLength": document["buffers"][0]["byteLength"],
        "bufferViewByteLengths": [view["byteLength"] for view in views],
        "accessorShapes": [{"componentType": accessor["componentType"], "count": accessor["count"], "type": accessor["type"]} for accessor in document["accessors"]],
        "nodeName": document["nodes"][0]["name"],
        "materialName": document["materials"][0]["name"],
        "embeddedPng": raw[image_start:image_start + 8] == PNG_SIGNATURE,
        "normal": list(normal),
        "imageViewBytes": image_view["byteLength"],
        "expectedImageBytes": expected_image_bytes,
        "lengthsValid": declared_length == len(raw) and document["buffers"][0]["byteLength"] == binary_length and image_view["byteLength"] >= expected_image_bytes,
    }


records = []
for identifier in IDS:
    folder = ROOT / identifier
    modified_png = (folder / "modified-texture.png").read_bytes()
    repeat_png = (folder / "repeat-texture.png").read_bytes()
    with Image.open(folder / "modified-texture.png") as image:
        image.load()
        png = {"format": image.format, "mode": image.mode, "size": list(image.size)}
    model = (folder / "modified-model.glb").read_bytes()
    record = {
        "id": identifier,
        "modifiedTextureSha256": digest(modified_png),
        "repeatTextureSha256": digest(repeat_png),
        "png": png,
        "glb": glb_report(model, len(modified_png)),
        "textureRepeatEqual": modified_png == repeat_png,
        "modelRepeatEqual": (folder / "modified-model.glb").read_bytes() == (folder / "repeat-model.glb").read_bytes(),
    }
    record["passed"] = (
        png == {"format": "PNG", "mode": "RGBA", "size": [512, 512]}
        and record["textureRepeatEqual"]
        and record["modelRepeatEqual"]
        and record["glb"]["magic"] == "glTF"
        and record["glb"]["version"] == 2
        and record["glb"]["nodeName"] == "finish-surface"
        and record["glb"]["materialName"] == "finish-surface"
        and record["glb"]["embeddedPng"]
        and record["glb"]["normal"] == [0.0, -1.0, 0.0]
        and record["glb"]["lengthsValid"]
    )
    records.append(record)

report = {"status": "passed" if all(record["passed"] for record in records) else "failed", "decoder": "Pillow", "records": records}
(ROOT.parent / "modified-output-verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report))
if report["status"] != "passed":
    raise SystemExit(1)
