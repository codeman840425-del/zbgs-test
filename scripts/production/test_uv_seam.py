import unittest

import numpy as np

from uv_seam import stitch_uv_patch


def split_uv(faces, attrs, uv):
    draw = np.arange(faces.size).reshape(faces.shape)
    exported = {name: arr[faces.ravel()].copy() for name, arr in attrs.items()}
    tex = uv[faces.ravel()].copy()
    tex[3:] += .25
    return draw, exported, tex


class UVSeamTest(unittest.TestCase):
    def setUp(self):
        self.faces = np.array([[0, 1, 2], [2, 1, 3]])
        p = np.array([[0., 0, 0], [1., 0, 0], [0., 1, 0], [1., 1, 0]], dtype=np.float32)
        self.original = {'POSITION': p, 'JOINTS_0': np.tile([7, 8, 0, 0], (4, 1)),
                         'WEIGHTS_0': np.tile([.6, .4, 0, 0], (4, 1))}
        self.draw, self.export, self.uv = split_uv(self.faces, self.original, p[:, :2])

    def stitch(self):
        return stitch_uv_patch(self.faces, self.original, self.draw, self.export, self.uv, {7, 8})

    def test_true_uv_seam(self):
        result = self.stitch()
        np.testing.assert_array_equal(result['sourceFaces'], self.faces)
        np.testing.assert_array_equal(result['cornerUV'], self.uv[self.draw])
        self.assertEqual(len(result['pairedBoundaryEdges']), 1)

    def test_identical_export_of_disconnected_anatomical_parts(self):
        # The same render buffers can originate from two intentionally open sheets.
        self.faces = self.draw.copy()
        self.original = {name: arr.copy() for name, arr in self.export.items()}
        with self.assertRaisesRegex(ValueError, 'no proven split UV edge'):
            self.stitch()

    def test_unknown_origin(self):
        self.faces = None
        with self.assertRaisesRegex(ValueError, 'missing source'):
            self.stitch()

    def test_nearly_coincident_position(self):
        self.export['POSITION'][3, 0] = np.nextafter(np.float32(0), np.float32(1))
        with self.assertRaisesRegex(ValueError, 'differs POSITION'):
            self.stitch()

    def test_same_endpoints_different_skin(self):
        self.export['WEIGHTS_0'][3] += [-.00001, .00001, 0, 0]
        with self.assertRaisesRegex(ValueError, 'differs WEIGHTS_0'):
            self.stitch()

    def test_cross_bone(self):
        self.original['JOINTS_0'][:, 0] = 11
        self.export['JOINTS_0'][:, 0] = 11
        with self.assertRaisesRegex(ValueError, 'wrong anatomical joint'):
            self.stitch()

    def test_distinct_morph_displacements(self):
        self.original['morph0.POSITION'] = np.zeros((4, 3))
        self.export['morph0.POSITION'] = np.zeros((6, 3))
        self.export['morph0.POSITION'][4, 2] = .01
        with self.assertRaisesRegex(ValueError, 'differs morph0.POSITION'):
            self.stitch()

    def test_duplicate_triangles(self):
        self.faces[1] = self.faces[0]
        self.draw, self.export, self.uv = split_uv(self.faces, self.original, self.original['POSITION'][:, :2])
        with self.assertRaisesRegex(ValueError, 'duplicate triangle'):
            self.stitch()

    def test_bowtie_vertex(self):
        self.faces = np.array([[0, 1, 2], [0, 3, 4]])
        self.original = {k: np.concatenate([v, v[:1]]) for k, v in self.original.items()}
        self.original['POSITION'][4] = [1, 2, 0]
        self.draw, self.export, self.uv = split_uv(self.faces, self.original, self.original['POSITION'][:, :2])
        with self.assertRaisesRegex(ValueError, 'disconnected vertex link'):
            self.stitch()

    def test_no_uv_change(self):
        self.uv = self.original['POSITION'][self.faces.ravel(), :2]
        with self.assertRaisesRegex(ValueError, 'no UV discontinuity'):
            self.stitch()


if __name__ == '__main__':
    unittest.main()
