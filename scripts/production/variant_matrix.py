"""Validate and resolve style-to-body variants before runtime registration.

This is deliberately independent of the browser runtime: a style can have
many body-specific variants, but an incomplete variant must never be silently
paired with a different body or inferred from a similar name.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path
from flow import GLB, Validator, require


SCHEMA = "zbgs-style-variant-matrix-v1"
VALID_STATUSES = {"candidate", "runtime-admitted", "rejected"}
SHA256 = 64
VERSION = re.compile(r"^[a-z][a-z0-9-]{0,100}$")


def validate_matrix(data: dict) -> list[str]:
    errors: list[str] = []
    if data.get("schema") != SCHEMA:
        errors.append("schema must be zbgs-style-variant-matrix-v1")
    styles = data.get("styles")
    if not isinstance(styles, list) or not styles:
        return errors + ["styles must be a non-empty array"]
    style_ids: set[str] = set()
    for style in styles:
        sid = style.get("styleId") if isinstance(style, dict) else None
        if not isinstance(sid, str) or not sid:
            errors.append("each style requires styleId")
            continue
        if sid in style_ids:
            errors.append(f"duplicate styleId: {sid}")
        style_ids.add(sid)
        variants = style.get("variants")
        if not isinstance(variants, list) or not variants:
            errors.append(f"{sid}: variants must be a non-empty array")
            continue
        body_versions: set[tuple[str, str]] = set()
        for variant in variants:
            if not isinstance(variant, dict):
                errors.append(f"{sid}: variant must be an object")
                continue
            body = variant.get("bodyType")
            if not isinstance(body, str) or not body:
                errors.append(f"{sid}: variant requires bodyType")
            version = variant.get("variantVersion")
            if not isinstance(version, str) or not VERSION.fullmatch(version):
                errors.append(f"{sid}/{body}: variantVersion must be a stable identifier")
            elif isinstance(body, str) and (body, version) in body_versions:
                errors.append(f"{sid}: duplicate bodyType/version {body}/{version}")
            if isinstance(body, str) and isinstance(version, str) and VERSION.fullmatch(version):
                body_versions.add((body, version))
            for key in ("bodySha256", "resourceManifestSha256", "coverageManifestSha256"):
                value = variant.get(key)
                if not isinstance(value, str) or len(value) != SHA256 or any(c not in "0123456789abcdef" for c in value):
                    errors.append(f"{sid}/{body}/{version}: {key} must be a lowercase sha256")
            for key in ("resourceManifest", "fitManifest", "coverageManifest"):
                if not isinstance(variant.get(key), str) or not variant[key]:
                    errors.append(f"{sid}/{body}/{version}: missing {key}")
            status = variant.get("status")
            if status not in VALID_STATUSES:
                errors.append(f"{sid}/{body}/{version}: invalid status {status!r}")
            if status == "runtime-admitted" and not variant.get("admissionEvidence"):
                errors.append(f"{sid}/{body}/{version}: runtime-admitted requires admissionEvidence")
            if status == "runtime-admitted" and variant.get("budgetStatus") == "reject-static-over-budget":
                errors.append(f"{sid}/{body}/{version}: over-budget variant cannot be runtime-admitted")
            blockers = variant.get("admissionBlockers")
            if status == "runtime-admitted" and blockers:
                if not isinstance(blockers, list) or any(not isinstance(item, str) or not item for item in blockers):
                    errors.append(f"{sid}/{body}/{version}: admissionBlockers must be non-empty strings")
                else:
                    errors.append(f"{sid}/{body}/{version}: runtime-admitted variant still has admission blockers")
    return errors


def _split_reference(reference: str) -> tuple[str, str | None]:
    path, separator, fragment = reference.partition('#')
    return path, fragment if separator else None


def _resolve_reference(root: Path, reference: str) -> Path:
    """Resolve a manifest reference using the repository's public asset roots."""
    if not isinstance(reference, str) or not reference:
        raise ValueError('manifest reference must be a non-empty string')
    path, _ = _split_reference(reference)
    if path.startswith('/assets/'):
        candidate = root / 'prototype' / 'public' / 'assets' / path.removeprefix('/assets/')
    elif path.startswith('assets/'):
        candidate = root / 'prototype' / 'public' / 'assets' / path.removeprefix('assets/')
    else:
        candidate = root / path
    candidate = candidate.resolve()
    repository = root.resolve()
    if not candidate.is_relative_to(repository):
        raise ValueError(f'manifest reference escapes repository: {reference}')
    return candidate


def check_declared_review(style_id, row, root, reviews):
    """An admitted label must point to the same receipt reviewed by the production tool."""
    from outfit_admission import evidence_pin, SCHEMA as review_schema

    ref = row['admissionEvidence']
    if not isinstance(ref, str) or '#' in ref:
        raise ValueError('Expected a complete admission receipt path')
    path = _resolve_reference(root, ref)
    receipt = json.loads(path.read_bytes())
    if not isinstance(receipt, dict) or receipt.get('schema') != review_schema or receipt.get('status') != 'passed':
        raise ValueError('Expected a passed whole-outfit receipt')
    fields = ('bodyType', 'bodySha256', 'variantVersion', 'recipeSha256', 'resourceManifest',
              'resourceManifestSha256', 'fitManifest', 'coverageManifest', 'coverageManifestSha256')
    expected = {key: row[key] for key in fields}
    expected['styleId'] = style_id
    expected['fitManifestSha256'] = hashlib.sha256(_resolve_reference(root, row['fitManifest']).read_bytes()).hexdigest()
    binding = receipt.get('binding')
    if not isinstance(binding, dict) or any(binding.get(key) != value for key, value in expected.items()):
        raise ValueError('Receipt body, style, version, recipe or material binding differs')
    pin = evidence_pin(path, root)
    if not any(review['approval'] == pin for review in reviews.values()):
        raise ValueError('Receipt is absent from the independently reviewed outfit index')


def _members(rows, label):
    require(isinstance(rows, list) and rows, f'{label}: expected nonempty member list')
    result = {}
    for row in rows:
        ident = row.get('id') if isinstance(row, dict) else None
        require(isinstance(ident, str) and ident, f'{label}: missing id')
        require(ident not in result, f'{label}: duplicate id {ident}')
        result[ident] = row
    return result


def _match(doc, expected, label):
    for key, value in expected.items():
        require(isinstance(doc, dict) and key in doc and type(doc[key]) is type(value) and doc[key] == value,
                f'{label}: {key} differs from the selected member')


def _asset(assets, manifest, url, sha, size=None):
    require(isinstance(url, str) and url and '#' not in url and '?' not in url, 'Invalid asset URL')
    name = assets.url(url) if url.startswith('/') else (manifest.parent.relative_to(assets.root) / url).as_posix()
    return assets.pin(name, sha, size)


def _check_bindings(assets, resource_path, item):
    require(type(item.get('bytes')) is int and item['bytes'] > 0, 'resourceManifest: missing byte count')
    glb = GLB(_asset(assets, resource_path, item.get('url'), item.get('sha256'), item['bytes']))
    require(isinstance(glb.doc, dict), 'resourceManifest: missing glTF JSON')
    # Embedded fits refer to exported bone bindings; the older assets have no fitId.
    bindings = item.get('bindings')
    require(isinstance(bindings, list) and bindings, 'fitManifest: missing bindings')
    exported = glb.bind_by_name()
    names = set()
    for binding in bindings:
        require(isinstance(binding, dict), 'fitManifest: invalid binding')
        bone, target, matrix = (binding.get(k) for k in ('sourceBone','targetRawBone','inverseBindMatrix'))
        require(isinstance(bone, str) and bone in exported and bone not in names and isinstance(target, str) and target,
                'fitManifest: invalid or duplicate raw bone binding')
        require(isinstance(matrix, list) and len(matrix) == 16 and all(type(x) in (int,float) for x in matrix)
                and all(abs(a-b) < 2e-6 for a,b in zip(exported[bone],matrix)), 'fitManifest: inverse bind differs')
        names.add(bone)
    require(names == set(exported), 'fitManifest: incomplete exported bindings')


def _validate_resources(variant, style_id, docs, paths, assets):
    resource, fit, coverage = (docs[k] for k in ('resourceManifest','fitManifest','coverageManifest'))
    resource_path, fit_path, coverage_path = (paths[k] for k in ('resourceManifest','fitManifest','coverageManifest'))
    ident, fit_ref, cover_ref = (_split_reference(variant[k])[1] for k in ('resourceManifest','fitManifest','coverageManifest'))
    require(resource.get('schema') == 'zbgs-equipment-v1', 'resourceManifest: unsupported equipment schema')
    catalog = _members(resource.get('items'), 'resourceManifest.items')
    require(ident in catalog, f'resourceManifest: missing exact equipment fragment {ident!r}')
    item, body = catalog[ident], variant['bodySha256']
    _match(item, {'compatibleAvatarSha256':body, 'requiresRawSkeleton':True}, 'resourceManifest')
    require(isinstance(item.get('slot'), str) and item['slot'], 'resourceManifest: missing slot')
    _check_bindings(assets, resource_path, item)
    if fit_path == resource_path:
        require(fit_ref in (ident+'.bindings', ident+'.fitId'), 'fitManifest: expected the selected equipment and fit field')
        if fit_ref == ident+'.fitId':
            require(isinstance(item.get('fitId'), str) and item['fitId'], 'fitManifest: missing fitId')
            if 'sourceSpec' in item:
                spec = json.loads(_resolve_reference(assets.root, item['sourceSpec']).read_bytes())
                _match(spec, {k:item[k] for k in ('id','fitId','compatibleAvatarSha256')}, 'fitManifest sourceSpec')
    else:
        require(fit_ref is None and fit.get('schema') == 'zbgs-socks-layer-fit-v1', 'fitManifest: unknown external fit or fragment')
        require(isinstance(item.get('fitId'), str) and item['fitId'], 'fitManifest: missing equipment fitId')
        _match(item, {'styleId':style_id, 'slot':'socks'}, 'fitManifest equipment')
        _match(fit, {'id':item['fitId'], 'garmentId':ident, 'garmentSha256':item['sha256'],
                     'baseAvatarSha256':body, 'slot':item['slot'], 'styleId':style_id, 'version':item['version']}, 'fitManifest')
        fitted = _members(fit.get('pairingCandidates'), 'fitManifest.pairingCandidates')
        pairs = item['pairedWith']
        declared = _members([*pairs['shoes'], *pairs['lower']], 'equipment.pairedWith')
        require(fitted.keys() == declared.keys(), 'fitManifest: paired equipment IDs differ')
        # An additive catalog can point to the immutable body catalog that owns its partners.
        partners = catalog
        if 'pairingCatalog' in resource:
            ref = resource['pairingCatalog']
            base = json.loads(_asset(assets, resource_path, ref['url'], ref['sha256']))
            _match(base, {'schema':'zbgs-equipment-v1'}, 'fitManifest pairing catalog')
            partners = _members(base.get('items'), 'fitManifest pairing catalog')
            require(not catalog.keys() & partners.keys(), 'fitManifest: duplicate additive equipment IDs')
        for key, pair in fitted.items():
            require(key in partners, 'fitManifest: paired equipment missing')
            _match(pair, {'sha256':declared[key]['sha256']}, 'fitManifest paired equipment')
            _match(partners[key], {'sha256':pair['sha256'], 'compatibleAvatarSha256':body}, 'fitManifest paired equipment')

    schema = coverage.get('schema')
    if schema == 'zbgs-equipment-v1':
        require(coverage_path == resource_path and cover_ref == ident+'.preserveOriginalBody',
                'coverageManifest: expected selected equipment preserveOriginalBody fragment')
        _match(item, {'preserveOriginalBody':True}, 'coverageManifest')
    elif schema == 'zbgs-socks-layer-fit-v1':
        require(coverage_path == fit_path and cover_ref == 'bodyCoverageMasks', 'coverageManifest: expected bodyCoverageMasks from selected fit')
        _match(fit, {'bodyCoverageMasks':[]}, 'coverageManifest')
        _match(item, {'preserveOriginalBody':True}, 'coverageManifest')
    elif schema == 'native-body-texture-coverage-v1':
        require(cover_ref is None, 'coverageManifest: unexpected native coverage fragment')
        _match(coverage, {'avatarSha256':body}, 'coverageManifest')
        rules = _members(coverage.get('equipment'), 'coverageManifest.equipment')
        require(ident in rules, 'coverageManifest: selected equipment missing')
        require(set(rules) == {k for k, entry in catalog.items() if entry.get('compatibleAvatarSha256') == body},
                'coverageManifest: equipment rules differ from body catalog')
        for key, rule in rules.items():
            require(key in catalog, f'coverageManifest: unknown equipment {key}')
            entry = catalog[key]
            _match(entry, {'compatibleAvatarSha256':body}, 'coverageManifest equipment')
            _match(rule, {'slot':entry['slot'], 'sha256':entry['sha256'], 'compatibleAvatarSha256':body,
                          'covered':entry['slot'] == 'top'}, 'coverageManifest')
            require(type(rule.get('required')) is bool, 'coverageManifest: missing required flag')
        mask = coverage['covered']
        _asset(assets, coverage_path, mask['url'], mask['sha256'])
    elif schema == 'zbgs-outfit-body-coverage-candidate.1':
        require(cover_ref is None and item['slot'] == 'top', 'coverageManifest: mask belongs to the selected top')
        _match(coverage, {'avatarSha256':body, 'topId':ident, 'topSha256':item['sha256']}, 'coverageManifest')
    elif schema == 'zbgs-garment-coverage-mask-v1':
        require(cover_ref is None, 'coverageManifest: unexpected garment-mask fragment')
        _match(coverage['binding'], {'bodySha256':body}, 'coverageManifest binding')
        for id_key,sha_key,slot in [('innerTopId','innerTopSha256','top'),('outerId','outerAssetSha256','outerwear')]:
            key = coverage[id_key]
            require(key in catalog, 'coverageManifest: missing garment '+str(key))
            _match(catalog[key], {'slot':slot, 'sha256':coverage[sha_key], 'compatibleAvatarSha256':body}, 'coverageManifest')
        require(ident in (coverage['innerTopId'],coverage['outerId']), 'coverageManifest: mask belongs to different garments')
    else:
        raise ValueError(f'coverageManifest: unsupported schema {schema!r}')


def validate_matrix_files(data: dict, root: Path) -> list[str]:
    """Validate the on-disk closure for every matrix row.

    The structural validator deliberately accepts synthetic rows for unit tests.
    This second pass is used by production/import callers and verifies that each
    referenced manifest exists, is inside the repository, and matches its pinned
    hash.  Fit references may include a fragment because several equipment
    variants share one manifest file.
    """
    errors = validate_matrix(data)
    if errors:
        return errors
    root = Path(root).resolve()
    reviews = None
    assets = Validator(root)
    for style in data['styles']:
        style_id = style['styleId']
        for variant in style['variants']:
            label = f"{style_id}/{variant['bodyType']}/{variant['variantVersion']}"
            if 'recipeSource' in variant:
                try:
                    source = _resolve_reference(root, variant['recipeSource'])
                    require('#' not in variant['recipeSource'] and
                            hashlib.sha256(source.read_bytes()).hexdigest() == variant.get('recipeSha256'),
                            'Recipe bytes differ from the declared authoring source')
                except (OSError, ValueError, TypeError) as error:
                    errors.append(f'{label}: recipeSource rejected: {error}')
            documents, paths = {}, {}
            for key in ('resourceManifest', 'fitManifest', 'coverageManifest'):
                try:
                    path = _resolve_reference(root, variant[key])
                    raw = path.read_bytes()
                    expected = variant.get(key+'Sha256')
                    if key == 'fitManifest' and 'fitManifestSha256' not in variant and path == paths.get('resourceManifest'):
                        expected = variant['resourceManifestSha256']
                    actual = hashlib.sha256(raw).hexdigest()
                    require(actual == expected, f'{key} SHA does not match {actual}')
                    document = json.loads(raw)
                    require(isinstance(document, dict), f'{key} must contain a JSON object')
                    documents[key], paths[key] = document, path
                except (OSError, ValueError) as error:
                    errors.append(f'{label}: {key} cannot be read: {error}')
            if len(documents) == 3:
                try:
                    _validate_resources(variant, style_id, documents, paths, assets)
                except (OSError, ValueError, KeyError, TypeError, IndexError, struct.error) as error:
                    errors.append(f'{label}: invalid resource/fit/coverage: {error}')
            if variant['status'] == 'runtime-admitted':
                try:
                    if reviews is None:
                        from outfit_admission import load_reviewed_admissions
                        reviews = load_reviewed_admissions()
                    check_declared_review(style_id, variant, root, reviews)
                except (OSError, ValueError, TypeError, KeyError) as error:
                    errors.append(f'{label}: admissionEvidence rejected: {error}')
    return errors


def runtime_variants(data: dict, body_type: str) -> list[dict]:
    """Return only exact, admitted variants for one body type."""
    if (errors := validate_matrix(data)):
        raise ValueError("; ".join(errors))
    result = []
    for style in data["styles"]:
        for variant in style["variants"]:
            if variant["bodyType"] == body_type and variant["status"] == "runtime-admitted":
                result.append({"styleId": style["styleId"], **variant})
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("matrix", type=Path)
    parser.add_argument("--body-type")
    parser.add_argument("--root", type=Path,
                        help="Repository root for on-disk manifest closure checks")
    args = parser.parse_args(argv)
    data = json.loads(args.matrix.read_text(encoding="utf-8"))
    check_root = args.root or (Path(__file__).resolve().parents[2] if args.body_type else None)
    errors = validate_matrix_files(data, check_root) if check_root else validate_matrix(data)
    if errors:
        print(json.dumps({"status": "rejected", "errors": errors}, ensure_ascii=False))
        return 2
    output = {"status": "validated", "styles": len(data["styles"])}
    if args.root:
        output["matrixPath"] = args.matrix.resolve().as_posix()
        output["matrixSha256"] = hashlib.sha256(args.matrix.resolve().read_bytes()).hexdigest()
        output["root"] = args.root.resolve().as_posix()
    if args.body_type:
        output["runtimeVariants"] = runtime_variants(data, args.body_type)
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
