"""Generate Android launcher icons at all required densities."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT_BASE = "/home/z/my-project/android/app/src/main/res"
SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

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


def make_icon(size, out_path, round_icon=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Emerald-to-teal gradient background
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(16 + (13 - 16) * t)
        g = int(185 + (148 - 185) * t)
        b = int(129 + (136 - 129) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Mask to shape (square with rounded corners OR circle)
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    if round_icon:
        mdraw.ellipse([0, 0, size - 1, size - 1], fill=255)
    else:
        radius = int(size * 0.22)
        mdraw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    img.putalpha(mask)

    # Inner white card
    pad = int(size * 0.18)
    card_size = size - 2 * pad
    if round_icon:
        draw.ellipse([pad, pad, pad + card_size, pad + card_size], fill=(255, 255, 255, 255))
    else:
        radius2 = int(card_size * 0.18)
        draw.rounded_rectangle([pad, pad, pad + card_size, pad + card_size], radius=radius2, fill=(255, 255, 255, 255))

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
    print(f"Wrote {out_path} ({size}x{size}) round={round_icon}")


# Generate square icons
for folder, size in SIZES.items():
    out_dir = os.path.join(OUT_BASE, folder)
    os.makedirs(out_dir, exist_ok=True)
    make_icon(size, os.path.join(out_dir, "ic_launcher.png"), round_icon=False)
    make_icon(size, os.path.join(out_dir, "ic_launcher_round.png"), round_icon=True)

print("Done.")
