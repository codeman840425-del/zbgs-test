"""Shared exact primitive/buffer extraction for native body equipment."""
import copy,hashlib,json,struct,os,tempfile
import importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sha=lambda b:hashlib.sha256(b).hexdigest()
js=lambda v:(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf-8')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def element(rows, index, label):
    require(type(index) is int and 0 <= index < len(rows), f"Invalid {label} index: {index!r}")
    return rows[index]


def selections(spec, primitives, materials):
    """Resolve every claim before emitting a file. Member order is draw order."""
    grouped = "primitiveGroups" in spec
    require(grouped != ("primitives" in spec), "Specify either primitives or primitiveGroups")
    groups = spec["primitiveGroups" if grouped else "primitives"]
    require(isinstance(groups, (list, tuple)) and groups, "Expected nonempty garment selections")
    claimed_slots, claimed_members, result = set(), set(), []
    for group in groups:
        if grouped:
            require(isinstance(group, dict) and set(group) == {"slot", "members"},
                    "Each primitive group requires a slot and explicit members")
            slot, members = group["slot"], group["members"]
            token = slot
        else:
            slot, primitive_id, token = group
            members = [{"primitive":primitive_id}]
        require(slot in ("top","bottom","shoes") and slot not in claimed_slots,
                f"Invalid or duplicate equipment slot: {slot!r}")
        claimed_slots.add(slot)
        require(isinstance(members, list) and members, f"Empty primitive group: {slot}")
        resolved = []
        for member in members:
            if grouped:
                require(isinstance(member, dict) and set(member) == {"primitive","material","materialName"},
                        f"Expected primitive, material and materialName for {slot}")
            primitive_id = member["primitive"]
            primitive = element(primitives, primitive_id, "primitive")
            require(primitive_id not in claimed_members, f"Source primitive claimed twice: {primitive_id}")
            claimed_members.add(primitive_id)
            mat_id = primitive["material"]
            mat = element(materials, mat_id, "material")
            if grouped:
                require(type(member["material"]) is int and member["material"] == mat_id and
                        isinstance(member["materialName"], str) and member["materialName"] == mat["name"],
                        f"Material identity differs for {slot} primitive {primitive_id}")
            else:
                require(isinstance(token, str) and token and token in mat["name"],
                        f"Material selector differs for {slot} primitive {primitive_id}")
            require(primitive.get("mode", 4) == 4 and not primitive.get("targets") and
                    not primitive.get("extensions") and "indices" in primitive and
                    {"POSITION","NORMAL","TEXCOORD_0","JOINTS_0","WEIGHTS_0"} <= primitive["attributes"].keys() and
                    "VRMC_materials_mtoon" in mat.get("extensions", {}),
                    f"Expected indexed skinned MToon triangles for {slot} primitive {primitive_id}")
            resolved.append((primitive_id, primitive, mat))
        result.append((slot, token, resolved))
    return result


def extract(spec, out):
    source_path = (ROOT/Path(spec["sourcePath"])).resolve()
    require(source_path.is_relative_to(ROOT), "Source VRM escapes the project")
    source_pin = spec["sourceSha256"]
    raw = source_path.read_bytes()
    require(sha(raw) == source_pin, "Source VRM SHA-256 differs")
    require(len(raw) >= 28 and struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)) and
            raw[16:20] == b'JSON', "Invalid GLB2 header")
    size = struct.unpack_from('<I', raw, 12)[0]
    source = json.loads(raw[20:20+size])
    require(raw[24+size:28+size] == b'BIN\0' and
            struct.unpack_from('<I', raw, 20+size)[0] == len(raw)-28-size, "Invalid GLB BIN chunk")
    binary = raw[28+size:]
    buffer, = source['buffers']
    require('uri' not in buffer and 0 <= len(binary)-buffer['byteLength'] <= 3, "Expected one embedded buffer")
    mesh_node_id = spec['sourceNode'];mesh_id = spec['sourceMesh'];skin_id = spec['sourceSkin']
    require(element(source['nodes'], mesh_node_id, 'node') ==
            {'name': spec['sourceNodeName'], 'mesh': mesh_id, 'skin': skin_id}, "Wrong or transformed source node")
    mesh = element(source['meshes'], mesh_id, 'mesh')
    skin = element(source['skins'], skin_id, 'skin')
    require(len({element(source['nodes'], i, 'joint')['name'] for i in skin['joints']}) == len(skin['joints']),
            "Ambiguous raw joint names")
    human = {v['node']: k for k, v in source['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}
    ia = element(source['accessors'], skin['inverseBindMatrices'], 'inverse bind matrices')
    iv = element(source['bufferViews'], ia['bufferView'], 'inverse bind view')
    require(ia['componentType'] == 5126 and ia['type'] == 'MAT4' and not ia.get('sparse') and
            ia['count'] == len(skin['joints']) > 0 and iv.get('byteStride',64) >= 64 and
            ia.get('byteOffset',0) >= 0 and ia.get('byteOffset',0)+(ia['count']-1)*iv.get('byteStride',64)+64 <= iv['byteLength'],
            "Invalid inverse bind matrices")
    ibm = [list(struct.unpack_from('<16f', binary, iv.get('byteOffset', 0)+ia.get('byteOffset', 0)+i*iv.get('byteStride', 64))) for i in range(ia['count'])]
    bindings = [dict(sourceBone=source['nodes'][n]['name'], targetRawBone=source['nodes'][n]['name'], humanoidSemantic=human.get(n), inverseBindMatrix=ibm[i]) for i,n in enumerate(skin['joints'])]
    files, items, records = {}, [], []
    grouped = "primitiveGroups" in spec
    for slot, token, members in selections(spec, mesh["primitives"], source["materials"]):
        blob, views, accessors, textures, images = bytearray(), [], [], [], []
        vm, am, tm, im = {}, {}, {}, {}
        def view(old):
            if old not in vm:
                v = copy.deepcopy(element(source['bufferViews'], old, 'bufferView'))
                require(v['buffer'] == 0 and 0 <= v.get('byteOffset', 0) and v['byteLength'] > 0 and
                        v.get('byteOffset', 0) + v['byteLength'] <= buffer['byteLength'] and not v.get('extensions'),
                        f"Invalid or unsupported bufferView {old}")
                payload = binary[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']]
                blob.extend(b'\0'*(-len(blob)%4))
                v['byteOffset'] = len(blob); blob.extend(payload)
                vm[old] = len(views); views.append(v)
            return vm[old]
        def accessor(old):
            entry = element(source['accessors'], old, 'accessor')
            if old not in am:
                a = copy.deepcopy(entry)
                require(not a.get('sparse') and type(a['count']) is int and a['count'] > 0,
                        f"Invalid or sparse accessor {old}")
                a['bufferView'] = view(a['bufferView'])
                layout = views[a['bufferView']]
                width = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a['componentType']] * {
                    'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
                stride = layout.get('byteStride',width)
                require(stride >= width and a.get('byteOffset',0) >= 0 and
                        a.get('byteOffset',0)+(a['count']-1)*stride+width <= layout['byteLength'],
                        f"Accessor {old} exceeds its bufferView")
                am[old] = len(accessors); accessors.append(a)
            return am[old]
        def image(old):
            if old not in im:
                i = copy.deepcopy(element(source['images'], old, 'image'))
                require('uri' not in i, f"Expected embedded image {old}")
                i['bufferView'] = view(i['bufferView'])
                im[old] = len(images); images.append(i)
            return im[old]
        def texture(old):
            if old not in tm:
                t = copy.deepcopy(element(source['textures'], old, 'texture'))
                require(not t.get('extensions'), f"Unsupported texture extension at {old}")
                if 'sampler' in t:
                    element(source.get('samplers',[]), t['sampler'], 'sampler')
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
        output_primitives, output_materials, material_map, provenance = [], [], {}, []
        own_skin = copy.deepcopy(skin)
        for primitive_id, primitive, material in members:
            p = copy.deepcopy(primitive)
            p['attributes'] = {k: accessor(v) for k,v in primitive['attributes'].items()}
            p['indices'] = accessor(primitive['indices'])
            index_stream = accessors[p['indices']]
            vertex_count = accessors[p['attributes']['POSITION']]['count']
            require(index_stream['type']=='SCALAR' and index_stream['componentType'] in (5121,5123,5125) and
                    index_stream['count']%3==0 and all(accessors[i]['count']==vertex_count for i in p['attributes'].values()),
                    f"Invalid triangle or attribute streams for primitive {primitive_id}")
            # Preserve the historical single-member buffer order: geometry, skin, material images.
            own_skin['inverseBindMatrices'] = accessor(skin['inverseBindMatrices'])
            old_material = primitive['material']
            if old_material not in material_map:
                m = copy.deepcopy(material)
                material_textures(m)
                material_map[old_material] = len(output_materials)
                output_materials.append(m)
            p['material'] = material_map[old_material]
            output_primitives.append(p)
            provenance.append(dict(sourcePrimitive=primitive_id,sourceMaterial=old_material,
                                   materialName=material['name'],sourceAttributes=primitive['attributes'],
                                   sourceIndices=primitive['indices'],triangles=source['accessors'][primitive['indices']]['count']//3,
                                   attributeRows=source['accessors'][primitive['attributes']['POSITION']]['count']))
        nodes = copy.deepcopy(source['nodes'])
        for node in nodes:
            node.pop('mesh', None); node.pop('skin', None)
        nodes[mesh_node_id].update(mesh=0, skin=0)
        # All original nodes and joint order retained; no JOINTS rewrite, renormalization or bind bake.
        identity = {'sourcePrimitives':[row['sourcePrimitive'] for row in provenance]} if grouped else {'sourcePrimitive':primitive_id}
        doc = dict(asset={'version':'2.0','generator':spec.get('generator','native-vroid-equipment-exact-extraction-v1')}, scene=source.get('scene',0), scenes=copy.deepcopy(source['scenes']), nodes=nodes, skins=[own_skin], meshes=[{'name': 'Native-'+token, 'primitives':output_primitives}], materials=output_materials, textures=textures, images=images, samplers=copy.deepcopy(source.get('samplers',[])), accessors=accessors, bufferViews=views, buffers=[{'byteLength':len(blob)}], extras={'sourceSha256': source_pin,'sourceMesh':mesh_id,**identity,'scope':'internal technical specimen; not runtime admitted'})
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
        maps = dict(accessors=am,bufferViews=vm,textures=tm,images=im)
        if grouped:
            item.update(fitAccepted=False,runtimeAccepted=False)
            records.append(dict(id=ident,sourceNode=mesh_node_id,sourceMesh=mesh_id,sourceSkin=skin_id,
                                members=provenance,maps={**maps,'materials':material_map},joints=len(bindings),
                                selectionStatus='diagnostic-group-selection',fitAccepted=False,runtimeAccepted=False))
        else:
            row, = provenance
            records.append(dict(id=ident,sourceNode=mesh_node_id,sourceMesh=mesh_id,
                                sourcePrimitive=primitive_id,sourceMaterial=primitive['material'],materialName=material['name'],
                                maps=maps,sourceSkin=skin_id,joints=len(bindings),sourceAttributes=row['sourceAttributes'],
                                sourceIndices=row['sourceIndices'],triangles=row['triangles'],attributeRows=row['attributeRows']))
    files['equipment.json'] = js(dict(schema='zbgs-equipment-v1',id=spec['equipmentId'],status='internal-extraction-not-runtime-admitted',items=items))
    schema = 'native-vroid-grouped-equipment-extraction-v1' if grouped else spec.get('extractionSchema','native-vroid-equipment-extraction-v1')
    files['extraction.json'] = js(dict(schema=schema,sourcePath=str(source_path.relative_to(ROOT)).replace('\\','/'),sourceSha256=source_pin,sourceBytes=len(raw),records=records,sourceMeta=source['extensions']['VRMC_vrm']['meta'],method='Exact original primitive and bufferViews; all nodes, joint ordering, IBM, authored normals/UV and material texture graph retained; no unlit conversion'))
    return files


def write_outputs(files,out,check=False):
    out = Path(out)
    if not check:
        # Factory build.py callers import this file directly by path.
        module = importlib.util.spec_from_file_location(
            'native_equipment_output_paths', Path(__file__).with_name('production') / 'production_paths.py')
        paths = importlib.util.module_from_spec(module)
        module.loader.exec_module(paths)
        actual = paths.project_output(out, __file__)
        require(actual == Path(os.path.abspath(out)), "Redirected output package")
        out = actual
    targets = {}
    for name, data in files.items():
        relative = Path(name)
        require(relative.parts and not relative.anchor and '..' not in relative.parts, 'Output escapes package: '+name)
        target = out / relative
        if not check:
            actual = paths.project_output(target, __file__)
            require(actual == target and actual.is_relative_to(out), 'Redirected output file: '+name)
        require(target not in targets, 'Duplicate output file: '+name)
        targets[target] = data
        if target.exists() and (not target.is_file() or target.read_bytes()!=data):
            raise ValueError('existing output differs: '+name)
        if check and not target.exists():
            raise FileNotFoundError('check missing output: '+name)
    if not check:
        for target, data in targets.items():
            if target.exists():
                require(paths.project_output(target, __file__) == target and target.is_file() and
                        target.read_bytes() == data, 'concurrent output differs: '+str(target))
                continue
            target.parent.mkdir(parents=True,exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:
                temporary = Path(f.name)
                f.write(data)
            try:
                try:
                    os.link(temporary,target)
                except FileExistsError:
                    require(paths.project_output(target, __file__) == target and target.is_file() and
                            target.read_bytes() == data, 'concurrent output differs: '+str(target))
            finally:
                temporary.unlink()
    return {k:{'bytes':len(v),'sha256':sha(v)} for k,v in files.items()}
