"""Original eye-layer geometry diagram, not a shader/occlusion render."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-eye-parameters-v1'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
r=json.loads((BASE/'measurements.json').read_text());fig,axes=plt.subplots(2,3,figsize=(15,8))
for row,(sex,b)in enumerate(r['bodies'].items()):
 g=GLB(ROOT/b['source']['sourceVRM']);m=g.doc['meshes'][b['faceMeshIndex']];p=g.acc(m['primitives'][0]['attributes']['POSITION']).astype(float);s=b['sides']['1'];center=np.array(s['apertureCornerMidpoint']);pivot=np.array(b['eyeRest'][s['eyeBone']]['restGlobalPivot']);q=(p-center)*1000;upper=s['upperChain'];lower=s['lowerChain'];ax=axes[row,0]
 for needle,color in [('EyeWhite','#8d8d8d'),('EyeIris','#3093b4'),('EyeHighlight','#bf9c08')]:
  ids=next(v['sideVertices']for k,v in s['layerRelations'].items()if needle in k);ax.scatter(q[ids,0],q[ids,1],s=7,color=color,alpha=.5,label=needle+' source vertices')
 ax.plot(q[upper,0],q[upper,1],'-o',color='#245db2',ms=3,label='skin upper chain (12)');ax.plot(q[lower,0],q[lower,1],'-o',color='#c64b48',ms=3,label='skin lower chain (14)');ax.plot(0,0,'kx',ms=8,label='aperture corner midpoint');pc=(pivot-center)*1000;ax.plot(pc[0],pc[1],'m+',ms=10,label='eye bone pivot projection');ax.set_title(f'{sex}: original open eye, source +X side');ax.set_xlim(-32,30);ax.set_ylim(-23,24);ax.set_aspect('equal');ax.set_xlabel('lateral mm');ax.set_ylabel('height mm');ax.legend(fontsize=6.7,loc='lower left')
 closed=next(t for t in s['blinkClosureDiagnostics']if t['name'].endswith('_Close'));c=p+g.acc(m['primitives'][0]['targets'][closed['index']]['POSITION']);c=(c-center)*1000;ax=axes[row,1];ax.plot(c[upper,0],c[upper,1],'-o',color='#245db2',ms=4,label='upper skin chain');ax.plot(c[lower,0],c[lower,1],'-o',color='#c64b48',ms=4,label='lower skin chain');ax.plot(q[upper,0],q[upper,1],'--',color='#9caec7',lw=.7,label='open upper reference');ax.plot(q[lower,0],q[lower,1],'--',color='#d1b3b2',lw=.7)
 for i in [s['minimumXCorner'],s['maximumXCorner']]:ax.annotate(str(i),c[i,:2],xytext=(4,3),textcoords='offset points',fontsize=8)
 ax.set_title(f'Original EYE_Close (target {closed["index"]})\n24 skin / white seam pairs remain coincident');ax.set_xlim(-25,25);ax.set_ylim(-23,20);ax.set_aspect('equal');ax.set_xlabel('lateral mm');ax.set_ylabel('height mm');ax.legend(fontsize=7,loc='upper left')
 ax=axes[row,2]
 for needle,color in [('EyeWhite','#8d8d8d'),('EyeIris','#3093b4'),('EyeHighlight','#bf9c08')]:
  ids=next(v['sideVertices']for k,v in s['layerRelations'].items()if needle in k);ax.scatter(-q[ids,2],q[ids,1],s=8,color=color,alpha=.6,label=needle)
 ax.scatter(-q[s['ringVertices'],2],q[s['ringVertices'],1],s=10,color='#b45455',label='skin aperture');ax.plot(0,0,'kx',ms=8);ax.plot(-pc[2],pc[1],'m+',ms=12,label='fixed eye pivot');ax.annotate('pivot (not visible eye center)',(-pc[2],pc[1]),xytext=(3,-22),textcoords='offset points',fontsize=8);ax.set_title('Original depth layout; points include\ntransparent carriers, no occlusion simulation');ax.set_xlim(-60,18);ax.set_ylim(-23,24);ax.set_aspect('equal');ax.set_xlabel('forward mm from aperture midpoint');ax.set_ylabel('height mm');ax.legend(fontsize=7,loc='lower left')
 for a in axes[row]:a.grid(alpha=.18)
fig.suptitle('Pinned original eye source: Head-skinned lids/white versus Eye-skinned iris/highlight\nNo eye-width sample generated; these are geometry diagrams, not rendered blink acceptance',fontsize=13);fig.tight_layout(rect=(0,0,1,.94));fig.savefig(BASE/'source-eye-layers.png',dpi=160)
