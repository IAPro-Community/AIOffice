"""Cria variantes V2 dos quadros e pôsteres a partir da pixel art já usada no mapa.

As variantes preservam a posição, a transparência, a proporção e a composição de cada pixel.
Só os valores RGB mudam, para manter o encaixe exato no renderizador de paredes.
"""

from __future__ import annotations

import colorsys
import json
import argparse
from collections import deque
from pathlib import Path

from PIL import Image

from postprocess import framed

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent.parent
PUBLIC = PROJECT_ROOT / "client" / "public" / "assets"


def _v2_color(r: int, g: int, b: int) -> tuple[int, int, int]:
    hue, saturation, value = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    degrees = hue * 360

    # Neutros e contornos ganham um viés azul-ardósia, sem perder sua claridade.
    if saturation < 0.14:
        nr, ng, nb = colorsys.hsv_to_rgb(210 / 360, min(0.2, saturation + 0.06), value)
    else:
        # Mantém a leitura de cada cor, aproximando verdes/azuis da identidade jade e âmbar.
        if degrees < 22 or degrees >= 340:
            shifted = (degrees + 14) % 360  # coral e terracota
        elif degrees < 68:
            shifted = (degrees - 22) % 360  # âmbar
        elif degrees < 165:
            shifted = (degrees + 26) % 360  # verde-jade
        elif degrees < 200:
            shifted = (degrees - 12) % 360  # verde-água
        elif degrees < 260:
            shifted = (degrees - 28) % 360  # azul-petróleo
        else:
            shifted = (degrees + 16) % 360
        nr, ng, nb = colorsys.hsv_to_rgb(shifted / 360, min(1, saturation * 1.15), value)

    return round(nr * 255), round(ng * 255), round(nb * 255)


POSTER_BACKGROUNDS = {
    "coffee": ("#3e6f70", 20),
    "rocket": ("#23434f", 16),
    "code": ("#264a54", 22),
    "cat": ("#6f9990", 14),
    "bug": ("#dce8dc", 14),
    "ship_it": ("#478391", 22),
}


def poster_background_mask(image: Image.Image, tolerance: int) -> set[tuple[int, int]]:
    """Select the connected poster backdrop inside its existing one-pixel outline."""
    pixels = image.load()
    seed = pixels[1, 1][:3]
    queue = deque([(1, 1)])
    selected = {(1, 1)}
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx <= 0 or ny <= 0 or nx >= image.width - 1 or ny >= image.height - 1 or (nx, ny) in selected:
                continue
            r, g, b, _ = pixels[nx, ny]
            if max(abs(r - seed[0]), abs(g - seed[1]), abs(b - seed[2])) <= tolerance:
                selected.add((nx, ny))
                queue.append((nx, ny))
    return selected


def recolor(source: Image.Image, poster_variant: str | None = None) -> Image.Image:
    image = source.convert("RGBA")
    pixels = image.load()
    backdrop: set[tuple[int, int]] = set()
    backdrop_color: tuple[int, int, int] | None = None
    if poster_variant in POSTER_BACKGROUNDS:
        hex_color, tolerance = POSTER_BACKGROUNDS[poster_variant]
        backdrop_color = tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
        backdrop = poster_background_mask(image, tolerance)
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, alpha = pixels[x, y]
            if alpha:
                color = backdrop_color if (x, y) in backdrop and backdrop_color else _v2_color(r, g, b)
                pixels[x, y] = (*color, alpha)
    return image


def build_map_v2_variants(out_root: Path, specs: dict) -> list[dict]:
    """Build themed art copies and return manifest entries for postprocess.py."""
    art_root = out_root / "art"
    entries: list[dict] = []

    for asset in specs["assets"]:
        kind = asset.get("kind")
        if kind not in ("painting", "poster"):
            continue

        original = art_root / Path(asset["out"]).name
        if not original.exists():
            continue

        post = asset["post"]
        poster_variant = asset.get("variant") if kind == "poster" else None
        filename = f"{asset['id']}.png"
        out = f"art/map-v2/{filename}"
        destination = out_root / out
        destination.parent.mkdir(parents=True, exist_ok=True)
        variant = recolor(Image.open(original), poster_variant)
        variant.save(destination, optimize=True)

        width, height = post["w"], post["h"]
        tiles = 1 if kind == "poster" else -(-(width + 6) // 16)
        entry = {
            "id": f"map-v2-{asset['id']}",
            "kind": kind,
            "file": out,
            "w": width,
            "h": height,
            "tiles": tiles,
            "title": asset["title"],
            "mapTheme": "v2",
        }

        if kind == "poster":
            entry["variant"] = asset["variant"]
        else:
            framed_out = f"art/map-v2/framed/{filename}"
            framed_path = out_root / framed_out
            framed_path.parent.mkdir(parents=True, exist_ok=True)
            framed(variant, post.get("frame", "wood")).save(framed_path, optimize=True)
            entry["framed"] = {"file": framed_out, "w": width + 6, "h": height + 6}

        entries.append(entry)

    return entries


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(PUBLIC), help="pasta client/public/assets")
    args = parser.parse_args()
    out_root = Path(args.out)
    specs = json.loads((HERE / "specs.json").read_text(encoding="utf-8"))
    entries = build_map_v2_variants(out_root, specs)

    manifest_path = out_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    base = [asset for asset in manifest.get("wallArt", []) if asset.get("mapTheme") != "v2"]
    manifest["wallArt"] = base + entries
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(entries)} variantes V2 derivadas da arte existente; manifest atualizado em {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
