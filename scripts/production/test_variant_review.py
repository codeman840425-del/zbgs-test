"""File-level and real CLI checks of equipment review declarations."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from outfit_admission import SCHEMA as REVIEW_SCHEMA, evidence_pin
from variant_matrix import check_declared_review, validate_matrix_files


ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / 'assets-source/variant-matrix-v1/representative-matrix.json'
REQUEST = MATRIX.with_name('shared-crew-socks-request.json')


class ReviewFilesTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(dir=ROOT / 'experiments')
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.matrix = json.loads(MATRIX.read_bytes())
        self.style, = [s for s in self.matrix['styles'] if s['styleId'] == 'plain-crew-socks-v1']
        self.row = self.style['variants'][0]
        self.evidence = self.folder / 'review.json'
        self.row.update(status='runtime-admitted', admissionEvidence=self.evidence.relative_to(ROOT).as_posix())
        self.binding = {**self.row, 'styleId': self.style['styleId']}

    def test_bad_review_never_publishes_requests(self):
        for reason, receipt in (
            ('invalid-json', b'not JSON'),
            ('failed-review', json.dumps({'schema': REVIEW_SCHEMA, 'status':'failed', 'binding':self.binding}).encode()),
            ('different-body', json.dumps({'schema': REVIEW_SCHEMA, 'status':'passed',
                                           'binding':dict(self.binding,bodyType='other')}).encode()),
            ('self-authored', json.dumps({'schema': REVIEW_SCHEMA, 'status':'passed', 'binding':self.binding}).encode()),
        ):
            with self.subTest(reason=reason):
                self.evidence.write_bytes(receipt)
                self.assertTrue(any('admissionEvidence' in e for e in validate_matrix_files(self.matrix, ROOT)))
                matrix_path = self.folder / 'matrix.json'
                matrix_path.write_text(json.dumps(self.matrix), encoding='utf-8')
                out = self.folder / reason
                result = subprocess.run([sys.executable, '-B', str(ROOT/'scripts/production/variant_batch.py'),
                                         str(matrix_path), str(REQUEST), '--root', str(ROOT), '--output', str(out)],
                                        cwd=ROOT, text=True, encoding='utf-8', capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('admissionEvidence rejected', result.stdout)
                self.assertFalse(out.exists())

    def test_local_receipt_bytes_and_reviewed_binding_must_both_match(self):
        receipt = {'schema':REVIEW_SCHEMA,'status':'passed','binding':self.binding}
        self.evidence.write_text(json.dumps(receipt),encoding='utf-8')
        reviews = {'fixture':{'approval':evidence_pin(self.evidence,ROOT)}}
        check_declared_review(self.style['styleId'],self.row,ROOT,reviews)
        with self.assertRaisesRegex(ValueError, 'binding differs'):
            check_declared_review('other-style',self.row,ROOT,reviews)
        self.evidence.write_bytes(self.evidence.read_bytes()+b'\n')
        with self.assertRaisesRegex(ValueError, 'reviewed outfit index'):
            check_declared_review(self.style['styleId'],self.row,ROOT,reviews)
