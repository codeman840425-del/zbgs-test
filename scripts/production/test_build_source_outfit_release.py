"""Check that a profile edit cannot silently publish another body, destination or set of fits."""

import copy
import json
import unittest

import build_source_outfit_release as release


class ProfileBindingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = json.loads(release.PROFILES.read_bytes())[release.fit.BODY_TYPE]
        cls.receipt = json.loads(release.body.REPORT.read_bytes())
        cls.catalog = (release.ROOT / release.fit.TARGET_MANIFEST).read_bytes()

    def test_exact_profile_and_existing_assets(self):
        release.check_profile(self.profile, self.receipt)
        release.check_catalog(self.profile, self.catalog)

    def test_other_body_or_asset_location_fails(self):
        for field, value in [
            ('sha256', release.fit.SOURCE_SHA),
            ('url', '/elsewhere/body.vrm'),
            ('manifestUrl', '/elsewhere/equipment.json'),
        ]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                release.check_profile(dict(self.profile, **{field: value}), self.receipt)

    def test_changed_catalog_sha_or_outfit_id_fails(self):
        with self.assertRaisesRegex(ValueError, 'profile SHA'):
            release.check_catalog(self.profile, self.catalog + b' ')
        profile = copy.deepcopy(self.profile)
        profile['ids']['pants'] = profile['ids']['top']
        with self.assertRaisesRegex(ValueError, 'profile slots, IDs or body SHA'):
            release.check_catalog(profile, self.catalog)


if __name__ == '__main__':
    unittest.main()
