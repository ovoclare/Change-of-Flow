from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif"}

PHASES = [
    {"id": "yuan_origin", "label": "元：起源阶段（史前至夏商）"},
    {"id": "heng_diverse", "label": "亨：多元阶段（两周至秦汉）"},
    {"id": "li_mature", "label": "利：成熟阶段（魏晋至隋唐）"},
    {"id": "zhen_peak", "label": "贞：鼎盛阶段（宋元至明清）"},
    {"id": "modern_supplement", "label": "近现代与补充参照"},
    {"id": "uncertain", "label": "待判断"},
]

PHASE_BY_ID = {phase["id"]: phase for phase in PHASES}


def normalize_object_title(file_name: str) -> str:
    stem = Path(file_name).stem.strip()
    stem = stem.replace("鬹", "鬶").replace("鸡头", "鸡首")
    stem = re.sub(r"\s+", " ", stem)
    stem = re.sub(r"\s*[（(]\s*\d+\s*[）)]\s*$", "", stem)
    stem = re.sub(r"[-_ ]+\d+\s*$", "", stem)
    return stem.strip()


def classify_phase(relative_path: Path) -> dict[str, str]:
    text = relative_path.as_posix()
    if "01_潜龙勿用_新石器时代" in text:
        return PHASE_BY_ID["yuan_origin"]
    if "02_见龙在田_夏商至秦汉" in text:
        if "二里头" in text or re.search(r"(^|[-_/])夏[-_/]", text):
            return PHASE_BY_ID["yuan_origin"]
        return PHASE_BY_ID["heng_diverse"]
    if "03_或跃在渊_魏晋至隋唐五代" in text:
        return PHASE_BY_ID["li_mature"]
    if "04_飞龙在天_宋元至明清" in text:
        return PHASE_BY_ID["zhen_peak"]
    if "05_亢龙有悔_晚清至现代" in text:
        return PHASE_BY_ID["modern_supplement"]
    if "晚清" in text or "民国" in text or "现代" in text:
        return PHASE_BY_ID["modern_supplement"]
    return PHASE_BY_ID["uncertain"]


def build_catalog(source_root: str | Path, existing_catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    root = Path(source_root).resolve()
    existing_catalog = existing_catalog or {}
    existing_objects = existing_catalog.get("objects", [])
    existing_images = existing_catalog.get("images", [])
    existing_by_key = {obj.get("objectKey"): obj for obj in existing_objects if obj.get("objectKey")}
    existing_images_by_path = {img.get("path"): img for img in existing_images if img.get("path")}
    existing_images_by_sha1 = {img.get("sha1"): img for img in existing_images if img.get("sha1")}

    used_object_ids: set[str] = set()
    used_image_ids: set[str] = set()
    objects_by_id: dict[str, dict[str, Any]] = {}
    images: list[dict[str, Any]] = []
    groups: dict[str, list[Path]] = defaultdict(list)

    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            relative_path = path.relative_to(root)
            title = normalize_object_title(path.name)
            phase = classify_phase(relative_path)
            object_key = make_object_key(phase["id"], title)
            groups[object_key].append(path)

    for object_key in sorted(groups):
        paths = groups[object_key]
        sample = paths[0]
        relative_sample = sample.relative_to(root)
        title = normalize_object_title(sample.name)
        phase = classify_phase(relative_sample)
        existing_object = existing_by_key.get(object_key)
        object_id = existing_object.get("id") if existing_object else next_id("HL", used_object_ids, existing_objects)
        used_object_ids.add(object_id)
        image_ids: list[str] = []

        for path in sorted(paths, key=lambda item: item.as_posix()):
            relative_path = path.relative_to(root)
            sha1 = file_sha1(path)
            previous_image = existing_images_by_path.get(str(path)) or existing_images_by_sha1.get(sha1)
            image_id = previous_image.get("id") if previous_image else next_id("IMG", used_image_ids, existing_images)
            used_image_ids.add(image_id)
            width, height = image_dimensions(path)
            image_ids.append(image_id)
            images.append(
                {
                    "id": image_id,
                    "objectId": object_id,
                    "fileName": path.name,
                    "path": str(path),
                    "relativePath": relative_path.as_posix(),
                    "sha1": sha1,
                    "width": width,
                    "height": height,
                    "role": previous_image.get("role", infer_image_role(path.name)) if previous_image else infer_image_role(path.name),
                    "fileStatus": "normal",
                }
            )

        objects_by_id[object_id] = make_object_record(
            object_id=object_id,
            object_key=object_key,
            title=title,
            phase=phase,
            relative_path=relative_sample,
            image_ids=image_ids,
            existing_object=existing_object,
        )

    for existing_object in existing_objects:
        object_id = existing_object.get("id")
        if object_id and object_id not in objects_by_id:
            retained = dict(existing_object)
            retained["imageIds"] = []
            objects_by_id[object_id] = retained
            used_object_ids.add(object_id)

    for old_image in existing_images:
        image_id = old_image.get("id")
        if not image_id or image_id in used_image_ids:
            continue
        missing = dict(old_image)
        missing["fileStatus"] = "missing"
        images.append(missing)
        object_id = missing.get("objectId")
        if object_id in objects_by_id and image_id not in objects_by_id[object_id].setdefault("imageIds", []):
            objects_by_id[object_id]["imageIds"].append(image_id)

    objects = sorted(objects_by_id.values(), key=lambda item: item["id"])
    images = sorted(images, key=lambda item: item["id"])
    pending = make_pending_merges(objects, images)

    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceRoot": str(root),
        "phases": PHASES,
        "objects": objects,
        "images": images,
        "pendingMergeGroups": pending,
        "stats": {
            "objectCount": len(objects),
            "imageCount": len(images),
            "pendingMergeCount": len(pending),
            "missingImageCount": sum(1 for image in images if image.get("fileStatus") == "missing"),
        },
    }


def make_object_key(phase_id: str, title: str) -> str:
    compact = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "", title).lower()
    return f"{phase_id}:{compact}"


def next_id(prefix: str, used_ids: set[str], existing_records: list[dict[str, Any]]) -> str:
    max_seen = 0
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    for record in existing_records:
        record_id = record.get("id", "")
        match = pattern.match(record_id)
        if match:
            max_seen = max(max_seen, int(match.group(1)))
    candidate = max_seen + 1
    while True:
        value = f"{prefix}-{candidate:04d}"
        if value not in used_ids:
            return value
        candidate += 1


def make_object_record(
    object_id: str,
    object_key: str,
    title: str,
    phase: dict[str, str],
    relative_path: Path,
    image_ids: list[str],
    existing_object: dict[str, Any] | None,
) -> dict[str, Any]:
    existing_object = existing_object or {}
    fields = infer_object_fields(title, relative_path)
    return {
        "id": object_id,
        "objectKey": object_key,
        "title": existing_object.get("title", title),
        "phaseId": phase["id"],
        "phaseLabel": phase["label"],
        "era": existing_object.get("era") or fields["era"],
        "vesselType": existing_object.get("vesselType") or fields["vesselType"],
        "kilnOrCulture": existing_object.get("kilnOrCulture") or fields["kilnOrCulture"],
        "flowForm": existing_object.get("flowForm") or fields["flowForm"],
        "material": existing_object.get("material") or fields["material"],
        "sourceOrCollection": existing_object.get("sourceOrCollection") or fields["sourceOrCollection"],
        "dataNature": existing_object.get("dataNature") or fields["dataNature"],
        "isCeramicSpoutCore": existing_object.get("isCeramicSpoutCore", fields["isCeramicSpoutCore"]),
        "spoutRelation": existing_object.get("spoutRelation") or fields["spoutRelation"],
        "reviewStatus": existing_object.get("reviewStatus", "待审阅"),
        "notes": existing_object.get("notes", ""),
        "imageIds": image_ids,
    }


def infer_object_fields(title: str, relative_path: Path) -> dict[str, Any]:
    text = f"{relative_path.as_posix()} {title}"
    vessel_type = first_keyword(text, ["鸡首壶", "鸡头壶", "执壶", "提梁壶", "军持", "僧帽壶", "多穆壶", "注子", "茶壶", "盉", "鬶", "爵", "壶", "杯"]) or "待判断"
    era = first_keyword(
        text,
        [
            "河姆渡文化",
            "良渚文化",
            "大汶口文化",
            "龙山文化",
            "齐家文化",
            "二里头文化",
            "魏晋南北朝",
            "明晚期",
            "明宣德",
            "明永乐",
            "明洪武",
            "明嘉靖",
            "明万历",
            "明隆庆",
            "清乾隆",
            "清康熙",
            "东晋",
            "南朝",
            "唐",
            "五代",
            "北宋",
            "南宋",
            "宋元",
            "宋",
            "元至明",
            "元",
            "明初",
            "明",
            "晚清",
            "民国",
            "现代",
            "战国",
            "西周",
            "商周",
            "商",
            "夏",
            "清",
        ],
    ) or "待判断"
    kiln = infer_kiln_or_culture(text)
    material = first_keyword(text, ["青铜", "紫砂", "白瓷", "青白瓷", "影青", "青瓷", "原始瓷", "陶质", "陶", "瓷"]) or "待判断"
    flow_form = infer_flow_form(text)
    source = infer_source_or_collection(title)
    predecessor = is_predecessor_reference(text, vessel_type, material)
    return {
        "era": era,
        "vesselType": vessel_type,
        "kilnOrCulture": kiln,
        "flowForm": flow_form,
        "material": material,
        "sourceOrCollection": source,
        "dataNature": "前身/源流参照" if predecessor else "陶瓷壶流本体",
        "isCeramicSpoutCore": not predecessor,
        "spoutRelation": "流部起源、功能参照或形态参照" if predecessor else "壶流形制主体资料",
    }


def first_keyword(text: str, keywords: list[str]) -> str | None:
    return next((keyword for keyword in keywords if keyword in text), None)


def infer_kiln_or_culture(text: str) -> str:
    culture = first_keyword(text, ["河姆渡文化", "良渚文化", "大汶口文化", "龙山文化", "齐家文化", "二里头文化", "三星堆文化", "金沙遗址"])
    if culture:
        return culture
    match = re.search(r"([\u4e00-\u9fffA-Za-z]+窑)", text)
    return match.group(1) if match else "待判断"


def infer_flow_form(text: str) -> str:
    if any(word in text for word in ["鸡首", "鸡头", "龙首", "羊头", "兽", "鸟形", "猪形", "狗形"]):
        return "动物或异形流"
    if "军持" in text:
        return "军持流"
    if "鸭嘴" in text:
        return "鸭嘴流"
    if any(word in text for word in ["曲", "弯"]):
        return "曲流"
    if any(word in text for word in ["长流", "长直流"]):
        return "长直流"
    if any(word in text for word in ["短直流", "直流", "筒状流"]):
        return "直流"
    if any(word in text for word in ["提梁", "僧帽", "多穆"]):
        return "特殊器型流"
    if "残件" in text:
        return "残件参照"
    return "待判断"


def infer_source_or_collection(title: str) -> str:
    parts = [part.strip() for part in re.split(r"[-_]", Path(title).stem) if part.strip()]
    for part in reversed(parts):
        if any(word in part for word in ["博物馆", "故宫", "大都会", "馆藏", "遗址"]):
            return part
    return "待补来源"


def is_predecessor_reference(text: str, vessel_type: str, material: str) -> bool:
    if material == "青铜" or vessel_type == "爵":
        return True
    if vessel_type in {"盉", "鬶"} and not any(word in text for word in ["执壶", "注子", "军持", "茶壶", "紫砂"]):
        return True
    return False


def infer_image_role(file_name: str) -> str:
    text = file_name
    if "局部" in text or "细节" in text or "流柄结构" in text:
        return "局部"
    if "修复前" in text:
        return "修复前"
    if "修复中" in text:
        return "修复中"
    if "修复后" in text:
        return "修复后"
    if "底款" in text:
        return "款识"
    return "整体或待判断"


def make_pending_merges(objects: list[dict[str, Any]], images: list[dict[str, Any]]) -> list[dict[str, Any]]:
    images_by_id = {image["id"]: image for image in images}
    pending = []
    for obj in objects:
        normal_images = [images_by_id[image_id] for image_id in obj["imageIds"] if images_by_id.get(image_id, {}).get("fileStatus") == "normal"]
        if len(normal_images) > 1:
            pending.append(
                {
                    "objectId": obj["id"],
                    "title": obj["title"],
                    "reason": "文件名序号或标题归并候选",
                    "status": "pending_review",
                    "imageIds": [image["id"] for image in normal_images],
                    "fileNames": [image["fileName"] for image in normal_images],
                }
            )
    return pending


def file_sha1(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_dimensions(path: Path) -> tuple[int | None, int | None]:
    try:
        with path.open("rb") as handle:
            header = handle.read(32)
            if header.startswith(b"\x89PNG\r\n\x1a\n") and header[12:16] == b"IHDR":
                return struct.unpack(">II", header[16:24])
            if header.startswith(b"\xff\xd8"):
                return jpeg_dimensions(path)
    except OSError:
        return None, None
    return None, None


def jpeg_dimensions(path: Path) -> tuple[int | None, int | None]:
    with path.open("rb") as handle:
        handle.read(2)
        while True:
            marker_start = handle.read(1)
            if not marker_start:
                return None, None
            if marker_start != b"\xff":
                continue
            marker = handle.read(1)
            while marker == b"\xff":
                marker = handle.read(1)
            if marker in {b"\xc0", b"\xc1", b"\xc2", b"\xc3", b"\xc5", b"\xc6", b"\xc7", b"\xc9", b"\xca", b"\xcb", b"\xcd", b"\xce", b"\xcf"}:
                handle.read(3)
                height, width = struct.unpack(">HH", handle.read(4))
                return width, height
            size_bytes = handle.read(2)
            if len(size_bytes) != 2:
                return None, None
            size = struct.unpack(">H", size_bytes)[0]
            handle.seek(size - 2, 1)


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the local Hulium thesis image catalog.")
    parser.add_argument("--source", required=True, help="Source folder to scan.")
    parser.add_argument("--catalog", default="data/catalog.json", help="Catalog JSON output path.")
    parser.add_argument("--pending", default="data/pending-merge.json", help="Pending merge JSON output path.")
    args = parser.parse_args()

    source = Path(args.source)
    if not source.exists():
        raise SystemExit(f"Source folder does not exist: {source}")

    catalog_path = Path(args.catalog)
    existing = load_json(catalog_path)
    catalog = build_catalog(source, existing_catalog=existing)
    write_json(catalog_path, catalog)
    write_json(Path(args.pending), catalog["pendingMergeGroups"])
    print(
        f"catalog built: objects={catalog['stats']['objectCount']} "
        f"images={catalog['stats']['imageCount']} pending={catalog['stats']['pendingMergeCount']} "
        f"missing={catalog['stats']['missingImageCount']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
