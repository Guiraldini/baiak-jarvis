"""Extract equipable item definitions from the public Baiak Idle game bundle.

The bundle is treated as data: this script never executes its JavaScript.
Run from the repository root with: python scripts/build_equipment_catalog.py
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen


GAME_URL = "https://baiakidle.com/jogar/"
ROOT = Path(__file__).resolve().parents[1]
ITEM_START = re.compile(r'(?P<name>"(?:\\.|[^"\\])*"|[A-Za-z_$][\w$]*):\{id:(?P<id>\d+)')
FIELDS = (
    "id", "slot", "wt", "twoHanded", "atk", "def", "arm", "level", "vocs",
    "skills", "absorb", "wandMin", "wandMax", "manaShot", "elementType",
    "elementAtk", "magicEl", "range", "ammoType", "critChance", "critDmg",
    "lifeLeech", "manaLeech", "moveSpeed", "durationSec", "hitChance",
    "charges",
)


def object_end(source: str, start: int) -> int:
    depth = 0
    quoted = False
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index + 1
    raise ValueError("Unclosed item definition")


def parse_literal(source: str) -> dict:
    quoted_keys = re.sub(r"(?<=[{,])([A-Za-z_$][\w$]*):", r'"\1":', source)
    quoted_keys = re.sub(r"(?<![\d.])\.(\d+)", r"0.\1", quoted_keys)
    return json.loads(quoted_keys.replace("!0", "true").replace("!1", "false"))


def extract_items(bundle: str) -> list[dict]:
    items: dict[str, dict] = {}
    for match in ITEM_START.finditer(bundle):
        start = bundle.find("{", match.start(), match.end())
        raw = bundle[start:object_end(bundle, start)]
        if "slot:" not in raw and "ammoType:" not in raw:
            continue
        try:
            item = parse_literal(raw)
        except (ValueError, json.JSONDecodeError):
            continue
        if not item.get("slot") and item.get("ammoType"):
            item["slot"] = "ammo"
        if item.get("slot") not in {"weapon", "shield", "helmet", "armor", "legs", "boots", "amulet", "ring", "ammo"}:
            continue
        name = json.loads(match.group("name")) if match.group("name").startswith('"') else match.group("name")
        lean = {"name": name, **{field: item[field] for field in FIELDS if field in item}}
        lean["imbSlots"] = item.get("imb", {}).get("slots", 0)
        items[name] = lean
    result = sorted(items.values(), key=lambda item: item["name"])
    if len(result) < 1500:
        raise ValueError(f"Expected full item catalog; found only {len(result)} entries")
    fork = next((item for item in result if item["name"] == "deepling fork"), None)
    book = next((item for item in result if item["name"] == "lion spellbook"), None)
    if not fork or fork.get("twoHanded") or book.get("slot") != "shield":
        raise ValueError("Druid weapon/off-hand validation failed")
    return result


def main() -> None:
    headers = {"User-Agent": "Mozilla/5.0"}
    with urlopen(Request(GAME_URL, headers=headers), timeout=30) as response:
        page = response.read().decode("utf-8")
    asset = re.search(r'/jogar/assets/index-[^"\s]+\.js', page)
    if not asset:
        raise ValueError("Game bundle URL not found")
    source_url = f"https://baiakidle.com{asset.group()}"
    with urlopen(Request(source_url, headers=headers), timeout=60) as response:
        bundle = response.read()
    catalog = {
        "sourceUrl": source_url,
        "bundleSha256": hashlib.sha256(bundle).hexdigest(),
        "capturedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"),
        "items": extract_items(bundle.decode("utf-8")),
    }
    output = "globalThis.BaiakJarvisEquipmentCatalog=" + json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ";\n"
    for browser in ("chrome", "firefox"):
        target = ROOT / browser / "src" / "equipment-catalog.js"
        target.write_text(output, encoding="utf-8")
    print(f"Saved {len(catalog['items'])} items from {source_url}")


if __name__ == "__main__":
    main()
