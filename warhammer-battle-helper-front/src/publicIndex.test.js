import fs from 'fs';
import path from 'path';
import { HELP_PAGES, helpHref } from './help/helpPages';

// public/index.html is served before React (and so before the consent banner) runs. Any
// third-party <link> or <script> in it reaches another server with the visitor's IP address
// before they have decided anything - which is how Google Fonts used to leak it.
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

const OWN_ORIGIN = 'https://playrpg.net/';

const loadedUrls = () => {
  const tags = html.match(/<(link|script|iframe|img)\b[^>]*>/gi) || [];
  return tags
    .map(tag => (tag.match(/\b(?:href|src)\s*=\s*"([^"]*)"/i) || [])[1])
    .filter(Boolean);
};

describe('public/index.html', () => {
  it('loads nothing from a third-party origin', () => {
    const external = loadedUrls().filter(url => /^(https?:)?\/\//i.test(url) && !url.startsWith(OWN_ORIGIN));
    expect(external).toEqual([]);
  });

  it('does not preconnect to Google Fonts', () => {
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });
});

describe('link preview tags', () => {
  const meta = (attr, name) => {
    const re = new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`, 'i');
    return (html.match(re) || [])[1];
  };

  it('has Open Graph and Twitter Card tags', () => {
    ['og:type', 'og:title', 'og:description', 'og:url', 'og:image', 'og:locale'].forEach(name => {
      expect(meta('property', name)).toEqual(expect.stringMatching(/\S/));
    });
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });

  // Crawlers resolve nothing relative and run no JavaScript: a relative or %PUBLIC_URL% image
  // would simply not show up in the preview.
  it('points og:image and twitter:image at an absolute URL of a file that ships in public/', () => {
    [meta('property', 'og:image'), meta('name', 'twitter:image')].forEach(url => {
      expect(url).toMatch(/^https:\/\/playrpg\.net\//);
      const file = path.join(__dirname, '..', 'public', new URL(url).pathname);
      expect(fs.existsSync(file)).toBe(true);
    });
  });
});

describe('indexing', () => {
  const publicFile = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

  it('lets search engines index the public pages', () => {
    expect(html).toContain('<meta name="robots" content="index, follow" />');
  });

  it('lists every help page in the sitemap', () => {
    const sitemap = publicFile('sitemap.xml');
    HELP_PAGES.forEach(({ slug }) => {
      expect(sitemap).toContain(`<loc>https://playrpg.net${helpHref(slug)}</loc>`);
    });
  });

  it('keeps private and token pages out of the index', () => {
    const robots = publicFile('robots.txt');
    ['/games', '/settings', '/character-sheet', '/verify-email', '/reset-password', '/join/'].forEach(route => {
      expect(robots).toContain(`Disallow: ${route}\n`);
    });
    expect(robots).toContain('Sitemap: https://playrpg.net/sitemap.xml');
  });
});
