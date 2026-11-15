"""Full difficult-segment diagnostic movie, every original PTS sample.
No source imagery is redistributed; source raw data and exact repairs retained.
"""
import pathlib,json,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import imageio_ffmpeg
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-dance-v1/turn-depth-bridge-study';d=np.load(OUT/'study.npz');states=json.loads((OUT/'root-contact-states.json').read_text());raw=d['rawCanonical'];corrected=d['correctedCanonical'];roots=d['root'];times=d['times'];indices=d['indices']
fig,axs=plt.subplots(2,2,figsize=(12.8,7.2),dpi=100);fig.subplots_adjust(top=.87,hspace=.25,wspace=.15,bottom=.07)
chains=[([11,12,24,23,11],'#777777'),([11,13,15],'#2077bd'),([23,25,27,29,31],'#2077bd'),([12,14,16],'#c75534'),([24,26,28,30,32],'#c75534'),([7,0,8],'#777777')]
artists=[]
for row,axis in enumerate([0,2]):
 for col,kind in enumerate(['RAW','TWO-FRAME DEPTH BRIDGE']):
  ax=axs[row,col];ax.set_xlim(-.85,.85);ax.set_ylim(0,1.9);ax.set_aspect('equal');ax.grid(alpha=.2);ax.axhline(0,c='gray',lw=1);ax.set_title(kind+(' — camera front X/Y'if row==0 else' — camera side Z/Y'));ls=[ax.plot([],[],'-o',color=color,lw=2,markersize=3)[0]for chain,color in chains];artists.append((col,axis,ls))
header=fig.suptitle('',fontsize=12);writer=imageio_ffmpeg.write_frames(str(OUT/'raw-vs-depth-bridge-1x.webm'),(1280,720),fps=24000/1001,codec='libvpx-vp9',quality=6,macro_block_size=1,output_params=['-threads','2']);writer.send(None)
for k in range(len(times)):
 for col,axis,ls in artists:
  p=(raw if col==0 else corrected)[k]+roots[k]
  for line,(chain,_)in zip(ls,chains):line.set_data(p[chain,axis],p[chain,1])
 s=states[k];header.set_text(f'Frame {indices[k]} / original PTS {times[k]:.6f}s — 1x samples, predicted body, inferred root\nSupport: L {s["left"]}, R {s["right"]} | blue anatomical left / orange right | NOT accepted motion')
 fig.canvas.draw();img=np.asarray(fig.canvas.buffer_rgba())[:,:,:3].copy();writer.send(img)
 if int(indices[k])in [146,147,171,172,173,174,190]:fig.savefig(OUT/f'frame-{indices[k]}.png',dpi=100)
writer.close();(OUT/'movie-timing.json').write_text(json.dumps({'sourceFirstLastPTSSeconds':[float(times[0]),float(times[-1])],'frames':len(times),'fpsNumerator':24000,'fpsDenominator':1001,'lastFrameStartRelativeSeconds':float(times[-1]-times[0]),'encodedDurationIncludingLastFrameExposure':len(times)*1001/24000,'allOriginalSamplesUsed':True,'rootBothPanels':'same inferred root, to isolate pose repair','poseSmoothing':'none in movie; correctedCanonical only; root estimator used declared filter'},indent=2),encoding='utf-8')
print('saved 73-frame 1x skeleton comparison')
