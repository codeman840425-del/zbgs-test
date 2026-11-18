"""Regression checks for safely intercepting one embedded normal bufferView."""

import base64
import copy
import io
import json
import struct
import unittest

from PIL import Image, PngImagePlugin

from native_uniform_normal import digest, pins_for_body


def png_bytes(*, changed_pixel=False, rgba=(128, 128, 255, 255), color_metadata=False):
    image = Image.new('RGBA', (1024, 1024), rgba)
    if changed_pixel:
        image.putpixel((1023, 1023), (127, 128, 255, 255))
    metadata = PngImagePlugin.PngInfo()
    if color_metadata:
        metadata.add(b'gAMA', struct.pack('>I', 45455))
    output = io.BytesIO()
    image.save(output, format='PNG', pnginfo=metadata)
    return output.getvalue()


def glb(doc, png):
    document = copy.deepcopy(doc)
    document['buffers'][0]['byteLength'] = len(png)
    document['bufferViews'][0]['byteLength'] = len(png)
    json_chunk = json.dumps(document).encode('utf8')
    json_chunk += b' ' * (-len(json_chunk) % 4)
    bin_chunk = png + b'\0' * (-len(png) % 4)
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(json_chunk) + len(bin_chunk)) +
            struct.pack('<I4s', len(json_chunk), b'JSON') + json_chunk +
            struct.pack('<I4s', len(bin_chunk), b'BIN\0') + bin_chunk)


class UniformNormalPinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.png = png_bytes()

    def setUp(self):
        self.doc = {
            'asset': {'version': '2.0'}, 'buffers': [{}], 'bufferViews': [{'buffer': 0}],
            'images': [{'bufferView': 0, 'mimeType': 'image/png'}],
            'textures': [{'source': 0}], 'materials': [{'normalTexture': {'index': 0}}],
        }

    def run_pin(self, png=None, expected_sha=None, doc=None):
        raw = glb(self.doc if doc is None else doc, self.png if png is None else png)
        return pins_for_body(raw, expected_sha or digest(raw))

    def test_generated_pixel_is_exact(self):
        [rows] = self.run_pin()['avatars'].values()
        [row] = rows
        self.assertEqual([row[key] for key in ('material', 'texture', 'image', 'bufferView')], [0, 0, 0, 0])
        self.assertEqual(row['sourcePngSha256'], digest(self.png))
        with Image.open(io.BytesIO(base64.b64decode(row['png1x1Base64']))) as image:
            self.assertEqual(image.size, (1, 1))
            self.assertEqual(list(image.getpixel((0, 0))), row['rgba'])

    def test_rejects_wrong_body_sha(self):
        with self.assertRaisesRegex(ValueError, 'VRM SHA256 mismatch'):
            self.run_pin(expected_sha='0' * 64)

    def test_rejects_transparency_color_metadata_and_even_one_different_pixel(self):
        for transform in ({'rgba': (128, 128, 255, 254)}, {'color_metadata': True}, {'changed_pixel': True}):
            with self.subTest(transform=transform), self.assertRaisesRegex(ValueError, 'Expected exactly'):
                self.run_pin(png_bytes(**transform))

    def test_rejects_shared_view(self):
        options = (
            {'accessors': [{'bufferView': 0}]},
            {'accessors': [{'sparse': {'indices': {'bufferView': 0}}}]},
            {'extensions': {'VRMC_vrm': {'bufferView': 0}}},
            {'images': [self.doc['images'][0], {'bufferView': 0, 'mimeType': 'image/png'}]},
        )
        for other_use in options:
            with self.subTest(other_use=other_use), self.assertRaisesRegex(ValueError, 'Expected exactly'):
                self.run_pin(doc={**self.doc, **other_use})

    def test_rejects_shared_texture_image_or_external_uri(self):
        options = (
            {'materials': [{'normalTexture': {'index': 0}, 'emissiveTexture': {'index': 0}}]},
            {'textures': [{'source': 0}, {'source': 0}]},
            {'extensions': {'VRMC_vrm': {'meta': {'thumbnailImage': 0}}}},
            {'images': [{'uri': 'normal.png', 'mimeType': 'image/png'}]},
        )
        for other_use in options:
            with self.subTest(other_use=other_use), self.assertRaisesRegex(ValueError, 'Expected exactly'):
                self.run_pin(doc={**self.doc, **other_use})

    def test_rejects_overlapping_view_and_unreviewed_extension(self):
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': 12, 'byteLength': 5})
        with self.assertRaisesRegex(ValueError, 'overlaps another bufferView'):
            self.run_pin()
        self.doc['extensionsUsed'] = ['KHR_texture_basisu']
        with self.assertRaisesRegex(ValueError, 'Unreviewed glTF extension'):
            self.run_pin()


if __name__ == '__main__':
    unittest.main()
