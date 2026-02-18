const test = require('node:test');
const assert = require('node:assert');
const { decodeHtmlEntities_ } = require('../main.js');

test('decodeHtmlEntities_', async (t) => {
    await t.test('should decode basic HTML entities', () => {
        assert.strictEqual(decodeHtmlEntities_('&quot;'), '"');
        assert.strictEqual(decodeHtmlEntities_('&#34;'), '"');
        assert.strictEqual(decodeHtmlEntities_('&apos;'), "'");
        assert.strictEqual(decodeHtmlEntities_('&#39;'), "'");
        assert.strictEqual(decodeHtmlEntities_('&lt;'), '<');
        assert.strictEqual(decodeHtmlEntities_('&gt;'), '>');
        assert.strictEqual(decodeHtmlEntities_('&amp;'), '&');
        assert.strictEqual(decodeHtmlEntities_('&nbsp;'), ' ');
    });

    await t.test('should decode multiple occurrences', () => {
        assert.strictEqual(decodeHtmlEntities_('&lt;b&gt;Hello&lt;/b&gt;'), '<b>Hello</b>');
        assert.strictEqual(decodeHtmlEntities_('&quot;&quot;'), '""');
    });

    await t.test('should decode mixed entities', () => {
        assert.strictEqual(decodeHtmlEntities_('&lt;a href=&quot;test&quot;&gt;link&lt;/a&gt; &amp; more'), '<a href="test">link</a> & more');
    });

    await t.test('should return same string if no entities', () => {
        assert.strictEqual(decodeHtmlEntities_('Hello World'), 'Hello World');
        assert.strictEqual(decodeHtmlEntities_('123'), '123');
    });

    await t.test('should handle null and undefined', () => {
        assert.strictEqual(decodeHtmlEntities_(null), '');
        assert.strictEqual(decodeHtmlEntities_(undefined), '');
    });

    await t.test('should handle empty string', () => {
        assert.strictEqual(decodeHtmlEntities_(''), '');
    });

    await t.test('should handle non-string inputs', () => {
        assert.strictEqual(decodeHtmlEntities_(123), '123');
        assert.strictEqual(decodeHtmlEntities_(true), 'true');
        assert.strictEqual(decodeHtmlEntities_({}), '[object Object]');
    });
});
