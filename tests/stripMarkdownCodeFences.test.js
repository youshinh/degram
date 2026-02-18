const { test } = require('node:test');
const assert = require('node:assert');
const { stripMarkdownCodeFences_ } = require('../main.js');

test('stripMarkdownCodeFences_ should strip basic code fences', (t) => {
    const input = '```\ncode\n```';
    const expected = 'code';
    assert.strictEqual(stripMarkdownCodeFences_(input), expected);
});

test('stripMarkdownCodeFences_ should strip code fences with language', (t) => {
    const input = '```mermaid\ncode\n```';
    const expected = 'code';
    assert.strictEqual(stripMarkdownCodeFences_(input), expected);
});

test('stripMarkdownCodeFences_ should strip code fences with language case insensitive', (t) => {
    const input = '```MERMAID\ncode\n```';
    const expected = 'code';
    assert.strictEqual(stripMarkdownCodeFences_(input), expected);
});

test('stripMarkdownCodeFences_ should handle leading/trailing whitespace around fences', (t) => {
    const input = '   ```mermaid   \ncode\n   ```   ';
    const expected = 'code';
    assert.strictEqual(stripMarkdownCodeFences_(input), expected);
});

test('stripMarkdownCodeFences_ should handle null input', (t) => {
    assert.strictEqual(stripMarkdownCodeFences_(null), '');
});

test('stripMarkdownCodeFences_ should handle undefined input', (t) => {
    assert.strictEqual(stripMarkdownCodeFences_(undefined), '');
});

test('stripMarkdownCodeFences_ should return plain string unchanged', (t) => {
    const input = 'just some text';
    assert.strictEqual(stripMarkdownCodeFences_(input), input);
});

test('stripMarkdownCodeFences_ should handle multi-line content', (t) => {
    const input = '```mermaid\nline1\nline2\nline3\n```';
    const expected = 'line1\nline2\nline3';
    assert.strictEqual(stripMarkdownCodeFences_(input), expected);
});

test('stripMarkdownCodeFences_ should handle content with empty lines', (t) => {
    const input = '```mermaid\n\ncode\n\n```';
    const expected = 'code';
    assert.strictEqual(stripMarkdownCodeFences_(input), expected);
});

test('stripMarkdownCodeFences_ should strip fences even without content', (t) => {
    const input = '```mermaid\n```';
    assert.strictEqual(stripMarkdownCodeFences_(input), '');
});

test('stripMarkdownCodeFences_ should preserve internal backticks', (t) => {
    const input = '```mermaid\ncode with `backticks` inside\n```';
    const expected = 'code with `backticks` inside';
    assert.strictEqual(stripMarkdownCodeFences_(input), expected);
});
