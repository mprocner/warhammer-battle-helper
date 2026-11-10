"""JS/JSX variant of tokenize.py for style objects (sx, style={{}}, MUI theme overrides).

Rewrites string values of camelCase style keys: `borderColor: '#7a5c42'` ->
`borderColor: 'var(--c-border-strong)'`. Usage as tokenize.py (--check / --write FILE...).
Content colours (participant palette, drawing colours, ...) must be reviewed by hand: run
--check first and only --write files whose every hit is UI chrome. One-off (PLAYRPG-346).
"""
import os
import re
import sys
sys.path.insert(0, os.path.dirname(__file__))
import importlib  # noqa: E402
tk = importlib.import_module('tokenize')

PAIR_RE = re.compile(r"(?P<key>['\"]?[a-zA-Z&-]+['\"]?)(?P<colon>\s*:\s*)(?P<q>['\"`])(?P<val>[^'\"`\n]*)(?P=q)")


def kebab(key):
    key = key.strip('\'"')
    return re.sub(r'([A-Z])', lambda m: '-' + m.group(1).lower(), key)


def process(text, fname, rep):
    def sub(m):
        prop = kebab(m.group('key'))
        val = m.group('val')
        where = '%s:%d' % (fname, text.count('\n', 0, m.start()) + 1)
        if prop in ('box-shadow', 'text-shadow'):
            new = tk.shadow_value(val, prop, rep, where)
        elif prop.endswith('radius'):
            new = tk.radius_value(val, rep)
        elif prop == 'letter-spacing':
            new = tk.tracking_value(val, rep).strip()
        elif prop == 'font-family':
            new = tk.font_value(val, rep)[0].strip()
        elif tk.family(prop) or prop in ('background', 'background-image'):
            new = tk.replace_colors(val, prop, rep, where)
        else:
            return m.group(0)
        if new != val:
            return m.group('key') + m.group('colon') + m.group('q') + new + m.group('q')
        return m.group(0)
    return PAIR_RE.sub(sub, text)


def main():
    mode, files = sys.argv[1], sys.argv[2:]
    for f in files:
        rep = tk.Report()
        src = open(f).read()
        new = process(src, f, rep)
        print('%-60s %4d' % (f, rep.count))
        if mode == '--check':
            for a, b in zip(src.split('\n'), new.split('\n')):
                if a != b:
                    print('   - ' + a.strip()[:110])
                    print('   + ' + b.strip()[:110])
        for where, h, tok, d in rep.far:
            print('   FAR  %s  %s -> %s  dE=%s' % (where, h, tok, d))
        if mode == '--write' and new != src:
            open(f, 'w').write(new)


if __name__ == '__main__':
    main()
