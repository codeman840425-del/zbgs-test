"""Install validated native packages and append generated candidate data to the build.

This does not publish 4196 or confer visual/fit acceptance. Changed identities
require new IDs. The record producer and game keep their existing controllers.
"""
import argparse
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from contextlib import ExitStack
import numpy as np
from PIL import Image
import native_import as importer
from native_body_package import GLB, skin

ROOT = importer.ROOT
CATALOG = ROOT / 'prototype/src/native-production-catalog.json'

def pinned(ref):
    path = importer.confined(ROOT, ref['path'])
    data = path.read_bytes()
    if importer.digest(data) != ref['sha256']:
        raise ValueError('Source provenance SHA differs: ' + ref['path'])
    return path, data


def coverage_entry(folder, staged, spec, native_file, lineage):
    manifest_bytes = (staged/'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    base_path = staged/spec['bodyFile']
    _, material, original, consumer = skin.body(GLB(base_path))
    _, _, native_covered, native_consumer = skin.body(GLB(native_file))
    masked = importer.confined(staged,manifest['covered']['url']).read_bytes()
    if (consumer != native_consumer or masked != native_covered or manifest['rgbPreserved'] is not True
            or manifest['width'] != 2048 or manifest['height'] != 2048 or manifest['alphaTest'] != .5
            or material['name'] != manifest['materialName'] or importer.digest(original) != manifest['basePngSha256']
            or importer.digest(masked) != manifest['covered']['sha256']):
        raise ValueError('Coverage material, native mask or texture identity differs')
    base, covered = [np.asarray(Image.open(io.BytesIO(data)).convert('RGBA')) for data in (original,masked)]
    if (base.shape != (2048,2048,4) or base.shape != covered.shape or not np.all(base[:,:,3] == 255)
            or not np.array_equal(base[:,:,:3],covered[:,:,:3])):
        raise ValueError('Coverage PNG size, base opacity or RGB differs')
    changed = int(np.count_nonzero(base[:,:,3] != covered[:,:,3]))
    if not changed or changed != lineage['changedCoverageAlphaPixels']:
        raise ValueError('Coverage alpha readback differs from source provenance')
    return dict(avatarSha256=spec['bodySha256'],manifestSha256=importer.digest(manifest_bytes),
                basePngSha256=manifest['basePngSha256'],maskedPngSha256=manifest['covered']['sha256'],
                evidence=(folder/'provenance.json').relative_to(ROOT).as_posix())


def registration(item, prepared, group):
    spec_path = importer.confined(ROOT, item['spec'])
    spec_bytes = spec_path.read_bytes()
    if importer.digest(spec_bytes) != prepared['specSha256']:
        raise ValueError('Spec changed after package preparation')
    spec = json.loads(spec_bytes)
    folder = spec_path.parent
    source = json.loads((folder / 'profile-candidate.json').read_bytes())
    recipe_bytes = (folder / 'recipe.json').read_bytes()
    recipe = json.loads(recipe_bytes)
    lineage = json.loads((folder / 'provenance.json').read_bytes())
    native_file, _ = pinned(lineage['native'])
    batch_path, batch_bytes = pinned(lineage['inputs']['authoringBatch'])
    result_path, result_bytes = pinned(lineage['inputs']['authoringResult'])
    native_batch, native_result = json.loads(batch_bytes), json.loads(result_bytes)
    identity = item['id']
    final, = [row for row in native_result['items'] if row['id'] == identity]
    expected, = [row for row in native_batch['items'] if row['id'] == identity]
    if (lineage['id'] != identity or recipe != expected or recipe['values'] != lineage['recipeValues']
            or not native_result['passed'] or final['state'] != 'exported' or final['coldReadback'] != recipe['values']
            or final['values'] != recipe['values'] or native_batch['template']['sha256'] != lineage['inputs']['template']['sha256']
            or batch_path.parent != result_path.parent or native_file != importer.confined(result_path.parent / identity, final['exported']['path'])
            or final['exported']['sha256'] != source['sourceExportSha256'] or lineage['native']['sha256'] != source['sourceExportSha256']
            or source['recipeSha256'] != importer.digest(recipe_bytes)):
        raise ValueError('Profile, native export and authoring recipe identities differ')
    staged = ROOT / 'output/native-production-registration' / item['package']
    equipment = json.loads((staged / 'equipment.json').read_bytes())
    ids = {('shorts' if e['slot'] == 'bottom' else e['slot']):e['id'] for e in equipment['items']}
    p = source['profile']
    floor = lineage['floor']
    if (source['schema'] != 'native-factory-profile-input-v1' or source['suggestedBodyType'] != spec['bodyType']
            or not p['sha256'] == spec['bodySha256'] == prepared['bodySha256'] == lineage['bodySha256'] == floor['bodySha256']
            or p['url'] != spec['urlRoot'] + spec['bodyFile'] or p['manifestUrl'] != spec['urlRoot'] + 'equipment.json'
            or p['bodyTextureCoverage'] != {'url':spec['urlRoot']+'manifest.json','sha256':spec['files']['manifest.json'][1]}
            or p['ids'] != ids or p['sourceFloorY'] != floor['rest'] or p['sourceRawFloorY'] != floor['raw']):
        raise ValueError('Profile does not match the prepared body, equipment, coverage or measured floor')
    addition = dict(bodyType=spec['bodyType'], group=group, sourceExportSha256=source['sourceExportSha256'], recipeSha256=source['recipeSha256'], profile=p)
    return addition, coverage_entry(folder,staged,spec,native_file,lineage)


def register(batch_path, group, report_path):
    if report_path.exists():
        raise FileExistsError('Refuse existing report')
    if not report_path.parent.is_dir():
        raise FileNotFoundError('Missing report directory')
    batch = json.loads(batch_path.read_bytes())
    prepared = importer.execute(batch, ROOT, ROOT / 'output/native-production-registration')
    if not prepared['passed']:
        raise ValueError(json.dumps(prepared, ensure_ascii=False))
    rows = [registration(item, proof, group) for item, proof in zip(batch['items'], prepared['items'], strict=True)]
    additions, admissions = zip(*rows)
    coverage_path = CATALOG.with_name('native-body-texture-coverage-admissions.json')
    lock = CATALOG.with_suffix('.lock')
    with lock.open('x', encoding='utf-8') as stream:
        stream.write('native-registration')
    try:
        previous_bytes = CATALOG.read_bytes()
        previous_coverage = coverage_path.read_bytes()
        coverage_list = json.loads(previous_coverage)
        by_body = {r['avatarSha256']:r for r in coverage_list}
        if len(by_body) != len(coverage_list):
            raise ValueError('Duplicate existing coverage admission')
        for row in admissions:
            prior = by_body.get(row['avatarSha256'])
            if prior is not None and prior != row:
                raise ValueError('Body already has a different coverage admission')
            by_body[row['avatarSha256']] = row
        new_coverage = list(by_body.values())
        changed_coverage = new_coverage != coverage_list
        coverage_payload = (json.dumps(new_coverage,ensure_ascii=False,indent=2)+'\n').encode('utf8') if changed_coverage else previous_coverage
        catalog = json.loads(previous_bytes)
        by_id = {row['bodyType']:row for row in catalog['entries']}
        for row in additions:
            if row['bodyType'] in by_id and by_id[row['bodyType']] != row:
                raise ValueError('Body type already exists with different production data')
            by_id[row['bodyType']] = row
        catalog['entries'] = list(by_id.values())
        check = subprocess.run(['node','--input-type=module','-e',
            "import fs from 'node:fs';import {compileNativeProductionCatalog} from './prototype/src/native-production-catalog.js';import {FOUNDATION_PROFILES} from './prototype/src/foundation-profiles.js';const c=JSON.parse(fs.readFileSync(0,'utf8'));const old=JSON.parse(fs.readFileSync('prototype/src/native-production-catalog.json','utf8'));const existing={...FOUNDATION_PROFILES};for(const r of old.entries)delete existing[r.bodyType];compileNativeProductionCatalog(c,existing);"],
            input=json.dumps(catalog),text=True,encoding='utf-8',cwd=ROOT,capture_output=True)
        if check.returncode:
            raise ValueError('Catalog rejected: '+check.stderr[-1800:])
        updated = json.loads(previous_bytes) != catalog
        payload = (json.dumps(catalog,ensure_ascii=False,indent=2)+'\n').encode('utf-8') if updated else previous_bytes
        report = dict(schema='native-package-registration-v1',bodyTypes=[r['bodyType'] for r in additions],catalogSha256=importer.digest(payload),prepared=prepared,status='source-candidate-registered-runtime-check-pending',fixedWorkbenchChanged=False)
        report['coverageAdmissions'] = list(admissions)
        report['coverageCatalogSha256'] = importer.digest(coverage_payload)
        with ExitStack() as temps:
            staged_dirs = []
            public = ROOT / 'prototype/public/assets'
            scratch = Path(temps.enter_context(tempfile.TemporaryDirectory(prefix='.native-install-', dir=public.parent)))
            for item in batch['items']:
                src = ROOT / 'output/native-production-registration' / item['package']
                dest = public / item['package']
                if report_path.resolve().is_relative_to(dest.resolve()):
                    raise ValueError('Report cannot be written inside a candidate package')
                files = {p.relative_to(src).as_posix():p.read_bytes() for p in src.rglob('*') if p.is_file()}
                if dest.exists():
                    importer.exact_directory(dest, files)
                else:
                    temp = scratch / item['package']
                    shutil.copytree(src,temp)
                    importer.exact_directory(temp,files)
                    staged_dirs.append((temp,dest))
            report_tmp = Path(temps.enter_context(tempfile.TemporaryDirectory(dir=report_path.parent))) / 'receipt'
            report_tmp.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
            catalog_tmp = Path(temps.enter_context(tempfile.TemporaryDirectory(dir=CATALOG.parent))) / 'catalog'
            catalog_tmp.write_bytes(payload)
            coverage_tmp = catalog_tmp.with_name('coverage')
            coverage_tmp.write_bytes(coverage_payload)
            backup = catalog_tmp.with_name('previous-coverage')
            backup.write_bytes(previous_coverage)
            if CATALOG.read_bytes() != previous_bytes or coverage_path.read_bytes() != previous_coverage:
                raise ValueError('Catalog changed during registration')
            with ExitStack() as rollback:
                for temp,dest in staged_dirs:
                    os.rename(temp,dest)
                    rollback.callback(os.rename,dest,temp)
                os.link(report_tmp,report_path)
                rollback.callback(report_path.unlink)
                if changed_coverage:
                    os.replace(coverage_tmp,coverage_path)
                    rollback.callback(os.replace,backup,coverage_path)
                if updated:
                    os.replace(catalog_tmp,CATALOG)
                rollback.pop_all()
            return report
    finally:
        lock.unlink()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch',type=Path,required=True)
    parser.add_argument('--group',choices=['female','male'],required=True)
    parser.add_argument('--report',type=Path,required=True)
    args = parser.parse_args()
    print(json.dumps(register(args.batch,args.group,args.report),ensure_ascii=False))
