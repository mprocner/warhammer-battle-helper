import fs from 'fs';
import path from 'path';
import i18n from '../i18n';
import {
  HELP_PAGES, HELP_LANGUAGES, helpHref, helpLanguage, parseHeadings, rewriteGuideLink, splitHeadingAnchor,
} from './helpPages';
import { getTour, TOUR_IDS } from '../components/tutorial/tours';

// The tour registry pulls in the creator, whose api/axios import is ESM that jest cannot parse.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const read = (lang, file) => fs.readFileSync(path.join(__dirname, lang, file), 'utf8');
const structure = (markdown) => parseHeadings(markdown).map(({ level, id }) => ({ level, id }));
const sectionIds = (slug) => {
  const page = HELP_PAGES.find(p => p.slug === slug);
  return parseHeadings(read('en', page.file)).map(h => h.id).filter(Boolean);
};

describe('the guide folders', () => {
  it.each(HELP_LANGUAGES)('holds exactly the registered pages in %s', (lang) => {
    const files = fs.readdirSync(path.join(__dirname, lang)).filter(f => f.endsWith('.md')).sort();
    expect(files).toEqual(HELP_PAGES.map(p => p.file).sort());
  });

  // A translation that drops or reorders a section breaks every link to it in one language only.
  it.each(HELP_PAGES.map(p => p.file))('%s has the same headings and anchors in pl and en', (file) => {
    expect(structure(read('pl', file))).toEqual(structure(read('en', file)));
  });

  it.each(HELP_PAGES.map(p => p.file))('%s gives every section heading a unique anchor', (file) => {
    const headings = parseHeadings(read('en', file)).filter(h => h.level >= 2);
    headings.forEach(h => expect(h.id).toMatch(/^[a-z0-9-]+$/));
    const ids = headings.map(h => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(HELP_LANGUAGES)('links in %s point at existing pages and sections', (lang) => {
    const broken = [];
    HELP_PAGES.forEach(({ file }) => {
      const links = [...read(lang, file).matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1]);
      links.filter(href => !/^https?:/.test(href)).forEach(href => {
        const target = rewriteGuideLink(href);
        const match = target.match(/^\/help(?:\/([\w-]+))?(?:#([\w-]+))?$/);
        const slug = match && (match[1] || 'home');
        if (!match || !HELP_PAGES.some(p => p.slug === slug)
          || (match[2] && !sectionIds(slug).includes(match[2]))) {
          broken.push(`${lang}/${file}: ${href}`);
        }
      });
    });
    expect(broken).toEqual([]);
  });

  it.each(HELP_LANGUAGES)('has a sidebar title for every page in %s', (lang) => {
    const gaps = HELP_PAGES.map(p => `help.pages.${p.slug}`)
      .filter(key => typeof i18n.getResource(lang, 'translation', key) !== 'string');
    expect(gaps).toEqual([]);
  });
});

describe('tutorial help links', () => {
  const refsOf = (help) => (help && typeof help === 'object' ? Object.values(help) : [help]).filter(Boolean);

  it('point at pages and sections that exist', () => {
    const broken = [];
    TOUR_IDS.forEach(tourId => {
      const tour = getTour(tourId);
      [tour, ...tour.steps].flatMap(item => refsOf(item.help)).forEach(ref => {
        const [slug, section] = ref.split('#');
        if (!HELP_PAGES.some(p => p.slug === slug) || (section && !sectionIds(slug).includes(section))) {
          broken.push(`${tourId}: ${ref}`);
        }
      });
    });
    expect(broken).toEqual([]);
  });

  it('give every tour a default help page', () => {
    TOUR_IDS.forEach(tourId => expect(getTour(tourId).help).toBeTruthy());
  });
});

describe('help helpers', () => {
  it('builds routes from references', () => {
    expect(helpHref('home')).toBe('/help');
    expect(helpHref('system-creator')).toBe('/help/system-creator');
    expect(helpHref('system-creator#formulas')).toBe('/help/system-creator#formulas');
    expect(helpHref(null)).toBe('/help');
  });

  it('rewrites links between guide files and leaves the rest alone', () => {
    expect(rewriteGuideLink('05-system-creator.md')).toBe('/help/system-creator');
    expect(rewriteGuideLink('./02-game-screen.md#map-tools')).toBe('/help/game-screen#map-tools');
    expect(rewriteGuideLink('README.md')).toBe('/help');
    expect(rewriteGuideLink('https://example.com/a.md')).toBe('https://example.com/a.md');
    expect(rewriteGuideLink('#rolls')).toBe('#rolls');
  });

  it('splits the anchor off a heading', () => {
    expect(splitHeadingAnchor('Map controls {#map-controls}')).toEqual({ text: 'Map controls', id: 'map-controls' });
    expect(splitHeadingAnchor('Plain')).toEqual({ text: 'Plain', id: null });
  });

  it('ignores lines that only look like headings inside code fences', () => {
    expect(parseHeadings('# A\n```\n# not a heading\n```\n## B {#b}')).toEqual([
      { level: 1, text: 'A', id: null },
      { level: 2, text: 'B', id: 'b' },
    ]);
  });

  it('maps any non-Polish language to English', () => {
    expect(helpLanguage('pl')).toBe('pl');
    expect(helpLanguage('pl-PL')).toBe('pl');
    expect(helpLanguage('de')).toBe('en');
    expect(helpLanguage(undefined)).toBe('en');
  });
});
