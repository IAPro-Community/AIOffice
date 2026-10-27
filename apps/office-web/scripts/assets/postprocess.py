"""Pós-processamento das ilustrações AIOffice e geração das variantes oficiais da marca.

Uso (a partir da raiz do projeto; requer Pillow e numpy):
    python3 -E scripts/assets/postprocess.py                  # gera tudo + manifest + folha de contato
    python3 -E scripts/assets/postprocess.py --only a,b       # reprocessa só alguns assets de specs.json
    python3 -E scripts/assets/postprocess.py --take gpt54 --only logo-mark --out /tmp/teste
                                                              # testa uma tomada alternativa em outra pasta

Entradas: scripts/assets/specs.json e scripts/assets/.cache/raw/<id>[@tomada].png
Saídas:   client/public/assets/** (+ manifest.json) e scripts/assets/.cache/contact-sheet.png.

Tipos de processamento (campo post.kind em specs.json):
- native: objeto sobre magenta desenhado pela IA numa grade de "pixels grandes": chroma key,
          desampliação para a grade nativa detectada, recorte e quantização.
- sprite: objeto sobre magenta reduzido para w x h por moda, alfa binário e contorno de 1px.
- art / poster / scene: imagem cheia cortada na proporção e reduzida por moda até w x h,
          quantizada sem dithering (pôster ganha contorno; cena pode ser ampliada com NEAREST).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import pixelart as art
import pixelops as px

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CACHE = HERE / ".cache"
RAW = CACHE / "raw"
SPECS = HERE / "specs.json"
PUBLIC = ROOT / "client" / "public" / "assets"
BRAND_SOURCE = PUBLIC / "brand" / "aioffice-pixel-art.png"

OUTLINE = "#1c2541"
NIGHT = "#171c35"  # fundo do og-image sem ilustração (com ela, vale a cor do canto da ilustração)


# ---------------------------------------------------------------------------
# processamento por tipo de asset


def process_native(src: Image.Image, post: dict) -> Image.Image:
    rgb = np.array(src.convert("RGB"))
    fg = ~px.magenta_mask(rgb)
    native, mask, _ = px.unscale(rgb, fg)
    mask = px.remove_specks(mask, post.get("minSpeck", 6))
    x0, y0, x1, y1 = px.bbox(mask)
    native, mask = native[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    native = px.quantize(native, mask, post.get("colors", 24), post.get("balance", 0.0))
    if post.get("merge"):
        native = px.merge_similar(native, mask, post["merge"])
    return Image.fromarray(px.to_rgba(native, mask), "RGBA")


def process_sprite(src: Image.Image, post: dict) -> Image.Image:
    rgb = np.array(src.convert("RGB"))
    fg = ~px.magenta_mask(rgb)
    fg = px.remove_specks(fg, min_area=max(64, fg.size // 20000))
    x0, y0, x1, y1 = px.bbox(fg)
    rgb, fg = rgb[y0:y1, x0:x1], fg[y0:y1, x0:x1]
    pad = 1 if post.get("outline") else 0
    scale = min((post["w"] - 2 * pad) / rgb.shape[1], (post["h"] - 2 * pad) / rgb.shape[0])
    tw, th = max(1, round(rgb.shape[1] * scale)), max(1, round(rgb.shape[0] * scale))
    palette = px.build_palette(rgb, fg, post.get("colors", 24) + 8)
    small, alpha = px.downscale_mode(rgb, fg, tw, th, palette, post.get("darkBias", 0.0))
    small = px.quantize(small, alpha, post.get("colors", 24))
    canvas = np.zeros((post["h"], post["w"], 4), dtype=np.uint8)
    ox, oy = (post["w"] - tw) // 2, (post["h"] - th) // 2
    canvas[oy:oy + th, ox:ox + tw] = px.to_rgba(small, alpha)
    if pad:
        canvas = px.add_outline(canvas, post["outline"])
    return Image.fromarray(canvas, "RGBA")


def process_flat(src: Image.Image, post: dict) -> Image.Image:
    pad = 1 if post.get("outline") else 0
    w, h = post["w"] - 2 * pad, post["h"] - 2 * pad
    rgb = np.array(px.crop_to_aspect(src.convert("RGB"), w, h))
    full = np.ones(rgb.shape[:2], dtype=bool)
    colors = post.get("colors", 16)
    balance = post.get("balance", 0.0)
    # paleta intermediária mais rica que a final: a redução por moda escolhe entre estas cores
    palette = px.build_palette(rgb, None, max(colors + 8, round(colors * 1.75)), balance)
    small, _ = px.downscale_mode(rgb, full, w, h, palette, post.get("darkBias", 0.0))
    small = px.enhance(small, post.get("saturation", 1.0), post.get("contrast", 1.0))
    small = px.quantize(small, np.ones((h, w), dtype=bool), colors, balance)
    if post.get("despeckle"):
        small = px.despeckle(small)
    out = np.full((post["h"], post["w"], 4), 255, dtype=np.uint8)
    out[pad:pad + h, pad:pad + w, :3] = small
    if pad:
        color = px.hex_rgb(post["outline"])
        out[0, :, :3] = out[-1, :, :3] = color
        out[:, 0, :3] = out[:, -1, :3] = color
    return Image.fromarray(out, "RGBA")


PROCESSORS = {"native": process_native, "sprite": process_sprite, "art": process_flat,
              "poster": process_flat, "scene": process_flat}


def process(asset: dict, src: Image.Image) -> Image.Image:
    kind = asset["post"]["kind"]
    if kind not in PROCESSORS:
        raise ValueError(f"tipo de pós-processamento desconhecido: {kind}")
    return PROCESSORS[kind](src, asset["post"])


# ---------------------------------------------------------------------------
# molduras das pinturas (3px: contorno + 2px de moldura com luz em cima/esquerda)

FRAMES: dict[str, tuple[str, str, str]] = {
    # estilo: (luz, corpo, sombra)
    "wood": ("#e3a868", "#c07d45", "#8a5530"),
    "black": ("#5a6276", "#3a4152", "#262b38"),
    "white": ("#ffffff", "#e9e6df", "#bdb8ae"),
    "gold": ("#f6d683", "#d9a441", "#9a6c24"),
}


def framed(img: Image.Image, style: str) -> Image.Image:
    light, body, shade = (px.hex_rgb(c) + (255,) for c in FRAMES[style])
    w, h = img.width + 6, img.height + 6
    out = Image.new("RGBA", (w, h), px.hex_rgb(OUTLINE) + (255,))
    p = out.load()
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            ring = min(x - 1, y - 1, w - 2 - x, h - 2 - y)  # 0 = anel externo da moldura, 1 = interno
            if ring >= 2:
                continue
            top_left = (y - 1 == ring and x - 1 >= ring) or (x - 1 == ring and y - 1 >= ring)
            if ring == 0:
                p[x, y] = light if top_left else body
            else:
                p[x, y] = body if top_left else shade
    out.paste(img, (3, 3))
    return out


# ---------------------------------------------------------------------------
# marca: mark desenhado, favicons, ícones com céu de entardecer


DUSK = ["#1f2445", "#262a55", "#30316a", "#433a7a", "#5d4585", "#7d4f8a", "#a45a88", "#cf6c7d", "#ee8c6c", "#f8b26a"]


def dusk_scene(w: int, h: int, horizon: int, seed: int = 3) -> Image.Image:
    """Céu de entardecer em faixas (sem gradiente), estrelas no alto e calçada abaixo do horizonte."""
    img = Image.new("RGBA", (w, h))
    draw = ImageDraw.Draw(img)
    # faixas mais finas perto do horizonte
    weights = np.linspace(1.6, 0.6, len(DUSK))
    bounds = np.concatenate([[0], np.cumsum(weights / weights.sum() * horizon)]).round().astype(int)
    for i, color in enumerate(DUSK):
        draw.rectangle((0, bounds[i], w - 1, bounds[i + 1] - 1), fill=color)
    rng = np.random.default_rng(seed)
    for _ in range(max(3, w * horizon // 260)):
        x, y = int(rng.integers(1, w - 1)), int(rng.integers(1, max(2, bounds[3])))
        draw.point((x, y), fill="#fef3d6")
    draw.rectangle((0, horizon, w - 1, h - 1), fill="#2b3245")
    draw.line((0, horizon, w - 1, horizon), fill="#4a5470")
    return img


def build_brand(out_root: Path) -> dict:
    brand = out_root / "brand"
    brand.mkdir(parents=True, exist_ok=True)
    source = Image.open(BRAND_SOURCE).convert("RGBA")
    source.save(brand / "aioffice-pixel-art.png", optimize=True)

    def scaled(size: int) -> Image.Image:
        return source.resize((size, size), Image.Resampling.LANCZOS)

    # Preserve the complete, current AIOffice artwork across the app and installer icons.
    mark32, mark16 = scaled(32), scaled(16)
    mark128 = scaled(128)
    sign_crop = source.crop((round(source.width * 0.0383), round(source.height * 0.7241), round(source.width * 0.9809), round(source.height * 0.9761)))
    sign_large = sign_crop.resize((256, 64), Image.Resampling.LANCZOS)
    sign = sign_large.resize((64, 16), Image.Resampling.LANCZOS)
    mark32.save(brand / "logo-mark.png")
    mark128.save(brand / "logo-mark@4x.png")
    mark16.save(brand / "favicon-16.png")
    mark32.save(brand / "favicon-32.png")
    sign.save(brand / "signage.png")
    sign_large.save(brand / "signage@4x.png")
    scaled(256).save(brand / "logo-detailed.png", optimize=True)
    scaled(180).save(brand / "apple-touch-icon.png", optimize=True)
    scaled(192).save(brand / "icon-192.png", optimize=True)
    icon512 = scaled(512)
    icon512.save(brand / "icon-512.png", optimize=True)
    icon512.save(brand / "icon.ico", format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    section: dict = {
        "source": "brand/aioffice-pixel-art.png",
        "mark": {"file": "brand/logo-mark.png", "w": 32, "h": 32},
        "markLarge": {"file": "brand/logo-mark@4x.png", "w": 128, "h": 128},
        "signage": {"file": "brand/signage.png", "w": sign.width, "h": sign.height},
        "signageLarge": {"file": "brand/signage@4x.png", "w": sign.width * 4, "h": sign.height * 4},
        "favicon16": "brand/favicon-16.png",
        "favicon32": "brand/favicon-32.png",
        "appleTouch": "brand/apple-touch-icon.png",
        "icon192": "brand/icon-192.png",
        "icon512": "brand/icon-512.png",
        "iconIco": "brand/icon.ico",
        "markDetailed": {"file": "brand/logo-detailed.png", "w": 256, "h": 256},
    }
    return section


# ---------------------------------------------------------------------------
# og-image (1200x630 = 600x315 nativo x2)


def build_og(out_root: Path) -> str:
    """Prévia para compartilhamento com a arte oficial completa do AIOffice."""
    w, h = 1200, 630
    og = Image.new("RGBA", (w, h), "#12151d")
    logo = Image.open(BRAND_SOURCE).convert("RGBA")
    logo.thumbnail((h, h), Image.Resampling.LANCZOS)
    og.alpha_composite(logo, ((w - logo.width) // 2, (h - logo.height) // 2))
    og.convert("RGB").save(out_root / "og-image.png", optimize=True)
    return "og-image.png"


# ---------------------------------------------------------------------------
# folha de contato (QA)


def contact_sheet(out_root: Path, manifest: dict) -> Image.Image:
    zoom = 4
    wall = px.hex_rgb("#e9e4da") + (255,)
    rows: list[Image.Image] = []

    def row(items: list[Image.Image], gap: int = 24) -> Image.Image:
        width = sum(i.width for i in items) + gap * (len(items) + 1)
        height = max(i.height for i in items) + gap * 2
        r = Image.new("RGBA", (width, height), wall)
        x = gap
        for i in items:
            r.alpha_composite(i, (x, gap + (height - 2 * gap - i.height)))
            x += i.width + gap
        return r

    def load(rel: str) -> Image.Image:
        return Image.open(out_root / rel).convert("RGBA")

    b = manifest["brand"]
    brand_items = [px.upscale(load(b["mark"]["file"]), zoom), px.upscale(load(b["favicon16"]), zoom),
                   load(b["markLarge"]["file"]), px.upscale(load(b["signage"]["file"]), zoom)]
    if "markDetailed" in b:
        brand_items.insert(0, px.upscale(load(b["markDetailed"]["file"]), zoom))
    rows.append(row(brand_items))
    rows.append(row([load(b["icon512"]).resize((256, 256), Image.NEAREST), load(b["icon192"]), load(b["appleTouch"]),
                     px.upscale(load(b["mark"]["file"]), 1), px.upscale(load(b["favicon16"]), 1)]))
    paintings = [a for a in manifest["wallArt"] if a["kind"] == "painting"]
    small = [px.upscale(load(a["framed"]["file"]), zoom) for a in paintings if a["w"] < 40]
    wide = [px.upscale(load(a["framed"]["file"]), zoom) for a in paintings if a["w"] >= 40]
    rows.append(row(small[:4]))
    rows.append(row(small[4:]))
    rows.append(row(wide))
    rows.append(row([px.upscale(load(a["file"]), zoom * 2) for a in manifest["wallArt"] if a["kind"] == "poster"]))
    ill = manifest["illustrations"]["emptyOffice"]
    rows.append(row([load(ill["file"])]))
    rows.append(row([load(manifest["og"]).resize((600, 315), Image.NEAREST)]))
    width = max(r.width for r in rows)
    sheet = Image.new("RGBA", (width, sum(r.height for r in rows)), wall)
    y = 0
    for r in rows:
        sheet.alpha_composite(r, (0, y))
        y += r.height
    return sheet


# ---------------------------------------------------------------------------
# CLI


def raw_path(asset_id: str, take: str) -> Path:
    return RAW / (f"{asset_id}@{take}.png" if take else f"{asset_id}.png")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", default="", help="ids de specs.json separados por vírgula")
    parser.add_argument("--brand-only", action="store_true", help="regenera apenas a marca/og-image a partir do artwork oficial, sem imagens brutas")
    parser.add_argument("--take", default="", help="usa raw/<id>@<tomada>.png em vez da tomada escolhida")
    parser.add_argument("--out", default=str(PUBLIC), help="pasta de saída (padrão: client/public/assets)")
    args = parser.parse_args()

    specs = json.loads(SPECS.read_text())
    only = {s for s in args.only.split(",") if s}
    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)

    if args.brand_only:
        manifest_path = out_root / "manifest.json"
        source_manifest = manifest_path if manifest_path.exists() else PUBLIC / "manifest.json"
        manifest = json.loads(source_manifest.read_text())
        manifest["brand"] = build_brand(out_root)
        manifest["og"] = build_og(out_root)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        print(f"manifest: marca/og-image regenerados -> {manifest_path}")
        return 0

    # 1) assets gerados por IA
    for asset in specs["assets"]:
        if only and asset["id"] not in only:
            continue
        raw = raw_path(asset["id"], args.take)
        if not raw.exists():
            print(f"[{asset['id']}] sem imagem bruta ({raw.relative_to(ROOT)}); pulei")
            continue
        img = process(asset, Image.open(raw))
        dest = out_root / asset["out"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        scale = asset["post"].get("scale", 1)
        px.upscale(img, scale).save(dest, optimize=True)
        if asset.get("kind") == "painting":
            dest_framed = out_root / "art" / "framed" / dest.name
            dest_framed.parent.mkdir(parents=True, exist_ok=True)
            framed(img, asset["post"].get("frame", "wood")).save(dest_framed, optimize=True)
        print(f"[{asset['id']}] {img.width}x{img.height} -> {dest.relative_to(ROOT) if dest.is_relative_to(ROOT) else dest}")

    if only:
        if "logo-mark" in only:
            build_brand(out_root)
        return 0

    # 2) marca, og-image, manifest e folha de contato (dependem dos arquivos acima)
    by_id = {a["id"]: a for a in specs["assets"]}
    brand = build_brand(out_root)

    ill_spec = by_id["empty-office"]
    ill_path = out_root / ill_spec["out"]
    ill_scale = ill_spec["post"].get("scale", 1)
    illustration = None
    illustrations = {}
    if ill_path.exists():
        big = Image.open(ill_path)
        illustration = big.resize((big.width // ill_scale, big.height // ill_scale), Image.NEAREST)
        illustrations["emptyOffice"] = {"file": ill_spec["out"], "w": big.width, "h": big.height, "scale": ill_scale}
    og = build_og(out_root)

    wall_art = []
    for asset in specs["assets"]:
        if asset.get("kind") not in ("painting", "poster") or not (out_root / asset["out"]).exists():
            continue
        w, h = asset["post"]["w"], asset["post"]["h"]
        # largura do vão na parede (tiles): pôster 1, pintura 2, pintura larga 4 (com a moldura de 3px)
        tiles = 1 if asset["kind"] == "poster" else -(-(w + 6) // 16)
        entry = {"id": asset["id"], "kind": asset["kind"], "file": asset["out"], "w": w, "h": h,
                 "tiles": tiles, "title": asset["title"]}
        if asset["kind"] == "poster":
            entry["variant"] = asset["variant"]
        else:
            entry["framed"] = {"file": f"art/framed/{Path(asset['out']).name}",
                               "w": asset["post"]["w"] + 6, "h": asset["post"]["h"] + 6}
        if asset.get("mapTheme"):
            entry["mapTheme"] = asset["mapTheme"]
        wall_art.append(entry)

    # A coleção V2 deriva a forma e a posição dos pixels dos mesmos assets da V1.
    from map_v2 import build_map_v2_variants

    wall_art.extend(build_map_v2_variants(out_root, specs))

    manifest = {"version": 1, "brand": brand, "illustrations": illustrations, "wallArt": wall_art, "og": og}
    (out_root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"manifest: {len(wall_art)} artes de parede, marca e ilustração -> {out_root / 'manifest.json'}")

    if illustrations and wall_art:
        CACHE.mkdir(exist_ok=True)
        contact_sheet(out_root, manifest).save(CACHE / "contact-sheet.png")
        print(f"folha de contato -> {CACHE / 'contact-sheet.png'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
