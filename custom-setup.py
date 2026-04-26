#!/usr/bin/env python3
import shutil
import subprocess
import sys
from pathlib import Path


USAGE = "python3 custom-setup.py <ide_name>"


def is_text_file(path: Path) -> bool:
    try:
        data = path.read_bytes()
    except OSError:
        return False
    return b"\x00" not in data


def replace_in_file(path: Path, ide_name: str, ide_name_lower: str) -> None:
    if not is_text_file(path):
        return

    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return

    updated = content.replace("shellde", ide_name_lower).replace("ShellDE", ide_name)
    if updated != content:
        path.write_text(updated, encoding="utf-8")


def replace_all_occurrences(root: Path, ide_name: str) -> None:
    ide_name_lower = ide_name.lower()
    this_script = Path(__file__).resolve()

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if ".git" in path.parts:
            continue
        if path.resolve() == this_script:
            continue
        replace_in_file(path, ide_name, ide_name_lower)


def remove_git_folder(root: Path) -> None:
    git_dir = root / ".git"
    if git_dir.exists():
        shutil.rmtree(git_dir)


def init_fresh_git(root: Path) -> None:
    subprocess.run(["git", "init"], cwd=root, check=True)


def delete_self() -> None:
    Path(__file__).resolve().unlink(missing_ok=True)


def main() -> int:
    if len(sys.argv) != 2:
        print(USAGE)
        return 1

    ide_name = sys.argv[1]
    root = Path.cwd()

    replace_all_occurrences(root, ide_name)
    remove_git_folder(root)
    init_fresh_git(root)
    delete_self()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
