import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from production_paths import project_output
from record_budget import ROOT, measure


PAIR = ROOT/'output/m2-rule-batch-delivery-v1/pair'
SOURCE = ROOT/'experiments/worktrees/shape-ext-a-6e858e51'
VERSION = 'm2-technical-v1'


@unittest.skipUnless((PAIR/'receipt.json').is_file() and (SOURCE/'prototype/dist/build-info.json').is_file(),
                     'Supply the archived dual-pack D02 delivery and its fixed ordinary dist')
class ExternalRecordBudgetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records = PAIR/'records.json'
        cls.packs = sorted((PAIR/'shape-packs').iterdir())
        cls.items = json.loads(cls.records.read_bytes())
        cls.ids = [r['identity']['id'] for r in cls.items]

    def test_complete_closures_and_actor_sum(self):
        result = measure(self.records,SOURCE,VERSION,shape_packs=self.packs,concurrent_groups=[self.ids])
        self.assertEqual([a['recordSha256'] for a in result['records']],[r['integrity']['recordSha256'] for r in self.items])
        descriptors = {p['bodyType']:p for p in result['shapePacks']}
        chosen = []
        for row,signed in zip(result['records'],self.items):
            body = signed['appearanceRecipe']['base']
            self.assertEqual(row['avatarSha256'],body['sha256'])
            models = {m['path']:m for m in row['models'] if m['selected']}
            self.assertEqual(models['assets/'+body['bodyType']+'/body.vrm']['sha256'],body['sha256'])
            for gear in signed['appearanceRecipe']['equipment']['resources'].values():
                asset = models[gear['url'][1:]]
                self.assertEqual((asset['sha256'],asset['id']),(gear['sha256'],gear['id']))
            self.assertIn(descriptors[body['bodyType']]['indexSha256'],{f['sha256'] for f in row['files']})
            chosen.append({p for p,m in models.items() if m['class']=='garment'})
        self.assertEqual(chosen[0],chosen[1])
        self.assertEqual(len(chosen[0]),3)
        union = {f['path']:f['bytes'] for r in result['records'] for f in r['files']}
        self.assertEqual(sum(union.values()),result['closureUnionSourceBytes'])
        group = result['concurrentAssessment']['groups'][0]
        for name,total in group['sumAcrossSelectedActors'].items():
            self.assertEqual(total,sum(r['selectedCost']['totals'][name] for r in result['records']))
        self.assertFalse(result['concurrentAssessment']['runtimeAdmission'])
        self.assertEqual(result['ordinaryPCPerformance'],'unmeasured')

    def test_missing_unused_and_duplicate_packs(self):
        with self.assertRaisesRegex(ValueError,'Unknown record body'):
            measure(self.records,SOURCE,VERSION,shape_packs=self.packs[:1])
        with self.assertRaisesRegex(ValueError,'duplicate shape pack'):
            measure(self.records,SOURCE,VERSION,shape_packs=[self.packs[0]]*2)
        with tempfile.TemporaryDirectory(dir=project_output(ROOT/'output',__file__)) as scratch:
            single = Path(scratch)/'one.json'
            single.write_text(json.dumps(self.items[:1]),encoding='utf8')
            with self.assertRaisesRegex(ValueError,'Unused or duplicate shape pack'):
                measure(single,SOURCE,VERSION,shape_packs=self.packs)
            self.assertEqual(list(Path(scratch).iterdir()),[single])

    def test_resigned_conflicting_equipment_binding_fails(self):
        script = """
import fs from 'node:fs';
import {updateCharacterRecord} from './prototype/src/character-record.js';
import {deriveCharacterResourceIdentities} from './prototype/src/character-runtime-record.js';
const [a,b]=JSON.parse(fs.readFileSync(0,'utf8')), appearanceRecipe=structuredClone(a.appearanceRecipe);
const shoes=appearanceRecipe.equipment.resources.shoes;
const field=process.argv[1];
if(field==='url') shoes.url=appearanceRecipe.equipment.resources.pants.url;
else shoes[field]=b.appearanceRecipe.equipment.resources.shoes[field];
const resourceIdentities=deriveCharacterResourceIdentities(appearanceRecipe,a.liveAccessories,a.equipmentMaterials);
const altered=await updateCharacterRecord(a,{appearanceRecipe,resourceIdentities},{},{validateResources:()=>({status:'pending'})});
console.log(JSON.stringify([altered,b]));
"""
        with tempfile.TemporaryDirectory(dir=project_output(ROOT/'output',__file__)) as scratch:
            candidate=Path(scratch)/'records.json'
            for field in ('fitId','url','compatibleAvatarSha256'):
                with self.subTest(field=field):
                    result = subprocess.run(['node','--input-type=module','-e',script,field],
                                            input=self.records.read_bytes(),cwd=SOURCE,capture_output=True)
                    self.assertEqual(result.returncode,0,result.stderr)
                    candidate.write_bytes(result.stdout)
                    with self.assertRaisesRegex(ValueError,'equipment|Equipment|appearance admission'):
                        measure(candidate,SOURCE,VERSION,shape_packs=self.packs)


if __name__=='__main__':
    unittest.main()
