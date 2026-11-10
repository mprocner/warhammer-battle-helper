"""Writes src/theme/tokens.css (default theme) from palette.py. One-off (PLAYRPG-346)."""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from palette import FAMILIES, RGB  # noqa: E402

BG_TEXTURE = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'%3E%3Cfilter id=\'paper\'%3E%3CfeTurbulence baseFrequency=\'0.04\' numOctaves=\'5\' seed=\'2\' /%3E%3CfeColorMatrix values=\'0 0 0 0 0.96, 0 0 0 0 0.91, 0 0 0 0 0.82, 0 0 0 0.15 0\'/%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23paper)\'/%3E%3C/svg%3E")'  # parchment noise
TITLES = {'text': 'Text', 'bg': 'Surfaces and fills', 'border': 'Borders and outlines'}
out = ['/* Theme tokens: default theme (PLAYRPG-346).',
       ' * Every themeable value in the app CSS comes from here; a theme overrides these under',
       ' * :root[data-theme="<id>"]. Tokens never cover dimensions (padding, sizes, font-size,',
       ' * line-height, border-width): sheets and tutorial anchors depend on fixed geometry.',
       ' * Guarded by src/theme/noRawStyleValues.test.js. */', ':root {']
for fam, toks in FAMILIES.items():
    out.append('  /* %s */' % TITLES[fam])
    for tok, h in toks:
        out.append('  %s: %s;' % (tok, h))
    out.append('')
out.append('  /* RGB triplets for transparency: rgb(var(--c-accent-rgb) / 0.3) */')
for tok, h in RGB:
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    out.append('  %s: %d %d %d;' % (tok, r, g, b))
out += ['',
        '  /* Typography */',
        "  --font-display: 'Cinzel', serif;",
        "  --font-body: 'Crimson Text', Georgia, serif;",
        "  --font-ui: 'Roboto', sans-serif;",
        '  --display-transform: none; /* text-transform of display-font text */',
        '  --tracking-k: 1;           /* letter-spacing multiplier */',
        '',
        '  /* Shape */',
        '  --radius-xs: 2px;',
        '  --radius-sm: 3px;',
        '  --radius-md: 4px;',
        '  --radius-lg: 6px;',
        '  --radius-xl: 8px;',
        '  --radius-2xl: 12px;',
        '  --radius-pill: 20px;',
        '',
        '  /* Surface decoration: page texture layered over the body gradient */',
        '  --bg-texture: %s;' % BG_TEXTURE,
        '',
        '  /* Depth: alpha multiplier of blurred shadows (focus rings are not affected) */',
        '  --shadow-k: 1;',
        '',
        '  /* Roll log and roll outcomes (also read from JS: ToastStack, log/rollUtils) */']
out += open(os.path.join(os.path.dirname(__file__), 'log_outcomes.css.part')).read().rstrip('\n').split('\n')
out += ['}', '']
path = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'theme', 'tokens.css')
os.makedirs(os.path.dirname(path), exist_ok=True)
open(path, 'w').write('\n'.join(out))
print('wrote', os.path.normpath(path))
