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
from pathlib import Path


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
    for style in data['styles']:
        style_id = style['styleId']
        for variant in style['variants']:
            label = f"{style_id}/{variant['bodyType']}/{variant['variantVersion']}"
            for key, sha_key in (
                ('resourceManifest', 'resourceManifestSha256'),
                ('coverageManifest', 'coverageManifestSha256'),
            ):
                try:
                    path = _resolve_reference(root, variant[key])
                    raw = path.read_bytes()
                except (OSError, ValueError) as error:
                    errors.append(f'{label}: {key} cannot be read: {error}')
                    continue
                actual = hashlib.sha256(raw).hexdigest()
                if actual != variant[sha_key]:
                    errors.append(f'{label}: {key} SHA does not match {actual}')
            try:
                fit_path = _resolve_reference(root, variant['fitManifest'])
                actual = hashlib.sha256(fit_path.read_bytes()).hexdigest()
                if 'fitManifestSha256' in variant and actual != variant['fitManifestSha256']:
                    errors.append(f'{label}: fitManifest SHA does not match {actual}')
            except (OSError, ValueError) as error:
                errors.append(f'{label}: fitManifest cannot be read: {error}')
            if variant['status'] == 'runtime-admitted':
                try:
                    evidence_path = _resolve_reference(root, variant['admissionEvidence'])
                    evidence_path.read_bytes()
                except (OSError, ValueError, KeyError) as error:
                    errors.append(f'{label}: admissionEvidence cannot be read: {error}')
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
    errors = validate_matrix_files(data, args.root) if args.root else validate_matrix(data)
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
