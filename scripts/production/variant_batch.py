"""Plan deterministic game-character records from a fixed style matrix.

Production requests use an exact body-specific matrix row and a separately
reviewed receipt for the complete configured outfit and fixed runtime. Diagnostic
requests use the same outfit resolution and remain technical candidates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from tempfile import TemporaryDirectory
from pathlib import Path

from variant_matrix import validate_matrix_files, _resolve_reference
from outfit_admission import binding_key, load_reviewed_admissions, outfit_binding, source_commit, verify_runtime_source
from production_paths import project_output, publish_new_directory


SCHEMA = "zbgs-style-variant-batch-request-v1"
OUT_SCHEMA = "zbgs-style-variant-batch-plan-v1"
ID = re.compile(r"^[a-z][a-z0-9-]{1,95}$")
SHA = re.compile(r"^[a-f0-9]{64}$")
QUERY_SCRIPT = "scripts/production/variant_batch_query.mjs"
FIXED_MATRIX = "assets-source/variant-matrix-v1/representative-matrix.json"
LIVE_ACCESSORY_KINDS = {"glasses", "mic"}
ITEM_FIELDS = {"stableId", "styleId", "bodyType", "variantVersion", "identity", "outfit", "appearance", "liveAccessories", "matchingStyles"}


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def pin(root: Path, reference: str) -> dict:
    path = _resolve_reference(root, reference)
    raw = path.read_bytes()
    return {"path": path.relative_to(root).as_posix(),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw)}


def matrix_rows(matrix: dict) -> dict[tuple[str, str, str], dict]:
    return {(style["styleId"], variant["bodyType"], variant["variantVersion"]): {
        "styleId": style["styleId"],
        "label": style.get("label", style["styleId"]),
        **variant,
    } for style in matrix["styles"] for variant in style["variants"]}


def variant_key(item):
    return tuple(item.get(key) for key in ("styleId", "bodyType", "variantVersion"))


def style_choices(choices):
    check(isinstance(choices, list) and choices, "Expected a nonempty list of styles")
    seen = set()
    for choice in choices:
        check(isinstance(choice, dict) and set(choice) == {"styleId", "variantVersion"} and
              all(isinstance(value, str) and ID.fullmatch(value) for value in choice.values()),
              "Each style requires an exact styleId and variantVersion")
        check(choice["styleId"] not in seen, "Duplicate requested style: " + choice["styleId"])
        seen.add(choice["styleId"])
    return choices


def selected_keys(item):
    if "matchingStyles" not in item:
        return [variant_key(item)]
    choices = style_choices(item["matchingStyles"])
    keys = [(c["styleId"], item.get("bodyType"), c["variantVersion"]) for c in choices]
    check(keys[0] == variant_key(item), "Primary style and version must match the first requested style")
    return keys


def validate_live_accessories(values):
    check(isinstance(values, dict), "Specify a liveAccessories object")
    for kind, enabled in values.items():
        check(kind in LIVE_ACCESSORY_KINDS, f"Unknown liveAccessories field: {kind}")
        check(type(enabled) is bool, f"liveAccessories.{kind} must be boolean")


def batch_items(request):
    items = request.get("items")
    check(isinstance(items, list) and items, "Batch request items must be non-empty")
    if "sharedLook" not in request:
        return items
    shared = request["sharedLook"]
    check(isinstance(shared, dict), "Invalid sharedLook")
    common = {"outfitRole", "appearance", "liveAccessories"}
    if "styles" in shared:
        check(set(shared) <= common | {"styles"}, "Do not mix individual and grouped style selectors")
        choices = style_choices(shared["styles"])
        primary = choices[0]
        check("outfitRole" not in shared or isinstance(shared["outfitRole"], str) and ID.fullmatch(shared["outfitRole"]),
              "Invalid shared outfitRole")
    else:
        required = {"styleId", "variantVersion", "outfitRole"}
        check(required <= set(shared) <= common | required and
              all(isinstance(shared[k], str) and ID.fullmatch(shared[k]) for k in required), "Invalid sharedLook")
        choices = None
        primary = shared
    if "appearance" in shared:
        check(isinstance(shared["appearance"], dict) and shared["appearance"] and
              all(isinstance(value, str) for value in shared["appearance"].values()), "Invalid shared appearance")
    if "liveAccessories" in shared:
        validate_live_accessories(shared["liveAccessories"])
    expanded = []
    required = {"bodyType", "identity"}
    for item in items:
        uses_live = "liveAccessories" in shared or isinstance(item, dict) and "liveAccessories" in item
        if not isinstance(item, dict) or not (required <= set(item) <= required | {"appearance", "liveAccessories"}):
            # Keep per-item errors isolated, including attempted overrides of the shared style.
            if uses_live and isinstance(item, dict):
                identity = item.get("identity")
                expanded.append({"stableId": identity.get("id") if isinstance(identity, dict) else None,
                                 "itemError": "Shared looks require bodyType, identity and optional appearance or liveAccessories per item"})
            else:
                expanded.append({"itemError": "Shared looks require bodyType, identity and optional appearance per item"})
            continue
        identity = item["identity"]
        stable_id = identity.get("id") if isinstance(identity, dict) else None
        if "appearance" in shared:
            overrides = item.get("appearance", {})
            if not isinstance(overrides, dict) or ("appearance" in item and not overrides):
                expanded.append({"itemError": "Specify a nonempty appearance object",
                                 **({"stableId": stable_id} if uses_live else {})})
                continue
            item = {**item, "appearance": {**shared["appearance"], **overrides}}
        if uses_live:
            overrides = item.get("liveAccessories", {})
            try:
                validate_live_accessories(overrides)
            except ValueError as error:
                expanded.append({"stableId": stable_id, "itemError": str(error)})
                continue
            item = {**item, "liveAccessories": {**shared.get("liveAccessories", {}), **overrides}}
        expanded.append({**item, "stableId": stable_id,
                         "styleId":primary["styleId"], "variantVersion":primary["variantVersion"],
                         **({"matchingStyles":choices} if choices else {}),
                         **({"outfit":{"role":shared["outfitRole"]}} if "outfitRole" in shared else {})})
    return expanded


def resource_member(row, root):
    reference, _, member = row["resourceManifest"].partition("#")
    check(bool(member), "Variant must identify its exact equipment member in resourceManifest")
    data = _resolve_reference(root, reference).read_bytes()
    check(hashlib.sha256(data).hexdigest() == row["resourceManifestSha256"], "Variant equipment manifest pin differs")
    items = json.loads(data).get("items", [])
    matches = [entry for entry in items if entry.get("id") == member]
    check(len(matches) == 1, "Variant equipment must be unique in its pinned manifest")
    entry, = matches
    check(entry.get("compatibleAvatarSha256") == row["bodySha256"] and SHA.fullmatch(str(entry.get("sha256", ""))),
          "Variant equipment body identity or hash differs")
    return {"id": member, "slot": entry["slot"], "sha256": entry["sha256"]}


def outfit_pins(pins):
    check(isinstance(pins, list) and bool(pins), "Outfit must list all exact equipment")
    checked = []
    for pin in pins:
        check(isinstance(pin, dict) and set(pin) == {"id", "slot", "sha256"} and
              isinstance(pin["id"], str) and bool(pin["id"]) and
              isinstance(pin["slot"], str) and bool(pin["slot"]) and SHA.fullmatch(str(pin["sha256"])),
              "Outfit equipment requires exact id, slot and sha256")
        checked.append((pin["id"], pin["slot"], pin["sha256"]))
    check(len({pin[0] for pin in checked}) == len(checked), "Duplicate outfit equipment ID")
    return sorted(checked)


def personal_appearance(values, query):
    check(isinstance(values, dict) and values, "Specify a nonempty appearance object")
    defaults = query.get("appearanceDefaults", {})
    choices = query.get("appearanceChoices", {})
    for field, value in values.items():
        check(field in defaults and isinstance(value, str), f"Unknown appearance field or invalid value: {field}")
        options = [entry for entry in choices.get(field, []) if entry["value"] == value]
        check(len(options) == 1, f"Appearance value is not registered for this body: {field}={value}")
        allowed_tones = options[0].get("supportedSkinTones")
        check(allowed_tones is None or values.get("skinTone", defaults.get("skinTone")) in allowed_tones,
              f"Appearance value is incompatible with the selected skin tone: {field}={value}")
    return {field: values[field] for field in sorted(values) if values[field] != defaults[field]}


def live_accessory_edits(values, query, appearance):
    validate_live_accessories(values)
    slots = query.get("liveAccessories", {})
    edits = []
    for kind in sorted(values):
        if not values[kind]:
            continue
        slot = slots.get(kind, {})
        enabled = [choice for choice in slot.get("choices", []) if choice.get("enabled") is True]
        reason = slot.get("reason", "exact body fit or resource unavailable")
        check(slot.get("status") == "registered" and len(enabled) == 1,
              f"liveAccessories.{kind} unavailable for this body: {reason}")
        if "headDependency" in slot.get("constraints", {}):
            style = appearance.get("hairStyle", query.get("appearanceDefaults", {}).get("hairStyle"))
            allowed = slot.get("allowedHairStyles")
            check(isinstance(allowed, list) and style in allowed,
                  f"liveAccessories.{kind} has no fit for the selected hairStyle: {style}")
        edits.append({"domain": "liveAccessory", "kind": kind, "enabled": True})
    return edits


def production_request(item, row, query, member, *, required_members=None):
    unknown = sorted(set(item) - ITEM_FIELDS)
    check(not unknown, "Unknown batch item field: " + ", ".join(unknown))
    identity = item.get("identity")
    check(isinstance(identity, dict) and set(identity) == {"id", "name", "gender"} and
          identity["id"] == item["stableId"], "Specify identity.id, name and gender; identity.id must equal stableId")
    for key, limit in (("name", 160), ("gender", 40)):
        text = identity[key]
        check(isinstance(text, str) and bool(text.strip()) and len(text.encode("utf-16-le")) // 2 <= limit,
              f"Specify an explicit identity.{key}")
    chosen = item.get("outfit")
    if "outfit" in item or required_members is None:
        check(isinstance(chosen, dict) and set(chosen) in ({"role"}, {"role", "equipment"}) and
              isinstance(chosen["role"], str) and bool(chosen["role"]), "Specify the configured outfit role")
    requested_pins = outfit_pins(chosen["equipment"]) if chosen and "equipment" in chosen else None
    check(bool(query) and query.get("ok") is True, (query or {}).get("error", "No verified runtime query for this body"))
    body = query["body"]
    check(body["bodyType"] == row["bodyType"] and body["sha256"] == row["bodySha256"],
          "Runtime query body differs from the matrix")
    matches = [outfit for outfit in query["outfits"] if (not chosen or outfit["role"] == chosen["role"]) and
               (requested_pins is None or outfit_pins(outfit["equipment"]) == requested_pins)]
    if required_members is not None:
        wanted = set(outfit_pins(required_members))
        matches = [outfit for outfit in matches if wanted.issubset(outfit_pins(outfit["equipment"]))]
        check(matches, "No configured outfit contains all requested exact equipment on this body")
        check(len(matches) == 1, "Several outfits match the requested styles; specify outfitRole: " +
              ", ".join(sorted(outfit["role"] for outfit in matches)))
    check(len(matches) == 1, "No unique configured outfit for the requested role and equipment pins")
    pins = outfit_pins(matches[0]["equipment"])
    check(bool(member) and outfit_pins([member])[0] in pins, "Configured outfit does not contain the exact matrix equipment")
    index = matches[0]["index"]
    check(type(index) is int and index >= 0, "Runtime query returned an invalid outfit index")
    edits = [{"domain": "outfit", "selection": {
        "bodySha256":body["sha256"], "role":matches[0]["role"],
        "equipment":[dict(id=id_, slot=slot, sha256=sha) for id_, slot, sha in pins],
    }}]
    if "appearance" in item:
        values = personal_appearance(item["appearance"], query)
        if values:
            edits.append({"domain": "appearance", "values": values})
    if "liveAccessories" in item:
        edits.extend(live_accessory_edits(item["liveAccessories"], query, item.get("appearance", {})))
    return {"schema": "character-production-request-v1", "operation": "create", "bodyType": row["bodyType"],
            "identity": dict(identity), "edits": edits}


def eligible_variant(row, diagnostic):
    return row.get("status") in {"candidate", "runtime-admitted"} and (
        diagnostic or row.get("budgetStatus") != "reject-static-over-budget")


def selected_row(rows, key, diagnostic, admissions):
    style_id, body_type, version = key
    row = rows.get((style_id, body_type, version))
    check(row is not None, f"No exact variant for {style_id}/{body_type}/{version}")
    if not eligible_variant(row, diagnostic):
        details = []
        if row.get("status") == "rejected":
            details.append("variant explicitly rejected")
        if row.get("budgetStatus") == "reject-static-over-budget":
            details.append("static budget over limit")
        blockers = row.get("admissionBlockers")
        if isinstance(blockers, list) and blockers:
            details.append("blockers: " + ", ".join(str(item) for item in blockers))
        suffix = f" ({'; '.join(details)})" if details else ""
        raise ValueError(f"runtime admission pending for {style_id}/{body_type}{suffix}")
    if row.get("status") == "runtime-admitted":
        check(isinstance(row.get("admissionEvidence"), str) and row["admissionEvidence"],
              "runtime-admitted variant has no admission evidence")
        check(SHA.fullmatch(str(row.get("recipeSha256") or "")),
              "runtime-admitted variant has no parameter recipe identity")
    if not diagnostic:
        check(admissions, "Whole-outfit runtime admission evidence is required from the reviewed index")
        check(SHA.fullmatch(str(row.get("recipeSha256") or "")),
              "Whole-outfit runtime admission requires an exact parameter recipe identity")
        if row["status"] == "candidate":
            check(isinstance(row.get("recipeSource"), str) and bool(row["recipeSource"]),
                  "Whole-outfit candidate requires its pinned parameter recipe source")
    for key in ("bodySha256", "resourceManifestSha256", "coverageManifestSha256"):
        check(SHA.fullmatch(str(row.get(key) or "")), f"Invalid {key}")
    return row


def plan(matrix: dict, request: dict, *, queries=None, members=None, diagnostic=False,
         fit_shas=None, admissions=None, runtime_commit=None) -> dict:
    check(request.get("schema") == SCHEMA, "Invalid style variant batch request schema")
    batch_id = request.get("batchId")
    check(isinstance(batch_id, str) and ID.fullmatch(batch_id), "Invalid batchId")
    items = batch_items(request)
    rows = matrix_rows(matrix)
    seen: set[str] = set()
    planned = []
    for item in items:
        result = {"status": "rejected"}
        try:
            check(isinstance(item, dict), "item must be an object")
            check("itemError" not in item, str(item.get("itemError")))
            stable_id = item.get("stableId")
            style_id = item.get("styleId")
            body_type = item.get("bodyType")
            version = item.get("variantVersion")
            check(isinstance(stable_id, str) and ID.fullmatch(stable_id), "Invalid stableId")
            check(stable_id not in seen, f"Duplicate stableId: {stable_id}")
            seen.add(stable_id)
            check(isinstance(style_id, str) and ID.fullmatch(style_id), "Invalid styleId")
            check(isinstance(body_type, str) and ID.fullmatch(body_type), "Invalid bodyType")
            check(isinstance(version, str) and ID.fullmatch(version), "Invalid variantVersion")
            selections = []
            for key in selected_keys(item):
                selected = selected_row(rows, key, diagnostic, admissions)
                component = (members or {}).get(key)
                check(not isinstance(component, str), component)
                selections.append((key, selected, component))
            _, row, member = selections[0]
            check(all(selected["bodySha256"] == row["bodySha256"] for _, selected, _ in selections),
                  "Requested styles resolve to different body digests")
            required_members = [component for _, _, component in selections] if "matchingStyles" in item else None
            executable = production_request(item, row, (queries or {}).get(body_type), member, required_members=required_members)
            outfit = executable["edits"][0]["selection"]
            approval = None
            approved_styles = []
            if not diagnostic:
                check(not any(edit["domain"] == "liveAccessory" for edit in executable["edits"]),
                      "Whole-outfit review requires live accessories disabled")
                check(len(executable["edits"]) == 1, "Whole-outfit review covers default appearance only")
                for key, selected, _ in selections:
                    fit_sha = (fit_shas or {}).get(key)
                    reviewed = (admissions or {}).get(binding_key(outfit_binding(selected, outfit, fit_sha)))
                    check(reviewed, "Whole-outfit runtime admission evidence is required for this exact body, version and equipment")
                    check(reviewed["runtime"]["sourceCommit"] == runtime_commit,
                          "Whole-outfit admission requires its reviewed runtime source commit")
                    if approval is None:
                        approval = reviewed
                    approved_styles.append(reviewed)
            result.update({
                "status": "candidate" if diagnostic else "accepted",
                "stableId": stable_id,
                "request": executable,
                "selection": {
                    "styleId": style_id,
                    "variantVersion": version,
                    "bodySha256": row["bodySha256"],
                    "recipeSha256": row.get("recipeSha256"),
                    "resourceManifest": row["resourceManifest"],
                    "resourceManifestSha256": row["resourceManifestSha256"],
                    "fitManifest": row["fitManifest"],
                    "coverageManifest": row["coverageManifest"],
                    "coverageManifestSha256": row["coverageManifestSha256"],
                    "admissionEvidence": row.get("admissionEvidence"),
                    "outfit": outfit,
                    **({"matchedStyles":[{"styleId":selected["styleId"], "variantVersion":selected["variantVersion"],
                                          "recipeSha256":selected.get("recipeSha256"), "equipment":component}
                                         for _, selected, component in selections]} if required_members else {}),
                    **({"styleAdmissions":approved_styles} if required_members and approved_styles else {}),
                    **({"appearance": dict(item["appearance"])} if "appearance" in item else {}),
                    **({"liveAccessories": dict(item["liveAccessories"])} if "liveAccessories" in item else {}),
                    **({"wholeOutfitAdmission":approval} if approval else {}),
                },
            })
        except (TypeError, ValueError, KeyError) as error:
            result["reason"] = str(error)
            if isinstance(item, dict) and isinstance(item.get("stableId"), str):
                result["stableId"] = item["stableId"]
        planned.append(result)
    accepted = sum(row["status"] == "accepted" for row in planned)
    candidates = sum(row["status"] == "candidate" for row in planned)
    return {
        "schema": OUT_SCHEMA,
        "batchId": batch_id,
        "mode": "technical-candidate" if diagnostic else "runtime-admitted" if accepted else "readiness-gated",
        "items": planned,
        "acceptedCount": accepted,
        **({"candidateCount": candidates} if diagnostic else {}),
        "rejectedCount": len(planned) - accepted - candidates,
    }


def resolve_runtime(matrix, request, root, diagnostic, has_admissions):
    rows = matrix_rows(matrix)
    queries, members, fit_shas = {}, {}, {}
    items = batch_items(request)
    live_kinds = {}
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("bodyType"), str) or set(item) - ITEM_FIELDS:
            continue
        values = item.get("liveAccessories", {})
        if isinstance(values, dict):
            enabled = {kind for kind in LIVE_ACCESSORY_KINDS if values.get(kind) is True}
            if enabled:
                live_kinds.setdefault(item["bodyType"], set()).update(enabled)
    keys = {}
    for item in items:
        if not isinstance(item, dict) or not all(isinstance(value, str) for value in variant_key(item)):
            continue
        try:
            keys.update(dict.fromkeys(selected_keys(item)))
        except ValueError:
            continue  # plan reports an invalid selection on its own character
    for key in keys:
        row = rows.get(key)
        if not row or not eligible_variant(row, diagnostic):
            continue
        if not diagnostic and (not has_admissions or not SHA.fullmatch(str(row.get("recipeSha256") or ""))):
            continue
        try:
            members[key] = resource_member(row, root)
            if not diagnostic:
                fit_shas[key] = pin(root, row["fitManifest"])["sha256"]
        except (KeyError, OSError, TypeError, ValueError) as error:
            members[key] = str(error)
            continue
        body = row["bodyType"]
        if body in queries:
            continue
        projection = Path(__file__).with_name("variant_batch_query.mjs")
        args = ["node", str(projection), body, str(root.resolve()), *sorted(live_kinds.get(body, ()))]
        result = subprocess.run(args, cwd=root, text=True, encoding="utf-8",
                                capture_output=True, check=False)
        if result.returncode:
            queries[body] = {"ok":False, "error":result.stderr.strip() or "Runtime query failed"}
        else:
            queries[body] = json.loads(result.stdout)
    return queries, members, fit_shas


def publish_plan(package: Path, output: Path):
    try:
        publish_new_directory(package, output)
    except FileExistsError as error:
        raise ValueError("Output already exists") from error


def run(matrix_path: Path | None, request_path: Path, output: Path, root: Path, diagnostic=False, *, input_root=None) -> dict:
    output = project_output(output, __file__)
    root = root.resolve()
    input_root = (input_root or root).resolve()
    default_matrix = matrix_path is None
    matrix_root = root if default_matrix else input_root
    matrix_path = (root / FIXED_MATRIX if default_matrix else matrix_path).resolve()
    request_path = (input_root / request_path if default_matrix else request_path).resolve()
    matrix_boundary = ("Default matrix must be inside the fixed runtime checkout" if default_matrix
                       else "Matrix must be inside the selected input checkout")
    check(matrix_path.is_relative_to(matrix_root), matrix_boundary)
    check(request_path.is_relative_to(input_root), "Request must be inside the selected input checkout")

    def load(path, checkout):
        raw = path.read_bytes()
        return json.loads(raw.decode("utf-8")), {
            "path": path.relative_to(checkout).as_posix(), "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
        }

    matrix, matrix_pin = load(matrix_path, matrix_root)
    errors = validate_matrix_files(matrix, root)
    check(not errors, "; ".join(errors))
    check(not output.exists(), "Output already exists")
    request, request_pin = load(request_path, input_root)
    admissions = {} if diagnostic else load_reviewed_admissions()
    if admissions:
        check(matrix_path == (root / FIXED_MATRIX).resolve(), "Formal outfit planning requires the compiled fixed matrix")
    runtime_commit = source_commit(root) if admissions else None
    reviewed_builds = {approval["runtime"]["sourceDigest"]: approval for approval in admissions.values()
                       if approval["runtime"]["sourceCommit"] == runtime_commit}
    for approval in reviewed_builds.values():
        verify_runtime_source(root, approval)
    queries, members, fit_shas = resolve_runtime(matrix, request, root, diagnostic, bool(admissions))
    if runtime_commit:
        check(source_commit(root) == runtime_commit, "Fixed outfit runtime source changed while planning")
    result = plan(matrix, request, queries=queries, members=members, diagnostic=diagnostic,
                  fit_shas=fit_shas, admissions=admissions, runtime_commit=runtime_commit)
    if default_matrix:
        matrix_pin["origin"] = "runtime-root"
        request_pin["origin"] = "input-root"
    result["source"] = {"matrix": matrix_pin, "request": request_pin}
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent, prefix=".variant-batch-") as temp:
        package = Path(temp) / "batch"
        requests = package / ("diagnostic-requests" if diagnostic else "requests")
        requests.mkdir(parents=True)
        jobs = []
        for row in result["items"]:
            if row["status"] not in ("accepted", "candidate"):
                continue
            path = requests / f"{row['stableId']}.request.json"
            job = row.pop("request")
            jobs.append(job)
            data = (json.dumps(job, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            path.write_bytes(data)
            row["requestPin"] = {"path":path.relative_to(package).as_posix(),
                                 "sha256":hashlib.sha256(data).hexdigest(), "bytes":len(data)}
        result["creationBatches"] = []
        for start in range(0, len(jobs), 4):
            group = jobs[start:start + 4]
            path = requests / f"create-{start // 4 + 1:03d}.batch.json"
            payload = {"schema":"character-production-batch-create-v1", "requests":group}
            data = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            path.write_bytes(data)
            result["creationBatches"].append({
                "ids":[job["identity"]["id"] for job in group],
                "path":path.relative_to(package).as_posix(),
                "sha256":hashlib.sha256(data).hexdigest(), "bytes":len(data),
            })
        (package / "plan.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        publish_plan(package, output)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("matrix", type=Path, nargs="?", help="Explicit operator matrix; defaults to the fixed matrix in --root")
    parser.add_argument("request", type=Path, help="Operator request; relative to --input-root when the matrix is omitted")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--input-root", type=Path, help="Checkout containing the request and any explicit matrix; defaults to --root")
    parser.add_argument("--diagnostic", action="store_true", help="Emit explicitly mapped test requests without granting runtime admission")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.matrix, args.request, args.output, args.root,
                             diagnostic=args.diagnostic, input_root=args.input_root), ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(error)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
