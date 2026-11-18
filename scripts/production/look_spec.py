"""Validate a structured art-agent look request before batch production.

This is an intake contract. It does not infer meshes, weights, clothing fits,
or runtime admission from a concept image. A later batch step can resolve the
exact body/style/version rows after the source assets have been produced and
admitted.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


SCHEMA = "zbgs-avatar-look-spec-v1"
ID = re.compile(r"^[a-z][a-z0-9-]{1,95}$")
SHA = re.compile(r"^[a-f0-9]{64}$")
MODES = {"concept-reference", "structured-asset"}
COLOR_KEYS = {"skin", "hair", "iris", "lip"}


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def identifier(value: object, label: str) -> str:
    check(isinstance(value, str) and ID.fullmatch(value), f"Invalid {label}")
    return value


def version(value: object, label: str = "variantVersion") -> str:
    return identifier(value, label)


def validate(spec: dict) -> dict:
    check(isinstance(spec, dict), "Look spec must be an object")
    check(spec.get("schema") == SCHEMA, "Invalid look spec schema")
    look_id = identifier(spec.get("lookId"), "lookId")
    mode = spec.get("sourceMode")
    check(mode in MODES, "sourceMode must be concept-reference or structured-asset")
    body_type = identifier(spec.get("bodyType"), "bodyType")
    body_version = version(spec.get("bodyVariantVersion"), "bodyVariantVersion")

    reference = spec.get("conceptReference")
    if mode == "concept-reference":
        check(isinstance(reference, dict), "Concept references require conceptReference")
        identifier(reference.get("referenceId"), "conceptReference.referenceId")
        check(isinstance(reference.get("label"), str) and reference["label"].strip(),
              "Concept reference label is required")
    else:
        source = spec.get("sourceAsset")
        check(isinstance(source, dict), "Structured assets require sourceAsset")
        for key in ("bodySha256", "recipeSha256", "manifestSha256"):
            check(SHA.fullmatch(str(source.get(key) or "")), f"Invalid sourceAsset.{key}")
        identifier(source.get("assetId"), "sourceAsset.assetId")

    appearance = spec.get("appearance")
    check(isinstance(appearance, dict), "appearance is required")
    for domain in ("face", "hair"):
        value = appearance.get(domain)
        check(isinstance(value, dict), f"appearance.{domain} is required")
        identifier(value.get("styleId"), f"appearance.{domain}.styleId")
        version(value.get("variantVersion"), f"appearance.{domain}.variantVersion")
    colors = appearance.get("colors")
    check(isinstance(colors, dict), "appearance.colors is required")
    check(set(colors) <= COLOR_KEYS, "appearance.colors contains an unknown domain")
    for key, value in colors.items():
        identifier(value, f"appearance.colors.{key}")

    equipment = spec.get("equipment")
    check(isinstance(equipment, list) and equipment, "equipment must be a non-empty list")
    roles: set[str] = set()
    normalized_equipment = []
    for item in equipment:
        check(isinstance(item, dict), "Each equipment item must be an object")
        role = identifier(item.get("role"), "equipment.role")
        check(role not in roles, f"Duplicate equipment role: {role}")
        roles.add(role)
        normalized_equipment.append({
            "role": role,
            "styleId": identifier(item.get("styleId"), "equipment.styleId"),
            "variantVersion": version(item.get("variantVersion"), "equipment.variantVersion"),
        })

    attachments = spec.get("attachments", [])
    check(isinstance(attachments, list), "attachments must be a list")
    slots: set[str] = set()
    normalized_attachments = []
    for item in attachments:
        check(isinstance(item, dict), "Each attachment item must be an object")
        slot = identifier(item.get("slot"), "attachments.slot")
        check(slot not in slots, f"Duplicate attachment slot: {slot}")
        slots.add(slot)
        normalized_attachments.append({
            "slot": slot,
            "styleId": identifier(item.get("styleId"), "attachments.styleId"),
            "variantVersion": version(item.get("variantVersion"), "attachments.variantVersion"),
        })

    return {
        "schema": SCHEMA,
        "lookId": look_id,
        "sourceMode": mode,
        "bodyType": body_type,
        "bodyVariantVersion": body_version,
        "conceptReference": reference if mode == "concept-reference" else None,
        "sourceAsset": spec.get("sourceAsset") if mode == "structured-asset" else None,
        "appearance": {
            "face": {
                "styleId": appearance["face"]["styleId"],
                "variantVersion": appearance["face"]["variantVersion"],
            },
            "hair": {
                "styleId": appearance["hair"]["styleId"],
                "variantVersion": appearance["hair"]["variantVersion"],
            },
            "colors": dict(colors),
        },
        "equipment": normalized_equipment,
        "attachments": normalized_attachments,
    }


def matrix_key(style_id: str, body_type: str, variant: str) -> tuple[str, str, str]:
    return style_id, body_type, variant


def plan(matrix: dict, spec: dict) -> dict:
    normalized = validate(spec)
    rows = {
        matrix_key(style["styleId"], row["bodyType"], row["variantVersion"]): row
        for style in matrix.get("styles", [])
        for row in style.get("variants", [])
    }
    resolved = []
    blockers: list[str] = []
    for item in normalized["equipment"]:
        row = rows.get(matrix_key(item["styleId"], normalized["bodyType"], item["variantVersion"]))
        if row is None:
            blockers.append(f"missing-exact-variant:{item['styleId']}/{normalized['bodyType']}/{item['variantVersion']}")
            continue
        source = normalized.get("sourceAsset")
        if source and row.get("bodySha256") != source.get("bodySha256"):
            blockers.append(f"body-identity-mismatch:{item['styleId']}/{normalized['bodyType']}/{item['variantVersion']}")
            continue
        resolved.append({
            "role": item["role"],
            "styleId": item["styleId"],
            "variantVersion": item["variantVersion"],
            "status": row.get("status"),
            "admissionBlockers": list(row.get("admissionBlockers") or []),
        })
        if row.get("status") != "runtime-admitted":
            blockers.append(f"variant-not-admitted:{item['styleId']}/{normalized['bodyType']}/{item['variantVersion']}")
    status = "runtime-ready" if not blockers and resolved else "candidate"
    if not resolved or any(item.startswith("missing-exact-variant:") for item in blockers):
        status = "rejected"
    return {
        "schema": "zbgs-avatar-look-plan-v1",
        "lookId": normalized["lookId"],
        "status": status,
        "bodyType": normalized["bodyType"],
        "bodyVariantVersion": normalized["bodyVariantVersion"],
        "sourceMode": normalized["sourceMode"],
        "resolvedEquipment": resolved,
        "blockers": sorted(set(blockers)),
        "normalizedSpec": normalized,
    }


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_plan(matrix_path: Path, spec_path: Path, output: Path) -> dict:
    check(not output.exists(), "Output already exists")
    result = plan(read_json(matrix_path), read_json(spec_path))
    result["source"] = {
        "matrix": {
            "path": matrix_path.as_posix(),
            "sha256": hashlib.sha256(matrix_path.read_bytes()).hexdigest(),
        },
        "spec": {
            "path": spec_path.as_posix(),
            "sha256": hashlib.sha256(spec_path.read_bytes()).hexdigest(),
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("matrix", type=Path)
    parser.add_argument("spec", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(write_plan(args.matrix.resolve(), args.spec.resolve(), args.output.resolve()), ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(error)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
