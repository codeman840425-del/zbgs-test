import base64
import hashlib
import io
import json
import pathlib
import struct
import zlib

from PIL import Image

directory = pathlib.Path(__file__).resolve().parent
original = (directory / 'failed-triangle-textured-no-uv.glb').read_bytes()
json_size = struct.unpack_from('<I', original, 12)[0]
metadata = json.loads(original[20:20 + json_size])
binary_offset = 20 + json_size + 8
image_view = metadata['bufferViews'][metadata['images'][0]['bufferView']]
image_start = binary_offset + image_view.get('byteOffset', 0)
png = original[image_start:image_start + image_view['byteLength']]
(directory / 'failed-original-texture.png').write_bytes(png)
chunks = []
offset = 8
while offset < len(png):
    length = struct.unpack_from('>I', png, offset)[0]
    kind = png[offset + 4:offset + 8]
    content = png[offset + 8:offset + 8 + length]
    recorded = struct.unpack_from('>I', png, offset + 8 + length)[0]
    computed = zlib.crc32(kind + content)
    chunks.append({'type': kind.decode('ascii'), 'bytes': length,
                   'crcValid': recorded == computed})
    offset += 12 + length
try:
    with Image.open(io.BytesIO(png)) as image:
        image.verify()
    original_verify = {'verified': True}
except Exception as error:
    original_verify = {'verified': False, 'error': str(error)}
try:
    with Image.open(io.BytesIO(png)) as image:
        image.load()
        original_decode = {'decoded': True, 'size': list(image.size)}
except Exception as error:
    original_decode = {'decoded': False, 'error': str(error)}

valid = Image.new('RGBA', (2, 2))
valid.putdata([(255, 0, 0, 255), (0, 255, 0, 255),
               (0, 0, 255, 255), (255, 255, 255, 255)])
buffer = io.BytesIO()
valid.save(buffer, format='PNG', compress_level=9)
valid_bytes = buffer.getvalue()
(directory / 'texture-valid.png').write_bytes(valid_bytes)
with Image.open(io.BytesIO(valid_bytes)) as loaded:
    loaded.verify()
with Image.open(io.BytesIO(valid_bytes)) as loaded:
    loaded.load()
    assert loaded.size == (2, 2)
    assert list(loaded.get_flattened_data()) == list(valid.get_flattened_data())
result = {'originalGlbSha256': hashlib.sha256(original).hexdigest(),
          'originalPngSha256': hashlib.sha256(png).hexdigest(),
          'originalPngChunks': chunks, 'originalVerify': original_verify, 'originalDecode': original_decode,
          'originalPrimitiveAttributes': metadata['meshes'][0]['primitives'][0]['attributes'],
          'validPngSha256': hashlib.sha256(valid_bytes).hexdigest(),
          'validPngBytes': len(valid_bytes), 'validPngBase64': base64.b64encode(valid_bytes).decode(),
          'validDecode': {'size': [2, 2], 'rgba': list(valid.get_flattened_data())}}
(directory / 'png-verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, indent=2))
