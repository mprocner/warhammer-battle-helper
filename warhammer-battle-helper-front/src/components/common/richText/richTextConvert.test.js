import { plainToHtml, htmlToPlain, looksLikeHtml } from './richTextConvert';

describe('plainToHtml', () => {
  test('empty stays empty', () => {
    expect(plainToHtml('')).toBe('');
    expect(plainToHtml(undefined)).toBe('');
  });
  test('each line becomes a paragraph, blank lines included', () => {
    expect(plainToHtml('one\n\nthree')).toBe('<p>one</p><p></p><p>three</p>');
    expect(plainToHtml('a\r\nb')).toBe('<p>a</p><p>b</p>');
  });
  test('markup characters are escaped, not interpreted', () => {
    expect(plainToHtml('a < b & "c" <script>')).toBe('<p>a &lt; b &amp; &quot;c&quot; &lt;script&gt;</p>');
  });
});

describe('htmlToPlain', () => {
  test('empty stays empty', () => {
    expect(htmlToPlain('')).toBe('');
  });
  test('paragraphs and headings become lines', () => {
    expect(htmlToPlain('<h2>Title</h2><p>one</p><p></p><p>two</p>')).toBe('Title\none\n\ntwo');
  });
  test('a hard break becomes a newline and marks disappear', () => {
    expect(htmlToPlain('<p>a<br>b <strong>c</strong></p>')).toBe('a\nb c');
  });
  test('list items and quotes become lines', () => {
    expect(htmlToPlain('<ul><li><p>x</p></li><li><p>y</p></li></ul><blockquote><p>q</p></blockquote>'))
      .toBe('x\ny\nq');
  });
  test('entities are decoded', () => {
    expect(htmlToPlain('<p>a &lt; b &amp; c</p>')).toBe('a < b & c');
  });
  test('a divider is dropped', () => {
    expect(htmlToPlain('<p>a</p><hr><p>b</p>')).toBe('a\nb');
  });
});

describe('looksLikeHtml', () => {
  test.each([
    ['<p>x</p>', true],
    ['  <h1>t</h1>', true],
    ['<ul><li><p>x</p></li></ul>', true],
    ['<blockquote><p>q</p></blockquote>', true],
    ['', false],
    ['plain text', false],
    ['a < b', false],
    ['<3 you', false],
    ['<pizza>', false],
  ])('%p → %p', (input, expected) => {
    expect(looksLikeHtml(input)).toBe(expected);
  });
});

test('plain text survives a round trip', () => {
  const text = 'one\n\na < b & c';
  expect(htmlToPlain(plainToHtml(text))).toBe(text);
});
