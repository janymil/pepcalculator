#!/usr/bin/env python3
"""Link the WhatsApp instance as a companion device, from this terminal.

Why this exists. A linking code is only valid for a couple of minutes, and a QR
rotates every few tens of seconds — so fetching one, pasting it into a chat and
waiting for someone to read the message does not work. This prints a **fresh**
one and keeps refreshing until the link opens, so what is on screen is current.

  python3 scripts/whatsapp-link.py

It reads the same `.env` the compose files use, and needs `WHATSAPP_API_KEY`
(optionally `WHATSAPP_INSTANCE`, `EVOLUTION_URL`).

Nothing here is secret: it only reads what the API already hands to anyone
holding the API key, and it prints to your own terminal.

Two ways in, and it uses whichever the API offers:
  - a **pairing code**, typed into WhatsApp — "Link with phone number instead"
  - a **QR**, shown as text, scanned with the phone camera

WhatsApp allows one pairing code per number at a time, with a cooldown, so the
code comes and goes. The QR is always available, which is why this falls back to
it rather than failing.
"""

import base64
import json
import os
import re
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFRESH_SECONDS = 25


def load_env(path=None):
    """The repo `.env`, as a dict. A missing file is not an error."""
    values = dict(os.environ)
    source = path or os.path.join(ROOT, '.env')
    if os.path.exists(source):
        with open(source) as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, _, value = line.partition('=')
                values.setdefault(key.strip(), value.strip())
    return values


def api(env, path):
    url = env.get('EVOLUTION_URL', 'http://127.0.0.1:8080').rstrip('/') + path
    request = urllib.request.Request(url)
    request.add_header('apikey', env.get('WHATSAPP_API_KEY', ''))
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode('utf-8'))


def connection_state(env):
    try:
        body = api(env, f'/instance/connectionState/{env.get("WHATSAPP_INSTANCE", "pepstool")}')
        return (body.get('instance') or {}).get('state', 'unknown')
    except Exception:
        return 'unknown'


def read_png(data):
    """Just enough PNG to get one luminance byte per pixel. No dependencies."""
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG')

    pos, palette, idat = 8, b'', b''
    width = height = depth = colour = None
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b'IHDR':
            width, height, depth, colour, _, _, interlace = struct.unpack('>IIBBBBB', body)
            if interlace:
                raise ValueError('interlaced PNG is not supported')
        elif kind == b'PLTE':
            palette = body
        elif kind == b'IDAT':
            idat += body
        elif kind == b'IEND':
            break

    if depth != 8:
        raise ValueError(f'bit depth {depth} is not supported')
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colour]
    stride = width * channels

    raw = zlib.decompress(idat)
    rows, previous, cursor = [], bytearray(stride), 0
    for _ in range(height):
        kind = raw[cursor]
        cursor += 1
        line = bytearray(raw[cursor:cursor + stride])
        cursor += stride
        # Undo the per-scanline filter. The five cases are PNG's own, verbatim.
        for index in range(stride):
            left = line[index - channels] if index >= channels else 0
            up = previous[index]
            up_left = previous[index - channels] if index >= channels else 0
            if kind == 1:
                line[index] = (line[index] + left) & 0xFF
            elif kind == 2:
                line[index] = (line[index] + up) & 0xFF
            elif kind == 3:
                line[index] = (line[index] + ((left + up) >> 1)) & 0xFF
            elif kind == 4:
                p = left + up - up_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                best = left if (pa <= pb and pa <= pc) else (up if pb <= pc else up_left)
                line[index] = (line[index] + best) & 0xFF
        rows.append(bytes(line))
        previous = line

    grey = []
    for line in rows:
        out = bytearray(width)
        for x in range(width):
            base = x * channels
            if colour == 3:
                at = line[base] * 3
                r, g, b = palette[at], palette[at + 1], palette[at + 2]
            elif colour in (0, 4):
                r = g = b = line[base]
            else:
                r, g, b = line[base], line[base + 1], line[base + 2]
            out[x] = (r * 299 + g * 587 + b * 114) // 1000
        grey.append(out)
    return width, height, grey


def to_modules(width, height, grey):
    """Snap the image onto the QR's own module grid.

    A QR looks fine at almost any scale but only decodes when the modules line
    up, so this measures one module from the top-left finder pattern rather than
    guessing a size from the image dimensions.
    """
    dark = [[grey[y][x] < 128 for x in range(width)] for y in range(height)]
    xs = [x for y in range(height) for x in range(width) if dark[y][x]]
    ys = [y for y in range(height) for x in range(width) if dark[y][x]]
    if not xs:
        raise ValueError('the image is blank')
    left, right, top, bottom = min(xs), max(xs), min(ys), max(ys)

    # The top-left finder pattern is exactly seven modules wide, which is how we
    # learn the module size. It has to stay a float: an 81-module code rendered
    # 348px wide is 4.29px per module, and rounding that to 4 drifts six modules
    # off the far edge — a QR that looks perfect and never scans.
    run = 0
    for x in range(left, right + 1):
        if dark[top][x]:
            run += 1
        else:
            break
    if run < 7:
        raise ValueError('no finder pattern')
    module = run / 7.0

    span = max(right - left + 1, bottom - top + 1)
    count = max(1, round(span / module))
    # Real codes are 4n+17 modules. The bottom-right module can be light, which
    # makes `span` a little short, so snap to the nearest legal size.
    snapped = 17 + 4 * round((count - 17) / 4.0)
    if 21 <= snapped <= 177 and abs(snapped - count) <= 2:
        count = snapped

    step = span / count
    grid = []
    for row in range(count):
        line = []
        for col in range(count):
            y = top + int((row + 0.5) * step)
            x = left + int((col + 0.5) * step)
            line.append('1' if 0 <= y < height and 0 <= x < width and dark[y][x] else '0')
        grid.append(''.join(line))
    return grid


QUIET = 4

# Half-block glyphs, keyed by the (upper, lower) module in a character cell.
# A terminal cell is roughly twice as tall as it is wide, so painting two modules
# into one cell is what keeps the symbol square *and* small.
HALF = {
    '11': '\u2588',   # both dark
    '10': '\u2580',   # upper half
    '01': '\u2584',   # lower half
    '00': ' ',        # both light
}


def draw(grid, compact=True):
    """The matrix as terminal text.

    `compact` paints two modules per cell, which is the difference between a code
    that fits and one that does not: an 81-module symbol needs 170 columns the
    obvious way (two characters per module) and 89 this way. The obvious way is
    what runs off the side of the screen.

    `compact=False` keeps the old wide form for a terminal that can take it.
    """
    if not compact:
        size = len(grid)
        border = '  ' * (size + 4)
        print(border)
        print(border)
        for line in grid:
            print('    ' + ''.join('  ' if cell == '0' else '\u2588\u2588' for cell in line) + '    ')
        print(border)
        print(border)
        return

    # The quiet zone is four light modules, which a decoder needs and a scanner
    # needs to be able to see.
    quiet = '0' * QUIET
    rows = [quiet + line + quiet for line in grid]
    width = len(rows[0])
    if len(rows) % 2:
        rows.append('0' * width)

    blank = ' ' * width
    print()
    print(blank)
    print(blank)
    for index in range(0, len(rows), 2):
        upper, lower = rows[index], rows[index + 1]
        print(''.join(HALF[upper[x] + lower[x]] for x in range(width)))
    print(blank)
    print(blank)
    print()


def write_png(path, grid, module=8, quiet=QUIET):
    """Write the matrix as a plain greyscale PNG.

    The text rendering has a hard floor: an 81-module symbol cannot be drawn in
    fewer than 81 columns without packing several modules into one character
    cell, which needs glyphs and fonts we cannot rely on. A file has no such
    limit — open it in VS Code and scan the image at any size that suits.
    """
    import binascii

    side = (len(grid) + quiet * 2) * module
    raw = bytearray()
    for y in range(side):
        raw.append(0)  # filter type 0: none
        row = y // module - quiet
        for x in range(side):
            col = x // module - quiet
            dark = 0 <= row < len(grid) and 0 <= col < len(grid) and grid[row][col] == '1'
            value = 0 if dark else 255
            raw += bytes((value, value, value))

    def chunk(kind, data):
        return (
            struct.pack('>I', len(data))
            + kind
            + data
            + struct.pack('>I', binascii.crc32(kind + data) & 0xFFFFFFFF)
        )

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', side, side, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as handle:
        handle.write(png)
    return side


def main():
    env = load_env()
    if not env.get('WHATSAPP_API_KEY'):
        sys.exit('WHATSAPP_API_KEY is not set — see .env.whatsapp.example')

    instance = env.get('WHATSAPP_INSTANCE', 'pepstool')
    once = '--once' in sys.argv
    dump = sys.argv[sys.argv.index('--dump') + 1] if '--dump' in sys.argv else None
    png = sys.argv[sys.argv.index('--png') + 1] if '--png' in sys.argv else None

    while True:
        state = connection_state(env)
        if state == 'open':
            print(f'\n  {instance} is LINKED and open — reminders will go out.')
            return 0

        try:
            body = api(env, f'/instance/connect/{instance}')
        except urllib.error.HTTPError as error:
            sys.exit(f'the API refused ({error.code}). Is the instance created?')
        except Exception as error:
            sys.exit(f'could not reach Evolution: {error}')

        code = body.get('pairingCode')
        base64png = body.get('base64')
        if dump:
            with open(dump, 'w') as handle:
                json.dump(body, handle)
        os.system('clear' if os.name != 'nt' else 'cls')

        if code:
            print('\n  PAIRING CODE\n')
            print(f'      >>> {code} <<<\n')
            print('  WhatsApp Business → Settings → Linked devices →')
            print('  Link a device → "Link with phone number instead"\n')
        elif base64png:
            print(f'\n  {instance} is "{state}". Scan this with the phone:\n')
            try:
                raw = base64.b64decode(re.sub(r'^data:image/\w+;base64,', '', base64png))
                width, height, grey = read_png(raw)
                matrix = to_modules(width, height, grey)
                draw(matrix, compact='--big' not in sys.argv)
                if png:
                    side = write_png(png, matrix)
                    print(f'  Also written to {png} ({side}x{side}) — open it in VS Code and scan that.\n')
            except Exception as error:
                sys.exit(f'could not render the QR: {error}')
            print('\n  WhatsApp Business → Settings → Linked devices → Link a device\n')
        else:
            sys.exit('the API offered neither a pairing code nor a QR')

        if once:
            return 0

        print(f'  This expires shortly. Refreshing every {REFRESH_SECONDS}s — Ctrl-C to stop.')
        for _ in range(REFRESH_SECONDS):
            time.sleep(1)
            if connection_state(env) == 'open':
                print(f'\n  {instance} is LINKED and open — reminders will go out.')
                return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\n  stopped.')
        sys.exit(130)

