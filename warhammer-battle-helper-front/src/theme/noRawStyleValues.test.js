import fs from 'fs';
import path from 'path';

// Themes (PLAYRPG-270) work by overriding the tokens in src/theme/tokens.css under
// :root[data-theme="<id>"]. A colour, radius, letter-spacing or font written directly in a
// stylesheet ignores the theme and stays parchment in every theme, so app CSS may only use
// tokens. Theme definitions in src/theme/ are the only place for raw values. A var() naming a token that does not exist is just as bad: the declaration becomes
// invalid at computed-value time and silently falls back to transparent / initial.

const SRC = path.join(__dirname, '..');
// Token definitions: the default theme (tokens.css) and the theme blocks (themes/*.css).
const isThemeDefinition = file => file.startsWith(__dirname + path.sep);

// Content colours that must not follow the theme. Keep this list short and justified.
const ALLOWED = [];

const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return walk(full, ext);
  return ext.some(e => entry.name.endsWith(e)) ? [full] : [];
});

const cssFiles = walk(SRC, ['.css']);
const jsFiles = walk(SRC, ['.js', '.jsx']).filter(f => !/\.test\.jsx?$/.test(f));

const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));

// Yields { prop, value, line } for every declaration inside a block.
const declarations = text => {
  const clean = stripComments(text);
  const out = [];
  const blockRe = /\{([^{}]*)\}/g;
  let block;
  while ((block = blockRe.exec(clean))) {
    const body = block[1];
    const bodyStart = block.index + 1;
    const declRe = /(-?-?[a-zA-Z-]+)\s*:([^;{}]+)/g;
    let decl;
    while ((decl = declRe.exec(body))) {
      const line = clean.slice(0, bodyStart + decl.index).split('\n').length;
      out.push({ prop: decl[1].toLowerCase(), value: decl[2], line });
    }
  }
  return out;
};

const COLOUR_PROP = /^(color|fill|stroke|caret-color|accent-color|background.*|border.*|outline.*|.*shadow|filter|scrollbar-color|text-decoration-color|column-rule.*)$/;

const violation = ({ prop, value }) => {
  if (prop.startsWith('--')) {
    return /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(value) ? 'raw colour in custom property' : null;
  }
  if (/#[0-9a-f]{3,8}\b/i.test(value)) return 'hex colour';
  if (/rgba?\(\s*\d/i.test(value)) return 'rgb()/rgba() with literal channels';
  if (COLOUR_PROP.test(prop) && /(^|[\s,(])(white|black)([\s,)]|$)/i.test(value)) return 'named colour';
  if (/radius/.test(prop) && /(^|[\s(])\d*\.?\d*[1-9]\d*px/.test(value)) return 'raw border-radius';
  if (prop === 'letter-spacing' && !/var\(|^\s*(0|normal|inherit)\s*$/.test(value)) return 'raw letter-spacing';
  if (prop === 'font-family' && /^\s*['"]?(Cinzel|Crimson Text|Roboto)\b/.test(value)) return 'raw theme font';
  return null;
};

const rel = file => path.relative(SRC, file);

describe('theme tokens guard', () => {
  it('app stylesheets use theme tokens instead of raw colours, radii, tracking and fonts', () => {
    const problems = cssFiles
      .filter(file => !isThemeDefinition(file))
      .flatMap(file => declarations(fs.readFileSync(file, 'utf8'))
        .map(d => ({ ...d, reason: violation(d) }))
        .filter(d => d.reason)
        .map(d => `${rel(file)}:${d.line} ${d.prop}: ${d.value.trim()} (${d.reason})`))
      .filter(p => !ALLOWED.some(a => p.startsWith(a)));
    expect(problems).toEqual([]);
  });

  it('every var(--x) used in CSS is defined somewhere', () => {
    const defined = new Set();
    cssFiles.forEach(file => {
      for (const m of stripComments(fs.readFileSync(file, 'utf8')).matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
    });
    // Custom properties set from JS (inline style objects) count as defined.
    jsFiles.forEach(file => {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/['"`](--[\w-]+)['"`]/g)) defined.add(m[1]);
    });
    const missing = cssFiles.flatMap(file => {
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      return [...text.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)]
        .filter(m => m[2] === ')' && !defined.has(m[1]))
        .map(m => `${rel(file)}: ${m[1]}`);
    });
    expect([...new Set(missing)]).toEqual([]);
  });
});
