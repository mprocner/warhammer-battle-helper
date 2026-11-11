import fs from 'fs';
import path from 'path';
import { THEMES, DEFAULT_THEME } from './themes';

// A theme block must override every token of the default theme: a token it leaves out keeps
// its parchment value and shows up as a light island on, say, the sci-fi navy. Aliases
// (`--log-purple: var(--log-purple-medium)`) follow their target and need no override.

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const declared = css => new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));

const defaults = declared(read('tokens.css'));
const required = [...defaults].filter(([, value]) => !value.startsWith('var(')).map(([name]) => name);

describe.each(THEMES.filter(t => t.id !== DEFAULT_THEME).map(t => t.id))('theme %s', (id) => {
  const css = read(`themes/${id}.css`);

  it('is scoped to its data-theme selector', () => {
    expect(css).toContain(`:root[data-theme="${id}"]`);
  });

  it('overrides every default token', () => {
    const own = declared(css);
    expect(required.filter(name => !own.has(name))).toEqual([]);
  });

  it('defines no token the default theme lacks (a typo would silently do nothing)', () => {
    const extra = [...declared(css).keys()].filter(name => !defaults.has(name) && !name.startsWith('--mui-'));
    expect(extra).toEqual([]);
  });
});
