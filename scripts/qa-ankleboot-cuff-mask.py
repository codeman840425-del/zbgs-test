"""Measure the saved boot/trousers ID image, excluding sightlines shared by both legs."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent / "production"))
from production_paths import project_output


def verified(directory, ref):
    file = (directory / ref["file"]).resolve()
    if file.parent != directory.resolve():
        raise ValueError("Unexpected input location")
    data = file.read_bytes()
    if len(data) != ref["bytes"] or hashlib.sha256(data).hexdigest() != ref["sha256"]:
        raise ValueError("Saved capture differs: " + file.name)
    return file


def cylinder_rays(orig, rays, band):
    start = np.asarray(band["ankle"])
    length = band["lengthM"]
    axis = (np.asarray(band["cuffCenter"]) - start) / length
    off = orig - start
    h, speed = off @ axis, rays @ axis
    perp, dirs = off - h * axis, rays - speed[..., None] * axis
    a = (dirs * dirs).sum(axis=-1)
    b = dirs @ perp
    c = perp @ perp - band["radiusM"] ** 2
    disc = b*b - a*c
    roots = np.sqrt(np.maximum(disc, 0))
    # Intersect the forward-ray distance intervals of a cylinder wall and its end caps.
    with np.errstate(divide="ignore", invalid="ignore"):
        lo, hi = (-b-roots)/a, (-b+roots)/a
        s, t = -h/speed, (length-h)/speed
    along = a < 1e-14
    level = np.abs(speed) < 1e-14
    radial = np.where(along, c <= 0, disc >= 0)
    height = ~level | ((h >= 0) & (h <= length))
    lower = np.maximum.reduce([np.zeros_like(lo), np.where(along, -np.inf, lo), np.where(level,-np.inf,np.minimum(s,t))])
    upper = np.minimum(np.where(along,np.inf,hi), np.where(level,np.inf,np.maximum(s,t)))
    return radial & height & (lower <= upper)


def measure(labels, x0, y0):
    result = {"bootPixels":int((labels==1).sum()),"pantsPixels":int((labels==2).sum()),"interfaceEdges":{},
              "alternations":{}, "enclosedComponents":{}}
    for axis, grid in (("row",labels),("column",labels.T)):
        changes = (grid[:,1:] + grid[:,:-1] == 3)
        result["interfaceEdges"][axis] = int(changes.sum())
        for outer, label in ((1,"boot-pants-boot"),(2,"pants-boot-pants")):
            runs = []
            for i, row in enumerate(grid):
                bounds = np.r_[0,np.flatnonzero(row[1:] != row[:-1])+1,len(row)]
                values = row[bounds[:-1]]
                for j in np.flatnonzero((values[:-2]==outer)&(values[1:-1]==3-outer)&(values[2:]==outer)):
                    first, last = int(bounds[j+1]),int(bounds[j+2]-1)
                    runs.append({"length":last-first+1,"first":[x0+first,y0+i] if axis=="row" else [x0+i,y0+first],
                                 "last":[x0+last,y0+i] if axis=="row" else [x0+i,y0+last]})
            result["alternations"][axis+"/"+label] = {"count":len(runs),"middleLengthHistogram":dict(sorted(Counter(r["length"] for r in runs).items())),
                "examples":sorted(runs,key=lambda r:-r["length"])[:3]}
    four = ndimage.generate_binary_structure(2,1)
    for kind,name in ((1,"bootInsidePants"),(2,"pantsInsideBoot")):
        ids,_ = ndimage.label(labels==kind,structure=four)
        groups=[]
        for i,box in enumerate(ndimage.find_objects(ids),1):
            y,x = box
            if min(y.start,x.start)==0 or y.stop==labels.shape[0] or x.stop==labels.shape[1]:continue
            outer=(slice(y.start-1,y.stop+1),slice(x.start-1,x.stop+1))
            component=ids[outer]==i
            border=ndimage.binary_dilation(component,structure=four)&~component
            if np.all(labels[outer][border]==3-kind):
                groups.append({"area":int(component.sum()),"boxXYXYInclusive":[x0+x.start,y0+y.start,x0+x.stop-1,y0+y.stop-1]})
        result["enclosedComponents"][name]={"count":len(groups),"areaPixels":sum(g["area"] for g in groups),
            "areaHistogram":dict(sorted(Counter(g["area"] for g in groups).items())),"boxes":groups}
    return result


def view(directory, item):
    normal,mask=(verified(directory,item["imageFiles"][key]) for key in ("normal","mask"))
    bands=item["bands"]
    boxes=[b["projectedBoundingBox"] for b in bands]
    x0,y0=min(b["x0"] for b in boxes),min(b["y0"] for b in boxes)
    x1,y1=max(b["x1"] for b in boxes),max(b["y1"] for b in boxes)
    w,h=item["width"],item["height"]
    with Image.open(mask) as image:
        if (w,h)!=image.size:raise ValueError("Mask dimensions differ from capture")
        px=np.asarray(image.convert("RGB").crop((x0,y0,x1,y1)))
    colors=item["pixels"]["colors"]
    boot=np.all(px==colors["bootFront"],axis=2)
    pants=np.all(px==colors["pantsFront"],axis=2)
    for known,n in [(boot,"bootFront"),(pants,"pantsFront")]:
        if int(known.sum())!=item["pixels"]["counts"][n]:raise ValueError("Color totals differ: "+n)
    ys,xs=np.mgrid[y0:y1,x0:x1]
    clip=np.stack([2*(xs+.5)/w-1,1-2*(ys+.5)/h,np.zeros_like(xs),np.ones_like(xs)],axis=-1)
    cam=item["camera"]
    world=np.asarray(cam["world"]).reshape(4,4).T
    proj=np.asarray(cam["projection"]).reshape(4,4).T
    if not np.isclose(proj[3,2],-1):raise ValueError("Expected a perspective camera")
    point=clip@(world@np.linalg.inv(proj)).T
    origin=world[:3,3]
    rays=point[:,:,:3]/point[:,:,3:]-origin
    rays/=np.linalg.norm(rays,axis=2,keepdims=True)
    left,right=[cylinder_rays(origin,rays,next(b for b in bands if b["side"]==side)) for side in ("left","right")]
    active=boot|pants
    results={}
    for side,belongs,other in (("left",left,right),("right",right,left)):
        selected=belongs&~other
        results[side]=measure(np.where(selected,boot.astype("uint8")+2*pants,0),x0,y0)
    return {"normal":normal.name,"mask":mask.name,"maskSHA256":item["imageFiles"]["mask"]["sha256"],
            "eligibleClothingPixels":int(active.sum()),"excludedBothLegSightlines":int((active&left&right).sum()),
            "outsideReconstructedBands":int((active&~left&~right).sum()),"legs":results}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pose_report",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    output=project_output(args.output,__file__)
    if output.exists():raise FileExistsError(output)
    raw=args.pose_report.read_bytes()
    poses=json.loads(raw)
    if poses.get("status")!="sampled" or poses.get("errors"):raise ValueError("Expected completed pose capture")
    rows=[{"pose":p["pose"],"camera":camera,**view(args.pose_report.parent,item)}
          for p in poses["poses"] for camera,item in p["views"].items()]
    report={"schema":"ankle-boot-visible-clothing-contours-v1","sourceDigest":poses["sourceDigest"],
            "inputPoseReportSha256":hashlib.sha256(raw).hexdigest(),"shoe":poses["shoe"]["id"],"views":rows,
            "scope":"Counts use exact colors of saved full-resolution first-hit ID masks inside finite posed ankle-to-cuff bands. Rays crossing both leg cylinders are excluded entirely. Interface length is the number of horizontal and vertical pixel-neighbor pairs; row/column runs require contiguous boot/pants/boot or pants/boot/pants with no gap. These counts depend on camera, resolution, silhouettes, folds and band cropping. Only components entirely surrounded by the other garment under four-neighbor connectivity are listed as islands. A visible interface or island is a witness to inspect in the matching normal image, not an automatic clothing defect. Zero counts do not establish a fit pass."}
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open("x",encoding="utf8",newline="\n") as target:json.dump(report,target,indent=2,allow_nan=False);target.write("\n")
    print(f"{len(rows)} pose/view masks -> {output}")


if __name__=="__main__":
    main()
