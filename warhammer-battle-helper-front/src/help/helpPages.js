// The user guide lives next to the code as plain Markdown, one file per page and language.
// CRA treats an imported .md file as a static asset: the import is the URL of the hashed copy in
// build/static/media, so the guide ships with every build and needs no copy step on deploy.
import plHome from './pl/README.md';
import plGettingStarted from './pl/01-getting-started.md';
import plGameScreen from './pl/02-game-screen.md';
import plForPlayers from './pl/03-for-players.md';
import plForGameMasters from './pl/04-for-game-masters.md';
import plSystemCreator from './pl/05-system-creator.md';
import plDiceAndChat from './pl/06-dice-and-chat.md';
import enHome from './en/README.md';
import enGettingStarted from './en/01-getting-started.md';
import enGameScreen from './en/02-game-screen.md';
import enForPlayers from './en/03-for-players.md';
import enForGameMasters from './en/04-for-game-masters.md';
import enSystemCreator from './en/05-system-creator.md';
import enDiceAndChat from './en/06-dice-and-chat.md';

// Page order is the sidebar order. `slug` is the URL segment (/help/<slug>), `file` the Markdown
// file name, identical in both language folders.
export const HELP_PAGES = [
  { slug: 'home', file: 'README.md' },
  { slug: 'getting-started', file: '01-getting-started.md' },
  { slug: 'game-screen', file: '02-game-screen.md' },
  { slug: 'for-players', file: '03-for-players.md' },
  { slug: 'for-game-masters', file: '04-for-game-masters.md' },
  { slug: 'system-creator', file: '05-system-creator.md' },
  { slug: 'dice-and-chat', file: '06-dice-and-chat.md' },
];

export const HELP_LANGUAGES = ['pl', 'en'];

const SOURCES = {
  pl: {
    home: plHome,
    'getting-started': plGettingStarted,
    'game-screen': plGameScreen,
    'for-players': plForPlayers,
    'for-game-masters': plForGameMasters,
    'system-creator': plSystemCreator,
    'dice-and-chat': plDiceAndChat,
  },
  en: {
    home: enHome,
    'getting-started': enGettingStarted,
    'game-screen': enGameScreen,
    'for-players': enForPlayers,
    'for-game-masters': enForGameMasters,
    'system-creator': enSystemCreator,
    'dice-and-chat': enDiceAndChat,
  },
};

export const isHelpPage = (slug) => HELP_PAGES.some(page => page.slug === slug);

// i18next may report a regional code ('pl-PL') or a language the guide does not have; anything
// that is not Polish falls back to English, the app's default language.
export const helpLanguage = (language) => (String(language || '').toLowerCase().startsWith('pl') ? 'pl' : 'en');

export const helpSourceUrl = (language, slug) => SOURCES[helpLanguage(language)][slug];

// A help reference is '<slug>' or '<slug>#<section-id>', e.g. 'system-creator#formulas'.
// Section ids are the explicit {#id} anchors in the Markdown headings, shared by both languages,
// so one reference works whatever language the reader has.
export const helpHref = (ref) => {
  if (!ref) return '/help';
  const [slug, section] = ref.split('#');
  const path = slug === 'home' ? '/help' : `/help/${slug}`;
  return section ? `${path}#${section}` : path;
};

const FILE_TO_SLUG = Object.fromEntries(HELP_PAGES.map(page => [page.file, page.slug]));

// The guide links pages the way a Markdown viewer expects ('05-system-creator.md#formulas'), so
// the files stay readable on GitHub. In the app such a link becomes a /help route; every other
// link is returned untouched.
export const rewriteGuideLink = (href) => {
  if (!href) return href;
  const match = href.match(/^(?:\.\/)?([\w-]+\.md)(#[\w-]+)?$/);
  if (!match || !FILE_TO_SLUG[match[1]]) return href;
  return helpHref(`${FILE_TO_SLUG[match[1]]}${match[2] || ''}`);
};

const ANCHOR = /\s*\{#([a-z0-9-]+)\}\s*$/;

// Splits '## Map controls {#map-controls}' style heading text into the visible text and the id.
export const splitHeadingAnchor = (text) => {
  const match = String(text).match(ANCHOR);
  return match ? { text: String(text).replace(ANCHOR, ''), id: match[1] } : { text: String(text), id: null };
};

// The headings of one Markdown page, in order, for the sidebar's section list and for tests.
// Lines inside fenced code blocks are skipped.
export const parseHeadings = (markdown) => {
  const headings = [];
  let inFence = false;
  String(markdown).split('\n').forEach(line => {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) return;
    const { text, id } = splitHeadingAnchor(match[2]);
    headings.push({ level: match[1].length, text, id });
  });
  return headings;
};

// Fetched pages stay in memory for the life of the tab: switching pages back and forth or
// toggling the language does not hit the network twice.
const cache = new Map();

export const loadHelpMarkdown = (language, slug) => {
  const url = helpSourceUrl(language, slug);
  if (!url) return Promise.reject(new Error(`Unknown help page: ${slug}`));
  if (!cache.has(url)) {
    const request = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`Help page ${slug} failed to load (${response.status})`);
        return response.text();
      })
      .catch(error => {
        cache.delete(url); // a failed load is retried next time instead of being cached
        throw error;
      });
    cache.set(url, request);
  }
  return cache.get(url);
};
