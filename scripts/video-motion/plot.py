"""Offline same-time skeleton diagnostics; not game visual acceptance."""
import pathlib,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from glb_source import GLB
root=pathlib.Path(__file__).resolve().parents[2];out=root/'assets-source/video-motion-v1'
g=GLB((out/'video-squat-dvids-v1.glb').read_bytes());times=np.array([0.,2.5,3.2,3.6,4.2,5.7,6.3,6.6,7.3,7.9746]);w,_,_=g.evaluate('Video_Squat_DVIDS_Once_v1',times)
chains=[['pelvis','spine_01','spine_02','spine_03','neck_01','Head']]+[[a+'_'+s for a in ['pelvis','thigh','calf','foot','ball']] for s in []]
for s in ['l','r']:
    chains.extend([['pelvis','thigh_'+s,'calf_'+s,'foot_'+s,'ball_'+s],['spine_03','clavicle_'+s,'upperarm_'+s,'lowerarm_'+s,'hand_'+s]])
fig,axs=plt.subplots(2,len(times),figsize=(24,7))
for j,t in enumerate(times):
    for row,axis in enumerate([0,2]):
        ax=axs[row,j]
        for ci,c in enumerate(chains):
            p=w[j,[g.byname[a] for a in c],:3,3];ax.plot(p[:,axis],p[:,1],'-o',markersize=2,lw=1.5)
        ax.set_xlim(-.8,.8);ax.set_ylim(-.05,1.8);ax.set_aspect('equal');ax.grid(alpha=.2);ax.set_title(f'{t:.2f}s');ax.axhline(0,c='gray',lw=.7)
axs[0,0].set_ylabel('Front / m');axs[1,0].set_ylabel('Side / m')
fig.suptitle('DVIDS squat pose conversion — UAL1 skeleton diagnostics, original PTS; game/garment acceptance pending')
fig.tight_layout();fig.savefig(out/'skeleton-contact.png',dpi=120)
