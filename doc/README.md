# Documentation folder

Word documents describing the asset-management application. Each document is
generated from a Markdown source, so the prose stays reviewable in a diff.

```
doc/
  NN-<name>.docx        the finished documents (generated - do not hand-edit)
  src/NN-<name>.md      the sources (edit these)
  _build/
    make_reference.py   builds reference.docx (styles, tables, footer)
    build_docs.py       runs pandoc over src/ and writes the .docx files
    verify_docs.py      checks every rendered file: structure, contents page,
                        footer page field, unrendered markdown, secret scan
    reference.docx      the style sheet every document is rendered against
    reference-default.docx  pandoc's own default, kept for comparison
```

## Documents

| File | Audience |
| --- | --- |
| `00-index` | start here: what the set covers and which document to read |
| `01-overview` | anyone - what the app does, roles, features, glossary |
| `02-architecture` | developers - repo layout, layers, request lifecycle, security |
| `03-data-model-and-migrations` | developers - every table, the migration runner, backups |
| `04-backend-guide` | developers - the Express server, module by module |
| `05-api-reference` | anyone calling the API - routes, payloads, error codes |
| `06-frontend-guide` | developers - React routes, components, styling, PWA, exports |
| `07-user-guide` | staff and admins - every screen, step by step |
| `08-setup-and-development` | developers - install, run, test, code conventions, recipes |
| `09-docker-deployment-and-operations` | whoever runs the server - image, compose, deploys, ops |

## Rebuild

Needs Python 3 and `pypandoc-binary` (it bundles pandoc, so no separate pandoc
install is required):

```bash
pip install pypandoc-binary python-docx
python doc/_build/make_reference.py   # only when the styling itself should change
python doc/_build/build_docs.py       # renders every source
python doc/_build/build_docs.py 04    # renders one, by filename fragment
python doc/_build/verify_docs.py      # checks all ten, exits non-zero on a problem
```

Output is written next to the other `.docx` files in `doc/`. The script prints
each file's size, and fails if a source has no `title:` line in its YAML block.

## Conventions for sources

- Start each file with a YAML block containing `title: "NN — Title"`. That
  becomes the Word title page; do not repeat it as a `#` heading.
- `#` is a chapter, `##` a section. `--number-sections` and `--toc-depth=2`
  mean only those two levels are numbered and listed in the contents.
- Pipe tables for anything with more than two columns of facts. Keep cells
  short; the style sheet gives them borders and a shaded header row.
- Fenced code blocks for commands, SQL and sample payloads.
- Simple English, present tense, second person for procedures ("press Save"),
  and exact on-screen wording in quotes when describing the UI.

## Before committing a rebuild

1. `python doc/_build/verify_docs.py` — structure, contents page, footer page
   field, unrendered Markdown and the secret scan, for all ten files.
2. Open one document in Word and look at it: table borders, shaded header row,
   heading colours, page numbers. (This machine has neither Word nor LibreOffice,
   so the visual pass is a human step, not an automated one.)
3. Re-verify numbers that move - migration count, table count, test counts,
   capability list - against the code, not against the old document.
4. Sources must use placeholders such as `<your-site-key>`, never a real
   credential, database host or staff email address.
