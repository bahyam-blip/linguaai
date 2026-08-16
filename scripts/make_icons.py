"""Generate PWA icons for LinguaAI app."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = "/home/z/my-project/public/icons"
os.makedirs(OUT_DIR, exist_ok=True)

# Try to find a good font
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def make_icon(size, out_path, maskable=False):
    # Emerald-to-teal gradient background
    img = Image.new("RGB", (size, size), (16, 185, 129))
    draw = ImageDraw.Draw(img)

    # Vertical gradient
    for y in range(size):
        # interpolate from #10b981 (emerald) at top to #0d9488 (teal) at bottom
        t = y / max(size - 1, 1)
        r = int(16 + (13 - 16) * t)
        g = int(185 + (148 - 185) * t)
        b = int(129 + (136 - 129) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b))

    # Padding — smaller for maskable (safe area)
    pad = int(size * (0.18 if maskable else 0.12))

    # White rounded card
    card_size = size - 2 * pad
    radius = int(card_size * 0.22)
    card_box = [pad, pad, pad + card_size, pad + card_size]
    draw.rounded_rectangle(card_box, radius=radius, fill=(255, 255, 255))

    # Draw "Aa" glyph
    font_size = int(card_size * 0.5)
    font = load_font(font_size)
    text = "Aa"
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
    except Exception:
        tw, th = font_size, font_size
    tx = pad + (card_size - tw) // 2 - bbox[0]
    ty = pad + (card_size - th) // 2 - bbox[1]
    # Emerald color text
    draw.text((tx, ty), text, font=font, fill=(16, 185, 129))

    # Add a small green checkmark dot in the top-right of the card
    dot_r = int(card_size * 0.12)
    cx = pad + card_size - dot_r - int(card_size * 0.08)
    cy = pad + int(card_size * 0.08) + dot_r
    draw.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=(16, 185, 129))
    # Checkmark inside dot
    ck_font = load_font(int(dot_r * 1.2))
    try:
        cbbox = draw.textbbox((0, 0), "✓", font=ck_font)
        ctw = cbbox[2] - cbbox[0]
        cth = cbbox[3] - cbbox[1]
    except Exception:
        ctw, cth = dot_r, dot_r
    draw.text((cx - ctw // 2 - cbbox[0], cy - cth // 2 - cbbox[1]), "✓", font=ck_font, fill=(255, 255, 255))

    img.save(out_path, "PNG", optimize=True)
    print(f"Wrote {out_path} ({size}x{size})")


# Standard icons
make_icon(192, os.path.join(OUT_DIR, "icon-192.png"), maskable=False)
make_icon(512, os.path.join(OUT_DIR, "icon-512.png"), maskable=False)

# Maskable variants (same file, the manifest declares purpose maskable)
make_icon(192, os.path.join(OUT_DIR, "icon-192-maskable.png"), maskable=True)
make_icon(512, os.path.join(OUT_DIR, "icon-512-maskable.png"), maskable=True)

# Favicon
make_icon(32, os.path.join(OUT_DIR, "favicon-32.png"), maskable=False)
make_icon(180, os.path.join(OUT_DIR, "apple-touch-icon.png"), maskable=False)

print("Done.")
