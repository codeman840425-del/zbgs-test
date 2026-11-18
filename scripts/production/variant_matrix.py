"""Validate and resolve style-to-body variants before runtime registration.

This is deliberately independent of the browser runtime: a style can have
many body-specific variants, but an incomplete variant must never be silently
paired with a different body or inferred from a similar name.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


SCHEMA = "zbgs-style-variant-matrix-v1"
VALID_STATUSES = {"candidate", "runtime-admitted", "rejected"}


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
        body_ids: set[str] = set()
        for variant in variants:
            if not isinstance(variant, dict):
                errors.append(f"{sid}: variant must be an object")
                continue
            body = variant.get("bodyType")
            if not isinstance(body, str) or not body:
                errors.append(f"{sid}: variant requires bodyType")
            elif body in body_ids:
                errors.append(f"{sid}: duplicate bodyType {body}")
            body_ids.add(body)
            for key in ("resourceManifest", "fitManifest", "coverageManifest"):
                if not isinstance(variant.get(key), str) or not variant[key]:
                    errors.append(f"{sid}/{body}: missing {key}")
            status = variant.get("status")
            if status not in VALID_STATUSES:
                errors.append(f"{sid}/{body}: invalid status {status!r}")
            if status == "runtime-admitted" and not variant.get("admissionEvidence"):
                errors.append(f"{sid}/{body}: runtime-admitted requires admissionEvidence")
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
    args = parser.parse_args(argv)
    data = json.loads(args.matrix.read_text(encoding="utf-8"))
    errors = validate_matrix(data)
    if errors:
        print(json.dumps({"status": "rejected", "errors": errors}, ensure_ascii=False))
        return 2
    output = {"status": "validated", "styles": len(data["styles"])}
    if args.body_type:
        output["runtimeVariants"] = runtime_variants(data, args.body_type)
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
