"""Original exact-PTS image + coordinate diagnostics; not calibrated reprojection."""
import gzip,json,pathlib,av,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from glb_source import GLB
root=pathlib.Path(__file__).resolve().parents[2];out=root/'assets-source/video-motion-v1';d=json.loads(gzip.decompress((out/'raw-sequence.json.gz').read_bytes()));p=np.load(out/'processed.npz');k=95;f=d['frames'][k];target=f['pts'];container=av.open(str(root/'evidence/real-video-pose-v1/dvids-squat-original.mp4'));stream=container.streams.video[0];container.seek(target,stream=stream,backward=True)
frame=next(x for x in container.decode(stream)if x.pts>=target);assert frame.pts==target;image=frame.to_ndarray(format='rgb24');container.close()
g=GLB((out/'video-squat-dvids-v1.glb').read_bytes());w,_,_=g.evaluate('Video_Squat_DVIDS_Once_v1',p['times'][k:k+1]);basis=np.array(json.loads((out/'conversion-report.json').read_text())['axisBasisColumns']);raw=p['rawWorld'][k]*[1,-1,-1]@basis;filtered=p['filteredCanonical'][k]
fig,axes=plt.subplots(1,3,figsize=(18,6));axes[0].imshow(image)
for side,ids,col in [('l',[11,13,15,19],'#00ffbf'),('r',[12,14,16,20],'#ffcf30')]:
    xy=np.array([[f['poses'][0]['normalized'][i][c]for c in ['x','y']]for i in ids])*[1024,576];axes[0].plot(xy[:,0],xy[:,1],'-o',color=col,lw=2,markersize=4,label=side+' raw 2D')
axes[0].set_title(f'Original PTS {target} = {f["source_seconds"]:.6f}s');axes[0].legend();axes[0].axis('off')
for a,(axis,label) in zip(axes[1:],[(0,'canonical front X/Y'),(2,'canonical side Z/Y')]):
    for side,ids,col in [('l',[11,13,15],'#087c63'),('r',[12,14,16],'#b77000')]:
        for data,style,name in [(raw,':','raw world'),(filtered,'--','filtered')]:
            pts=data[ids]-data[ids[0]];a.plot(pts[:,axis],pts[:,1],style+'o',color=col,label=f'{side} {name}')
        pts=w[0,[g.byname[b+'_'+side]for b in ['upperarm','lowerarm','hand']],:3,3];pts-=pts[0];a.plot(pts[:,axis],pts[:,1],'-s',color=col,label=f'{side} UAL bone')
    a.set_title(label+' — each shoulder at origin');a.set_aspect('equal');a.grid(alpha=.3);a.legend(fontsize=8);a.set_xlabel('metres');a.set_ylabel('metres')
fig.suptitle('Trough audit: same PTS; original body proportions differ from UAL; depth is not calibrated ground truth')
fig.tight_layout();fig.savefig(out/'audit/trough-comparison.png',dpi=130)
