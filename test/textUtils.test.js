import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapText, stripTags, decodeEntities, stripControlChars } from '../lib/textUtils.js';

test('wraps CJK text by visual width (2 cols per char)', () => {
  const lines = wrapText('你好世界你好世界你好世界', 10);
  assert.equal(lines[0], '你好世界你');
  assert.equal(lines[1], '好世界你好');
});

test('preserves blank lines as paragraph breaks', () => {
  const lines = wrapText('abc\n\ndef', 10);
  assert.deepEqual(lines, ['abc', '', 'def']);
});

test('wraps ascii text by character count', () => {
  const lines = wrapText('abcdefghij', 4);
  assert.deepEqual(lines, ['abcd', 'efgh', 'ij']);
});

test('stripTags removes html tags', () => {
  assert.equal(stripTags('<p>hello <b>world</b></p>'), 'hello world');
});

test('decodeEntities handles named, decimal and hex entities', () => {
  assert.equal(decodeEntities('AT&amp;T'), 'AT&T');
  assert.equal(decodeEntities('she said&hellip;'), 'she said…');
  assert.equal(decodeEntities('&#20320;&#x597d;'), '你好');
});

test('wraps em-dash and ellipsis as double-width', () => {
  const lines = wrapText('你好——世界', 8);
  assert.equal(lines[0], '你好——');
});

test('stripControlChars removes escape sequences but keeps newlines', () => {
  assert.equal(stripControlChars('a\x1b[2mb\nc'), 'a[2mb\nc');
});
