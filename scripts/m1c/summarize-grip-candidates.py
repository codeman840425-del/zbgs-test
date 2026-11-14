"""Offline summary/contact sheets for the bounded diagnostic grip experiment."""
import json
import pathlib
import sys
from PIL import Image, ImageDraw

folder = pathlib.Path(sys.argv[1])
reports = json.loads((folder / 'report.json').read_text(encoding='utf8'))
summary = []
for report in reports:
    body = report['body']
    for action in ['stand', 'sit', 'walk']:
        for config in report['configs']:
            rows = [r for r in report['rows'] if r['action'] == action and r['candidate'] == config['id']]
            summary.append({
                'body': body, 'action': action, 'candidate': config['id'], 'samples': len(rows),
                'maxDepthMm': max(r['contact']['maxDepth'] for r in rows) * 1000,
                'maxInsideVertices': max(r['contact']['inside'] for r in rows),
                'minNearContactVertices': min(r['contact']['near'] for r in rows),
                'maxNearestSurfaceGapMm': max(r['contact']['minAbsGap'] for r in rows) * 1000,
                'lastGroups': rows[-1]['contact']['groups'],
            })
        canvas = Image.new('RGB', (1800, 1060), '#f6f6f2')
        draw = ImageDraw.Draw(canvas)
        for column, config in enumerate(report['configs']):
            metric = summary[-len(report['configs']) + column]
            for row, view in enumerate(['front', 'side']):
                image = Image.open(folder / f'{body}-{action}-{config["id"]}-{view}.png').convert('RGB')
                image.thumbnail((360, 470))
                x, y = column * 360, row * 530
                canvas.paste(image, (x, y + 55))
                draw.text((x + 5, y + 5), f'{body} {action} {view}\n{config["id"]}\ndepth {metric["maxDepthMm"]:.2f}mm near>= {metric["minNearContactVertices"]}', fill='black')
        canvas.save(folder / f'{body}-{action}-comparison.jpg', quality=94)
(folder / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf8')
print(json.dumps([{k: r[k] for k in ['body', 'action', 'candidate', 'maxDepthMm', 'minNearContactVertices']} for r in summary], indent=2))
