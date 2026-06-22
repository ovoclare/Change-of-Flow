from __future__ import annotations

import argparse
import json
import mimetypes
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

try:  # Works both in tests (package import) and when run as python scripts/serve.py.
    from scripts.catalog_builder import IMAGE_EXTENSIONS, build_catalog, load_json, write_json
except ImportError:  # pragma: no cover - exercised by direct script execution.
    from catalog_builder import IMAGE_EXTENSIONS, build_catalog, load_json, write_json


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = PROJECT_ROOT / "data" / "catalog.json"
PENDING_PATH = PROJECT_ROOT / "data" / "pending-merge.json"
ALLOWED_REVIEW_STATUSES = {"待审阅", "已审阅", "待确认", "需补来源", "已入论文"}
SOURCE_ENV_NAME = "HULIUM_SOURCE_ROOT"


class HuliumRequestHandler(BaseHTTPRequestHandler):
    server_version = "HuliumGallery/0.2"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        request_path = unquote(parsed.path)
        if request_path == "/":
            self.serve_file(PROJECT_ROOT / "prototype" / "index.html")
            return
        if request_path == "/api/catalog":
            self.serve_file(CATALOG_PATH, content_type="application/json; charset=utf-8")
            return
        if request_path.startswith("/image/"):
            self.serve_image(request_path.removeprefix("/image/"))
            return
        if request_path.startswith("/prototype/") or request_path.startswith("/data/"):
            try:
                self.serve_file(safe_child(PROJECT_ROOT, request_path.lstrip("/")))
            except ValueError:
                self.send_error(HTTPStatus.FORBIDDEN, "Path outside project root")
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        request_path = unquote(parsed.path)
        if request_path.startswith("/api/object/"):
            self.update_object(request_path.removeprefix("/api/object/"))
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def update_object(self, object_id: str) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid content length")
            return
        if length <= 0 or length > 65536:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid request body")
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            catalog = load_catalog()
            updated = update_object_metadata(catalog, object_id, payload)
        except ValueError as error:
            self.send_json({"ok": False, "error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return
        except json.JSONDecodeError:
            self.send_json({"ok": False, "error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            return
        if not updated:
            self.send_json({"ok": False, "error": "Object not found"}, status=HTTPStatus.NOT_FOUND)
            return
        save_catalog(catalog)
        obj = next(item for item in catalog["objects"] if item["id"] == object_id)
        self.send_json({"ok": True, "object": obj})

    def serve_image(self, image_id: str) -> None:
        catalog = load_catalog()
        image = next((item for item in catalog.get("images", []) if item.get("id") == image_id), None)
        if not image:
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown image id")
            return
        if image.get("fileStatus") != "normal":
            self.send_error(HTTPStatus.NOT_FOUND, "Image is not available")
            return
        image_path = resolve_image_path(image, catalog)
        if not image_path:
            self.send_error(HTTPStatus.NOT_FOUND, "Image file not found; restart the server to rebuild the catalog")
            return
        self.serve_file(image_path)

    def serve_file(self, path: Path, content_type: str | None = None) -> None:
        if not path or not path.exists() or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        content_type = content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        try:
            data = path.read_bytes()
        except OSError:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "Could not read file")
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, data: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


def safe_child(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    root = root.resolve()
    if not is_relative_to(candidate, root):
        raise ValueError(f"Path outside project root: {candidate}")
    return candidate


def is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def load_catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def save_catalog(catalog: dict) -> None:
    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")


def update_object_metadata(catalog: dict, object_id: str, payload: dict) -> bool:
    review_status = payload.get("reviewStatus")
    notes = payload.get("notes")
    if review_status is not None and review_status not in ALLOWED_REVIEW_STATUSES:
        raise ValueError("Unknown review status")
    for obj in catalog.get("objects", []):
        if obj.get("id") != object_id:
            continue
        if review_status is not None:
            obj["reviewStatus"] = review_status
        if notes is not None:
            obj["notes"] = str(notes)
        return True
    return False


def ensure_catalog_current(explicit_source: str | Path | None = None, *, force: bool = False) -> bool:
    source_root = find_source_root(explicit_source)
    if not source_root:
        if force or not CATALOG_PATH.exists():
            print(
                "未找到 codex整理 图库目录。请把 codex整理 放在“壶流图库程序”的同级目录，"
                f"或启动时加 --source，或设置环境变量 {SOURCE_ENV_NAME}。"
            )
        return False

    existing = load_json(CATALOG_PATH) or {}
    catalog = build_catalog(source_root, existing_catalog=existing)
    write_json(CATALOG_PATH, catalog)
    write_json(PENDING_PATH, catalog["pendingMergeGroups"])
    print(
        "catalog rebuilt: "
        f"source={source_root} objects={catalog['stats']['objectCount']} "
        f"images={catalog['stats']['imageCount']} pending={catalog['stats']['pendingMergeCount']} "
        f"missing={catalog['stats']['missingImageCount']}"
    )
    return True


def find_source_root(explicit_source: str | Path | None = None) -> Path | None:
    """Find the image library even when the program folder is nested after unzipping.

    Normal layout::
        1形制图谱/壶流图库程序
        1形制图谱/codex整理

    Common unzip mistake::
        1形制图谱/壶流图库程序/壶流图库程序
        1形制图谱/codex整理

    The search therefore checks the program folder, its parent, and a few
    ancestors for a sibling/child named codex整理 before falling back to any
    sourceRoot stored in catalog.json.
    """
    seen: set[Path] = set()
    candidates: list[Path] = []

    def add(candidate: str | Path | None, *, relative_to_project: bool = True) -> None:
        if not candidate:
            return
        path = Path(candidate).expanduser()
        if not path.is_absolute():
            base = PROJECT_ROOT if relative_to_project else Path.cwd()
            path = (base / path).resolve()
        else:
            path = path.resolve()
        if path not in seen:
            seen.add(path)
            candidates.append(path)

    add(explicit_source)
    add(os.environ.get(SOURCE_ENV_NAME))

    project = PROJECT_ROOT.resolve()
    # Check the project folder itself, then parent/grandparent/great-grandparent.
    # This covers both the intended sibling layout and the accidental nested layout.
    anchors = [project, *list(project.parents)[:4]]
    for anchor in anchors:
        add(anchor / "codex整理")

    catalog = load_json(CATALOG_PATH) or {}
    add(catalog.get("sourceRoot"))

    # Finally, search shallowly around nearby folders without walking the whole drive.
    for base in anchors[:3]:
        for candidate in iter_named_dirs(base, "codex整理", max_depth=2):
            add(candidate)

    for candidate in candidates:
        if candidate.exists() and candidate.is_dir() and has_images(candidate):
            return candidate
    return None


def iter_named_dirs(base: Path, name: str, max_depth: int) -> list[Path]:
    if not base.exists() or not base.is_dir():
        return []
    found: list[Path] = []
    stack: list[tuple[Path, int]] = [(base.resolve(), 0)]
    visited: set[Path] = set()
    while stack:
        current, depth = stack.pop()
        if current in visited or depth > max_depth:
            continue
        visited.add(current)
        try:
            children = list(current.iterdir())
        except OSError:
            continue
        for child in children:
            if not child.is_dir():
                continue
            if child.name == name:
                found.append(child.resolve())
            if depth < max_depth and not child.name.startswith(".") and child.name not in {"__pycache__", "node_modules"}:
                stack.append((child.resolve(), depth + 1))
    return found


def has_images(root: Path) -> bool:
    try:
        return any(path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS for path in root.rglob("*"))
    except OSError:
        return False


def resolve_source_root(catalog: dict) -> Path | None:
    raw = catalog.get("sourceRoot")
    if raw:
        root = Path(raw)
        if not root.is_absolute():
            root = PROJECT_ROOT / root
        root = root.resolve()
        if root.exists() and root.is_dir():
            return root
    return find_source_root()


def resolve_image_path(image: dict, catalog: dict) -> Path | None:
    source_root = resolve_source_root(catalog)
    candidates: list[Path] = []

    raw_path = image.get("path")
    if raw_path:
        image_path = Path(raw_path)
        if not image_path.is_absolute():
            if source_root:
                candidates.append(source_root / image_path)
            candidates.append(PROJECT_ROOT / image_path)
        else:
            candidates.append(image_path)

    relative_path = image.get("relativePath")
    if source_root and relative_path:
        candidates.append(source_root / relative_path)

    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if not resolved.exists() or not resolved.is_file():
            continue
        if source_root and not is_relative_to(resolved, source_root.resolve()):
            continue
        return resolved

    file_name = image.get("fileName")
    if source_root and file_name:
        for candidate in source_root.rglob(file_name):
            if candidate.is_file():
                return candidate.resolve()
    return None


def check_catalog() -> int:
    if not CATALOG_PATH.exists():
        print(f"catalog missing: {CATALOG_PATH}")
        return 1
    catalog = load_catalog()
    normal_images = [image for image in catalog.get("images", []) if image.get("fileStatus") == "normal"]
    if not catalog.get("objects"):
        print("catalog has no objects")
        return 1
    if not normal_images:
        print("catalog has no normal images")
        return 1
    first_path = resolve_image_path(normal_images[0], catalog)
    if not first_path:
        print(f"first image missing: {normal_images[0].get('fileName')}")
        return 1
    print(
        "server check ok: "
        f"objects={len(catalog['objects'])} images={len(catalog['images'])} "
        f"firstImage={normal_images[0]['id']} path={first_path}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the local Hulium thesis gallery prototype.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8877)
    parser.add_argument("--source", help="图库根目录；不填时自动寻找同级 codex整理。")
    parser.add_argument("--no-auto-rebuild", action="store_true", help="启动时不自动重建 catalog.json。")
    parser.add_argument("--check", action="store_true", help="Check catalog and exit without starting the server.")
    args = parser.parse_args()

    if not args.no_auto_rebuild:
        ensure_catalog_current(args.source, force=args.check)

    if args.check:
        return check_catalog()

    if check_catalog() != 0:
        return 1
    server = ThreadingHTTPServer((args.host, args.port), HuliumRequestHandler)
    print(f"Serving Hulium gallery at http://{args.host}:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping server")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
