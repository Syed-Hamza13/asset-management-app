"""Render every Markdown source in doc/src/ into a Word .docx in doc/.

Run:  python doc/_build/build_docs.py [name-filter]
Output: doc/NN-Title.docx, styled by doc/_build/reference.docx.
"""

import glob
import os
import re
import subprocess
import sys
from pathlib import Path

import pypandoc

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "doc" / "src"
OUT = ROOT / "doc"
REFERENCE = ROOT / "doc" / "_build" / "reference.docx"
PANDOC = pypandoc.get_pandoc_path()
DATE = "2026-11-01"


def build(md_path: Path) -> Path:
    text = md_path.read_text(encoding="utf-8")
    title = re.search(r'^title:\s*"?(.+?)"?\s*$', text, re.M)
    if not title:
        raise SystemExit(f"{md_path.name}: no YAML 'title:' line")
    docx_path = OUT / (md_path.stem + ".docx")
    subprocess.run(
        [
            PANDOC, str(md_path),
            "--from", "markdown+pipe_tables+tex_math_dollars",
            "--to", "docx",
            "--output", str(docx_path),
            "--reference-doc", str(REFERENCE),
            "--toc", "--toc-depth=2",
            "--number-sections",
            "--metadata", f"date={DATE}",
            "--metadata", "lang=en",
        ],
        check=True,
    )
    return docx_path


def main() -> None:
    if not REFERENCE.exists():
        raise SystemExit("run make_reference.py first")
    wanted = sys.argv[1] if len(sys.argv) > 1 else ""
    sources = sorted(glob.glob(str(SRC / "*.md")))
    built, skipped = [], []
    for name in sources:
        path = Path(name)
        if path.name == "README.md" or (wanted and wanted not in path.name):
            skipped.append(path.name)
            continue
        built.append(build(path))
    for path in built:
        print(f"{path.name:55s} {os.path.getsize(path):>9,d} bytes")
    if skipped:
        print("skipped:", ", ".join(skipped))


if __name__ == "__main__":
    main()
