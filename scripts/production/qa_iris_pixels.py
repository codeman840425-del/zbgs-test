"""Compare paired paused GPU frames against the screen-projected skinned iris surfaces."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def compare(folder, row):
    root = folder / row['body']
    images = [np.asarray(Image.open(root / name).convert('RGB'), dtype=np.int16)
              for name in ('original.png', 'green.png')]
    if images[0].shape != images[1].shape:
        raise ValueError('Paired camera dimensions changed')
    diff = np.max(np.abs(images[0] - images[1]), axis=2)
    height, width = diff.shape
    yy, xx = np.ogrid[:height, :width]
    both = np.zeros((height, width), dtype=bool)
    per_eye = []
    for x0,y0,x1,y1 in row['eyeBounds']:
        # Include the raster edge of triangles and the antialias resolve.
        window = (xx>=x0*width-2)&(xx<=x1*width+2)&(yy>=y0*height-2)&(yy<=y1*height+2)
        both |= window
        per_eye.append(int(np.count_nonzero(window & (diff >= 4))))
    return {'body': row['body'], 'size': [width,height], 'changesAtLeast4PerEye': per_eye,
            'changesAtLeast4OutsideBothEyeWindows': int(np.count_nonzero(~both & (diff >= 4))),
            'singleLevelOrGreaterTotal': int(np.count_nonzero(diff))}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    args = parser.parse_args()
    report = json.loads((args.folder / 'report.json').read_bytes())
    if report.get('status') != 'passed' or not report['cases']:
        raise ValueError('No complete paired room capture')
    results = [compare(args.folder,row) for row in report['cases']]
    print(json.dumps(results,indent=2))
    if any(min(row['changesAtLeast4PerEye']) == 0 for row in results):
        raise SystemExit('A selected iris did not visibly change')
