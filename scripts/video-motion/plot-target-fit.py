import pathlib,json,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=pathlib.Path(__file__).resolve().parents[2];out=root/'assets-source/video-target-adaptation-v1';report={}
for body in ['female','male']:
 d=np.load(out/(body+'-world.npz'));w=d['world'];names=d['names'].tolist();t=d['times'];ix={s:i for i,s in enumerate(names)};pick=[0,65,85,95,110,130,175,190,205,239]
 fig,axs=plt.subplots(2,len(pick),figsize=(24,7))
 chains=[['hips','spine','chest','upperChest','neck','head']]
 for s in ['left','right']:chains.extend([['hips',s+'UpperLeg',s+'LowerLeg',s+'Foot',s+'Toes'],['upperChest',s+'Shoulder',s+'UpperArm',s+'LowerArm',s+'Hand']])
 for c,k in enumerate(pick):
  for row,axis in enumerate([0,2]):
   ax=axs[row,c]
   for chain in chains:
    p=w[k,[ix[s]for s in chain],:3,3];ax.plot(p[:,axis],p[:,1],'-o',markersize=2,lw=1.4)
   ax.set_xlim(-.7,.7);ax.set_ylim(0,1.8);ax.set_aspect('equal');ax.grid(alpha=.3);ax.set_title(f'{t[k]:.2f}s')
 fig.suptitle(body+' target offline fit — observed relative stance, estimated root, not visual acceptance');fig.tight_layout();fig.savefig(out/(body+'-fit-contact.png'),dpi=120)
 audit=json.loads((out/(body+'-frame-audit.json')).read_text());sides={}
 for side in ['left','right']:
  angles=np.array([f['legs'][side]['kneeFlexionDeg']for f in audit]);poles=np.array([f['legs'][side]['poleCanonical']for f in audit]);dot=np.sum(poles[1:]*poles[:-1],axis=1)
  sides[side]={'kneeFlexionMinMaxDeg':[float(angles.min()),float(angles.max())],'maximumKneeFlexionFrameDeltaDeg':float(abs(np.diff(angles)).max()),'minimumAdjacentPoleDot':float(dot.min()),'poleForwardZMinMax':[float(poles[:,2].min()),float(poles[:,2].max())],'noPoleHemisphereFlip':bool(dot.min()>0)}
 report[body]={'legs':sides,'scope':'No runtime human/garment visibility verification. A small pole dot or max angle is a diagnostic, not an automatic aesthetic pass.'}
(out/'knee-direction-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(report)
