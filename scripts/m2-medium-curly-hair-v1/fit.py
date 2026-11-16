"""Generate an exact target fit only after head dependencies and real triangles pass."""
import argparse
import copy
import json
from pathlib import Path
import re
import sys
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-medium-curly-hair-v1'
sys.path.insert(0, str(Path(__file__).parent))
from build import source, sha, encoded, apply
from importlib.util import spec_from_file_location, module_from_spec
loader = spec_from_file_location('contact', Path(__file__).with_name('check-source.py'))
contact = module_from_spec(loader); loader.loader.exec_module(contact)
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, require


def validate_target(original, target, spec, inverse, head):
    a, b = original.doc, target.doc
    require(a['skins'] == b['skins'], 'Target skin structure differs')
    require(original.bind_by_name() == target.bind_by_name(), 'Target inverse binds differ')
    require(a['nodes'] == b['nodes'], 'Target node hierarchy or raw transforms differ')
    require(a['materials'] == b['materials'], 'Target materials differ')
    require(a.get('textures') == b.get('textures') and a.get('samplers') == b.get('samplers'), 'Texture declarations differ')
    require(len(a['images']) == len(b['images']), 'Image count differs')
    for image_a, image_b in zip(a['images'], b['images']):
        va, vb = a['bufferViews'][image_a['bufferView']], b['bufferViews'][image_b['bufferView']]
        ba = original.binary[va.get('byteOffset',0):va.get('byteOffset',0)+va['byteLength']]
        bb = target.binary[vb.get('byteOffset',0):vb.get('byteOffset',0)+vb['byteLength']]
        require(ba == bb, 'Embedded image bytes differ')
    require(len(a['meshes']) == len(b['meshes']), 'Target mesh structure differs')
    changed_head = 0; protected_head = 0; max_displacement = 0.; head_skin = []
    for ma, mb in zip(a['meshes'], b['meshes']):
        require(len(ma['primitives']) == len(mb['primitives']), 'Target primitive count differs')
        for pa, pb in zip(ma['primitives'], mb['primitives']):
            require(pa['material'] == pb['material'], 'Target primitive material differs')
            require(original.accessor(pa['indices']) == target.accessor(pb['indices']), 'Target index topology differs')
            for key in ['TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']:
                require(original.accessor(pa['attributes'][key]) == target.accessor(pb['attributes'][key]), 'Target UV/skin data differs')
            used = np.unique(np.array(original.accessor(pa['indices']),int))
            av = apply(np.array(original.accessor(pa['attributes']['POSITION'])), inverse)
            bv = apply(np.array(target.accessor(pb['attributes']['POSITION'])), inverse)
            name = a['materials'][pa['material']]['name']
            if name == spec['sourceMaterial']:
                require(np.array_equal(av[used], bv[used]), 'Target original cap geometry differs')
                require(np.array_equal(np.array(original.accessor(pa['attributes']['NORMAL']))[used], np.array(target.accessor(pb['attributes']['NORMAL']))[used]), 'Target cap normals differ')
            indices = np.array(original.accessor(pa['attributes']['JOINTS_0']),int)
            weights = np.array(original.accessor(pa['attributes']['WEIGHTS_0']))
            slot = a['skins'][0]['joints'].index(head)
            head_region = used[np.sum(np.where(indices[used] == slot, weights[used], 0),axis=1) > .98]
            delta = np.linalg.norm(bv[head_region]-av[head_region],axis=1)
            lower_front = (av[head_region,1] < .065)&(av[head_region,2] < -.025)&(np.abs(av[head_region,0]) < .115)&('SKIN' in name)
            require(np.all(delta[~lower_front] < 1e-7), 'Protected scalp/ear/eye or upper head geometry differs')
            require(np.max(delta,initial=0) <= .035, 'Lower face exceeds this fit method displacement envelope')
            changed_head += int(np.count_nonzero(delta>1e-7)); protected_head += int(np.count_nonzero(~lower_front))
            max_displacement = max(max_displacement,float(np.max(delta,initial=0)))
            if 'SKIN' in name:
                faces = np.array(target.accessor(pb['indices']),int).reshape(-1,3)
                faces = faces[bv[faces,1].min(1)>-.14]
                head_skin.extend(bv[faces])
    return np.array(head_skin), {'changedLowerFaceVertices':changed_head,'protectedHeadVertices':protected_head,
                                'maxHeadDisplacementM':max_displacement,'protectedHeadExact':True,'headBindingsExact':True,'hairMaterialAndImagesExact':True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target',required=True); parser.add_argument('--target-sha',required=True); parser.add_argument('--id',required=True)
    args = parser.parse_args(); require(re.fullmatch(r'[a-z0-9-]{1,64}',args.id), 'Unsafe target id')
    out = BASE/'fits'/args.id
    try:
        spec = json.loads((BASE/'spec.json').read_text(encoding='utf-8-sig'))
        original, _, cap, _, _, inverse, head = source(ROOT/spec['source']['path'], spec['sourceMaterial'])
        data = Path(args.target).resolve().read_bytes(); require(sha(data) == args.target_sha, 'Target SHA differs')
        target = GLB(data); skin, dependencies = validate_target(original,target,spec,inverse,head)
        files, summaries = {}, []
        for preset in spec['presets']:
            folder = BASE/'budget'/preset['id']
            manifest = json.loads((folder/'manifest.json').read_bytes()); fit = json.loads((folder/'fit.json').read_bytes())
            hair = GLB((folder/'hair.glb').read_bytes()); primitive = hair.doc['meshes'][0]['primitives'][0]
            positions = np.array(hair.accessor(primitive['attributes']['POSITION']))
            faces = np.array(hair.accessor(primitive['indices']),int).reshape(-1,3)
            added = faces[faces.min(1)>=len(cap)]
            hits = contact.intersections(positions[added],skin)
            require(not hits, 'Target skin intersects authored added curl triangles: '+preset['id'])
            fit['id'] = preset['id']+'-'+args.id+'-fit'; fit['targetBodySha256'] = args.target_sha
            manifest['compatibleBodies'] = [args.target_sha]
            manifest['fit'] = {'id':fit['id'],'version':1,'url':'/assets/m2-medium-curly-hair-v1/fits/'+args.id+'/'+preset['id']+'/fit.json','sha256':sha(encoded(fit))}
            files[preset['id']+'/fit.json'] = encoded(fit); files[preset['id']+'/manifest.json'] = encoded(manifest)
            summaries.append({'styleId':preset['id'],'fitSha256':sha(encoded(fit)),'manifestSha256':sha(encoded(manifest)),'addedCurlSkinIntersections':len(hits)})
        report = {'targetId':args.id,'targetSha256':args.target_sha,'sourceSha256':spec['source']['sha256'],'dependencies':dependencies,
                  'presets':summaries,'runtimeAccepted':False,'scope':'Exact head/material/bind dependencies plus bounded lower-front-face differences and actual bind-pose added-curl/target-skin triangle test. Dynamic contacts and visible acceptance require game QA.'}
        files['fit-report.json'] = encoded(report)
        for name, payload in files.items():
            require(not (out/name).exists() or (out/name).read_bytes() == payload,'Conflicting target output: '+name)
        for name, payload in files.items():
            p = out/name; p.parent.mkdir(parents=True,exist_ok=True)
            if not p.exists(): p.write_bytes(payload)
        print(json.dumps(report))
    except Exception as error:
        out.mkdir(parents=True,exist_ok=True);(out/'FAILED.json').write_bytes(encoded({'targetId':args.id,'targetSha256':args.target_sha,'error':str(error),'runtimeAccepted':False}))
        raise


if __name__ == '__main__':
    main()

