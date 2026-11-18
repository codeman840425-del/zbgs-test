"""Independently re-read native skinned triangles, rotate ankle/toes and rasterize material IDs on CPU."""
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation

import make

draw_file = make.ROOT / 'assets-source/native-male-crew-socks-fit-v1/diagnosis.py'
loader = importlib.util.spec_from_file_location('native_raster', draw_file)
raster = importlib.util.module_from_spec(loader)
loader.loader.exec_module(raster)


def arrays(g, mesh, prim):
    node = next(n for n in g.doc['nodes'] if n.get('mesh') == mesh)
    skin = g.doc['skins'][node['skin']]
    return (np.array(g.accessor(prim['attributes']['POSITION'])), np.array(g.accessor(prim['attributes']['JOINTS_0']),int),
            np.array(g.accessor(prim['attributes']['WEIGHTS_0'])), [g.doc['nodes'][i]['name'] for i in skin['joints']])


def transforms(g, ankle_deg, toe_deg):
    world = make.native.world_transforms(g.doc)
    human = g.doc['extensions']['VRMC_vrm']['humanoid']['humanBones']
    result = {}
    for side in ['left','right']:
        parent = np.eye(4)
        for suffix, angle in [('Foot',ankle_deg),('Toes',toe_deg)]:
            i = human[side+suffix]['node']
            rest = world(i)
            local = np.eye(4)
            local[:3,:3] = Rotation.from_euler('x', angle, degrees=True).as_matrix()
            parent = parent @ rest @ local @ np.linalg.inv(rest)
            result[g.doc['nodes'][i]['name']] = parent
    return result


def pose(data, delta):
    pos, joints, weights, names = data
    out = pos.copy()
    for name, mat in delta.items():
        if name in names:
            w = np.where(joints == names.index(name), weights, 0).sum(1)
            out += w[:,None] * (pos @ mat[:3,:3].T + mat[:3,3] - pos)
    return out


def main():
    out = make.HERE / 'corrected'
    entry = json.loads((out/'entry.json').read_bytes())
    g = make.GLB((make.ROOT / make.read(make.TARGET)['avatar']['path']).read_bytes())
    s = make.GLB((out/entry['url']).read_bytes())
    parts = []
    for mi, mesh in enumerate(g.doc['meshes']):
        for prim in mesh['primitives']:
            material = g.doc['materials'][prim['material']]
            role = next((i for i,token in enumerate(['_Body_00_SKIN','_Bottoms_','_Shoes_'],1) if token in material['name']),None)
            if not role:
                continue
            data = arrays(g,mi,prim)
            faces = np.array(g.accessor(prim['indices']),int).reshape(-1,3)
            faces = faces[data[0][faces,1].min(1) < .34]
            uv = np.array(g.accessor(prim['attributes']['TEXCOORD_0']))
            parts.append((role,data,faces,uv,raster.image_alpha(g,material),material))
    for prim in s.doc['meshes'][0]['primitives']:
        data = arrays(s,0,prim)
        faces = np.array(s.accessor(prim['indices']),int).reshape(-1,3)
        parts.append((4,data,faces,np.zeros((len(data[0]),2)),np.full((1,1),255),{}))
    palette = np.array([[242,241,237],[227,171,133],[78,100,134],[48,50,58],[166,182,190]],dtype=np.uint8)
    records = []
    for label, ankle, toe in [('rest',0,0),('ankle-flex-toe',20,-15),('ankle-extend-toe',-20,15)]:
        delta = transforms(g,ankle,toe)
        posed = [pose(data,delta) for _,data,*_ in parts]
        row = {'pose':label,'localAnkleDegrees':ankle,'localToeDegrees':toe,'views':{},'triangleContacts':[]}
        for j in [3,4]:
            side = {'self':len(make.qa.intersections(posed[j],parts[j][2],posed[j],parts[j][2],True))}
            for k,name in enumerate(['body','bottom','shoes']):
                side[name] = len(make.qa.intersections(posed[j],parts[j][2],posed[k],parts[k][2]))
            row['triangleContacts'].append(side)
        panels = []
        for view, sideview, direction in [('front',False,1),('back',False,-1),('left',True,1),('right',True,-1)]:
            h,w,scale = 370,400,1100
            depth = np.full((h,w),-np.inf)
            ids = np.zeros((h,w),int)
            for j,(role,_,faces,uv,alpha,material) in enumerate(parts):
                positions = posed[j].copy()
                if sideview:
                    positions = positions[:,[2,1,0]].copy()
                    positions[:,0] *= -1
                positions[:,1] += .03
                raster.draw(depth,ids,direction,positions,uv,faces,alpha,material,role,scale)
                if role == 3:
                    before, old_depth = ids.copy(), depth.copy()
            changed = (before == 3) & (ids == 4)
            rows, cols = np.where(changed)
            row['views'][view] = {'baselineShoePixels':int((before==3).sum()), 'sockPixels':int((ids==4).sum()),
                                 'baselineShoePixelsNowSock':int(changed.sum()), 'maximumDepthAdvanceOverShoeM':
                                 float((depth[changed]-old_depth[changed]).max()) if changed.any() else 0,
                                 'lowerYOfShoeChangeM':float((h - rows.max() - .5)/scale - .03) if len(rows) else None}
            panels.extend([palette[before],palette[ids]])
        Image.fromarray(np.concatenate(panels,axis=1)).save(out/(label+'-ids.png'))
        records.append(row)
    make.crew.write(out/'pose-readback.json', {'method':'Raw-joint local rotations from the actual native bind pose. CPU linear blend skinning and four orthographic material-ID views with source base-color alpha cutoff. Each image shows front/back/left/right with socks off/on.', 'poses':records})
    print([(row['pose'],row['triangleContacts'],[v['baselineShoePixelsNowSock'] for v in row['views'].values()]) for row in records])


if __name__ == '__main__':
    main()
