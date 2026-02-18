const test = require('node:test');
const assert = require('node:assert');
const { escapeFlowLabel_ } = require('../main.js');

test('escapeFlowLabel_', async (t) => {
    await t.test('should handle null and undefined', () => {
        assert.strictEqual(escapeFlowLabel_(null), '');
        assert.strictEqual(escapeFlowLabel_(undefined), '');
    });

    await t.test('should return basic strings unchanged', () => {
        assert.strictEqual(escapeFlowLabel_('Hello World'), 'Hello World');
        assert.strictEqual(escapeFlowLabel_('123'), '123');
    });

    await t.test('should normalize fancy double quotes to single quotes', () => {
        // All fancy double quotes are first converted to ", then later " is converted to '
        assert.strictEqual(escapeFlowLabel_('“Hello”'), "'Hello'");
        assert.strictEqual(escapeFlowLabel_('„Hello”'), "'Hello'");
        assert.strictEqual(escapeFlowLabel_('‟Hello”'), "'Hello'");
        // assert.strictEqual(escapeFlowLabel_('❝Hello❞'), "'Hello'"); // ❝ and ❞ are not in the regex range in main.js
    });

    await t.test('should normalize fancy single quotes to single quotes', () => {
        assert.strictEqual(escapeFlowLabel_('‘Hello’'), "'Hello'");
        assert.strictEqual(escapeFlowLabel_('‚Hello’'), "'Hello'"); // ‚ is \u201A which is in the regex
        assert.strictEqual(escapeFlowLabel_('‛Hello’'), "'Hello'"); // ‛ is \u201B which is in the regex
        // assert.strictEqual(escapeFlowLabel_('❛Hello❜'), "'Hello'"); // ❛ and ❜ are not in the regex range in main.js
    });

    await t.test('should remove BOM', () => {
        assert.strictEqual(escapeFlowLabel_('\uFEFFHello'), 'Hello');
    });

    await t.test('should replace escaped double quotes with single quotes', () => {
        assert.strictEqual(escapeFlowLabel_('Hello \\"World\\"'), "Hello 'World'");
        assert.strictEqual(escapeFlowLabel_('Hello \\\\"World\\\\"'), "Hello 'World'");
    });

    await t.test('should replace double quotes with single quotes', () => {
        assert.strictEqual(escapeFlowLabel_('Hello "World"'), "Hello 'World'");
    });

    await t.test('should collapse multiple single quotes', () => {
        assert.strictEqual(escapeFlowLabel_("Hello ''World''"), "Hello 'World'");
        assert.strictEqual(escapeFlowLabel_("Hello '''World'''"), "Hello 'World'");
    });

    await t.test('should replace newlines with spaces', () => {
        assert.strictEqual(escapeFlowLabel_('Hello\nWorld'), 'Hello World');
        assert.strictEqual(escapeFlowLabel_('Hello\r\nWorld'), 'Hello World');
        assert.strictEqual(escapeFlowLabel_('Hello\n\nWorld'), 'Hello World');
    });

    await t.test('should trim whitespace', () => {
        assert.strictEqual(escapeFlowLabel_('  Hello World  '), 'Hello World');
    });

    await t.test('should handle complex mixed cases', () => {
        const input = '\uFEFF  “Hello”\nWorld  "Test"  ';
        const expected = "'Hello' World  'Test'";
        assert.strictEqual(escapeFlowLabel_(input), expected);
    });
});
