"""Resolve production writes against the tool's main Git worktree."""
import os
from pathlib import Path
import re
import subprocess
import time


DEVICE = re.compile(r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", re.IGNORECASE)


def publish_new_directory(staged, destination):
    """Publish the prepared directory, retrying only a short Windows lock."""
    for delay in (0.025, 0.05, 0.1, 0.2, None):
        if destination.exists():
            raise FileExistsError(destination)
        try:
            staged.rename(destination)
            return
        except PermissionError as error:
            if delay is None or getattr(error, 'winerror', None) not in (5, 32, 33):
                raise
            time.sleep(delay)


def main_checkout(script_file):
    tool = Path(script_file).resolve().parent
    git_env = os.environ.copy()
    try:
        local_vars = subprocess.check_output(["git", "rev-parse", "--local-env-vars"], cwd=tool)
        for name in local_vars.splitlines():
            git_env.pop(os.fsdecode(name), None)
        listing = subprocess.check_output(
            ["git", "worktree", "list", "--porcelain", "-z"], cwd=tool, env=git_env,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise ValueError("Cannot locate the production tool Git checkout") from error
    # Git lists the main checkout first, including when the tool is in a linked one.
    first = listing.split(b"\0", 1)[0]
    if not first.startswith(b"worktree "):
        raise ValueError("Cannot locate the production tool main checkout")
    return Path(os.fsdecode(first[9:])).resolve()


def resolve_output_path(path):
    destination = Path(path)
    if os.name == "nt":
        parts = destination.parts[1:] if destination.anchor else destination.parts
        invalid_name = any(part.endswith((".", " ")) or ":" in part or DEVICE.match(part)
                           for part in parts if part != "..")
        if destination.drive.startswith(("\\\\?\\", "\\\\.\\")) or invalid_name:
            raise ValueError("Unsupported Windows output path")
    return destination.resolve()


def project_output(path, script_file):
    output = resolve_output_path(path)
    checkout = main_checkout(script_file)
    if output == checkout or not output.is_relative_to(checkout):
        raise ValueError("Output must be inside the production tool main checkout")
    return output
