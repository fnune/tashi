"""Generates the Tashi logo SVGs and app icon PNGs. See README.md next to this file."""

import json
import math
import subprocess
from pathlib import Path

OUT = Path(__file__).parent
TOKENS = json.loads((OUT.parent / "tokens" / "tokens.json").read_text())
FRONTEND = OUT.parents[1] / "frontend"

PALETTES = {
    "light": {
        "bar_left": "sora.800",
        "bar_right": "sora.500",
        "stem": "sora.600",
        "drop": "sora.400",
        "cast": "sora.950",
        "tile": "neutral.0",
        "tile_edge": "neutral.100",
    },
    "dark": {
        "bar_left": "sora.300",
        "bar_right": "sora.500",
        "stem": "sora.200",
        "drop": "sora.400",
        "cast": "sora.950",
        "tile": "sora.950",
        "tile_edge": "sora.950",
    },
}
CAST_OPACITY = {"light": 0.35, "dark": 0.45}


def colour(path):
    node = TOKENS["color"]
    for key in path.split("."):
        node = node[key]
    value = node["$value"]
    return colour(value[len("{color.") : -1]) if value.startswith("{") else value


# Geometry lives on a 360x360 grid; the mark is optically centred in it.
BAR_Y, BAR_H = 134, 75
BAR_X0, BAR_X1 = 8, 352
STEM_X0, STEM_X1 = 135, 222
STEM_TOP = 4
STEM_BOTTOM = 356
STEM_R = (STEM_X1 - STEM_X0) / 2
TIP, TIP_R = (254, 246), 7
BULB, BULB_R = (314, 318), 31
DROP_BELLY = (96, 140)


def fmt(n):
    return f"{n:.2f}".rstrip("0").rstrip(".")


def pt(p):
    return f"{fmt(p[0])} {fmt(p[1])}"


def stem_path():
    cap_y = STEM_TOP + STEM_R
    toe = (STEM_X0 + 16, STEM_BOTTOM)
    return (
        f"M{fmt(STEM_X0)} {fmt(cap_y)}"
        f"A{fmt(STEM_R)} {fmt(STEM_R)} 0 0 1 {fmt(STEM_X1)} {fmt(cap_y)}"
        f"V{fmt(BAR_Y + BAR_H + 6)}"
        # The sweep is what turns the plus into the brush-like "ta" stroke.
        f"C{fmt(STEM_X1)} {fmt(STEM_BOTTOM - 62)} {fmt(STEM_X1 - 34)} {fmt(STEM_BOTTOM - 4)} {pt(toe)}"
        f"C{fmt(STEM_X0 + 6)} {fmt(STEM_BOTTOM + 0.5)} {fmt(STEM_X0)} {fmt(STEM_BOTTOM - 6)} {fmt(STEM_X0)} {fmt(STEM_BOTTOM - 16)}"
        "Z"
    )


def drop_path():
    # Built in a frame running from the tip towards the bulb, with +y on the underside.
    dx, dy = BULB[0] - TIP[0], BULB[1] - TIP[1]
    length = math.hypot(dx, dy)
    u = (dx / length, dy / length)
    v = (-u[1], u[0])

    def world(x, y):
        return (TIP[0] + u[0] * x + v[0] * y, TIP[1] + u[1] * x + v[1] * y)

    def on(cx, r, degrees):
        a = math.radians(degrees)
        return world(cx + r * math.cos(a), r * math.sin(a))

    def heading(point, degrees, k):
        a = math.radians(degrees + 90)
        return (point[0] + (u[0] * math.cos(a) + v[0] * math.sin(a)) * k, point[1] + (u[1] * math.cos(a) + v[1] * math.sin(a)) * k)

    top = -90 - math.degrees(math.asin((BULB_R - TIP_R) / length))
    top_tip, top_bulb = on(0, TIP_R, top), on(length, BULB_R, top)
    # Leaving the bulb flatter and reaching the tip steeper than the chord gives the underside its belly.
    low_bulb, low_tip = on(length, BULB_R, DROP_BELLY[0]), on(0, TIP_R, DROP_BELLY[1])
    return (
        f"M{pt(top_tip)}L{pt(top_bulb)}"
        f"A{BULB_R} {BULB_R} 0 {int(DROP_BELLY[0] - top > 180)} 1 {pt(low_bulb)}"
        f"C{pt(heading(low_bulb, DROP_BELLY[0], 44))} {pt(heading(low_tip, DROP_BELLY[1], -28))} {pt(low_tip)}"
        f"A{TIP_R} {TIP_R} 0 {int(top + 360 - DROP_BELLY[1] > 180)} 1 {pt(top_tip)}"
        "Z"
    )


def bar_path(x0, x1, round_left, round_right):
    r = BAR_H / 2
    y0, y1 = BAR_Y, BAR_Y + BAR_H
    left = f"M{fmt(x0 + r)} {fmt(y1)}A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x0 + r)} {fmt(y0)}" if round_left else f"M{fmt(x0)} {fmt(y1)}V{fmt(y0)}"
    right = f"H{fmt(x1 - r)}A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x1 - r)} {fmt(y1)}" if round_right else f"H{fmt(x1)}V{fmt(y1)}"
    return f"{left}{right}Z"


def mark(mode, prefix):
    p = {role: colour(path) for role, path in PALETTES[mode].items()}
    mid = (STEM_X0 + STEM_X1) / 2
    bar_left, bar_right = bar_path(BAR_X0, mid, True, False), bar_path(mid, BAR_X1, False, True)
    bar = bar_path(BAR_X0, BAR_X1, True, True)
    defs = (
        f'<clipPath id="{prefix}k"><path d="{bar}"/></clipPath>'
        f'<filter id="{prefix}c" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>'
    )
    return (
        f"<defs>{defs}</defs>"
        f'<path fill="{p["bar_left"]}" d="{bar_left}"/>'
        f'<path fill="{p["bar_right"]}" d="{bar_right}"/>'
        f'<g clip-path="url(#{prefix}k)"><path fill="{p["cast"]}" fill-opacity="{CAST_OPACITY[mode]}" filter="url(#{prefix}c)" transform="translate(7 5)" d="{stem_path()}"/></g>'
        f'<path fill="{p["stem"]}" d="{stem_path()}"/>'
        f'<path fill="{p["drop"]}" d="{drop_path()}"/>'
    )


def svg(view, body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="{title}">{body}</svg>\n'


def tile(size, inset=0.0):
    r = 0.225 * size - inset
    return f'x="{fmt(inset)}" y="{fmt(inset)}" width="{fmt(size - 2 * inset)}" height="{fmt(size - 2 * inset)}" rx="{fmt(r)}"'


def icon(mode, prefix, rounded=True):
    tile_fill, edge = colour(PALETTES[mode]["tile"]), colour(PALETTES[mode]["tile_edge"])
    size = 1024
    scale = 0.58 * size / 360
    offset = (size - 360 * scale) / 2
    # Home screens round and mask icons themselves, so those get a square that bleeds to the edges.
    background = (
        f'<rect fill="{tile_fill}" {tile(size)}/><rect fill="none" stroke="{edge}" stroke-width="4" {tile(size, 2)}/>'
        if rounded
        else f'<rect fill="{tile_fill}" width="{size}" height="{size}"/>'
    )
    return f'{background}<g transform="translate({fmt(offset)} {fmt(offset)}) scale({fmt(scale)})">{mark(mode, prefix)}</g>'


def render_png(svg_path, png_path, size):
    subprocess.run(["rsvg-convert", "--width", str(size), "--height", str(size), "--output", str(png_path), str(svg_path)], check=True)


for mode in PALETTES:
    for kind, content in (
        ("mark", svg("0 0 360 360", mark(mode, "m"), "Tashi")),
        ("icon", svg("0 0 1024 1024", icon(mode, "i"), "Tashi")),
        ("square", svg("0 0 1024 1024", icon(mode, "i", rounded=False), "Tashi")),
    ):
        name = f"tashi-{kind}-{mode}.svg"
        (OUT / name).write_text(content)
        # The app ships its own copies so the frontend never reaches outside its package.
        # Only installed icons need the tile (D-10).
        if kind == "mark":
            (FRONTEND / "src" / "assets" / name).write_text(content)
            (FRONTEND / "public" / f"favicon-{mode}.svg").write_text(content)

# Installed icons cannot follow the system theme, so they always use the light palette.
PUBLIC = FRONTEND / "public"
render_png(OUT / "tashi-icon-light.svg", PUBLIC / "icon-192.png", 192)
render_png(OUT / "tashi-icon-light.svg", PUBLIC / "icon-512.png", 512)
render_png(OUT / "tashi-square-light.svg", PUBLIC / "icon-maskable-512.png", 512)
render_png(OUT / "tashi-square-light.svg", PUBLIC / "apple-touch-icon.png", 180)
