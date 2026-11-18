import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from variant_matrix import _resolve_reference, runtime_variants, validate_matrix, validate_matrix_files

ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / "assets-source/variant-matrix-v1/representative-matrix.json"


def real_row(style_id, body):
    matrix = json.loads(MATRIX.read_bytes())
    style = next(s for s in matrix["styles"] if s["styleId"] == style_id)
    row = next(v for v in style["variants"] if v["bodyType"] == body)
    return {"schema":matrix["schema"], "styles":[{"styleId":style_id, "variants":[row]}]}, row


def variant(body="female-v1", status="runtime-admitted"):
    row = {
        "bodyType": body,
        "variantVersion": "v1",
        "resourceManifest": f"assets/{body}/dress.json",
        "fitManifest": f"fits/{body}/dress.json",
        "coverageManifest": f"coverage/{body}/dress.json",
        "bodySha256": "a" * 64,
        "resourceManifestSha256": "b" * 64,
        "coverageManifestSha256": "c" * 64,
        "status": status,
    }
    if status == "runtime-admitted":
        row["admissionEvidence"] = f"evidence/{body}/dress.json"
    return row


class VariantMatrixTests(unittest.TestCase):
    def test_exact_body_resolution_never_falls_back(self):
        data = {"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [variant()]}]}
        self.assertEqual(len(runtime_variants(data, "female-v1")), 1)
        self.assertEqual(runtime_variants(data, "female-v2"), [])

    def test_candidate_is_not_runtime_admitted(self):
        data = {"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [variant(status="candidate")]}]}
        self.assertEqual(runtime_variants(data, "female-v1"), [])

    def test_missing_fit_is_rejected(self):
        row = variant()
        del row["fitManifest"]
        self.assertTrue(validate_matrix({"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [row]}]}))

    def test_admitted_requires_evidence(self):
        row = variant()
        del row["admissionEvidence"]
        self.assertTrue(validate_matrix({"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [row]}]}))

    def test_over_budget_candidate_cannot_be_promoted(self):
        row = variant()
        row["budgetStatus"] = "reject-static-over-budget"
        self.assertTrue(validate_matrix({"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [row]}]}))

    def test_admission_blockers_cannot_be_promoted(self):
        row = variant()
        row["admissionBlockers"] = ["runtimeRecordAndBudget"]
        self.assertTrue(validate_matrix({"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [row]}]}))

    def test_duplicate_body_variant_is_rejected(self):
        self.assertTrue(validate_matrix({"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [variant(), variant("female-v1", "candidate")]}]}))

    def test_same_body_can_have_distinct_versions(self):
        newer = variant()
        newer["variantVersion"] = "v2"
        data = {"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [variant(), newer]}]}
        self.assertEqual(validate_matrix(data), [])

    def test_variant_version_is_required(self):
        row = variant()
        del row["variantVersion"]
        self.assertTrue(validate_matrix({"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [row]}]}))

    def test_file_closure_checks_manifest_hashes_and_fragments(self):
        matrix = json.loads(MATRIX.read_bytes())
        self.assertEqual(validate_matrix_files(matrix, ROOT), [])
        data, row = real_row('uniform-top-v1', 'female')
        row['fitManifestSha256'] = '0' * 64
        self.assertTrue(any('fitManifest SHA' in e for e in validate_matrix_files(data, ROOT)))
        row['fitManifestSha256'] = row['resourceManifestSha256']
        self.assertEqual(validate_matrix_files(data, ROOT), [])
        for key, fragment in [('fitManifest','missing.fitId'), ('resourceManifest','missing'),
                              ('coverageManifest','other.preserveOriginalBody')]:
            with self.subTest(key=key):
                original = row[key]
                row[key] = original.split('#')[0] + '#' + fragment
                self.assertTrue(validate_matrix_files(data, ROOT))
                row[key] = original
        row['resourceManifestSha256'] = '0'*64
        self.assertTrue(any('resourceManifest SHA' in e for e in validate_matrix_files(data, ROOT)))

    def test_resigned_documents_reject_bad_json_fields_bindings_and_member_ids(self):
        def write_catalog(doc, item):
            doc['items'].append(dict(item))
        fixtures = [
            ('uniform-top-v1','female','resourceManifest', write_catalog, 'duplicate id'),
            ('uniform-top-v1','female','resourceManifest', lambda d,i:i.pop('bindings'), 'missing bindings'),
            ('uniform-top-v1','female','resourceManifest', lambda d,i:i['bindings'][0]['inverseBindMatrix'].__setitem__(0,15), 'inverse bind'),
            ('uniform-top-v1','female','resourceManifest', lambda d,i:i.update(compatibleAvatarSha256='0'*64), 'compatibleAvatarSha256'),
            ('uniform-top-v1','female','resourceManifest', lambda d,i:i.update(preserveOriginalBody=False), 'preserveOriginalBody'),
            ('lower-shorts-v1','male','resourceManifest', lambda d,i:i.update(fitId='wrong-fit'), 'fitId'),
            ('plain-crew-socks-v1','male','fitManifest', lambda d,i:d.update(garmentId='wrong-member'), 'garmentId'),
            ('plain-crew-socks-v1','female','fitManifest', lambda d,i:d.update(baseAvatarSha256='0'*64), 'baseAvatarSha256'),
            ('plain-crew-socks-v1','female','fitManifest', lambda d,i:d.pop('bodyCoverageMasks'), 'bodyCoverageMasks'),
            ('uniform-top-v1','native-contour-roundness-a-v1','coverageManifest',
             lambda d,i:d['equipment'].append(d['equipment'][0].copy()), 'duplicate id'),
            ('lower-shorts-v1','native-contour-cheek-b-v1','coverageManifest',
             lambda d,i:d['equipment'][1].update(covered=True), 'covered'),
            ('plain-crew-socks-v1','female','fitManifest', None, 'cannot be read'),
        ]
        with tempfile.TemporaryDirectory(dir=ROOT / 'experiments') as directory:
            for style, body, key, mutate, reason in fixtures:
                with self.subTest(style=style, body=body, reason=reason):
                    data, row = real_row(style, body)
                    original = _resolve_reference(ROOT, row[key])
                    doc = json.loads(original.read_bytes())
                    member = row['resourceManifest'].split('#')[1]
                    item = next((r for r in doc.get('items',[]) if r['id']==member), None)
                    # References in a copied manifest still identify the original test assets.
                    for entry in [item, doc.get('covered')]:
                        if entry and not entry['url'].startswith('/'):
                            entry['url'] = '/' + (original.parent / entry['url']).relative_to(ROOT/'prototype/public').as_posix()
                    if mutate:
                        mutate(doc,item)
                    copy = Path(directory)/'manifest.json'
                    copy.write_bytes(json.dumps(doc).encode() if mutate else b'invalid {')
                    for field in ('resourceManifest','fitManifest','coverageManifest'):
                        if _resolve_reference(ROOT, row[field]) == original:
                            _, sep, fragment = row[field].partition('#')
                            row[field] = copy.relative_to(ROOT).as_posix() + sep + fragment
                            row[field+'Sha256'] = hashlib.sha256(copy.read_bytes()).hexdigest()
                    errors = validate_matrix_files(data, ROOT)
                    self.assertTrue(any(reason in error for error in errors), errors)

    def test_body_mask_and_garment_pair_do_not_substitute_for_unrelated_bottoms(self):
        for body, filename in [('female','/assets/body-coverage-risk-v1/female-top.json'),
                               ('male','/assets/m2-garment-coverage-v1/coverage-mask.json')]:
            for style in ('uniform-top-v1','lower-shorts-v1'):
                with self.subTest(body=body,style=style):
                    data,row = real_row(style,body)
                    row['coverageManifest'] = filename
                    row['coverageManifestSha256'] = hashlib.sha256(_resolve_reference(ROOT,filename).read_bytes()).hexdigest()
                    errors = validate_matrix_files(data,ROOT)
                    if style == 'uniform-top-v1':
                        self.assertEqual(errors, [])
                    else:
                        self.assertTrue(any('coverageManifest' in error for error in errors), errors)

    def test_file_closure_rejects_missing_fit(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'experiments') as directory:
            root = Path(directory)
            data = {"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [variant()]}]}
            errors = validate_matrix_files(data, root)
            self.assertTrue(any('resourceManifest' in error for error in errors))
            self.assertTrue(any('fitManifest' in error for error in errors))


if __name__ == "__main__":
    unittest.main()
