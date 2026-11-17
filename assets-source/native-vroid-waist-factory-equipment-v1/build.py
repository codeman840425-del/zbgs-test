import argparse,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sp=importlib.util.spec_from_file_location('extractor',ROOT/'scripts/native-vroid-equipment-extract.py');x=importlib.util.module_from_spec(sp);sp.loader.exec_module(x)
spec={'sourceNode':131,'sourceNodeName':'Body','sourceMesh':1,'sourceSkin':1,'primitives':[('top',3,'Tops'),('bottom',1,'Bottoms'),('shoes',2,'Shoes')],'sourcePath':'assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-waist-unmasked.vrm','sourceSha256':'cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5','idPrefix':'native-vroid-waist-geometry-','equipmentId':'native-vroid-waist-geometry-equipment-v1','generator':'native-vroid-equipment-v1 exact extraction','limits':['MToon loader available in current integration; new Waist fit and coverage remain unverified','No new fit or clothing deformation']}
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');a=p.parse_args();out=Path(__file__).resolve().parent;print(x.write_outputs(x.extract(spec,out),out,a.check))
