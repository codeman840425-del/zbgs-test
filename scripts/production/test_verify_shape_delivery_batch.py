import copy
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

import verify_shape_delivery_batch as delivery


class VerifyBatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = delivery.ROOT/'evidence/m2-first-rule-delivery-v1'
        cls.raw = (source/'game/signed.json').read_bytes()
        cls.fit = json.loads((source/'fit/candidate.json').read_bytes())
        body = cls.fit['bodyType']
        cls.record = next(r for r in json.loads(cls.raw) if r['appearanceRecipe']['base']['bodyType']==body)
        cls.catalog = json.loads((delivery.ROOT/f'prototype/public/assets/{body}/equipment.json').read_bytes())
        cls.item = {'bodyType':body,'bodySha256':cls.fit['bodySha256'],'recipeSha256':cls.fit['recipeSha256'],
                    'identity':cls.record['identity'],'revision':cls.record['revision'],
                    'recordSha256':cls.record['integrity']['recordSha256']}

    def test_records_recompute_both_hashes_including_identity(self):
        delivery.signed_hashes(self.raw)
        forged = json.loads(self.raw)
        forged[0]['identity']['name'] += ' changed'
        with self.assertRaisesRegex(ValueError,'Invalid D02 record'):
            delivery.signed_hashes(json.dumps(forged).encode())

    def test_distinct_fit_and_equipment_bindings_survive_shared_garment_hash(self):
        delivery.record_bindings(self.item,self.record,self.catalog,self.fit)
        other = next(r for r in json.loads(self.raw) if r['identity']!=self.record['identity'])
        other_shoe = other['appearanceRecipe']['equipment']['resources']['shoes']
        self.assertEqual(other_shoe['sha256'],self.record['appearanceRecipe']['equipment']['resources']['shoes']['sha256'])
        bad_fit = copy.deepcopy(self.fit)
        bad_fit['equipment']['shoes']['fitSha256'] = other_shoe['compatibleAvatarSha256']
        with self.assertRaisesRegex(ValueError,'fitSha256'):
            delivery.record_bindings(self.item,self.record,self.catalog,bad_fit)
        bad_catalog = copy.deepcopy(self.catalog)
        next(row for row in bad_catalog['items'] if row['slot']=='shoes')['compatibleAvatarSha256'] = other_shoe['compatibleAvatarSha256']
        with self.assertRaisesRegex(ValueError,'Signed catalog differs'):
            delivery.record_bindings(self.item,self.record,bad_catalog,self.fit)

    def test_shared_file_requires_both_package_origins_and_their_own_fit_declarations(self):
        name = 'assets/shared-shoes.glb'
        bindings = {'a':('assets/body-a/equipment.json','a-shoes'),'b':('assets/body-b/equipment.json','b-shoes')}
        refs = [{'indexSha256':s,'packPath':name} for s in bindings]
        refs += [{'indexSha256':s,'packPath':p,'equipmentId':item} for s,(p,item) in bindings.items()]
        row = {'sha256':'same bytes','provenance':refs}
        origins = {name:bindings}
        delivery.shared_paths({name:row},origins)
        with self.assertRaisesRegex(ValueError,'Multiple game copies'):
            delivery.shared_paths({name:row,'assets/alias.glb':row},origins)
        with self.assertRaisesRegex(ValueError,'origins differ'):
            delivery.shared_paths({name:{**row,'provenance':refs[1:]}},origins)
        crossed = copy.deepcopy(refs)
        crossed[-1]['indexSha256'] = 'a'
        with self.assertRaisesRegex(ValueError,'catalog binding differs'):
            delivery.shared_paths({name:{**row,'provenance':crossed}},origins)

    @unittest.skipUnless(os.environ.get('SHAPE_BATCH_DELIVERY') and os.environ.get('SHAPE_BATCH_SOURCE'),
                         'Supply a produced batch directory and its independent original source')
    def test_real_delivery_and_forged_approval_without_modifying_delivered_files(self):
        source = Path(os.environ['SHAPE_BATCH_SOURCE'])
        out = Path(os.environ['SHAPE_BATCH_DELIVERY']).resolve()
        result = delivery.verify(source,out)
        self.assertEqual(len(result['sharedGarments']),3)
        self.assertEqual(result['wholeOutfitAdmission'],'not-evaluated')
        with self.assertRaisesRegex(ValueError,'External delivery receipt digest differs'):
            delivery.verify(source,out,'wrong receipt pin')
        old_read = Path.read_bytes
        def substituted(path):
            raw = old_read(path)
            if path==out/'receipt.json':
                receipt=json.loads(raw)
                receipt['wholeOutfitAdmission']='approved'
                return json.dumps(receipt).encode()
            return raw
        with patch.object(Path,'read_bytes',substituted), self.assertRaisesRegex(ValueError,'wholeOutfitAdmission'):
            delivery.verify(source,out)
        garment = out/'game'/next(iter(result['sharedGarments']))
        def damaged(path):
            raw = old_read(path)
            return bytes([raw[0]^1])+raw[1:] if path==garment else raw
        with patch.object(Path,'read_bytes',damaged), self.assertRaisesRegex(ValueError,'sha256 differs'):
            delivery.verify(source,out)


if __name__=='__main__':
    unittest.main()
