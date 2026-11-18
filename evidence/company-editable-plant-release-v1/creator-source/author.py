import hashlib
import io
import json
import math
from pathlib import Path
import struct
import sys

from PIL import Image

FAMILY = Path("assets-source/company-desktop-plants-v1")
GLB_HEADER = struct.Struct("<4sII")
CHUNK = struct.Struct("<I4s")
SIDE = 128
ASSET_ID = "desktop-plant-herringbone-ceramic"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def chunks(data):
    assert GLB_HEADER.unpack_from(data) == (b"glTF", 2, len(data))
    length, kind = CHUNK.unpack_from(data, 12)
    assert kind == b"JSON"
    binary_at = 20 + length
    size, kind = CHUNK.unpack_from(data, binary_at)
    assert kind == b"BIN\0" and binary_at + 8 + size == len(data)
    return json.loads(data[20:binary_at]), data[binary_at + 8:]


def rgba_png(role):
    image = Image.new("RGBA", (SIDE, SIDE))
    for y in range(SIDE):
        for x in range(SIDE):
            u, v = (x + .5) / SIDE, (y + .5) / SIDE
            grain = ((x * 23 + y * 41 + x * y * 7) % 19) - 9
            if role == "foliage":
                mid = abs(u - .5)
                branch = (v * 5.0 - mid * 6.2) % 1
                if mid < .024 or (branch < .115 and mid < .43):
                    color = (186, 224, 101)
                elif mid > .42:
                    color = (25, 96, 48)
                else:
                    color = (54 + int(48 * mid), 152 - int(88 * mid), 65 + int(36 * v))
            else:
                wave = math.sin(math.tau * (8 * u + .14 * math.sin(math.tau * v)))
                rim = v < .14 or .70 < v < .78 or v > .93
                color = (171, 92, 55) if rim else ((216, 193, 154) if wave > -.18 else (41, 117, 125))
            image.putpixel((x, y), tuple(c + grain for c in color) + (255,))
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def add_view(gltf, binary, data, target=None):
    binary.extend(b"\0" * (-len(binary) % 4))
    row = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(data)}
    if target is not None:
        row["target"] = target
    gltf["bufferViews"].append(row)
    binary.extend(data)
    return len(gltf["bufferViews"]) - 1


def remap_uv(gltf, inner, original, primitive, role):
    position = gltf["accessors"][primitive["attributes"]["POSITION"]]
    view = gltf["bufferViews"][position["bufferView"]]
    assert position["componentType"] == 5126 and position["type"] == "VEC3"
    assert view.get("byteStride", 12) == 12
    offset = view["byteOffset"] + position.get("byteOffset", 0)
    points = [struct.unpack_from("<3f", original, offset + i * 12) for i in range(position["count"])]
    uv = []
    for x, y, z in points:
        if role == "pot":
            u = .5 + math.atan2(z, x) / math.tau
            v = 1 - y / .095
        else:
            # Orthogonal cross-axis projection on the original tapered leaf bundle.
            u = .5 + (.85 * x + .52 * z) / .205
            v = 1 - (y - .08) / .212
        uv.append((u, v))
    packed = b"".join(struct.pack("<2f", *point) for point in uv)
    view_id = add_view(gltf, inner, packed, 34962)
    gltf["accessors"].append({"bufferView": view_id, "componentType": 5126,
                              "count": len(uv), "type": "VEC2"})
    primitive["attributes"]["TEXCOORD_0"] = len(gltf["accessors"]) - 1
    return {"uvSha256": sha(packed), "uvCount": len(uv)}


def main(root):
    family = root / FAMILY
    base_recipe = json.loads((family / "examples/pointed-kenney-v2.json").read_bytes())
    base = base_recipe["sources"]["pointed-plant"]
    donor = (root / base["path"]).read_bytes()
    assert sha(donor) == base["sha256"]
    original_license = (root / base["licensePath"]).read_bytes()
    assert sha(original_license) == base["licenseSha256"]
    gltf, old_binary = chunks(donor)
    assert "images" not in gltf and "textures" not in gltf
    binary = bytearray(old_binary)
    source_dir = family / "receiver-herringbone-v1"
    source_dir.mkdir()
    gltf.update(images=[], textures=[], samplers=[{"minFilter": 9987, "magFilter": 9729, "wrapS": 10497, "wrapT": 33071}])
    receipt = {"CC0Donor": base, "positionsNormalsIndicesRemainExact": True, "textures": {}}
    for role, primitive in zip(("pot", "foliage"), gltf["meshes"][0]["primitives"], strict=True):
        meta = remap_uv(gltf, binary, old_binary, primitive, role)
        png = rgba_png(role)
        (source_dir / f"{role}.png").write_bytes(png)
        gltf["images"].append({"bufferView": add_view(gltf, binary, png), "mimeType": "image/png"})
        i = len(gltf["images"]) - 1
        gltf["textures"].append({"source": i, "sampler": 0})
        pbr = gltf["materials"][primitive["material"]]["pbrMetallicRoughness"]
        pbr.update(baseColorFactor=[1, 1, 1, 1], baseColorTexture={"index": i, "texCoord": 0},
                   roughnessFactor=.75 if role == "pot" else .88)
        receipt["textures"][role] = {**meta, "pngSha256": sha(png), "dimensions": [SIDE, SIDE],
                                      "pbr": pbr}
    assert binary[:len(old_binary)] == old_binary
    binary.extend(b"\0" * (-len(binary) % 4))
    gltf["buffers"][0]["byteLength"] = len(binary)
    gltf["asset"]["copyright"] = "Kenney CC0-1.0 geometry; recipient-authored UVs and PNG patterns for this project."
    description = json.dumps(gltf, separators=(",", ":")).encode()
    description += b" " * (-len(description) % 4)
    model = (GLB_HEADER.pack(b"glTF", 2, 28 + len(description) + len(binary)) +
             CHUNK.pack(len(description), b"JSON") + description + CHUNK.pack(len(binary), b"BIN\0") + binary)
    (source_dir / "herringbone.glb").write_bytes(model)
    allow = ("Kenney Furniture Kit plantSmall2 geometry (CC0-1.0), original notice below.\n"
             "Receiver-authored ceramic and foliage PNGs and UV remap are project-authorized original "
             "work of this isolated validation, authorized for inclusion and reproduction in the project's package.\n\n").encode() + original_license
    (source_dir / "LICENSE.txt").write_bytes(allow)
    (source_dir / "author.py").write_bytes(Path(__file__).read_bytes())
    def in_project(name):
        return (source_dir.relative_to(root) / name).as_posix()
    source = {"path": in_project("herringbone.glb"), "sha256": sha(model),
              "author": "Kenney geometry (CC0-1.0), receiver-authored UV and PNG patterns",
              "license": "Project-authorized-original", "licensePath": in_project("LICENSE.txt"),
              "licenseSha256": sha(allow), "url": base["url"],
              "potNode": base["potNode"], "foliageNode": base["foliageNode"],
              "editable": {"path": in_project("author.py"), "sha256": sha(Path(__file__).read_bytes())}}
    design = {"id": ASSET_ID, "version": 1, "displayName": "桌面绿植 · 青陶叶脉盆栽",
              "form": "stock-plant", "source": "herringbone", "fit": {"height": .224, "yawQuarterTurns": 1}}
    recipe = {"schema": base_recipe["schema"], "version": 1, "sources": {"herringbone": source}, "designs": [design]}
    (source_dir / "recipe.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"recipe": in_project("recipe.json"), "source": source, "design": design, **receipt},
                     ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
