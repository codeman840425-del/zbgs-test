"""Create an isolated character checkout within the project, or audit its drive root."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess


SCRIPT_REPO = Path(__file__).resolve().parents[1]
GIT_ENV = os.environ.copy()
for variable in subprocess.check_output(['git', 'rev-parse', '--local-env-vars'], cwd=SCRIPT_REPO).splitlines():
    GIT_ENV.pop(os.fsdecode(variable), None)


def worktrees(cwd):
    listing = subprocess.check_output(['git', 'worktree', 'list', '--porcelain', '-z'], cwd=cwd, env=GIT_ENV)
    return [Path(os.fsdecode(field[9:])) for field in listing.split(b'\0')
            if field.startswith(b'worktree ')]


# Git lists the main checkout first, including when git-common-dir is stored separately.
ROOT = worktrees(SCRIPT_REPO)[0].resolve()
HOME_DIR = ROOT / 'experiments' / 'worktrees'


def check_location(path, label):
    try:
        resolved = path.resolve()
    except (OSError, RuntimeError) as error:
        raise ValueError(f'{label} cannot be resolved: {path}: {error}') from error
    if resolved != path or path.is_symlink() or getattr(path, 'is_junction', lambda: False)():
        raise ValueError(f'{label} is redirected: {path} -> {resolved}')


def check_home():
    for directory in (HOME_DIR.parent, HOME_DIR):
        check_location(directory, 'Worktree parent')
        if directory.exists() and not directory.is_dir():
            raise ValueError(f'Worktree parent is not a directory: {directory}')


def require_new_destination(destination):
    check_home()
    try:
        # Inspect the entry itself so a dangling junction or symlink still counts.
        destination.lstat()
    except FileNotFoundError:
        pass
    else:
        raise ValueError('Worktree destination already exists')


def require_created_destination(destination):
    check_home()
    check_location(destination, 'Created worktree')
    if not destination.is_dir():
        raise ValueError(f'Created worktree directory is missing: {destination}')


def audit():
    # Git's NUL-delimited names stay literal even for paths containing whitespace.
    registered = worktrees(ROOT)
    company_root = (ROOT.parent / 'gamemake-company-platform-c1').resolve()
    path_issues = set()
    unexpected_worktrees = []
    for path in registered:
        try:
            resolved = path.resolve()
        except (OSError, RuntimeError) as error:
            path_issues.add(f'Registered worktree cannot be resolved: {path}: {error}')
            continue
        if not resolved.is_relative_to(ROOT) and not resolved.is_relative_to(company_root):
            unexpected_worktrees.append(str(resolved))
    try:
        check_home()
        entries = list(HOME_DIR.iterdir()) if HOME_DIR.is_dir() else []
    except (OSError, ValueError) as error:
        path_issues.add(str(error))
        entries = []
    for path in set(entries) | {path for path in registered if path.is_relative_to(ROOT)}:
        try:
            check_location(path, 'Worktree path')
        except (OSError, ValueError) as error:
            path_issues.add(str(error))
    prefixes = tuple(ROOT.name.casefold() + separator for separator in ('-', '_', '.'))
    siblings = sorted(p.name for p in ROOT.parent.iterdir() if p.name.casefold().startswith(prefixes))
    company = [name for name in siblings if (ROOT.parent / name).resolve() == company_root]
    fusion = [name for name in siblings if name == 'gamemake-test' and
              (ROOT.parent / name / 'audit' / 'baseline.mjs').is_file()]
    outside = [name for name in siblings if name not in company + fusion]
    print(json.dumps({'project':str(ROOT), 'unexpectedSiblings':outside,
                      'unexpectedWorktrees':sorted(unexpected_worktrees), 'companyOwnedSiblings':company,
                      'independentFusionTests':fusion, 'worktreePathIssues':sorted(path_issues)}, ensure_ascii=False))
    return bool(outside or unexpected_worktrees or path_issues)


def runtime_inputs(commit):
    matrix = 'assets-source/variant-matrix-v1/representative-matrix.json'
    listing = subprocess.check_output(
        ['git', 'ls-tree', '-z', commit, '--', 'prototype', '.gitattributes', matrix], cwd=ROOT, env=GIT_ENV,
    )
    entries = {}
    for field in listing.split(b'\0'):
        if field:
            metadata, name = field.split(b'\t', 1)
            entries[os.fsdecode(name)] = metadata.split()
    if entries.get('prototype', [None])[0] != b'040000':
        raise ValueError('Runtime checkout requires a prototype directory in the requested commit')
    directories = ['prototype']
    if matrix in entries:
        directories.append(Path(matrix).parent.as_posix())
    attributes = None
    attribute_entry = entries.get('.gitattributes')
    if attribute_entry:
        mode, _, object_id = attribute_entry
        if mode not in (b'100644', b'100755'):
            raise ValueError('Expected a regular .gitattributes file in the requested commit')
        attributes = subprocess.check_output(['git', 'cat-file', 'blob', os.fsdecode(object_id)], cwd=ROOT, env=GIT_ENV)
    return directories, attributes, bool(attribute_entry and attribute_entry[0] == b'100755')


def create(name, revision, runtime_only=False):
    if not re.fullmatch('[a-z0-9][a-z0-9_-]{0,79}', name):
        raise ValueError('Use one lowercase directory name')
    if re.fullmatch('con|prn|aux|nul|com[1-9]|lpt[1-9]', name):
        raise ValueError('Worktree name is reserved by Windows')
    destination = HOME_DIR / name
    require_new_destination(destination)
    commit = subprocess.check_output(['git','rev-parse','--verify','--end-of-options', revision+'^{commit}'],
                                     cwd=ROOT, env=GIT_ENV, text=True).strip()
    if runtime_only:
        directories, attributes, attributes_executable = runtime_inputs(commit)
    for directory in (HOME_DIR.parent, HOME_DIR):
        require_new_destination(destination)
        directory.mkdir(exist_ok=True)
    require_new_destination(destination)
    checkout_options = ['--no-checkout'] if runtime_only else []
    subprocess.run(['git', 'worktree', 'add', '--detach', *checkout_options, str(destination), commit],
                   cwd=ROOT, env=GIT_ENV, check=True)
    if runtime_only:
        require_created_destination(destination)
        # Populate the exact attributes before Git materializes runtime inputs on Windows.
        if attributes is not None:
            attribute_path = destination / '.gitattributes'
            with attribute_path.open('xb') as stream:
                stream.write(attributes)
            if attributes_executable:
                attribute_path.chmod(0o755)
        require_created_destination(destination)
        subprocess.run(['git', 'sparse-checkout', 'set', '--cone', *directories],
                       cwd=destination, env=GIT_ENV, check=True)
        require_created_destination(destination)
        subprocess.run(['git', 'checkout', '--detach', commit], cwd=destination, env=GIT_ENV, check=True)
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command',required=True)
    commands.add_parser('audit')
    add = commands.add_parser('create')
    add.add_argument('name')
    add.add_argument('revision',nargs='?',default='HEAD')
    add.add_argument('--runtime-only', action='store_true', help='Check out the fixed runtime sources and variant matrix')
    args = parser.parse_args()
    raise SystemExit(audit() if args.command == 'audit' else create(args.name,args.revision,args.runtime_only))
