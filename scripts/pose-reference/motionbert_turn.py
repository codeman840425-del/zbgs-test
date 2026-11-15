"""Bounded MotionBERT pose-only experiment. Never changes the MediaPipe raw sequence."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'analysis/motionbert-turn-v1'
OUT = ROOT / 'evidence/dance-video-pose-v1/motionbert-turn-v1'
REV = '705d3a95354db8bdb696b3492e47a3b5537174ff'
HFREV = '370a9196aa3c89198b134c82476143b01c0fb32c'
WEIGHT_SHA = '9811155371db4ca5d20f31a36a232d41012e12e1333882888a564d741861148f'
WEIGHT_URL = f'https://huggingface.co/walterzhu/MotionBERT/resolve/{HFREV}/checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin'
NAMES = ['pelvis','right_hip','right_knee','right_ankle','left_hip','left_knee','left_ankle','spine','neck','nose','head_proxy','left_shoulder','left_elbow','left_wrist','right_shoulder','right_elbow','right_wrist']
PAIRS = [(1,4),(2,5),(3,6),(11,14),(12,15),(13,16)]

def sha(data): return hashlib.sha256(data).hexdigest()
def save(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, indent=2), encoding='utf-8')
def fetch(url, path, expected=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
        if expected and sha(data) != expected:
            raise ValueError('Downloaded SHA mismatch')
        path.write_bytes(data)
    data = path.read_bytes()
    if expected: assert sha(data) == expected
    return {'url':url,'path':str(path.relative_to(ROOT)),'bytes':len(data),'sha256':sha(data)}

def prepare():
    manifest = {}
    for name in ['lib/model/DSTformer.py','lib/model/drop.py','lib/utils/utils_data.py','configs/pose3d/MB_ft_h36m_global_lite.yaml','LICENSE']:
        manifest[name] = fetch(f'https://raw.githubusercontent.com/Walter0807/MotionBERT/{REV}/{name}', LOCAL/'official'/name)
    manifest['weight'] = fetch(WEIGHT_URL, LOCAL/'best_epoch.bin', WEIGHT_SHA)
    for folder in ['lib','lib/model','lib/utils']:
        # Empty package markers are adapter-owned, not modified model source.
        (LOCAL/'official'/folder/'__init__.py').write_text('',encoding='utf-8')
    raw = gzip.decompress((ROOT/'evidence/dance-video-pose-v1/sequence.raw.json.gz').read_bytes())
    data = json.loads(raw)
    frames = data['frames'][138:211]
    def avg(*p):
        return {k:sum(q[k] for q in p)/len(p) for k in ['x','y','z']} | {'visibility':min(q['visibility'] for q in p),'presence':min(q['presence'] for q in p)}
    def map_points(p):
        hips=avg(p[23],p[24]);neck=avg(p[11],p[12]);head=avg(p[7],p[8])
        return [hips,p[24],p[26],p[28],p[23],p[25],p[27],avg(hips,neck),neck,p[0],head,p[11],p[13],p[15],p[12],p[14],p[16]]
    records=[]; conditions={'raw_2d':[],'swap_172_173_2d':[]};raw_world=[]
    for f in frames:
        p=map_points(f['poses'][0]['normalized'])
        x=[[(q['x']*3840-1920)/1080,(q['y']*2160-1080)/1080,q['visibility']] for q in p]
        alt=[q[:] for q in x]
        if f['source_frame_index'] in [172,173]:
            for a,b in PAIRS:alt[a],alt[b]=alt[b],alt[a]
        conditions['raw_2d'].append(x);conditions['swap_172_173_2d'].append(alt)
        raw_world.append([[q[k] for k in ['x','y','z']] for q in map_points(f['poses'][0]['world_meters_predicted'])])
        records.append({k:f[k] for k in ['source_frame_index','pts','time_base','source_seconds','clip_seconds']} | {'raw_normalized_33':f['poses'][0]['normalized']})
    inputs={'raw_sequence_sha256':sha(raw),'joint_names':NAMES,'frames':records,'conditions':conditions,'raw_mediapipe_predicted_world_meters_mapped17':raw_world,
        'adapter':{'head_proxy':'Mean MediaPipe left/right ears7/8. Not observed head-top; retained as approximate head proxy in all conditions.','synthetic_points':'Pelvis=mean hips23/24; neck=mean shoulders11/12; spine=mean pelvis/neck.','confidence':'Original MediaPipe visibility as uncalibrated model confidence proxy; synthetic points=min contributing visibility. Original presence and visibility retained in raw_normalized_33.','normalization':'xy=(original3840x2160 pixels - [1920,1080])/1080; official pixel path; z input channel is visibility, NOT depth.','alternative':'Only H36M bilateral limb pairs swapped at source172/173; coordinate values/confidences travel together. No depth reflection, smoothing or inferred coordinate fill. Nose/head proxy untouched.','time':'73 consecutive original samples138..210, no resampling/context; original PTS retained.'}}
    save('inputs.json',inputs)
    save('restore-manifest.json',{'github_revision':REV,'hf_revision':HFREV,'assets':manifest,'adapter_script_sha256':sha(Path(__file__).read_bytes()),'source_license':'Apache-2.0, retained from official repository','weights_local_sha_verified':True})
    (OUT/'LICENSE-MotionBERT.txt').write_bytes((LOCAL/'official/LICENSE').read_bytes())
    print(json.dumps({'prepared_frames':len(frames),'weights':manifest['weight']},indent=2))

def infer():
    import importlib.metadata
    from functools import partial
    import numpy as np
    import torch
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    sys.path.insert(0,str(LOCAL/'official'))
    from lib.model.DSTformer import DSTformer
    from lib.utils.utils_data import flip_data
    manifest=json.loads((OUT/'restore-manifest.json').read_text())
    for a in manifest['assets'].values():assert sha((ROOT/a['path']).read_bytes())==a['sha256']
    inputs=json.loads((OUT/'inputs.json').read_text())
    model=DSTformer(dim_in=3,dim_out=3,dim_feat=256,dim_rep=512,depth=5,num_heads=8,mlp_ratio=4,maxlen=243,num_joints=17,norm_layer=partial(torch.nn.LayerNorm,eps=1e-6))
    checkpoint=torch.load(LOCAL/'best_epoch.bin',map_location='cpu',weights_only=True)
    state=checkpoint['model_pos']
    had_prefix=any(k.startswith('module.') for k in state)
    state={k.removeprefix('module.'):v for k,v in state.items()}
    model.load_state_dict(state,strict=True);model.eval()
    run={'torch':torch.__version__,'numpy':np.__version__,'python':sys.version,'executable':sys.executable,'threads':4,'inter_op_threads':1,'device':'cpu','weights_only_load':True,'stripped_dataparallel_prefix':had_prefix,'strict_state_dict':True,'gpu_initialized':torch.cuda.is_initialized(),'conditions':{},'output_units':'Model-normalized predicted 3D, not metric world. Official global config rootrel=False; first frame root Z set0. No camera/metric calibration or contact/root reconstruction.'}
    outputs={}
    with torch.no_grad():
        for name,values in inputs['conditions'].items():
            t=time.perf_counter();x=torch.tensor(values,dtype=torch.float32).unsqueeze(0)
            y=(model(x)+flip_data(model(flip_data(x))))/2
            y[:,0,0,2]=0 # Exact official global inference postprocess.
            arr=y[0].numpy();assert np.isfinite(arr).all();outputs[name]=arr.tolist()
            run['conditions'][name]={'frames':len(arr),'wall_seconds':time.perf_counter()-t,'finite':True,'flip_ensemble':True}
            print(json.dumps({name:run['conditions'][name]}),flush=True)
    save('predictions.raw.json',{'joint_names':NAMES,'outputs':outputs,'units':run['output_units'],'frame_times':[{k:f[k] for k in ['source_frame_index','pts','time_base','source_seconds']} for f in inputs['frames']]})
    run['installed_environment_packages']={d.metadata['Name']:d.version for d in importlib.metadata.distributions()}
    save('run.json',run)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('stage',choices=['prepare','infer']);a=ap.parse_args()
    prepare() if a.stage=='prepare' else infer()
