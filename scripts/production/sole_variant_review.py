"""Read both GLBs back, compare the authored skin and rasterize the original texture on the CPU."""
from collections import Counter
from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from flow import GLB, ROOT, require
from garment_source_mapping import json_bytes
from native_import import digest
from native_mesh_budget import accessor
from production_paths import project_output, publish_new_directory
from sole_variant import GENERATED, RECIPE, run

OUT = ROOT/'evidence/m2-sole-variant-v1/asset'


def streams(glb):
    prim = glb.doc['meshes'][0]['primitives'][0]
    attrs = {k:accessor(glb, i) for k, i in prim['attributes'].items()}
    img = glb.doc['bufferViews'][glb.doc['images'][0]['bufferView']]
    png = glb.binary[img['byteOffset']:img['byteOffset']+img['byteLength']]
    return attrs, accessor(glb, prim['indices']).reshape(-1,3), png


def open_edges(pos, tris):
    edges = Counter()
    for tri in tris:
        for a,b in zip(tri, np.roll(tri,-1)):
            edges[tuple(sorted((tuple(pos[a]), tuple(pos[b]))))] += 1
    return {e:n for e,n in edges.items() if n != 2}


def compare(flat, thick, rise):
    src, faces, png = streams(flat)
    new, current, current_png = streams(thick)
    require(png == current_png and flat.bind_by_name() == thick.bind_by_name(), 'Changed color texture or rig')
    n = len(src['POSITION'])
    require(np.array_equal(current[:len(faces)],faces) and all(
        np.array_equal(values,new[k][:n]) for k,values in src.items() if k != 'POSITION'), 'Changed source corners or attributes')
    uv_bottom = src['TEXCOORD_0'][faces,1].max(axis=1) < .26
    cap = np.unique(faces[uv_bottom])
    p, q = src['POSITION'], new['POSITION']
    delta = q[:n] - p
    require(np.array_equal(delta[:,[0,2]], np.zeros((n,2))) and np.max(np.abs(delta[cap,1]+rise)) < 1e-7
            and np.array_equal(q[faces[~uv_bottom]],p[faces[~uv_bottom]]), 'Sole translation or upper differs')
    require(open_edges(p,faces) == open_edges(q,current), 'Added an open or nonmanifold welded edge')
    # Tie every sidewall corner to an exact source corner with identical skin influences.
    for i in range(n,len(q)):
        matches = np.flatnonzero(np.all(q[:n] == q[i],axis=1))
        require(any(all(np.array_equal(new[k][j],new[k][i]) for k in ['JOINTS_0','WEIGHTS_0']) for j in matches),
                'Sidewall seam loses its skin influences')
    return {'upperTriangleCount':int((~uv_bottom).sum()), 'originalShoeVertices':n, 'newWallVertices':len(q)-n,
            'maxUpperDeltaM':float(np.abs(delta[faces[~uv_bottom]]).max()), 'maxTreadOffsetErrorM':float(np.abs(delta[cap,1]+rise).max()),
            'unchangedOriginalStreams':['NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0','triangle indices','inverse binds'],
            'newBoundaryEdges':0, 'baseColorPngSha256':digest(png), 'soleFloorOffsetByFootM':{
              side:float(p[p[:,0]*sign>0,1].min()-q[q[:,0]*sign>0,1].min()) for side,sign in [('left',1),('right',-1)]}}


def panel(glb, direction, one_shoe):
    attrs, tris, png = streams(glb)
    pos, uv = attrs['POSITION'].astype(float), attrs['TEXCOORD_0']
    color = np.asarray(Image.open(BytesIO(png)).convert('RGBA'))
    w,h = 480,250
    direction = np.array(direction,dtype=float)
    direction /= np.linalg.norm(direction)
    right = np.cross([0,1,0],direction)
    right /= np.linalg.norm(right)
    up = np.cross(direction,right)
    center = [0.052 if one_shoe else 0, .042, -.045]
    scale = 1425 if one_shoe else 1070
    xy = ((pos-center) @ np.array([right,-up]).T) * scale + [w/2,h/2]
    z = pos @ direction
    pixels = np.full((h,w,3),[227,230,234],dtype='uint8')
    depth = np.full((h,w),-np.inf)
    for tri in tris:
        if one_shoe and pos[tri,0].mean()<0:
            continue
        a,b,c = xy[tri]
        left,top = np.maximum(np.floor(xy[tri].min(0)).astype(int),[0,0])
        right_x,bottom = np.minimum(np.ceil(xy[tri].max(0)).astype(int),[w-1,h-1])
        mat = np.column_stack((b-a,c-a))
        if abs(np.linalg.det(mat)) < 1e-8 or left>right_x or top>bottom:
            continue
        yy,xx = np.mgrid[top:bottom+1,left:right_x+1]
        s,t = np.linalg.inv(mat) @ np.stack((xx.ravel()+.5-a[0],yy.ravel()+.5-a[1]))
        bary = np.stack((1-s-t,s,t),axis=1)
        tex = np.clip(bary @ uv[tri],0,1) * [color.shape[1]-1,color.shape[0]-1]
        rgb = color[tex[:,1].round().astype(int),tex[:,0].round().astype(int)]
        v = bary @ z[tri]
        y,x = yy.ravel(),xx.ravel()
        mask = (bary.min(1)>=0) & (rgb[:,3]>=128) & (depth[y,x]<v)
        pixels[y[mask],x[mask]],depth[y[mask],x[mask]] = rgb[mask,:3],v[mask]
    return Image.fromarray(pixels)


def contact_sheet(flat, thick):
    sheet = Image.new('RGB',(960,860),'#f9fafb')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=20)
    for x,model,label in [(0,flat,'Source flat shoe'),(480,thick,'Parallel platform (+20 mm)')]:
        draw.text((x+16,8),label,fill='#20252b',font=font)
        for i,(direction,one_shoe) in enumerate([((1,.06,0),True),((1,.48,-1.1),False),((.3,-2,0),False)]):
            sheet.paste(panel(model,direction,one_shoe),(x,42+i*267))
    draw.text((16,834),'CPU geometry and base-color preview | one scale and camera per row',font=ImageFont.load_default(size=16),fill='#323940')
    buf = BytesIO()
    sheet.save(buf,format='PNG')
    return buf.getvalue()


def review():
    output = project_output(OUT,__file__)
    raw = json.loads(RECIPE.read_bytes())
    catalog = json.loads((ROOT/raw['equipmentCatalog']).read_bytes())
    src = next(row for row in catalog['items'] if row['id']==raw['sourceId'])
    a = GLB((ROOT/'prototype/public'/src['url'][1:]).read_bytes())
    b = GLB((GENERATED/(raw['id']+'.glb')).read_bytes())
    output.parent.mkdir(parents=True,exist_ok=True)
    first = run(GENERATED,check_only=True)
    with TemporaryDirectory(dir=GENERATED.parent,prefix='.sole-repeat-') as tmp:
        second = run(Path(tmp)/'package')
    require(first == second, 'Fresh rebuild differs')
    doc = {'schema':'sole-variant-asset-review-v1','bodySha256':raw['body']['sha256'],'sourceShoeSha256':src['sha256'],
           'recipeSha256':digest(RECIPE.read_bytes()),'generated':first,'repeatByteIdentical':True,
           'readback':compare(a,b,raw['soleOffsetM']),'limits':['Rest geometry and skin weights; motion, ground and seat support need runtime measurement.']}
    png = contact_sheet(a,b)
    doc['previewSha256'] = digest(png)
    files = {'comparison.png':png,'report.json':json_bytes(doc)}
    if output.exists():
        for name,data in files.items():
            require(project_output(output/name,__file__).read_bytes()==data,'Existing evidence differs: '+name)
    else:
        with TemporaryDirectory(dir=output.parent,prefix='.sole-review-') as tmp:
            staged = Path(tmp)/'asset'
            staged.mkdir()
            for name,data in files.items():
                (staged/name).write_bytes(data)
            publish_new_directory(staged,output)
    return doc


if __name__ == '__main__':
    print(json.dumps(review(),indent=2))
