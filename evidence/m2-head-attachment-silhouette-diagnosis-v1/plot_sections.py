"""Static geometric cross-section diagnostic; not a game render."""
import sys
sys.dont_write_bytecode=True
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).parent
OUT=HERE/'worst-section-witnesses.png'
if OUT.exists():raise SystemExit('Refusing to overwrite evidence')
data=json.loads((HERE/'result.json').read_bytes())
response=json.loads((ROOT/'assets-source/m2-head-cage-skin-domain-v1/generated/male.json').read_bytes())
H=np.asarray(response['rawHeadRestOriginM']);P=np.asarray(response['sourcePointsM'])
F=np.asarray(response['sourceFaceTriangles'],int)
records=json.loads((ROOT/'assets-source/m2-head-volume-domain-v1/generated/endpoint-records.json').read_bytes())
def segments(points,y):
    result=[]
    for tri in points[F]:
        hits=[]
        for a,b in zip(tri,np.roll(tri,-1,axis=0)):
            if abs(b[1]-a[1])<1e-12:continue
            t=(y-a[1])/(b[1]-a[1])
            if 0<=t<=1:hits.append((a+t*(b-a))[[0,2]]*1000)
        if len(hits)==2:result.append(hits)
    return result
plt.rcParams['font.family']='Microsoft YaHei'
fig,axes=plt.subplots(1,2,figsize=(14,7),layout='constrained')
for ax,case in zip(axes,data['cases']):
    row=case['rows'][case['worstSectionIndex']]
    mapped=np.load(ROOT/f"assets-source/m2-head-attachment-slim-v1/generated/{case['id']}/mapped-endpoints.npz",allow_pickle=False)['mappedEndpointsM']
    Q=P.copy()
    for rec in records:
        if rec['endpoint']==-1 and rec['positionAccessor']==response['sourceFacePositionAccessor']:
            Q[rec['sourceIndices']]=mapped[rec['offset']:rec['offset']+rec['count']]
    Q=Q.astype(np.float32).astype(float)-H
    y=row['requestedYHeadLocalM']
    ax.add_collection(LineCollection(segments(P-H,y),colors='#b8bdc6',linewidths=1,alpha=.75,label='原网格（同一目标Y）'))
    ax.add_collection(LineCollection(segments(Q,y),colors='#bb3e38',linewidths=1.25,alpha=.85,label='实际映射网格'))
    target=np.asarray(row['requestedPairHeadLocalM'])*1000
    ax.axvspan(target[0,0],target[1,0],facecolor='#2c8b63',alpha=.07,label='目标左右范围')
    ax.axvline(target[0,0],color='#2c8b63',ls='--',lw=1)
    ax.axvline(target[1,0],color='#2c8b63',ls='--',lw=1)
    ax.axhline(-25,color='#666666',ls=':',lw=1,label='原筛选边界 z=-25mm')
    for side,align in [('left','left'),('right','right')]:
        ext=row['actual'][side];point=np.asarray(ext['pointHeadLocalM'])*1000
        edge='–'.join(map(str,ext['edgeVertices']))
        guide_count=sum(ext['edgeEndpointIsNativeGuide'])
        ax.scatter(point[0],point[2],s=48,color='#bb3e38',zorder=5)
        dx=8 if side=='left' else -8
        dy=-27 if case['id'].startswith('male-long') else -25
        ax.annotate(f'实际边 {edge}\n{guide_count}/2 个端点为guide',xy=(point[0],point[2]),xytext=(point[0]+dx,point[2]+dy),
                    ha=align,fontsize=8,color='#9c302a',arrowprops={'arrowstyle':'->','color':'#9c302a','lw':.8})
        carrier=row['sourceCarrierEdgesAfterMapping'][side]
        cp=np.asarray(carrier['pointHeadLocalM'])*1000
        ax.scatter(cp[0],cp[2],marker='D',s=43,color='#286ca0',zorder=6,label='原carrier边的新交点' if side=='left' else None)
    short='lean' if 'lean' in case['id'] else 'round'
    ax.set_title(f'{short}：第 {row["index"]} 截面（0起始）\nY={y*1000:.3f}mm；实际半宽 {row["actual"]["halfWidthM"]*1000:.3f} / 目标 {row["requestedHalfWidthM"]*1000:.3f}mm',fontsize=11)
    ax.set_xlim(-100,100);ax.set_ylim(-115,25);ax.set_aspect('equal',adjustable='box')
    ax.set_xlabel('head-local X (mm)');ax.set_ylabel('head-local Z (mm)')
    ax.grid(alpha=.15);ax.legend(fontsize=7,loc='upper center',ncol=2)
fig.suptitle('几何诊断，非游戏渲染：实际极值已离开原23个guide所定义的carrier边',fontsize=14)
fig.savefig(OUT,dpi=180)
plt.close(fig)
print(OUT)
