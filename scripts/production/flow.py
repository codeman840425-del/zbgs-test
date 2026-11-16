"""Read-only production command index. Never imports exporters or launches a process."""
import argparse
import hashlib
import json
import math
import pathlib
import struct
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def local(root, name):
    require(isinstance(name, str) and name, 'Nonempty relative path required')
    p = pathlib.Path(name.replace('\\', '/'))
    require(not p.is_absolute() and ':' not in name and '..' not in p.parts, 'Unsafe path: '+name)
    resolved = (root/p).resolve()
    require(resolved.is_relative_to(root.resolve()), 'Path escapes workspace: '+name)
    return resolved


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def validate_config(config, root=ROOT):
    require(config.get('schema') == 'zbgs-production-command-index-v1', 'Unknown workflow schema')
    ids = set()
    for workflow in config['workflows']:
        identifier = workflow['id']
        require(identifier not in ids, 'Duplicate workflow: '+identifier)
        ids.add(identifier)
        require(workflow['kind'] in ['shorts', 'accessories', 'dance', 'variant', 'source-package'], 'Unknown workflow kind')
        for name in workflow['sources']+workflow['requirements']:
            local(root, name)
        require(set(workflow['stages']) == {'source', 'export', 'check', 'readback'}, 'Missing workflow stage')
        for commands in list(workflow['stages'].values())+[workflow.get('sourceRebuild', [])]:
            for command in commands:
                require(isinstance(command['argv'], list) and all(isinstance(x, str) and x for x in command['argv']), 'argv must be nonempty strings')
                require(command['argv'][0] in ['python', 'node', 'experiments/tools/blender-4.5.9-windows-x64/blender.exe'], 'Unknown tool')
                for name in command['writes']:
                    local(root, name)
                scripts = [x for x in command['argv'] if x.startswith('scripts/')]
                require(bool(scripts), 'Script entry missing')
                for script in scripts:
                    require(local(root, script).is_file(), 'Missing command script: '+script)
        require(workflow.get('limits') and workflow.get('recovery'), 'Scope/recovery missing')
    return ids


class GLB:
    def __init__(self, data):
        require(len(data) >= 20 and data[:4] == b'glTF', 'Not a GLB')
        version, length = struct.unpack_from('<II', data, 4)
        require(version == 2 and length == len(data), 'GLB version/length mismatch')
        offset = 12; self.binary = b''; self.doc = None
        while offset < length:
            size, kind = struct.unpack_from('<II', data, offset); offset += 8
            require(offset+size <= length, 'Truncated GLB chunk')
            chunk = data[offset:offset+size]; offset += size
            if kind == 0x4E4F534A:
                self.doc = json.loads(chunk)
            elif kind == 0x004E4942:
                self.binary = chunk
        require(self.doc is not None, 'GLB JSON absent')
        require(all('uri' not in b for b in self.doc.get('buffers', [])), 'External GLB buffers not supported')

    def accessor(self, index):
        a = self.doc['accessors'][index]
        require('sparse' not in a, 'Sparse accessor requires dedicated reader')
        view = self.doc['bufferViews'][a['bufferView']]
        sizes = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT4':16}
        formats = {5121:'B', 5123:'H', 5125:'I', 5126:'f'}
        fmt = '<'+formats[a['componentType']]*sizes[a['type']]
        size = struct.calcsize(fmt); stride = view.get('byteStride', size)
        offset = view.get('byteOffset', 0)+a.get('byteOffset', 0)
        require(offset+max(0,a['count']-1)*stride+size <= len(self.binary), 'Accessor exceeds binary')
        return [struct.unpack_from(fmt, self.binary, offset+i*stride) for i in range(a['count'])]

    def bind_by_name(self):
        result = {}
        for skin in self.doc.get('skins', []):
            matrices = self.accessor(skin['inverseBindMatrices'])
            require(len(matrices) == len(skin['joints']), 'Bind matrix count mismatch')
            for joint, matrix in zip(skin['joints'], matrices):
                name = self.doc['nodes'][joint]['name']
                if name in result:
                    require(max(abs(a-b) for a,b in zip(matrix,result[name])) < 1e-6, 'Conflicting bind identity')
                result[name] = matrix
        return result


class Validator:
    def __init__(self, root=ROOT):
        self.root = root; self.cache = {}; self.observed = []

    def json(self, name):
        return read_json(local(self.root, name))

    def pin(self, name, expected, size=None):
        path = local(self.root, name)
        require(isinstance(expected,str) and len(expected)==64 and all(c in '0123456789abcdef' for c in expected), 'Invalid SHA declaration: '+name)
        if path not in self.cache:
            data = path.read_bytes(); self.cache[path] = (data, hashlib.sha256(data).hexdigest())
        data, actual = self.cache[path]
        require(actual == expected, 'SHA mismatch: '+name)
        if size is not None:
            require(len(data) == size, 'Byte count mismatch: '+name)
        row = {'path':name.replace('\\','/'), 'sha256':actual, 'bytes':len(data)}
        if row not in self.observed:
            self.observed.append(row)
        return data

    def url(self, url):
        require(url.startswith('/assets/') and '?' not in url and '#' not in url, 'Expected local asset URL')
        return 'prototype/public'+url

    def item(self, manifest, identifier, collection='items'):
        items = manifest[collection]; names = [x['id'] for x in items]
        require(len(names)==len(set(names)), 'Duplicate asset IDs in manifest')
        require(names.count(identifier)==1, 'Missing exact ID: '+identifier)
        return next(x for x in items if x['id']==identifier)

    def equipment(self, item, avatar_sha, body, manifest_path):
        require(item['compatibleAvatarSha256']==avatar_sha, 'Wrong body fit: '+item['id'])
        require(item['preserveOriginalBody'] is True and item['requiresRawSkeleton'] is True, 'Body/raw skeleton preservation contract changed')
        asset=self.url(item['url']) if item['url'].startswith('/') else str(pathlib.PurePosixPath(manifest_path).parent/item['url'])
        glb = GLB(self.pin(asset, item['sha256'], item['bytes']))
        exported = glb.bind_by_name(); actual_body = body.bind_by_name()
        bindings = item['bindings']; names = [b['sourceBone'] for b in bindings]
        require(len(names)==len(set(names)) and set(names)==set(exported), 'Binding declarations differ from GLB')
        for b in bindings:
            require(b['targetRawBone'] in actual_body, 'Target raw bone absent')
            require(len(b['inverseBindMatrix'])==16 and all(math.isfinite(v) for v in b['inverseBindMatrix']), 'Invalid bind matrix')
            for matrix in [exported[b['sourceBone']], actual_body[b['targetRawBone']]]:
                require(max(abs(a-v) for a,v in zip(matrix,b['inverseBindMatrix'])) < 2e-6, 'Inverse bind mismatch: '+b['sourceBone'])
        vertices = 0
        for node in glb.doc['nodes']:
            if 'mesh' not in node: continue
            require('skin' in node, 'Unskinned garment primitive')
            count = len(glb.doc['skins'][node['skin']]['joints'])
            for primitive in glb.doc['meshes'][node['mesh']]['primitives']:
                attrs=primitive['attributes']; weights=glb.accessor(attrs['WEIGHTS_0']);joints=glb.accessor(attrs['JOINTS_0'])
                require(len(weights)==len(joints), 'Weight count mismatch')
                for ws,js in zip(weights,joints):
                    require(all(math.isfinite(w) and w>=0 for w in ws) and abs(sum(ws)-1)<2e-6, 'Invalid vertex weights')
                    require(all(0<=j<count for j in js), 'Joint index outside skin')
                vertices += len(weights)
        return {'id':item['id'],'fitSha256':avatar_sha,'weightedVertices':vertices,'bones':len(exported)}

    def validate(self, workflow, candidate_dir=None):
        for source in workflow['sources']:
            require(local(self.root,source).is_file(), 'Missing editable source: '+source)
        missing_tools=[x for x in workflow['requirements'] if not local(self.root,x).is_file()]
        ident=workflow['identity'];kind=workflow['kind'];details=[]
        require(not candidate_dir or kind=='dance', '--candidate-dir currently supports technical-dance only')
        if kind=='source-package':
            from source_packages import validate_package
            details.append(validate_package(self, ident, require, GLB))
        elif kind=='shorts':
            spec=self.json(ident['spec']);base=self.json('assets-source/m1b/spec.json')
            require(spec['compatibleAvatarSha256']==base['roundtripSha256'], 'Shorts/base pin differs')
            body=GLB(self.pin(base['roundtrip'],base['roundtripSha256']))
            self.pin(base['source'],base['sourceSha256']);self.pin(base['editableSource'],base['editableSourceSha256'])
            editable=self.json('assets-source/m1b/shorts/editable-report.json');self.pin(editable['blend'],editable['blendSha256'])
            item=self.item(self.json(ident['manifest']),spec['id'])
            require(ident['itemIds']==[spec['id']], 'Shorts index ID differs')
            require(all(item[k]==spec[k] for k in ['fitId','styleId']), 'Shorts fit/style mismatch')
            require(0<spec['hemAboveKneeMeters']<.25 and 0<spec['hemThicknessMeters']<.01, 'Invalid shorts parameter range')
            details.append(self.equipment(item,base['roundtripSha256'],body,ident['manifest']))
        elif kind=='accessories':
            manifest=self.json(ident['manifest']);self.pin('assets-source/m1c-accessories/parameters.json',manifest['parameterSha256'])
            for identifier in ident['itemIds']:
                item=self.item(manifest,identifier);g=GLB(self.pin(self.url(item['url']),item['sha256'],item['bytes']))
                require(not g.doc.get('skins') and not g.doc.get('animations'), 'Unexpected skinned/animated accessory')
                for key, socket in item['sockets'].items():
                    nodes=[n for n in g.doc['nodes'] if n.get('name')=='socket_'+key]
                    require(len(nodes)==1, 'Missing accessory socket')
                    require(nodes[0].get('extras',{}).get('semantic')==key, 'Socket semantic mismatch')
                    require(max(abs(a-b) for a,b in zip(nodes[0].get('translation',[0,0,0]),socket['position']))<1e-6, 'Socket position mismatch')
                details.append({'id':identifier,'sockets':list(item['sockets'])})
            for grip in self.json(ident['grips'])['items']:
                accessory=self.item(manifest,grip['accessoryId'])
                require(grip['accessorySha256']==accessory['sha256'],'Grip uses stale microphone geometry')
                data=json.loads(self.pin(self.url(grip['url']),grip['sha256'],grip['bytes']))
                require(data.get('compatibleAvatarSha256')==grip['compatibleAvatarSha256'],'Grip body mismatch')
                require(data.get('id')==grip['id'] and data.get('accessoryId')==accessory['id'] and data.get('compatibleAccessorySha256')==accessory['sha256'],'Grip payload version/accessory mismatch')
                details.append({'gripId':grip['id'],'compatibleAvatarSha256':grip['compatibleAvatarSha256']})
        elif kind=='variant':
            spec=self.json(ident['spec']);catalog=self.json(ident['catalog']);profile=self.item(catalog,ident['profileId'],'profiles')
            source=self.json('assets-source/m1-variants/'+profile['id']+'/build-report.json')
            self.pin(spec['sourceBlend'],spec['sourceBlendSha256']);self.pin(spec['sourceVRM'],spec['sourceVRMSha256'])
            self.pin(source['editableBlend'],source['editableBlendSha256'])
            require(profile['sha256']==source['vrmSha256']==source['repeatExportSha256'],'Derived VRM/export report mismatch')
            require(catalog['originalAvatarSha256']==spec['sourceVRMSha256'],'Original-body identity changed')
            body=GLB(self.pin(self.url(profile['url']),profile['sha256']))
            manifest=self.json(self.url(profile['manifestUrl']))
            require(set(profile['ids'].values())=={x['id'] for x in manifest['items']},'Derived equipment roles mismatch')
            for identifier in profile['ids'].values():details.append(self.equipment(self.item(manifest,identifier),profile['sha256'],body,self.url(profile['manifestUrl'])))
        else:
            config=self.json(ident['config']);self.pin(config['source'],config['sourceSha256'])
            manifest_path=(candidate_dir.rstrip('/')+'/dance-imports.json') if candidate_dir else ident['manifest']
            manifest=self.json(manifest_path);require(manifest['sourceSha256']==config['sourceSha256'],'Dance source identity mismatch')
            if candidate_dir:
                require(self.json(candidate_dir.rstrip('/')+'/dance-technical-v1.config.json')==config,'Candidate source parameters differ; review before publishing new version')
                checks=self.json(candidate_dir.rstrip('/')+'/qa/source-qa.json')['checks'];require(checks and all(checks.values()),'Generated dance source numeric checks failed')
            for identifier in ident['itemIds']:
                entry=self.item(manifest,identifier,'entries');asset=str(pathlib.PurePosixPath(manifest_path).parent/entry['file'])
                g=GLB(self.pin(asset,entry['sha256']));clips=[a for a in g.doc.get('animations',[]) if a['name']==entry['clip']]
                require(len(clips)==1,'Declared clip missing/duplicate');clip=clips[0]
                require(entry['duration']==config['duration'] and entry['playback']=='once-then-idle' and entry['heldPropsAllowed'] is False,'Dance playback contract changed')
                require(entry['rootPolicy']=='local-displacement','Dance root displacement contract changed')
                maxima=[]
                for sampler in clip['samplers']:
                    times=[x[0] for x in g.accessor(sampler['input'])]
                    require(times and all(math.isfinite(t) for t in times) and all(a<=b for a,b in zip(times,times[1:])),'Invalid animation time channel')
                    maxima.append(max(times))
                require(abs(max(maxima)-entry['duration'])<1e-5,'Actual clip duration differs')
                details.append({'id':identifier,'clip':entry['clip'],'duration':max(maxima),'channels':len(clip['channels'])})
        return {'workflow':workflow['id'],'structuralReadbackPassed':True,'assets':details,'observedPins':self.observed,'missingLocalToolPrerequisites':missing_tools,'toolsExecuted':False,'runtimeOrVisualAcceptance':'Not established; consult docs/CAPABILITIES.md and matching fixed evidence'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['list','show','validate','dry-run'])
    parser.add_argument('workflow',nargs='?',default='all')
    parser.add_argument('--candidate-dir')
    args=parser.parse_args()
    config=read_json(ROOT/'scripts/production/workflows.json');ids=validate_config(config)
    require(args.workflow=='all' or args.workflow in ids,'Unknown workflow')
    selected=[w for w in config['workflows'] if args.workflow in ['all',w['id']]]
    if args.command=='list':
        result={'readOnly':True,'workflows':[{k:w[k]for k in ['id','title','kind']}for w in selected]}
    elif args.command in ['show','dry-run']:
        result={'readOnly':True,'commandsExecuted':False,'cwd':'repository root','workflows':selected}
    else:
        require(not args.candidate_dir or args.workflow=='technical-dance','Select technical-dance for candidate validation')
        records=[]
        for w in selected:
            try:records.append(Validator().validate(w,args.candidate_dir))
            except (ValueError,KeyError,OSError,struct.error) as error:records.append({'workflow':w['id'],'structuralReadbackPassed':False,'error':str(error)})
        result={'readOnly':True,'commandsExecuted':False,'results':records}
        failed=not all(r['structuralReadbackPassed']for r in records)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 1 if args.command=='validate' and failed else 0


if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,KeyError,OSError) as error:
        print(json.dumps({'error':str(error),'commandsExecuted':False},ensure_ascii=False));sys.exit(1)
