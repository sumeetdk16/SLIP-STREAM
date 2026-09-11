"""Render the Slipstream mark to PNG at every size the manifest needs.

The mark is a lane change drawn in transit-diagram grammar: the line you were
on runs straight and dim, the line you take rises to the next lane through a
single 45-degree elbow. Flat fills only — no gradients, no glow.

Pure stdlib: 4x supersampled signed-distance rendering, then a minimal PNG
writer (zlib + CRC) so the build needs no image dependency.
"""
import math, struct, zlib, pathlib

OUT = pathlib.Path("icons")
SS = 4  # supersample factor

PLATE = (0x10, 0x0C, 0x0A)      # warm near-black
GHOST = (0x3A, 0x2E, 0x26)      # the line you left
LIVE = (0xFF, 0x6A, 0x00)       # hot orange — the line you take


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def seg_dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def rounded_rect_sdf(px, py, half, radius):
    """Signed distance to a centered rounded square; negative is inside."""
    qx = abs(px) - (half - radius)
    qy = abs(py) - (half - radius)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - radius


def render(size):
    n = size * SS

    # Transit grammar: two lanes, joined by a single 45-degree elbow.
    upper, lower = -0.36, 0.36
    live = [
        (-0.74, lower, -0.36, lower),
        (-0.36, lower, 0.36, upper),
        (0.36, upper, 0.74, upper),
    ]
    ghost = [(-0.74, lower, 0.74, lower)]
    live_w, ghost_w = 0.135, 0.062

    px_per_unit = n / 2.0
    aa = 1.2 / px_per_unit

    rows = []
    for y in range(n):
        row = bytearray()
        vy = (y + 0.5) / n * 2 - 1
        for x in range(n):
            vx = (x + 0.5) / n * 2 - 1

            plate = rounded_rect_sdf(vx, vy, 0.97, 0.30)
            plate_a = max(0.0, min(1.0, 0.5 - plate / aa))

            r, g, b = PLATE
            dg = min(seg_dist(vx, vy, *s) for s in ghost) - ghost_w
            ga = max(0.0, min(1.0, 0.5 - dg / aa))
            r = round(r * (1 - ga) + GHOST[0] * ga)
            g = round(g * (1 - ga) + GHOST[1] * ga)
            b = round(b * (1 - ga) + GHOST[2] * ga)

            dl = min(seg_dist(vx, vy, *s) for s in live) - live_w
            la = max(0.0, min(1.0, 0.5 - dl / aa))
            r = round(r * (1 - la) + LIVE[0] * la)
            g = round(g * (1 - la) + LIVE[1] * la)
            b = round(b * (1 - la) + LIVE[2] * la)

            row += bytes((r, g, b, round(255 * plate_a)))
        rows.append(bytes(row))

    out = bytearray()
    for y in range(size):
        out.append(0)  # PNG filter type: none
        for x in range(size):
            r = g = b = al = 0
            for sy in range(SS):
                src = rows[y * SS + sy]
                for sx in range(SS):
                    i = ((x * SS + sx) * 4)
                    r += src[i]; g += src[i + 1]; b += src[i + 2]; al += src[i + 3]
            k = SS * SS
            out += bytes((r // k, g // k, b // k, al // k))
    return bytes(out)


def write_png(path, size, raw):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


OUT.mkdir(exist_ok=True)
for size in (16, 32, 48, 128):
    write_png(OUT / f"icon{size}.png", size, render(size))
    print("wrote", OUT / f"icon{size}.png")
