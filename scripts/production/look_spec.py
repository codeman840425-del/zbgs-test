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

from variant_matrix import _resolve_reference, validate_matrix, validate_matrix_files
from production_paths import project_output


SCHEMA = "zbgs-avatar-look-spec-v1"
ID = re.compile(r"^[a-z][a-z0-9-]{1,95}$")
SHA = re.compile(r"^[a-f0-9]{64}$")
MODES = {"concept-reference", "structured-asset"}
COLOR_KEYS = {"skin", "hair", "iris", "lip"}
REPO_ROOT = Path(__file__).resolve().parents[2]


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
    check(isinstance(mode, str) and mode in MODES,
          "sourceMode must be concept-reference or structured-asset")
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
            pin = source.get(key)
            check(isinstance(pin, str) and SHA.fullmatch(pin), f"Invalid sourceAsset.{key}")
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


def plan(matrix: dict, spec: dict, *, root: Path | None = None) -> dict:
    normalized = validate(spec)
    check(isinstance(matrix, dict), "Style variant matrix must be an object")
    errors = validate_matrix(matrix) if root is None else validate_matrix_files(matrix, root)
    check(not errors, "; ".join(errors))
    rows = {
        (style["styleId"], row["bodyType"], row["variantVersion"]): row
        for style in matrix["styles"]
        for row in style["variants"]
    }
    source = normalized["sourceAsset"]
    body_type = normalized["bodyType"]
    resolved: list[dict] = []
    rejections: list[str] = []
    manifest_files: set[Path] = set()

    # The equipment matrix has no admission rows for these look domains.
    appearance = normalized["appearance"]
    blockers = [
        f"appearance-unverified:{domain}/{appearance[domain]['styleId']}/{appearance[domain]['variantVersion']}"
        for domain in ("face", "hair")
    ]
    blockers.extend(f"color-unverified:{domain}/{value}" for domain, value in appearance["colors"].items())
    blockers.extend(
        f"attachment-unverified:{item['slot']}/{item['styleId']}/{item['variantVersion']}"
        for item in normalized["attachments"]
    )
    if normalized["sourceMode"] == "concept-reference":
        blockers.append("concept-reference-pending-production")

    for item in normalized["equipment"]:
        key = (item["styleId"], body_type, item["variantVersion"])
        label = "/".join(key)
        row = rows.get(key)
        if row is None:
            rejections.append(f"missing-exact-variant:{label}")
            continue
        if source is not None:
            manifest_files.add(_resolve_reference(root or REPO_ROOT, row["resourceManifest"]))
            identity_errors = [
                f"{identity}-identity-mismatch:{label}"
                for identity, source_key, row_key in (
                    ("body", "bodySha256", "bodySha256"),
                    ("recipe", "recipeSha256", "recipeSha256"),
                    ("resource-manifest", "manifestSha256", "resourceManifestSha256"),
                )
                if source[source_key] != row.get(row_key)
            ]
            if identity_errors:
                rejections.extend(identity_errors)
                continue
        resolved.append({
            **item,
            "status": row["status"],
            "admissionBlockers": list(row.get("admissionBlockers") or []),
        })
        if row["status"] == "rejected":
            rejections.append(f"variant-rejected:{label}")
        elif row["status"] != "runtime-admitted":
            blockers.append(f"variant-not-admitted:{label}")

    # V1 pins one complete equipment manifest. Different fragments in the
    # same file use the same pin. Separate files require a new input contract.
    if len(manifest_files) > 1:
        rejections.append("multiple-resource-manifests:structured-asset-v1")

    return {
        "schema": "zbgs-avatar-look-plan-v1",
        "lookId": normalized["lookId"],
        "status": "rejected" if rejections else "candidate",
        "bodyType": body_type,
        "bodyVariantVersion": normalized["bodyVariantVersion"],
        "sourceMode": normalized["sourceMode"],
        "resolvedEquipment": resolved,
        "blockers": sorted(set(rejections + blockers)),
        "normalizedSpec": normalized,
    }


def write_plan(matrix_path: Path, spec_path: Path, output: Path, *, root: Path = REPO_ROOT) -> dict:
    output = project_output(output, __file__)
    check(not output.exists(), "Output already exists")
    matrix_bytes = matrix_path.read_bytes()
    spec_bytes = spec_path.read_bytes()
    result = plan(json.loads(matrix_bytes.decode("utf-8")), json.loads(spec_bytes.decode("utf-8")), root=root)
    result["source"] = {
        "matrix": {
            "path": matrix_path.as_posix(),
            "sha256": hashlib.sha256(matrix_bytes).hexdigest(),
        },
        "spec": {
            "path": spec_path.as_posix(),
            "sha256": hashlib.sha256(spec_bytes).hexdigest(),
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("matrix", type=Path)
    parser.add_argument("spec", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="Repository root for matrix file checks")
    args = parser.parse_args()
    try:
        result = write_plan(args.matrix.resolve(), args.spec.resolve(), args.output, root=args.root.resolve())
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(error)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
