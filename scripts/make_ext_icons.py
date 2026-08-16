"""Generate Chrome extension icons at multiple sizes."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = "/home/z/my-project/extension/icons"
os.makedirs(OUT_DIR, exist_ok=True)

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def make_icon(size, out_path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Background circle with gradient (simulate by drawing concentric circles)
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(16 + (13 - 16) * t)
        g = int(185 + (148 - 185) * t)
        b = int(129 + (136 - 129) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
    # Mask to circle
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.ellipse([0, 0, size - 1, size - 1], fill=255)
    img.putalpha(mask)

    # Inner white circle
    pad = int(size * 0.18)
    card_size = size - 2 * pad
    cx0, cy0 = pad, pad
    cx1, cy1 = pad + card_size, pad + card_size
    draw.ellipse([cx0, cy0, cx1, cy1], fill=(255, 255, 255, 255))

    # Aa text
    font_size = int(card_size * 0.5)
    font = load_font(font_size)
    text = "Aa"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = (size - th) // 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=(16, 185, 129, 255))

    img.save(out_path, "PNG", optimize=True)
    print(f"Wrote {out_path} ({size}x{size})")


for sz in [16, 32, 48, 128]:
    make_icon(sz, os.path.join(OUT_DIR, f"icon-{sz}.png"))

print("Done.")
