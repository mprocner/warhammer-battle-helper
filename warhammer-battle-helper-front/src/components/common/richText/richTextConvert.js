// Read-time conversion between the two formats a long text field can hold (PLAYRPG-256). The
// template flag decides how a field renders, but the stored value keeps whatever format it was
// last saved in until the player edits it — so flipping the flag never needs a data migration.

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Each line becomes its own paragraph, blank lines included, so the line breaks a player typed
// into the plain textarea survive the switch to the editor.
export function plainToHtml(text) {
  if (!text) return '';
  return text.split(/\r?\n/).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

// Elements whose text is one line of the plain version. Lists and quotes are containers: their
// lines come from the paragraphs (or bare text) inside them.
const LINE_ELEMENTS = new Set(['P', 'H1', 'H2', 'H3', 'PRE']);

const inlineText = (node) => {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeName === 'BR') out += '\n';
    else if (child.nodeType === Node.TEXT_NODE) out += child.textContent;
    else out += inlineText(child);
  });
  return out;
};

const collectLines = (node, lines) => {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent.trim()) lines.push(child.textContent);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE || child.nodeName === 'HR') return;
    if (LINE_ELEMENTS.has(child.nodeName)) lines.push(inlineText(child));
    else collectLines(child, lines);
  });
};

// Parsed by DOMParser, which builds an inert document: nothing in it loads or runs.
export function htmlToPlain(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines = [];
  collectLines(doc.body, lines);
  return lines.join('\n');
}

// The editor always wraps content in a block element, so its output starts with one. Plain text
// that happens to start with "<" ("<3", "<pizza>") does not match a block tag.
const BLOCK_START = /^\s*<(p|h[1-3]|ul|ol|li|blockquote|pre|hr)[\s>/]/i;

export function looksLikeHtml(s) {
  return !!s && BLOCK_START.test(s);
}
