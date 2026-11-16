"""CPU regression for selected-look dependency aggregation."""
import copy
import io
import json
from pathlib import Path
import tempfile
import hashlib
import subprocess
import sys
from PIL import Image

from asset_budget import ROOT, budget_config, read_json
from selected_look_budget import measure_look


config = budget_config(ROOT/'scripts/production/asset-budgets-v1.json', 'm2-technical-v1')
inputs = read_json(ROOT/'scripts/production/selected-look-representatives.json')
rows = [measure_look(look, config) for look in inputs['looks']]
assert len(rows) == 4
assert all(row['status'] == 'legacy-observation' for row in rows)
assert rows[2]['totals']['textureObjects'] == sum(asset['cost']['metrics']['textures'] for asset in rows[2]['assetRows']) + rows[2]['totals']['recipeTextureObjects']
assert rows[2]['totals']['recipeTextureObjects'] == 0
assert all(row['totals']['uniqueImagePayloadBytesInformational'] <= row['totals']['encodedImageBytes'] for row in rows)
assert rows[0]['assetRows'][0]['assetStatus'] == 'legacy-observation'
assert rows[3]['assetRows'][1]['id'] == 'm2-male-training-onepiece-v1'

passed = ['four explicit representatives measure', 'legacy over-budget body/assets remain observation',
          'texture objects counted per GLB without cross-asset dedupe', 'onePiece dependency selection retained']

with tempfile.TemporaryDirectory(prefix='selected-look-budget-', dir=ROOT/'scripts/production') as directory:
    folder = Path(directory)
    texture = io.BytesIO(); Image.new('RGBA', (4, 2)).save(texture, format='PNG')
    texture_path = folder/'recipe.png'; texture_path.write_bytes(texture.getvalue())
    valid = copy.deepcopy(inputs['looks'][2])
    texture_name = texture_path.relative_to(ROOT).as_posix()
    valid['materialRecipes'][0]['textureFiles'] = [{'path': texture_name, 'sha256': hashlib.sha256(texture_path.read_bytes()).hexdigest()}]
    measured = measure_look(valid, config)
    assert measured['totals']['recipeTextureObjects'] == 1 and measured['totals']['textureObjects'] == 29
    passed.append('declared material recipe texture counted as an additional object')
    missing = copy.deepcopy(valid); missing['dependencies'].append({'path': (folder/'missing.json').relative_to(ROOT).as_posix(), 'sha256': '0'*64})
    try: measure_look(missing, config)
    except (ValueError, OSError) as error: assert 'Missing' in str(error) or 'No such file' in str(error)
    else: raise AssertionError('missing dependency accepted')
    passed.append('missing dependency rejected')
    duplicate = copy.deepcopy(valid); duplicate['materialRecipes'][0]['textureFiles'].append(duplicate['materialRecipes'][0]['textureFiles'][0])
    try: measure_look(duplicate, config)
    except ValueError as error: assert 'Duplicate recipe texture' in str(error)
    else: raise AssertionError('duplicate recipe texture accepted')
    passed.append('duplicate recipe texture rejected')
    bad_sha = copy.deepcopy(valid); bad_sha['assets'][0]['sha256'] = '0'*64
    try: measure_look(bad_sha, config)
    except ValueError as error: assert 'Selected asset SHA mismatch' in str(error)
    else: raise AssertionError('wrong asset SHA accepted')
    passed.append('wrong selected asset SHA rejected')
    low = copy.deepcopy(config); low['classes']['body']['rgba8MipBytes'] = 1
    low_result = measure_look(inputs['looks'][1], low)
    assert low_result['status'] == 'legacy-observation' and low_result['legacyObservationAssets']
    passed.append('temporary low budget leaves real over-limit assets as observation')

cli = subprocess.run([sys.executable, str(ROOT/'scripts/production/selected_look_budget.py'), 'measure',
                      'scripts/production/selected-look-representatives.json', '--look-id', 'missing-look',
                      '--budget-version', 'm2-technical-v1'], cwd=ROOT, capture_output=True, text=True, check=False)
invalid = json.loads(cli.stdout)
assert cli.returncode == 2 and invalid['status'] == 'invalid'
passed.append('unknown look ID returns structured invalid exit 2')

print(json.dumps({'schema': 'zbgs-selected-look-budget-qa-v1', 'passed': True,
                  'checks': passed, 'lookCount': len(rows), 'GPUUsed': False,
                  'ordinaryPCPerformance': 'unmeasured'}, indent=2))
