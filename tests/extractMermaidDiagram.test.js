const test = require('node:test');
const assert = require('node:assert');
const { extractMermaidDiagram_ } = require('../main.js');

test('extractMermaidDiagram_', async (t) => {
    await t.test('should extract diagram starting with keyword', () => {
        const input = 'Here is a diagram:\nflowchart TD\n  A --> B';
        const expected = 'flowchart TD\n  A --> B';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should extract diagram starting with keyword at the beginning', () => {
        const input = 'flowchart TD\n  A --> B';
        const expected = 'flowchart TD\n  A --> B';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should extract diagram even if markdown code blocks are present', () => {
        const input = '```mermaid\nflowchart TD\n  A --> B\n```';
        const expected = 'flowchart TD\n  A --> B';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should handle HTML entities', () => {
        const input = '&lt;div&gt;\nflowchart TD\n  A --&gt; B\n&lt;/div&gt;';
        // Note: decodeHtmlEntities_ is called inside extractMermaidDiagram_
        // so &gt; becomes >. But the regex search for 'flowchart' still works.
        // The function first decodes entities, then strips markdown, then looks for keyword.
        // input decoded: <div>\nflowchart TD\n  A --> B\n</div>
        // match: flowchart ...
        const expected = 'flowchart TD\n  A --> B\n</div>';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

    await t.test('should return trimmed original if no keyword found', () => {
        const input = 'Just some text without a diagram.';
        assert.strictEqual(extractMermaidDiagram_(input), input);
    });

    await t.test('should return empty string for null/undefined', () => {
        assert.strictEqual(extractMermaidDiagram_(null), '');
        assert.strictEqual(extractMermaidDiagram_(undefined), '');
    });

    await t.test('should handle multiple keywords, picking the first one found', () => {
        // "sequenceDiagram" appears first
        const input = 'Some text\nsequenceDiagram\n  A->>B: Hello\n\ngraph TD\n  C-->D';
        const expected = 'sequenceDiagram\n  A->>B: Hello\n\ngraph TD\n  C-->D';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });

     await t.test('should ignore case for keywords', () => {
        const input = 'FLOWCHART TD\n  A --> B';
        const expected = 'FLOWCHART TD\n  A --> B';
        assert.strictEqual(extractMermaidDiagram_(input), expected);
    });
});
