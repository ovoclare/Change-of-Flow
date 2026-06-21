from __future__ import annotations

import argparse
import json
import mimetypes
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = PROJECT_ROOT / "data" / "catalog.json"


class HuliumRequestHandler(BaseHTTPRequestHandler):
    server_version = "HuliumGallery/0.1"

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
        if request_path.startswith("/prototype/"):
            self.serve_file(safe_child(PROJECT_ROOT, request_path.lstrip("/")))
            return
        if request_path.startswith("/data/"):
            self.serve_file(safe_child(PROJECT_ROOT, request_path.lstrip("/")))
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def serve_image(self, image_id: str) -> None:
        catalog = load_catalog()
        image = next((item for item in catalog.get("images", []) if item.get("id") == image_id), None)
        if not image:
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown image id")
            return
        if image.get("fileStatus") != "normal":
            self.send_error(HTTPStatus.NOT_FOUND, "Image is not available")
            return
        source_root = Path(catalog["sourceRoot"]).resolve()
        image_path = Path(image["path"]).resolve()
        if not is_relative_to(image_path, source_root):
            self.send_error(HTTPStatus.FORBIDDEN, "Image outside source root")
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
    first_path = Path(normal_images[0]["path"])
    if not first_path.exists():
        print(f"first image missing: {first_path}")
        return 1
    print(
        "server check ok: "
        f"objects={len(catalog['objects'])} images={len(catalog['images'])} "
        f"firstImage={normal_images[0]['id']}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the local Hulium thesis gallery prototype.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8877)
    parser.add_argument("--check", action="store_true", help="Check catalog and exit without starting the server.")
    args = parser.parse_args()

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
