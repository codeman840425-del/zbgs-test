"""Static technical source preview; not game footage or motion acceptance."""
import json,pathlib
import numpy as np
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
R=pathlib.Path(__file__).resolve().parents[2];P=R/'assets-source/m1/offline-corrective/ring-cage-v1';d=json.loads((P/'cage-and-binding.json').read_text(encoding='utf8'));t=json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/topology.json').read_text(encoding='utf8'));original=np.array(d['originalWeldedSourcePositions']);cage=np.array(d['positionsHipLocal']);f=np.array(t['triangles']);quads=np.array(d['quads'])
fig=plt.figure(figsize=(10,5),layout='constrained')
for i,(p,faces,title,color)in enumerate([(original,f,'Retained original pleat render source','#487590'),(cage,quads,'Independent regular simulation cage (static)','#df9c49')]):
 ax=fig.add_subplot(1,2,i+1,projection='3d');p=p[:,[0,2,1]];poly=Poly3DCollection(p[faces],facecolor=color,edgecolor='#273742',linewidth=.25,alpha=.85);ax.add_collection3d(poly);ax.set(xlim=(-.21,.21),ylim=(-.16,.16),zlim=(-.20,.15),xlabel='local X (m)',ylabel='local Z (m)',zlabel='local Y (m)',title=title);ax.view_init(elev=18,azim=-65);ax.set_box_aspect((.42,.32,.35))
fig.suptitle('Static authoring comparison only: no cloth animation or finished-game acceptance\nCage: 520 vertices, 480 quads; min edge 10.22 mm; original pleat details bound separately',fontsize=10);fig.savefig(P/'static-source-preview.png',dpi=140);plt.close(fig)
