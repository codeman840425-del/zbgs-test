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
from selected_look_budget import measure_look, recipe_texture, add_recipe_texture_cost, AGGREGATE_LIMITS


config = budget_config(ROOT/'scripts/production/asset-budgets-v1.json', 'm2-technical-v1')
inputs = read_json(ROOT/'scripts/production/selected-look-representatives.json')
rows = [measure_look(look, config) for look in inputs['looks']]
assert len(rows) == 4
assert all(row['status'] == 'legacy-observation' for row in rows)
assert rows[2]['totals']['textureObjects'] == sum(asset['cost']['metrics']['textures'] for asset in rows[2]['assetRows']) + rows[2]['totals']['recipeTextureObjects']
assert rows[2]['totals']['recipeTextureObjects'] == 0
assert rows[2]['materialRecipes'][0]['externalTextureDependencyValidation'] == 'complete for pinned current implementation'
assert rows[2]['materialRecipes'][0]['materialClones'] == 2
assert all(row['totals']['uniqueImagePayloadBytesInformational'] <= row['totals']['encodedImageBytes'] for row in rows)
assert rows[0]['assetRows'][0]['assetStatus'] == 'legacy-observation'
assert rows[3]['assetRows'][1]['id'] == 'm2-male-training-onepiece-v1'
assert [asset['id'] for asset in rows[3]['assetRows']] == ['male-body', 'm2-male-training-onepiece-v1', 'm1b-uniform-shoes']

passed = ['four explicit representatives measure', 'legacy over-budget body/assets remain observation',
          'texture objects counted per GLB without cross-asset dedupe', 'onePiece and actual selected shoes retained',
          'actual recipe parsed against pinned runtime and manifest; two material clones share source maps']

with tempfile.TemporaryDirectory(prefix='selected-look-budget-', dir=ROOT/'scripts/production') as directory:
    folder = Path(directory)
    texture = io.BytesIO(); Image.new('RGBA', (4, 2)).save(texture, format='PNG')
    texture_path = folder/'recipe.png'; texture_path.write_bytes(texture.getvalue())
    valid = copy.deepcopy(inputs['looks'][2])
    texture_name = texture_path.relative_to(ROOT).as_posix()
    valid['materialRecipes'][0]['textureFiles'] = [{'path': texture_name, 'sha256': hashlib.sha256(texture_path.read_bytes()).hexdigest()}]
    baseline = copy.deepcopy(rows[2]['totals'])
    observed_texture = recipe_texture(texture_path)
    add_recipe_texture_cost(baseline, [observed_texture])
    assert observed_texture['rgba8MipBytes'] == 44
    assert baseline['recipeTextureObjects'] == 1 and baseline['textureObjects'] == 29
    assert baseline['rgba8MipBytes'] == rows[2]['totals']['rgba8MipBytes'] + 44
    passed.append('actual 4x2 PNG adds one object and exactly 44 mip bytes through shared accumulator')
    try: measure_look(valid, config)
    except ValueError as error: assert 'declares no external textures' in str(error)
    else: raise AssertionError('current runtime recipe accepted invented texture dependency')
    passed.append('current material recipe rejects caller-invented external texture declaration')
    omitted_manifest = copy.deepcopy(inputs['looks'][2])
    omitted_manifest['dependencies'] = []
    try: measure_look(omitted_manifest, config)
    except ValueError as error: assert 'requires one pinned equipment manifest' in str(error)
    else: raise AssertionError('recipe without its actual manifest accepted')
    passed.append('recipe requires actual selected manifest dependency')
    missing = copy.deepcopy(inputs['looks'][2]); missing['dependencies'].append({'path': (folder/'missing.json').relative_to(ROOT).as_posix(), 'sha256': '0'*64})
    try: measure_look(missing, config)
    except (ValueError, OSError) as error: assert 'Missing' in str(error) or 'No such file' in str(error)
    else: raise AssertionError('missing dependency accepted')
    passed.append('missing dependency rejected')
    duplicate = copy.deepcopy(inputs['looks'][2]); duplicate['materialRecipes'].append(copy.deepcopy(duplicate['materialRecipes'][0]))
    try: measure_look(duplicate, config)
    except ValueError as error: assert 'Duplicate selected recipe ID' in str(error)
    else: raise AssertionError('duplicate recipe accepted')
    passed.append('duplicate selected recipe rejected')
    bad_sha = copy.deepcopy(inputs['looks'][2]); bad_sha['assets'][0]['sha256'] = '0'*64
    try: measure_look(bad_sha, config)
    except ValueError as error: assert 'Selected asset SHA mismatch' in str(error)
    else: raise AssertionError('wrong asset SHA accepted')
    passed.append('wrong selected asset SHA rejected')
    low = copy.deepcopy(config); low['classes']['body']['rgba8MipBytes'] = 1
    low_result = measure_look(inputs['looks'][1], low)
    assert low_result['status'] == 'legacy-observation' and low_result['legacyObservationAssets']
    passed.append('temporary low budget leaves real over-limit assets as observation')
    original_limit = AGGREGATE_LIMITS['rgba8MipBytes']
    try:
        AGGREGATE_LIMITS['rgba8MipBytes'] = 1
        excess_result = measure_look(inputs['looks'][1], config)
        assert excess_result['aggregateLimitExcesses'] == [{'metric': 'rgba8MipBytes',
            'actual': rows[1]['totals']['rgba8MipBytes'], 'limit': 1}]
        assert excess_result['status'] == 'legacy-observation'
    finally:
        AGGREGATE_LIMITS['rgba8MipBytes'] = original_limit
    passed.append('aggregate limit exceedance is reported without admitting legacy assets')
    recipe = read_json(ROOT/inputs['looks'][2]['materialRecipes'][0]['path'])
    recipe['textures'] = [{'url': 'missing.png'}]
    bad_recipe = folder/'unsupported-recipe.json'
    bad_recipe.write_bytes(json.dumps(recipe).encode('utf-8'))
    unsupported = copy.deepcopy(inputs['looks'][2])
    unsupported['materialRecipes'][0].update(path=bad_recipe.relative_to(ROOT).as_posix(),
                                           sha256=hashlib.sha256(bad_recipe.read_bytes()).hexdigest())
    try: measure_look(unsupported, config)
    except ValueError as error: assert 'Recipe fields unsupported' in str(error)
    else: raise AssertionError('unknown texture reference silently ignored')
    passed.append('unsupported texture reference in actual recipe JSON rejected')

cli = subprocess.run([sys.executable, str(ROOT/'scripts/production/selected_look_budget.py'), 'measure',
                      'scripts/production/selected-look-representatives.json', '--look-id', 'missing-look',
                      '--budget-version', 'm2-technical-v1'], cwd=ROOT, capture_output=True, text=True, check=False)
invalid = json.loads(cli.stdout)
assert cli.returncode == 2 and invalid['status'] == 'invalid'
passed.append('unknown look ID returns structured invalid exit 2')

print(json.dumps({'schema': 'zbgs-selected-look-budget-qa-v1', 'passed': True,
                  'checks': passed, 'lookCount': len(rows), 'GPUUsed': False,
                  'ordinaryPCPerformance': 'unmeasured'}, indent=2))
