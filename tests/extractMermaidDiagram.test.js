const test = require('node:test');
const assert = require('node:assert');
const { extractMermaidDiagram_ } = require('../main.js');

test('extractMermaidDiagram_', async (t) => {
    await t.test('should extract from markdown code block', () => {
        const input = '```mermaid\nflowchart TD\nA-->B\n```';
        const expected = 'flowchart TD\nA-->B';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should extract from markdown code block with text around', () => {
        const input = 'Here is the diagram:\n```mermaid\nflowchart TD\nA-->B\n```\nEnd of diagram.';
        // Note: Current implementation removes fences but includes trailing text
        const expected = 'flowchart TD\nA-->B\n\nEnd of diagram.';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should extract plain text starting with keyword', () => {
        const input = 'flowchart TD\nA-->B';
        const expected = 'flowchart TD\nA-->B';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should extract plain text with preceding text on new line', () => {
        const input = 'Here is a diagram\nflowchart TD\nA-->B';
        const expected = 'flowchart TD\nA-->B';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should decode HTML entities', () => {
        const input = 'flowchart TD\nA--&gt;B';
        const expected = 'flowchart TD\nA-->B';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should normalize whitespace', () => {
        // \u3000 is Ideographic Space (full-width space)
        const input = 'flowchart\u3000TD\nA-->B';
        const expected = 'flowchart TD\nA-->B';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should handle various diagram types', async (t) => {
        const types = [
            'flowchart', 'graph', 'sequenceDiagram', 'gantt', 'classDiagram', 'stateDiagram-v2',
            'erDiagram', 'journey', 'mindmap', 'timeline', 'pie', 'gitGraph',
            'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'
        ];

        for (const type of types) {
             const input = `Here is a ${type}\n${type}\n...`;
             const expected = `${type}\n...`;
             assert.strictEqual(extractMermaidDiagram_(input), expected, `Failed for ${type}`);
        }
    });

    await t.test('should return trimmed raw text if no keyword found', () => {
        const input = 'This is just some text without a diagram.';
        const expected = 'This is just some text without a diagram.';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should handle null and undefined', () => {
        assert.strictEqual(extractMermaidDiagram_(null), '');
        assert.strictEqual(extractMermaidDiagram_(undefined), '');
    });

    await t.test('should handle empty string', () => {
        assert.strictEqual(extractMermaidDiagram_(''), '');
    });

    await t.test('should handle non-string input', () => {
        assert.strictEqual(extractMermaidDiagram_(123), '123');
    });
});
