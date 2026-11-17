"""One CPU orthographic source diagnostic, not a product render."""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PolyCollection

OUT = Path(__file__).resolve().parent
data = np.load(OUT / 'source-diagnostic-arrays.npz', allow_pickle=False)
P, F = data['hairPositionsM'], data['hairTriangles']
Q, B = data['exactPositionQuotientPositionsM'], data['exactPositionQuotientBoundaryEdges']
skin, skin_faces = data['sourceSkinPositionsM'], data['sourceSkinTriangles']
# Plot-only head window. All 8700 skin triangles were used by the audit.
display = skin[skin_faces][skin[skin_faces][:, :, 1].max(1) >= P[:, 1].min() - .01]
fig, axes = plt.subplots(1, 3, figsize=(14, 5.6))
for ax, dimensions, title in zip(axes, [(0, 1), (2, 1), (0, 2)], ['Front projection', 'Side projection', 'Top projection']):
    a, b = dimensions
    ax.add_collection(PolyCollection(display[:, :, [a, b]], facecolors='#dbe1e3', edgecolors='#c0c9cc', linewidths=.2, alpha=.45))
    ax.add_collection(PolyCollection(P[F][:, :, [a, b]], facecolors='#3394ab', edgecolors='#247a91', linewidths=.3, alpha=.22))
    ax.add_collection(LineCollection(P[data['rawBoundaryEdges']][:, :, [a, b]], colors='#8556a8', linewidths=1.1, alpha=.7))
    ax.add_collection(LineCollection(Q[B][:, :, [a, b]], colors='#e36e26', linewidths=2.0))
    margin = .018
    ax.set_xlim(P[:, a].min() - margin, P[:, a].max() + margin)
    ax.set_ylim(P[:, b].min() - margin, P[:, b].max() + margin)
    ax.set_aspect('equal')
    ax.set_title(title)
    ax.set_xlabel('xyz'[a] + ' (m)')
    ax.set_ylabel('xyz'[b] + ' (m)')
    ax.grid(alpha=.15)
fig.suptitle('Original male 62b · CPU source topology · 250 vertices / 408 triangles', fontsize=14)
fig.text(.5, .035, 'Orange = complete 54-edge geometric rim. Purple = 90 raw index-boundary edges, including coincident seams.\nGray = source skin in display window. Teal = source hair geometry. Material transparency and game lighting are not rendered.', ha='center', fontsize=10)
fig.tight_layout(rect=(0, .1, 1, .92))
fig.savefig(OUT / 'source-topology.png', dpi=150)
plt.close(fig)
