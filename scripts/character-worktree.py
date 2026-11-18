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
    return [Path(os.fsdecode(field[9:])).resolve() for field in listing.split(b'\0')
            if field.startswith(b'worktree ')]


# Git lists the main checkout first, including when git-common-dir is stored separately.
ROOT = worktrees(SCRIPT_REPO)[0]
HOME_DIR = ROOT / 'experiments' / 'worktrees'


def audit():
    # Git's NUL-delimited names stay literal even for paths containing whitespace.
    registered = worktrees(ROOT)
    company_root = (ROOT.parent / 'gamemake-company-platform-c1').resolve()
    unexpected_worktrees = sorted(str(path) for path in registered
                                  if not path.is_relative_to(ROOT) and not path.is_relative_to(company_root))
    prefixes = tuple(ROOT.name.casefold() + separator for separator in ('-', '_', '.'))
    siblings = sorted(p.name for p in ROOT.parent.iterdir() if p.name.casefold().startswith(prefixes))
    company = [name for name in siblings if (ROOT.parent / name).resolve() == company_root]
    fusion = [name for name in siblings if name == 'gamemake-test' and
              (ROOT.parent / name / 'audit' / 'baseline.mjs').is_file()]
    outside = [name for name in siblings if name not in company + fusion]
    print(json.dumps({'project':str(ROOT), 'unexpectedSiblings':outside,
                      'unexpectedWorktrees':unexpected_worktrees, 'companyOwnedSiblings':company,
                      'independentFusionTests':fusion}, ensure_ascii=False))
    return bool(outside or unexpected_worktrees)


def create(name, revision):
    if not re.fullmatch('[a-z0-9][a-z0-9_-]{0,79}', name):
        raise ValueError('Use one lowercase directory name')
    if HOME_DIR.resolve() != HOME_DIR or (HOME_DIR / name).exists():
        raise ValueError('Worktree parent is redirected or destination already exists')
    commit = subprocess.check_output(['git','rev-parse','--verify','--end-of-options', revision+'^{commit}'],
                                     cwd=ROOT, env=GIT_ENV, text=True).strip()
    HOME_DIR.mkdir(parents=True,exist_ok=True)
    subprocess.run(['git','worktree','add','--detach',str(HOME_DIR / name),commit],cwd=ROOT,env=GIT_ENV,check=True)
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command',required=True)
    commands.add_parser('audit')
    add = commands.add_parser('create')
    add.add_argument('name')
    add.add_argument('revision',nargs='?',default='HEAD')
    args = parser.parse_args()
    raise SystemExit(audit() if args.command == 'audit' else create(args.name,args.revision))
