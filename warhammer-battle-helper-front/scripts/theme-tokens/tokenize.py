"""One-off codemod: rewrite raw style values in CSS to theme tokens (PLAYRPG-346).

Usage:
    python3 scripts/theme-tokens/tokenize.py --check FILE...   # report only
    python3 scripts/theme-tokens/tokenize.py --write FILE...   # rewrite in place

Rules (see docs/superpowers/plans/2026-11-11-playrpg-346-css-tokens.md):
  * hex / named colours snap to the nearest token of the declaration's property family
  * rgb()/rgba() become rgb(var(--x-rgb) / alpha) with the nearest rgb-triplet token
  * colours inside blurred shadow layers get their alpha multiplied by var(--shadow-k)
  * border-radius lengths snap to the radius scale
  * letter-spacing gets multiplied by var(--tracking-k)
  * Cinzel / Crimson Text / Roboto stacks become font tokens; display-font rules without
    their own text-transform get text-transform: var(--display-transform)
Custom-property declarations (--x: ...) are left alone and reported.
"""
import math
import re
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from palette import FAMILIES, RGB  # noqa: E402

FAR = 15  # ΔE at which a snap is reported for manual review


def norm_hex(h):
    h = h.lower().lstrip('#')
    if len(h) in (3, 4):
        h = ''.join(c * 2 for c in h)
    alpha = None
    if len(h) == 8:
        alpha = int(h[6:], 16) / 255
        h = h[:6]
    return '#' + h, alpha


def to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lab(rgb):
    def f(c):
        c /= 255
        return ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    r, g, b = (f(c) for c in rgb)
    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
    y = r * 0.2126 + g * 0.7152 + b * 0.0722
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883

    def t(v):
        return v ** (1 / 3) if v > 0.008856 else 7.787 * v + 16 / 116
    return (116 * t(y) - 16, 500 * (t(x) - t(y)), 200 * (t(y) - t(z)))


FAM_LAB = {f: [(tok, lab(to_rgb(h))) for tok, h in toks] for f, toks in FAMILIES.items()}
RGB_LAB = [(tok, lab(to_rgb(h))) for tok, h in RGB]
NAMED = {'white': '#ffffff', 'black': '#000000'}


def nearest(table, rgb):
    L = lab(rgb)
    return min(((tok, math.dist(L, l)) for tok, l in table), key=lambda x: x[1])


def family(prop):
    if prop in ('color', 'fill', 'stroke', 'caret-color', 'accent-color',
                'text-decoration-color', '-webkit-text-fill-color'):
        return 'text'
    if prop.startswith('background'):
        return 'bg'
    if 'border' in prop or prop.startswith('outline') or 'scrollbar' in prop or prop == 'column-rule':
        return 'border'
    return None


class Report:
    def __init__(self):
        self.count = 0
        self.far = []
        self.skipped = []


def fmt_alpha(a):
    a = round(a, 3)
    return ('%g' % a)


def rgb_expr(rgb, alpha, blurred, rep, where):
    tok, d = nearest(RGB_LAB, rgb)
    if d >= FAR:
        rep.far.append((where, '#%02x%02x%02x' % rgb, tok, round(d, 1)))
    rep.count += 1
    if blurred:
        a = 'var(--shadow-k)' if alpha is None or alpha == 1 else 'calc(%s * var(--shadow-k))' % fmt_alpha(alpha)
        return 'rgb(var(%s) / %s)' % (tok, a)
    if alpha is None or alpha == 1:
        return 'rgb(var(%s))' % tok
    return 'rgb(var(%s) / %s)' % (tok, fmt_alpha(alpha))


COLOR_RE = re.compile(
    r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+%?)\s*)?\)'
    r'|#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b'
    r'|(?<![\w-])(?:white|black)(?![\w-])')


def parse_alpha(s):
    if s is None:
        return None
    if s.endswith('%'):
        return float(s[:-1]) / 100
    return float(s)


def nearest_distinct(table, rgb, used):
    """Nearest token, but never one already taken by a clearly different colour of the same
    value: two gradient stops collapsing into one token would flatten the gradient."""
    L = lab(rgb)
    ranked = sorted(((tok, math.dist(L, l)) for tok, l in table), key=lambda x: x[1])
    for tok, d in ranked:
        prev = used.get(tok)
        if prev is None or math.dist(prev, L) < 8:
            used[tok] = L
            return tok, d
    return ranked[0]


def replace_colors(value, prop, rep, where, blurred=False, force_rgb=False):
    fam = None if force_rgb else family(prop)
    used = {}

    def sub(m):
        txt = m.group(0)
        if txt.startswith('rgb'):
            rgb = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
            return rgb_expr(rgb, parse_alpha(m.group(4)), blurred, rep, where)
        if txt in NAMED:
            h, alpha = NAMED[txt], None
        else:
            h, alpha = norm_hex(txt)
        rgb = to_rgb(h)
        if fam and alpha is None and not blurred:
            tok, d = nearest_distinct(FAM_LAB[fam], rgb, used)
            if d >= FAR:
                rep.far.append((where, h, tok, round(d, 1)))
            rep.count += 1
            return 'var(%s)' % tok
        return rgb_expr(rgb, alpha, blurred, rep, where)
    return COLOR_RE.sub(sub, value)


def split_top(value, sep=','):
    parts, depth, cur = [], 0, ''
    for ch in value:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == sep and depth == 0:
            parts.append(cur)
            cur = ''
        else:
            cur += ch
    parts.append(cur)
    return parts


LEN_RE = re.compile(r'^-?\d*\.?\d+(px|em|rem)?$')


def layer_blurred(layer):
    # strip colour functions so only lengths remain
    stripped = COLOR_RE.sub(' ', layer)
    lengths = [t for t in stripped.split() if LEN_RE.match(t)]
    if len(lengths) < 3:
        return False
    return float(re.sub(r'[a-z]+$', '', lengths[2]) or 0) != 0


def shadow_value(value, prop, rep, where):
    if value.strip() in ('none', 'inherit', 'initial', 'unset'):
        return value
    layers = split_top(value)
    out = [replace_colors(l, prop, rep, where, blurred=layer_blurred(l), force_rgb=True) for l in layers]
    return ','.join(out)


RADIUS = [(2, '--radius-xs'), (3, '--radius-sm'), (5, '--radius-md'), (7, '--radius-lg'),
          (10, '--radius-xl'), (16, '--radius-2xl'), (10 ** 9, '--radius-pill')]


def radius_token(px):
    for lim, tok in RADIUS:
        if px <= lim:
            return tok


def radius_value(value, rep):
    def sub(m):
        px = float(m.group(1))
        if px == 0:
            return m.group(0)
        rep.count += 1
        return 'var(%s)' % radius_token(px)
    return re.sub(r'(?<![\w.-])(\d*\.?\d+)px\b', sub, value)


def tracking_value(value, rep):
    v = value.strip()
    if v in ('0', 'normal', 'inherit', 'initial', 'unset') or 'var(' in v:
        return value
    rep.count += 1
    return ' calc(%s * var(--tracking-k))' % v


def font_value(value, rep):
    first = value.strip().split(',')[0].strip().strip('\'"')
    tok = {'Cinzel': '--font-display', 'Crimson Text': '--font-body', 'Roboto': '--font-ui'}.get(first)
    if not tok:
        return value, None
    rep.count += 1
    return ' var(%s)' % tok, tok


DECL_RE = re.compile(r'(?P<prop>-?-?[a-zA-Z-]+)(?P<colon>\s*:)(?P<val>[^;{}]+)(?P<end>;|$)')
COMMENT_RE = re.compile(r'/\*.*?\*/', re.S)


def process_block(body, rep, fname, line_of):
    display = []

    def sub(m):
        prop = m.group('prop').lower()
        val = m.group('val')
        where = '%s:%d' % (fname, line_of(m.start()))
        if prop.startswith('--'):
            if COLOR_RE.search(val):
                rep.skipped.append((where, prop))
            return m.group(0)
        if prop in ('box-shadow', 'text-shadow'):
            new = shadow_value(val, prop, rep, where)
        elif prop == 'filter' or prop == 'backdrop-filter':
            new = replace_colors(val, prop, rep, where, blurred=True, force_rgb=True)
        elif 'radius' in prop:
            new = radius_value(val, rep)
        elif prop == 'letter-spacing':
            new = tracking_value(val, rep)
        elif prop == 'font-family':
            new, tok = font_value(val, rep)
            if tok == '--font-display':
                display.append(True)
        elif prop in ('transition', 'animation', 'content', 'grid-template-areas', 'will-change'):
            new = val
        else:
            new = replace_colors(val, prop, rep, where)
        return m.group('prop') + m.group('colon') + new + m.group('end')

    new_body = DECL_RE.sub(sub, body)
    if display and not re.search(r'(?<![\w-])text-transform\s*:', body):
        new_body = re.sub(r'(font-family\s*:\s*var\(--font-display\)\s*;)',
                          r'\1 text-transform: var(--display-transform);', new_body, count=1)
        rep.count += 1
    return new_body


def process(text, fname, rep):
    # protect comments
    comments = []

    def stash(m):
        comments.append(m.group(0))
        return '\0%d\0' % (len(comments) - 1)
    work = COMMENT_RE.sub(stash, text)

    def line_of_factory(offset):
        return lambda pos: work.count('\n', 0, offset + pos) + 1

    out, i = [], 0
    for m in re.finditer(r'\{([^{}]*)\}', work):
        out.append(work[i:m.start() + 1])
        out.append(process_block(m.group(1), rep, fname, line_of_factory(m.start() + 1)))
        out.append('}')
        i = m.end()
    out.append(work[i:])
    res = ''.join(out)
    return re.sub(r'\0(\d+)\0', lambda m: comments[int(m.group(1))], res)


def main():
    mode, files = sys.argv[1], sys.argv[2:]
    total = 0
    for f in files:
        rep = Report()
        src = open(f).read()
        new = process(src, f, rep)
        total += rep.count
        print('%-60s %5d replacements' % (f, rep.count))
        for where, h, tok, d in rep.far:
            print('   FAR  %s  %s -> %s  dE=%s' % (where, h, tok, d))
        for where, prop in rep.skipped:
            print('   SKIP %s  custom property %s' % (where, prop))
        if mode == '--write' and new != src:
            open(f, 'w').write(new)
    print('TOTAL', total)


if __name__ == '__main__':
    main()
