const test = require('node:test');
const assert = require('node:assert');
const { sanitizeFlowchartMermaid_ } = require('../main.js');

test('sanitizeFlowchartMermaid_', async (t) => {
  await t.test('should handle null or undefined input', () => {
    assert.strictEqual(sanitizeFlowchartMermaid_(null), '');
    assert.strictEqual(sanitizeFlowchartMermaid_(undefined), '');
  });

  await t.test('should normalize whitespace and remove carriage returns', () => {
    const input = 'A\r --> B\u3000';
    const expected = 'A --> B';
    assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should replace semicolons with newlines', () => {
    const input = 'A-->B; B-->C;';
    // The function replaces "; " with "\n", so " B" becomes "B"
    // And it trims the result, removing trailing newline.
    const expected = 'A-->B\nB-->C';
    assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should fix subgraph syntax with style attachment', () => {
    const input = 'subgraph["Title"]:::class';
    const expected = 'subgraph SG1["Title"]';
    assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should fix subgraph with square brackets and ID', () => {
      const input = 'subgraph MyID["My Title"]';
      const expected = 'subgraph MyID["My Title"]';
      assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should separate fused lines', () => {
     const input = 'node5subgraph';
     const expected = 'node5\nsubgraph';
     assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should fix escaped quotes', () => {
      const input = 'id[\\"Label\\"]';
      // Escaped quotes are converted to single quotes, and wrapped in double quotes
      const expected = 'id["\'Label\'"]';
      assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should normalize edge labels', () => {
      const input = 'A -- Label -- B';
      const expected = 'A -->|Label| B';
      assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should split one-liner flowchart definition', () => {
      const input = 'flowchart LR A-->B';
      const expected = 'flowchart LR\nA-->B';
      assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should fix decision nodes (rhombus)', () => {
      const input = 'id{"Label"}';
      const expected = 'id{Label}';
      assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should fix unclosed quotes', () => {
     const input = 'id["Label';
     const expected = 'id["Label"';
     assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should handle japanese text in labels', () => {
     const input = 'id["テスト"]';
     const expected = 'id["テスト"]';
     assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

  await t.test('should normalize single node definitions', () => {
     // Rule 8: standalone node definition
     const input = 'myNode "My Label"';
     // It adds brackets and escapes label.
     const expected = 'myNode["My Label"]';
     assert.strictEqual(sanitizeFlowchartMermaid_(input), expected);
  });

});
