"""Shared exact primitive/buffer extraction for native body equipment."""
import copy,hashlib,json,struct,os,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sha=lambda b:hashlib.sha256(b).hexdigest()
js=lambda v:(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf-8')

def extract(spec, out):
    source_path = (ROOT/Path(spec["sourcePath"])).resolve()
    source_pin = spec["sourceSha256"]
    raw = source_path.read_bytes()
    assert sha(raw) == source_pin
    assert struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw))
    size = struct.unpack_from('<I', raw, 12)[0]
    source = json.loads(raw[20:20+size])
    assert raw[24+size:28+size] == b'BIN\0'
    binary = raw[28+size:]
    mesh_node_id = spec['sourceNode'];mesh_id = spec['sourceMesh'];skin_id = spec['sourceSkin']
    assert source['nodes'][mesh_node_id] == {'name': spec['sourceNodeName'], 'mesh': mesh_id, 'skin': skin_id}
    skin = source['skins'][skin_id]
    assert len(set(source['nodes'][i]['name'] for i in skin['joints'])) == len(skin['joints'])
    human = {v['node']: k for k, v in source['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}
    ia = source['accessors'][skin['inverseBindMatrices']]
    iv = source['bufferViews'][ia['bufferView']]
    assert ia['componentType'] == 5126 and ia['type'] == 'MAT4' and not ia.get('sparse')
    ibm = [list(struct.unpack_from('<16f', binary, iv.get('byteOffset', 0)+ia.get('byteOffset', 0)+i*iv.get('byteStride', 64))) for i in range(ia['count'])]
    bindings = [dict(sourceBone=source['nodes'][n]['name'], targetRawBone=source['nodes'][n]['name'], humanoidSemantic=human.get(n), inverseBindMatrix=ibm[i]) for i,n in enumerate(skin['joints'])]
    files, items, records = {}, [], []
    for slot, primitive_id, token in spec['primitives']:
        primitive = source['meshes'][mesh_id]['primitives'][primitive_id]
        material = source['materials'][primitive['material']]
        assert token in material['name'] and not primitive.get('targets')
        assert 'VRMC_materials_mtoon' in material['extensions']
        blob, views, accessors, textures, images = bytearray(), [], [], [], []
        vm, am, tm, im = {}, {}, {}, {}
        def view(old):
            if old not in vm:
                v = copy.deepcopy(source['bufferViews'][old]); assert v['buffer'] == 0
                payload = binary[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']]
                blob.extend(b'\0'*(-len(blob)%4))
                v['byteOffset'] = len(blob); blob.extend(payload)
                vm[old] = len(views); views.append(v)
            return vm[old]
        def accessor(old):
            if old not in am:
                a = copy.deepcopy(source['accessors'][old]); assert not a.get('sparse')
                a['bufferView'] = view(a['bufferView'])
                am[old] = len(accessors); accessors.append(a)
            return am[old]
        def image(old):
            if old not in im:
                i = copy.deepcopy(source['images'][old]); assert 'uri' not in i
                i['bufferView'] = view(i['bufferView'])
                im[old] = len(images); images.append(i)
            return im[old]
        def texture(old):
            if old not in tm:
                t = copy.deepcopy(source['textures'][old]); assert not t.get('extensions')
                t['source'] = image(t['source'])
                tm[old] = len(textures); textures.append(t)
            return tm[old]
        def material_textures(value):
            if isinstance(value, dict):
                for k,v in value.items():
                    if 'texture' in k.lower() and isinstance(v, dict) and 'index' in v:
                        v['index'] = texture(v['index'])
                    else: material_textures(v)
            elif isinstance(value, list):
                for v in value: material_textures(v)
        p = copy.deepcopy(primitive)
        p['attributes'] = {k: accessor(v) for k,v in primitive['attributes'].items()}
        p['indices'] = accessor(primitive['indices']); p['material'] = 0
        own_skin = copy.deepcopy(skin); own_skin['inverseBindMatrices'] = accessor(skin['inverseBindMatrices'])
        m = copy.deepcopy(material); material_textures(m)
        nodes = copy.deepcopy(source['nodes'])
        for node in nodes:
            node.pop('mesh', None); node.pop('skin', None)
        nodes[mesh_node_id].update(mesh=0, skin=0)
        # All original nodes and joint order retained; no JOINTS rewrite, renormalization or bind bake.
        doc = dict(asset={'version':'2.0','generator':spec.get('generator','native-vroid-equipment-exact-extraction-v1')}, scene=source.get('scene',0), scenes=copy.deepcopy(source['scenes']), nodes=nodes, skins=[own_skin], meshes=[{'name': 'Native-'+token, 'primitives':[p]}], materials=[m], textures=textures, images=images, samplers=copy.deepcopy(source.get('samplers',[])), accessors=accessors, bufferViews=views, buffers=[{'byteLength':len(blob)}], extras={'sourceSha256': source_pin,'sourceMesh':mesh_id,'sourcePrimitive':primitive_id,'scope':'internal technical specimen; not runtime admitted'})
        extensions = set()
        def scan(v):
            if isinstance(v,dict):
                extensions.update(v.get('extensions',{}))
                for child in v.values(): scan(child)
            elif isinstance(v,list):
                for child in v: scan(child)
        scan(doc)
        doc['extensionsUsed'] = sorted(extensions)
        doc['extensionsRequired'] = [x for x in source.get('extensionsRequired',[]) if x in extensions]
        jb = json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8'); jb += b' '*(-len(jb)%4)
        blob.extend(b'\0'*(-len(blob)%4))
        output = struct.pack('<4sII',b'glTF',2,28+len(jb)+len(blob))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(blob),b'BIN\0')+blob
        ident=spec['idPrefix']+('shorts' if slot=='bottom' else slot)+'-v1'
        filename=ident+'.glb';files[filename]=output
        item=dict(id=ident,name={'top':'原生上衣','bottom':'原生短裤','shoes':'原生鞋'}[slot],slot=slot,url=filename,sha256=sha(output),bytes=len(output),compatibleAvatarSha256=source_pin,preserveOriginalBody=True,requiresRawSkeleton=True,bindings=bindings,sourceLicense={'status':'internal-study-only','sourceVRMMeta':source['extensions']['VRMC_vrm']['meta']},limits=[spec['limits'][0], spec['limits'][1],'All original Body attribute rows retained; only selected primitive indices drawn'])
        items.append(item)
        records.append(dict(id=ident,sourceNode=mesh_node_id,sourceMesh=mesh_id,sourcePrimitive=primitive_id,sourceMaterial=primitive['material'],materialName=material['name'],maps=dict(accessors=am,bufferViews=vm,textures=tm,images=im),sourceSkin=skin_id,joints=len(bindings),sourceAttributes=primitive['attributes'],sourceIndices=primitive['indices'],triangles=source['accessors'][primitive['indices']]['count']//3,attributeRows=source['accessors'][primitive['attributes']['POSITION']]['count']))
    files['equipment.json'] = js(dict(schema='zbgs-equipment-v1',id=spec['equipmentId'],status='internal-extraction-not-runtime-admitted',items=items))
    files['extraction.json'] = js(dict(schema=spec.get('extractionSchema','native-vroid-equipment-extraction-v1'),sourcePath=str(source_path.relative_to(ROOT)).replace('\\','/'),sourceSha256=source_pin,sourceBytes=len(raw),records=records,sourceMeta=source['extensions']['VRMC_vrm']['meta'],method='Exact original primitive and bufferViews; all nodes, joint ordering, IBM, authored normals/UV and material texture graph retained; no unlit conversion'))
    return files


def write_outputs(files,out,check=False):
 out=Path(out)
 # Preflight every output before creating directories or writing any file.
 for name,data in files.items():
  if Path(name).is_absolute() or '..' in Path(name).parts:raise ValueError('Output escapes package: '+name)
  target=out/name
  if target.exists() and (not target.is_file() or target.read_bytes()!=data):raise ValueError('existing output differs: '+name)
  if check and not target.exists():raise FileNotFoundError('check missing output: '+name)
 if not check:
  for name,data in files.items():
   target=out/name
   if target.exists():continue
   target.parent.mkdir(parents=True,exist_ok=True)
   with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:temporary=Path(f.name);f.write(data)
   try:
    try:os.link(temporary,target)
    except FileExistsError:
     if target.read_bytes()!=data:raise ValueError('concurrent output differs: '+name)
   finally:temporary.unlink()
 return {k:{'bytes':len(v),'sha256':sha(v)} for k,v in files.items()}
