# 壶流论文图库原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local browser-based prototype that scans only `codex整理`, generates a stable thesis-oriented image catalog, and lets the user browse images by thesis period.

**Architecture:** A Python catalog builder reads the source image folder and writes JSON data. A tiny Python HTTP server serves the static prototype and safely streams original images through `/image/<image_id>`. The frontend is plain HTML/CSS/JavaScript so it can later become a PWA without changing the catalog model.

**Tech Stack:** Python standard library, Python `unittest`, static HTML/CSS/JavaScript, local HTTP server.

---

### File Structure

- Create: `scripts/catalog_builder.py`  
  Scans `codex整理`, groups numbered image variants into object records, preserves stable `HL-0001` and `IMG-0001` ids, marks missing files, classifies thesis periods, and writes catalog JSON.
- Create: `scripts/serve.py`  
  Starts a local HTTP server, serves `prototype/`, exposes `/api/catalog`, and streams original image files by catalog image id.
- Create: `tests/test_catalog_builder.py`  
  Tests period classification, multi-image object grouping, stable id preservation, and missing-file retention.
- Create: `prototype/index.html`  
  App shell for the browser prototype.
- Create: `prototype/styles.css`  
  Dense, thesis-workbench-style responsive UI.
- Create: `prototype/app.js`  
  Fetches catalog data, manages filters and selection, renders phase navigation, image grid, and object details.
- Create: `README.md`  
  Explains how to rebuild the catalog and run the local prototype.
- Generate: `data/catalog.json`  
  Current scanned catalog.
- Generate: `data/pending-merge.json`  
  Candidate same-object groups that should be reviewed later.

### Task 1: Catalog Builder Tests

**Files:**
- Create: `tests/test_catalog_builder.py`
- Create: `scripts/catalog_builder.py`

- [ ] **Step 1: Write failing tests for catalog behavior**

Write `tests/test_catalog_builder.py` with these tests:

```python
import json
import tempfile
import unittest
from pathlib import Path

from scripts.catalog_builder import build_catalog, classify_phase, normalize_object_title


PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00"
    b"\x90wS\xde"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


class CatalogBuilderTests(unittest.TestCase):
    def write_png(self, root: Path, relative: str) -> Path:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(PNG_BYTES)
        return path

    def test_classifies_thesis_phases_from_period_paths(self):
        self.assertEqual(classify_phase(Path("01_按时期分类/01_潜龙勿用_新石器时代/图.png"))["id"], "yuan_origin")
        self.assertEqual(classify_phase(Path("01_按时期分类/02_见龙在田_夏商至秦汉/青铜盉流/图.jpg"))["id"], "heng_diverse")
        self.assertEqual(classify_phase(Path("01_按时期分类/03_或跃在渊_魏晋至隋唐五代/图.png"))["id"], "li_mature")
        self.assertEqual(classify_phase(Path("01_按时期分类/04_飞龙在天_宋元至明清/图.png"))["id"], "zhen_peak")
        self.assertEqual(classify_phase(Path("01_按时期分类/05_亢龙有悔_晚清至现代/图.png"))["id"], "modern_supplement")

    def test_normalizes_numbered_views_to_one_object_title(self):
        self.assertEqual(normalize_object_title("河姆渡文化鸟形盉 (1).png"), "河姆渡文化鸟形盉")
        self.assertEqual(normalize_object_title("龙首青铜盉-2.jpg"), "龙首青铜盉")
        self.assertEqual(normalize_object_title("大汶口文化猪形陶鬹.png"), "大汶口文化猪形陶鬶")

    def test_groups_numbered_views_under_one_object(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_png(root, "01_按时期分类/01_潜龙勿用_新石器时代/河姆渡文化鸟形盉 (1).png")
            self.write_png(root, "01_按时期分类/01_潜龙勿用_新石器时代/河姆渡文化鸟形盉 (2).png")

            catalog = build_catalog(root, existing_catalog=None)

            self.assertEqual(len(catalog["objects"]), 1)
            self.assertEqual(catalog["objects"][0]["id"], "HL-0001")
            self.assertEqual(catalog["objects"][0]["title"], "河姆渡文化鸟形盉")
            self.assertEqual(len(catalog["objects"][0]["imageIds"]), 2)

    def test_preserves_existing_object_and_image_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image = self.write_png(root, "01_按时期分类/04_飞龙在天_宋元至明清/宋-湖田窑-影青执壶.png")
            first = build_catalog(root, existing_catalog=None)
            first["objects"][0]["reviewStatus"] = "已审阅"

            second = build_catalog(root, existing_catalog=first)

            self.assertEqual(second["objects"][0]["id"], first["objects"][0]["id"])
            self.assertEqual(second["objects"][0]["reviewStatus"], "已审阅")
            self.assertEqual(second["images"][0]["id"], first["images"][0]["id"])
            self.assertEqual(Path(second["images"][0]["path"]), image)

    def test_retains_missing_images_without_deleting_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image = self.write_png(root, "01_按时期分类/03_或跃在渊_魏晋至隋唐五代/唐-白釉侈口曲柄注子.png")
            first = build_catalog(root, existing_catalog=None)
            image.unlink()

            second = build_catalog(root, existing_catalog=first)

            self.assertEqual(len(second["objects"]), 1)
            self.assertEqual(second["images"][0]["fileStatus"], "missing")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
python -m unittest tests.test_catalog_builder -v
```

Expected: fail because `scripts.catalog_builder` does not exist.

### Task 2: Catalog Builder Implementation

**Files:**
- Create: `scripts/catalog_builder.py`

- [ ] **Step 1: Implement minimal catalog builder**

Create `scripts/catalog_builder.py` with functions:

```python
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif"}

PHASES = [
    {"id": "yuan_origin", "label": "元：起源阶段（史前至夏商）"},
    {"id": "heng_diverse", "label": "亨：多元阶段（两周至秦汉）"},
    {"id": "li_mature", "label": "利：成熟阶段（魏晋至隋唐）"},
    {"id": "zhen_peak", "label": "贞：鼎盛阶段（宋元至明清）"},
    {"id": "modern_supplement", "label": "近现代与补充参照"},
    {"id": "uncertain", "label": "待判断"},
]


def normalize_object_title(file_name: str) -> str:
    stem = Path(file_name).stem.strip()
    stem = stem.replace("鬹", "鬶").replace("鸡头", "鸡首")
    stem = re.sub(r"\s+", " ", stem)
    stem = re.sub(r"\s*[（(]\s*\d+\s*[）)]\s*$", "", stem)
    stem = re.sub(r"[-_ ]+\d+\s*$", "", stem)
    return stem.strip()
```

Then add `classify_phase`, `build_catalog`, and CLI code following the tested behavior.

- [ ] **Step 2: Run Python catalog tests**

Run:

```powershell
python -m unittest tests.test_catalog_builder -v
```

Expected: all tests pass.

### Task 3: Generate Real Catalog

**Files:**
- Generate: `data/catalog.json`
- Generate: `data/pending-merge.json`

- [ ] **Step 1: Run builder against `codex整理`**

Run:

```powershell
python scripts/catalog_builder.py --source "F:\我爱的\美术\研究生\毕业论文毕业设计\1形制图谱\codex整理" --catalog data/catalog.json --pending data/pending-merge.json
```

Expected: command exits 0 and reports object/image counts.

- [ ] **Step 2: Inspect a capped catalog summary**

Run:

```powershell
python -c "import json; c=json.load(open('data/catalog.json', encoding='utf-8')); print(len(c['objects']), len(c['images'])); print(c['objects'][:3])"
```

Expected: nonzero objects and images; first objects include stable `HL-` ids.

### Task 4: Static Browser Prototype

**Files:**
- Create: `prototype/index.html`
- Create: `prototype/styles.css`
- Create: `prototype/app.js`

- [ ] **Step 1: Write frontend files**

Create a dense workbench interface:

- left phase navigation
- center thumbnail grid
- right object detail panel
- search and filter controls
- previous/next navigation
- image URLs use `/image/<image_id>`

- [ ] **Step 2: Add simple frontend smoke test**

Run:

```powershell
python -m http.server 8899
```

Expected: static files serve. Stop this simple server before using `scripts/serve.py`.

### Task 5: Local Image Server

**Files:**
- Create: `scripts/serve.py`

- [ ] **Step 1: Implement local server**

Implement a server that:

- serves `/` as `prototype/index.html`
- serves `/prototype/*`, `/data/*`
- serves `/api/catalog`
- serves `/image/<image_id>` by resolving the image id from `data/catalog.json`
- refuses image ids missing from the catalog

- [ ] **Step 2: Start server and verify HTTP endpoints**

Run:

```powershell
python scripts/serve.py --host 127.0.0.1 --port 8877
```

In another shell, verify:

```powershell
Invoke-WebRequest http://127.0.0.1:8877/api/catalog -UseBasicParsing
```

Expected: status 200 and JSON response.

### Task 6: README and Final Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Document:

- what the prototype does
- how to rebuild catalog
- how to start local server
- how GitHub upload will work later
- that original images are never deleted or modified

- [ ] **Step 2: Run final verification**

Run:

```powershell
python -m unittest tests.test_catalog_builder -v
python scripts/catalog_builder.py --source "F:\我爱的\美术\研究生\毕业论文毕业设计\1形制图谱\codex整理" --catalog data/catalog.json --pending data/pending-merge.json
python scripts/serve.py --check --host 127.0.0.1 --port 8877
```

Expected: tests pass, catalog builds, server check exits 0.

### GitHub Upload Follow-Up

After local verification, GitHub upload needs one of these:

1. A working `gh` CLI login on this machine, or
2. A working GitHub connector session plus an existing repository name, or
3. A GitHub remote URL supplied by the user.

If none are available, initialize no remote push automatically. Explain the blocker and provide exact next steps.
