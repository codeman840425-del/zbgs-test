"""Rebuild the private paired game from verified native packages and fixed Git source."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts/production"))

import native_import
import register_native_packages as registrar
from production_paths import project_output

SOURCE = (".gitattributes", ".gitignore", "prototype", "assets-source/variant-matrix-v1")
PAIRED = (("studio-01-yun-lan", "female"), ("studio-02-bo-chen", "male"))


def read(path):
    return json.loads(path.read_bytes())


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def store(path, data, mode="x"):
    with path.open(mode, encoding="utf-8", newline="\n") as stream:
        json.dump(data, stream, indent=2, ensure_ascii=False)
        stream.write("\n")


def checked_batches(args):
    if args.inputs and not (args.female or args.male):
        directory = args.inputs.resolve(strict=True)
        return [directory / f / "import-batch.json" for f in ("yun-package", "bo-chen-package")]
    if args.female and args.male and not args.inputs:
        return [args.female, args.male]
    raise ValueError("Use --inputs or provide both --female and --male import batches")


def freeze(args, output, env):
    def git(directory, *words):
        return subprocess.check_output(["git", "-c", "core.hooksPath=.git/no-hooks", *words], cwd=directory, env=env)

    if not re.fullmatch(r"[0-9a-f]{40}", args.base):
        raise ValueError("Expected an exact Git base commit SHA")
    if git(ROOT, "rev-parse", args.base + "^{commit}").decode().strip() != args.base:
        raise ValueError("Base must be a Git commit")
    snap = output / "source"
    snap.mkdir()
    archive = output / "base.tar"
    git(ROOT, "archive", "--format=tar", f"--output={archive}", args.base, *SOURCE)
    with tarfile.open(archive) as stream:
        stream.extractall(snap, filter="data")
    archive.unlink()
    git(snap, "init", "--quiet")
    git(snap, "config", "core.autocrlf", "false")
    git(snap, "add", "-f", "--", *SOURCE)
    expected = git(ROOT, "ls-tree", "-r", args.base, "--", *SOURCE)
    tree = git(snap, "write-tree").decode().strip()
    if git(snap, "ls-tree", "-r", tree, "--", *SOURCE) != expected:
        raise ValueError("Archived source does not match the base Git blobs")

    additions = []
    coverage = []
    pins = []
    requests = []
    for index, (batch_path, (identity, group)) in enumerate(zip(checked_batches(args), PAIRED, strict=True)):
        batch = read(batch_path)
        item, = batch["items"]
        if item["id"] != identity or item["package"] != f"native-{identity}-v1":
            raise ValueError("Unexpected paired package identity")
        stage = output / "staging" / group
        prepared = native_import.execute(batch, ROOT, stage)
        if not prepared["passed"]:
            raise ValueError(prepared)
        proof, = prepared["items"]
        source_receipts = []
        addition, admitted = registrar.registration(item, proof, group, prepared_root=stage,
                                                     source_receipts=source_receipts)
        source_receipt, = source_receipts
        additions.append(addition)
        body = addition["bodyType"]
        package = stage / item["package"]
        spec_path = native_import.confined(ROOT, item["spec"])
        spec = read(spec_path)
        provenance, _ = registrar.pinned(source_receipt)
        if source_receipt["bodyType"] != body or provenance.parent != spec_path.parent:
            raise ValueError("Offline source receipt does not identify the registered package")
        covered = admitted
        if args.historical_layout:
            # This field was included in 9071184230a1's runtime source digest.
            covered = {**admitted, "evidence": source_receipt["path"]}
        coverage.append(covered)
        # Keep the actual verified metadata readable at its hashed logical path in the snapshot.
        for source in [provenance, spec_path, spec_path.parent / "profile-candidate.json", spec_path.parent / "recipe.json",
                       *(native_import.confined(ROOT, ref) for ref, _ in spec["files"].values())]:
            retained = native_import.confined(snap, source.relative_to(ROOT).as_posix())
            if not retained.is_relative_to(snap / "output"):
                raise ValueError("Package evidence must live under the private output tree")
            retained.parent.mkdir(parents=True, exist_ok=True)
            with source.open("rb") as original, retained.open("xb") as copy:
                shutil.copyfileobj(original, copy)
        installed = snap / "prototype/public/assets" / body
        installed.mkdir()
        resources = registrar.published_files(package, item, proof, native_removal=not args.historical_layout)
        expected_files = set(spec["files"])
        if args.historical_layout:
            expected_files.add("staging-manifest.json")
        if set(resources) != expected_files:
            raise ValueError("Unexpected published runtime closure")
        for name, data in resources.items():
            with native_import.confined(installed, name).open("xb") as stream:
                stream.write(data)
        evidence = native_import.confined(snap, covered["evidence"])
        expected_evidence = source_receipt["sha256"] if args.historical_layout else covered["manifestSha256"]
        if digest(evidence) != expected_evidence:
            raise ValueError("Published coverage evidence does not resolve to its verified bytes")
        git(snap, "add", "-f", "--", installed.relative_to(snap).as_posix())
        pins.append(dict(bodyType=body, sha256=covered["avatarSha256"], coverageSha256=covered["manifestSha256"],
                         maskedPngSha256=covered["maskedPngSha256"], basePngSha256=covered["basePngSha256"],
                         files={name: sha for name, (_, sha) in spec["files"].items()},
                         publishedFiles=sorted(resources), stagingReceiptSha256=digest(package / "staging-manifest.json"),
                         coverageEvidence=covered["evidence"], coverageEvidenceSha256=expected_evidence))
        requests.append(dict(schema="character-production-request-v1", operation="create", bodyType=body,
                             identity=dict(id=f"qa-native-removal-fit-{identity}-v1",
                                           name=addition["profile"]["label"], gender=group)))
        store(output / f"registration-{index + 1}.json", dict(prepared=prepared, addition=addition,
                                                               registrationCoverage=admitted, replayCoverage=covered,
                                                               nativeRemovalSourceReceipts=source_receipts))

    source = snap / "prototype/src"
    catalog_path = source / "native-production-catalog.json"
    coverage_path = source / "native-body-texture-coverage-admissions.json"
    catalog = read(catalog_path)
    admitted = read(coverage_path)
    for current, new, key in [(catalog["entries"], additions, "bodyType"), (admitted, coverage, "avatarSha256")]:
        if {row[key] for row in current} & {row[key] for row in new}:
            raise ValueError(f"Existing identity in base catalog: {key}")
        current.extend(new)
    for path, value in ((catalog_path, catalog), (coverage_path, admitted)):
        store(path, value, "w")
        git(snap, "add", "--", path.relative_to(snap).as_posix())
    git(snap, "-c", "user.name=Local QA", "-c", "user.email=local@example.invalid", "commit", "--quiet", "-m",
        "Private paired runtime replay")
    if git(snap, "remote") or git(snap, "status", "--porcelain", "--untracked-files=all"):
        raise ValueError("Expected a clean, private source checkout without a remote")
    store(output / "create.batch.json", dict(schema="character-production-batch-create-v1", requests=requests))
    return snap, git(snap, "rev-parse", "HEAD").decode().strip(), pins


def build(args):
    checked_batches(args)
    output = project_output(args.output, __file__)
    allowed = ROOT / "output"
    if allowed.resolve() != allowed or output == allowed or not output.is_relative_to(allowed):
        raise ValueError("Choose a fresh private directory below project output/")
    reference = args.reference_dist.resolve(strict=True) if args.reference_dist else None
    if reference and (output.is_relative_to(reference) or reference.is_relative_to(output)):
        raise ValueError("Reference and output must be separate")
    if not (args.dependency_prototype / "node_modules/vite/bin/vite.js").is_file():
        raise ValueError("Supply a prototype with its locked installed Node dependencies")
    output.mkdir()
    temp = output / "tmp"
    temp.mkdir()
    private_temp = dict(TEMP=str(temp), TMP=str(temp), TMPDIR=str(temp), NODE_COMPILE_CACHE=str(temp / "node-cache"))
    env = {**os.environ, **private_temp}
    for name in subprocess.check_output(["git", "rev-parse", "--local-env-vars"], cwd=ROOT, env=env).splitlines():
        env.pop(os.fsdecode(name), None)
    previous_temp = {name: os.environ.get(name) for name in private_temp}
    os.environ.update(private_temp)
    try:
        snap, commit, pins = freeze(args, output, env)
    finally:
        for name, value in previous_temp.items():
            if value is None:
                os.environ.pop(name)
            else:
                os.environ[name] = value
    project = snap / "prototype"
    lock = digest(project / "package-lock.json")
    if digest(args.dependency_prototype / "package-lock.json") != lock:
        raise ValueError("Supplied dependency lock differs from fixed source")
    shutil.copytree(args.dependency_prototype / "node_modules", project / "node_modules")
    with (output / "build.log").open("x", encoding="utf-8") as log:
        for command in (["node", "scripts/build-id.mjs"], ["node", "node_modules/vite/bin/vite.js", "build"]):
            subprocess.run(command, cwd=project, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)

    dist = project / "dist"
    info = read(dist / "build-info.json")
    for pin in pins:
        asset = dist / "assets" / pin["bodyType"]
        if sorted(p.name for p in asset.iterdir()) != pin["publishedFiles"]:
            raise ValueError("Fixed runtime published unexpected files")
        if any(digest(asset / name) != sha for name, sha in pin["files"].items()):
            raise ValueError("Fixed runtime resource differs from registered pin")
    report = dict(layout="historical" if args.historical_layout else "current",
                  baseCommit=args.base, privateSourceCommit=commit, sourceDigest=info["sourceDigest"],
                  packageLockSha256=lock, catalogSha256=digest(project / "src/native-production-catalog.json"),
                  coverageCatalogSha256=digest(project / "src/native-body-texture-coverage-admissions.json"),
                  registeredBodies=pins)
    if args.historical_layout:
        expected = read(HERE / "paired-fixed-game.json")["runtimeDigest"]
        report.update(expectedDigest=expected, originalDigestMatches=info["sourceDigest"] == expected)
    if reference:
        left = {p.relative_to(reference).as_posix(): digest(p) for p in reference.rglob("*") if p.is_file()}
        right = {p.relative_to(dist).as_posix(): digest(p) for p in dist.rglob("*") if p.is_file()}
        report.update(referenceDistFiles=len(left), rebuiltDistFiles=len(right),
                      distChangedPaths=sorted(name for name in left.keys() | right.keys() if left.get(name) != right.get(name)))
    store(output / "build-receipt.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, help="Exact base Git commit SHA")
    parser.add_argument("--inputs", type=Path, help="Directory produced by replay_inputs.py")
    parser.add_argument("--female", type=Path, help="Original female package import-batch.json")
    parser.add_argument("--male", type=Path, help="Original male package import-batch.json")
    parser.add_argument("--dependency-prototype", type=Path, default=ROOT / "prototype")
    parser.add_argument("--reference-dist", type=Path)
    parser.add_argument("--historical-layout", action="store_true", help="Keep the old staging and provenance paths for 9071184230a1")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(build(args), ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
