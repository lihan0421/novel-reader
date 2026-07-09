import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapText, stripTags } from '../lib/textUtils.js';

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
