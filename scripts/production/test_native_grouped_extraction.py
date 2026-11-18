import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from flow import GLB
from production_paths import project_output

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts/native-vroid-equipment-extract.py'
module = importlib.util.spec_from_file_location('grouped_extraction', SCRIPT)
extractor = importlib.util.module_from_spec(module)
module.loader.exec_module(extractor)
HISTORICAL = 'assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-face-unmasked.vrm'
PRIVATE = 'output/native-group-extractor-13/studio-13-nami-yu.vrm'


def recipe(source=HISTORICAL):
    if source == PRIVATE:
        identity = '254fedea6b91273df2f1d6f06670b954f3a77a3aa0d14dc4b679aeda475ee83a'
        node = 112
        members = [(3,11,'N00_007_01_Tops_01_CLOTH_01 (Instance)'), (4,12,'N00_007_01_Tops_01_CLOTH_02 (Instance)')]
    else:
        identity = 'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce'
        node = 131
        # A diagnostic selection from the tracked fixture. These pieces have different authored slots.
        members = [(3,11,'N00_004_01_Tops_01_CLOTH (Instance)'), (1,9,'N00_001_01_Bottoms_01_CLOTH (Instance)')]
    return dict(sourcePath=source,sourceSha256=identity,sourceNode=node,sourceMesh=1,sourceNodeName='Body',sourceSkin=1,
                idPrefix='group-diagnostic-',equipmentId='group-diagnostic-v1',limits=['CPU selection only','No authored subtraction or fit'],
                primitiveGroups=[dict(slot='top',members=[dict(primitive=p,material=m,materialName=n) for p,m,n in members])])


def view_bytes(glb,index):
    view = glb.doc['bufferViews'][index]
    start = view.get('byteOffset',0)
    return glb.binary[start:start+view['byteLength']]


def material_graph(glb,value):
    """Resolve retained glTF texture infos all the way to actual image bytes and sampler state."""
    if isinstance(value,list):
        return [material_graph(glb,v) for v in value]
    if not isinstance(value,dict):
        return value
    result = {}
    for key,v in value.items():
        if key.lower().endswith('texture') and isinstance(v,dict) and 'index' in v:
            tex = glb.doc['textures'][v['index']]
            image = glb.doc['images'][tex['source']]
            sampler = glb.doc['samplers'][tex['sampler']] if 'sampler' in tex else None
            result[key] = [dict((k,x) for k,x in v.items() if k!='index'),
                           dict((k,x) for k,x in tex.items() if k not in ('source','sampler')),sampler,
                           dict((k,x) for k,x in image.items() if k!='bufferView'),
                           hashlib.sha256(view_bytes(glb,image['bufferView'])).hexdigest()]
        else:
            result[key] = material_graph(glb,v)
    return result


class NativeGroupedExtraction(unittest.TestCase):
    def check_group(self,spec):
        files = extractor.extract(spec,None)
        item, = json.loads(files['equipment.json'])['items']
        replay = GLB(files[item['url']])
        original = GLB((ROOT/spec['sourcePath']).read_bytes())
        trace = json.loads(files['extraction.json'])
        self.assertEqual(trace['schema'],'native-vroid-grouped-equipment-extraction-v1')
        record, = trace['records']
        self.assertFalse(item['fitAccepted'] or item['runtimeAccepted'])
        self.assertEqual(record['selectionStatus'],'diagnostic-group-selection')
        self.assertEqual(trace['sourceSha256'],spec['sourceSha256'])
        self.assertEqual(item['sha256'],hashlib.sha256(files[item['url']]).hexdigest())
        self.assertEqual(replay.doc['scenes'],original.doc['scenes'])
        nodes = copy.deepcopy(original.doc['nodes'])
        for node in nodes:
            node.pop('mesh',None)
            node.pop('skin',None)
        nodes[spec['sourceNode']].update(mesh=0,skin=0)
        self.assertEqual(replay.doc['nodes'],nodes)
        self.assertEqual(replay.doc['samplers'],original.doc['samplers'])
        self.assertEqual(replay.bind_by_name().keys(),{b['sourceBone'] for b in item['bindings']})
        source_skin = original.doc['skins'][spec['sourceSkin']]
        delivered_skin, = replay.doc['skins']
        self.assertEqual(source_skin['joints'],delivered_skin['joints'])
        self.assertEqual(source_skin['skeleton'],delivered_skin['skeleton'])
        self.assertEqual(original.accessor(source_skin['inverseBindMatrices']),replay.accessor(delivered_skin['inverseBindMatrices']))
        for matrix,binding in zip(replay.accessor(delivered_skin['inverseBindMatrices']),item['bindings'],strict=True):
            self.assertEqual(list(matrix),binding['inverseBindMatrix'])
        for old,new in record['maps']['bufferViews'].items():
            self.assertEqual(view_bytes(original,int(old)),view_bytes(replay,new))
        mesh, = replay.doc['meshes']
        selected = spec['primitiveGroups'][0]['members']
        self.assertEqual(replay.doc['extras']['sourcePrimitives'],[s['primitive'] for s in selected])
        self.assertEqual(len(replay.doc['materials']),len({s['material'] for s in selected}))
        for pick,own,row in zip(selected,mesh['primitives'],record['members'],strict=True):
            old = original.doc['meshes'][spec['sourceMesh']]['primitives'][pick['primitive']]
            self.assertEqual(row['sourcePrimitive'],pick['primitive'])
            self.assertEqual(row['sourceMaterial'],pick['material'])
            self.assertEqual(old['material'],pick['material'])
            self.assertEqual(old['attributes'].keys(),own['attributes'].keys())
            for key,accessor in old['attributes'].items():
                self.assertEqual(original.accessor(accessor),replay.accessor(own['attributes'][key]))
            self.assertEqual(original.accessor(old['indices']),replay.accessor(own['indices']))
            self.assertEqual(material_graph(original,original.doc['materials'][old['material']]),
                             material_graph(replay,replay.doc['materials'][own['material']]))
        return files

    def test_historical_single_primitive_packages_are_byte_identical(self):
        for body in ('face','waist'):
            build = ROOT / f'assets-source/native-vroid-{body}-factory-equipment-v1/build.py'
            with self.subTest(body=body):
                subprocess.run([sys.executable,'-B',str(build),'--check'],check=True,stdout=subprocess.PIPE)

    def test_tracked_two_material_group_roundtrips_shared_views(self):
        self.check_group(recipe())

    @unittest.skipUnless((ROOT/PRIVATE).is_file(),'Private pinned Studio #13 VRM is optional')
    def test_studio_13_actual_group_roundtrips(self):
        files = self.check_group(recipe(PRIVATE))
        record, = json.loads(files['extraction.json'])['records']
        self.assertEqual([p['triangles'] for p in record['members']],[4072,4072])
        self.assertEqual(record['joints'],111)

    def test_selector_collisions_and_mismatches(self):
        original = recipe()
        original_group, = original['primitiveGroups']
        first,second = original_group['members']
        groups = [
            ([dict(slot='top',members=[first,first])],'claimed twice'),
            ([original_group,dict(slot='bottom',members=[second])],'claimed twice'),
            ([dict(slot='top',members=[first]),dict(slot='top',members=[second])],'duplicate equipment slot'),
            ([dict(slot='top',members=[dict(first,material=9)])],'Material identity differs'),
            ([dict(slot='top',members=[dict(first,materialName='Tops')])],'Material identity differs'),
            ([dict(slot='top',members=[dict(first,primitive=-1)])],'Invalid primitive index'),
            ([dict(slot='top',members=[])],'Empty primitive group'),
        ]
        for selection, reason in groups:
            with self.subTest(reason=reason), self.assertRaisesRegex(ValueError,reason):
                extractor.extract(dict(original,primitiveGroups=selection),None)
        legacy = {k:v for k,v in original.items() if k!='primitiveGroups'}
        with self.assertRaisesRegex(ValueError,'duplicate equipment slot'):
            extractor.extract(dict(legacy,primitives=[('top',3,'Tops'),('top',1,'Bottoms')]),None)
        with self.assertRaisesRegex(ValueError,'either primitives or primitiveGroups'):
            extractor.extract(dict(original,primitives=[]),None)

    def test_repeated_source_material_is_remapped_once(self):
        # Alter only the fixture's second material reference; keep both geometry streams.
        source = GLB((ROOT/HISTORICAL).read_bytes())
        spec = recipe()
        first,second = spec['primitiveGroups'][0]['members']
        second.update(material=first['material'],materialName=first['materialName'])
        source.doc['meshes'][1]['primitives'][second['primitive']]['material'] = first['material']
        js = json.dumps(source.doc,separators=(',',':')).encode()
        js += b' '*(-len(js)%4)
        raw = (struct.pack('<4sII',b'glTF',2,28+len(js)+len(source.binary))+
               struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(source.binary),b'BIN\0')+source.binary)
        with tempfile.TemporaryDirectory(dir=project_output(ROOT/'output',__file__)) as work:
            src = Path(work)/'test.vrm'
            src.write_bytes(raw)
            self.check_group(dict(spec,sourcePath=src.relative_to(ROOT).as_posix(),sourceSha256=hashlib.sha256(raw).hexdigest()))

    def test_writer_preflights_all_actual_paths(self):
        with tempfile.TemporaryDirectory(dir=project_output(ROOT/'output',__file__)) as work:
            fixture = Path(work)
            operator,other = fixture/'operator',fixture/'other'
            subprocess.run(['git','init','-q',str(operator)],check=True)
            script = operator/'scripts'/SCRIPT.name
            helper = script.parent/'production/production_paths.py'
            helper.parent.mkdir(parents=True)
            shutil.copyfile(ROOT/'scripts/production/production_paths.py',helper)
            other.mkdir()
            target = operator/'out'
            target.mkdir()
            link = target/'redirect'
            if os.name=='nt':
                subprocess.run(['cmd.exe','/d','/c','mklink','/j',str(link),str(other)],check=True,capture_output=True)
            else:
                link.symlink_to(other,target_is_directory=True)
            with patch.object(extractor,'__file__',str(script)):
                for output in (other,link):
                    with self.assertRaisesRegex(ValueError,'inside the production tool main checkout'):
                        extractor.write_outputs({'x':b'a'},output)
                with self.assertRaisesRegex(ValueError,'inside the production tool main checkout'):
                    extractor.write_outputs({'first':b'a','redirect/second':b'b'},target)
                self.assertFalse((target/'first').exists())
                self.assertEqual(list(other.iterdir()),[])
                files = {'nested/asset':b'ok'}
                extractor.write_outputs(files,target)
                self.assertEqual(extractor.write_outputs(files,target),extractor.write_outputs(files,target,check=True))
                with self.assertRaisesRegex(ValueError,'existing output differs'):
                    extractor.write_outputs({'nested/asset':b'different'},target)

    def test_writer_rechecks_file_appearing_after_preflight(self):
        exists = Path.exists
        with tempfile.TemporaryDirectory(dir=project_output(ROOT/'output',__file__)) as work:
            for arriving in (b'other',b'expected'):
                target = Path(work) / arriving.decode()
                checks = 0

                def concurrent(path):
                    nonlocal checks
                    if path == target:
                        checks += 1
                        if checks == 2:
                            with path.open('xb') as f:
                                f.write(arriving)
                    return exists(path)

                with self.subTest(arriving=arriving), patch.object(Path,'exists',concurrent):
                    if arriving == b'expected':
                        extractor.write_outputs({target.name:b'expected'},target.parent)
                    else:
                        with self.assertRaisesRegex(ValueError,'concurrent output differs'):
                            extractor.write_outputs({target.name:b'expected'},target.parent)
                self.assertEqual(target.read_bytes(),arriving)


if __name__=='__main__':
    unittest.main()
