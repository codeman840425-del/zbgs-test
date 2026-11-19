"""Make a 512px texture candidate from a self-contained singing-stage GLB."""
import hashlib
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(data):
    magic, version, length, size, kind = struct.unpack_from("<5I", data)
    assert (magic, version, length, kind) == (0x46546C67, 2, len(data), 0x4E4F534A)
    second = 20 + size
    size_bin, kind_bin = struct.unpack_from("<2I", data, second)
    assert kind_bin == 0x004E4942 and second + 8 + size_bin == length
    document = json.loads(data[20:second])
    assert len(document["buffers"]) == 1 and "uri" not in document["buffers"][0]
    return document, data[second + 8:]


def image_roles(document):
    roles = {}
    for m in document["materials"]:
        pbr = m.get("pbrMetallicRoughness", {})
        for entry, role in [(pbr.get("baseColorTexture"), "srgb"), (m.get("normalTexture"), "normal"),
                            (pbr.get("metallicRoughnessTexture"), "linear"), (m.get("occlusionTexture"), "linear")]:
            if entry is not None:
                idx = document["textures"][entry["index"]]["source"]
                assert roles.setdefault(idx, role) == role, "One image is used in conflicting color spaces"
    assert sorted(roles) == list(range(len(document["images"])))
    return roles


def shrink_jpeg(raw, role):
    with Image.open(io.BytesIO(raw)) as image:
        assert image.format == "JPEG" and image.size == (2048, 2048)
        pixels = np.asarray(image.convert("RGB"), dtype=np.float32) / 255
    if role == "srgb":
        pixels = np.where(pixels <= .04045, pixels / 12.92, ((pixels + .055) / 1.055) ** 2.4)
    elif role == "normal":
        pixels = pixels * 2 - 1
    result = pixels.reshape(512, 4, 512, 4, 3).mean(axis=(1, 3))
    if role == "srgb":
        result = np.where(result <= .0031308, 12.92 * result, 1.055 * result ** (1 / 2.4) - .055)
    elif role == "normal":
        magnitude = np.linalg.norm(result, axis=-1, keepdims=True)
        result = np.divide(result, magnitude, out=np.zeros_like(result), where=magnitude > 1e-7)
        result[magnitude[:, :, 0] <= 1e-7] = [0, 0, 1]
        result = (result + 1) / 2
    rgb = np.round(np.clip(result, 0, 1) * 255).astype(np.uint8)
    encoded = io.BytesIO()
    Image.fromarray(rgb).save(encoded, format="JPEG", quality=92, subsampling=0)
    data = encoded.getvalue()
    with Image.open(io.BytesIO(data)) as check:
        check.load()
        assert check.size == (512, 512) and check.mode == "RGB"
    return data
