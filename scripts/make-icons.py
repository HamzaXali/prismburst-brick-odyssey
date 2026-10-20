"""Generate the original PrismBurst launcher icons (neon prism motif).
Usage: python3 scripts/make-icons.py   (needs Pillow)"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(OUT, exist_ok=True)

def make(size, maskable=False):
    S = 1024
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    # background: navy -> purple vertical gradient
    bg = Image.new('RGBA', (S, S))
    px = bg.load()
    for y in range(S):
        t = y / (S - 1)
        r = int(10 + (44 - 10) * t); g = int(12 + (10 - 12) * t); b = int(46 + (76 - 46) * t)
        for x in range(S):
            px[x, y] = (r, g, b, 255)
    radius = 0 if maskable else 220
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)
    img.paste(bg, (0, 0), mask)
    scale = 0.72 if maskable else 0.9   # keep the motif inside the maskable safe zone
    cx, cy = S / 2, S / 2 + 20 * scale
    def P(x, y): return (cx + x * scale, cy + y * scale)
    # glow layer
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    tri = [P(0, -330), P(300, 220), P(-300, 220)]
    gd.polygon(tri, fill=(255, 61, 240, 200))
    glow = glow.filter(ImageFilter.GaussianBlur(60))
    img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)
    # prism facets
    top, right, left = tri
    mid = P(0, 60)
    d.polygon([top, right, mid], fill=(34, 232, 255, 255))
    d.polygon([top, mid, left], fill=(155, 107, 255, 255))
    d.polygon([left, mid, right], fill=(255, 61, 240, 255))
    d.line([top, mid], fill=(255, 255, 255, 230), width=int(10 * scale))
    d.line([left, mid, right], fill=(255, 255, 255, 160), width=int(8 * scale))
    d.polygon(tri, outline=(232, 253, 255, 255), width=int(14 * scale))
    # light beam in, spectrum out
    d.line([P(-470, -40), P(-150, -60)], fill=(255, 255, 255, 255), width=int(18 * scale))
    cols = [(34, 232, 255), (61, 255, 160), (255, 209, 102), (255, 61, 240)]
    for i, c in enumerate(cols):
        d.line([P(150, -20 + i * 22), P(470, 60 + i * 70)], fill=c + (255,), width=int(20 * scale))
    # bouncing ball + paddle
    bx, by = P(0, 330)
    r = 46 * scale
    d.ellipse([bx - r - 20, by - r - 20, bx + r + 20, by + r + 20], fill=(34, 232, 255, 70))
    d.ellipse([bx - r, by - r, bx + r, by + r], fill=(220, 252, 255, 255))
    px0, py0 = P(-170, 410); px1, py1 = P(170, 450)
    d.rounded_rectangle([px0, py0, px1, py1], radius=int(20 * scale), fill=(34, 232, 255, 255), outline=(255, 255, 255, 255), width=int(6 * scale))
    # sparkle shards
    for (sx, sy, k) in [(-330, -260, 1.0), (330, -300, 0.8), (380, 300, 0.7), (-400, 260, 0.6)]:
        x, y = P(sx, sy); k *= 34 * scale
        d.polygon([(x, y - k * 1.6), (x + k * 0.45, y), (x, y + k * 1.6), (x - k * 0.45, y)], fill=(255, 255, 255, 230))
        d.polygon([(x - k * 1.6, y), (x, y + k * 0.45), (x + k * 1.6, y), (x, y - k * 0.45)], fill=(255, 255, 255, 230))
    return img.resize((size, size), Image.LANCZOS)

make(512).save(os.path.join(OUT, 'icon-512.png'))
make(192).save(os.path.join(OUT, 'icon-192.png'))
make(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'))
make(1024).save(os.path.join(OUT, 'icon-1024.png'))
print('icons written to', os.path.abspath(OUT))
