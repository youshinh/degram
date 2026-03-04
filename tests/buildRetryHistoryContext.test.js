const test = require('node:test');
const assert = require('node:assert');
const { buildRetryHistoryContext_ } = require('../main.js');

test('buildRetryHistoryContext_', async (t) => {
    await t.test('should return empty string for null, undefined, or empty input', () => {
        assert.strictEqual(buildRetryHistoryContext_(null), '');
        assert.strictEqual(buildRetryHistoryContext_(undefined), '');
        assert.strictEqual(buildRetryHistoryContext_(''), '');
        assert.strictEqual(buildRetryHistoryContext_('   '), '');
    });

    await t.test('should return empty string for invalid JSON', () => {
        assert.strictEqual(buildRetryHistoryContext_('{invalid-json}'), '');
        assert.strictEqual(buildRetryHistoryContext_('not-json'), '');
    });

    await t.test('should return empty string for non-array JSON', () => {
        assert.strictEqual(buildRetryHistoryContext_('{}'), '');
        assert.strictEqual(buildRetryHistoryContext_('123'), '');
        assert.strictEqual(buildRetryHistoryContext_('"string"'), '');
        assert.strictEqual(buildRetryHistoryContext_('true'), '');
    });

    await t.test('should return empty string for empty array', () => {
        assert.strictEqual(buildRetryHistoryContext_('[]'), '');
    });

    await t.test('should format a single retry attempt correctly', () => {
        const history = [{ model: 'gpt-4', error: 'syntax error' }];
        const result = buildRetryHistoryContext_(JSON.stringify(history));
        assert.ok(result.includes('# PREVIOUS FAILED ATTEMPTS'));
        assert.ok(result.includes('Attempt 1 (gpt-4): syntax error'));
    });

    await t.test('should format multiple retry attempts correctly', () => {
        const history = [
            { model: 'model-a', error: 'error 1' },
            { model: 'model-b', error: 'error 2' }
        ];
        const result = buildRetryHistoryContext_(JSON.stringify(history));
        assert.ok(result.includes('Attempt 1 (model-a): error 1'));
        assert.ok(result.includes('Attempt 2 (model-b): error 2'));
    });

    await t.test('should limit to the last 3 attempts', () => {
        const history = [
            { model: 'm1', error: 'e1' },
            { model: 'm2', error: 'e2' },
            { model: 'm3', error: 'e3' },
            { model: 'm4', error: 'e4' }
        ];
        const result = buildRetryHistoryContext_(JSON.stringify(history));

        // Ensure m1/e1 (the first attempt) is not in the output
        assert.strictEqual(result.includes('m1'), false);
        assert.strictEqual(result.includes('e1'), false);

        // Ensure m2, m3, m4 are present.
        // Note: The function re-indexes the displayed attempts starting from 1.
        assert.ok(result.includes('Attempt 1 (m2): e2'));
        assert.ok(result.includes('Attempt 2 (m3): e3'));
        assert.ok(result.includes('Attempt 3 (m4): e4'));
    });

    await t.test('should handle missing model or error fields', () => {
        const history = [{}];
        const result = buildRetryHistoryContext_(JSON.stringify(history));
        assert.ok(result.includes('Attempt 1 (unknown-model): unknown-error'));
    });

    await t.test('should normalize whitespace in error messages', () => {
        const history = [{ model: 'm', error: 'error   with  \n  newlines' }];
        const result = buildRetryHistoryContext_(JSON.stringify(history));
        assert.ok(result.includes('error with newlines'));
    });

    await t.test('should truncate long error messages', () => {
        const longError = 'a'.repeat(300);
        const history = [{ model: 'm', error: longError }];
        const result = buildRetryHistoryContext_(JSON.stringify(history));
        const expected = longError.slice(0, 220);
        assert.ok(result.includes(expected));
        assert.strictEqual(result.includes(longError), false);
    });
});
