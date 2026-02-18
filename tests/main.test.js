const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const { normalizeDiagramTypeKeyword_ } = require('../main.js');

describe('normalizeDiagramTypeKeyword_', () => {
  it('should return empty string for null or undefined', () => {
    assert.strictEqual(normalizeDiagramTypeKeyword_(null), '');
    assert.strictEqual(normalizeDiagramTypeKeyword_(undefined), '');
  });

  it('should return empty string for empty string', () => {
    assert.strictEqual(normalizeDiagramTypeKeyword_(''), '');
    assert.strictEqual(normalizeDiagramTypeKeyword_('   '), '');
  });

  it('should return empty string for "auto"', () => {
    assert.strictEqual(normalizeDiagramTypeKeyword_('auto'), '');
    assert.strictEqual(normalizeDiagramTypeKeyword_('AUTO'), '');
    assert.strictEqual(normalizeDiagramTypeKeyword_(' Auto '), '');
  });

  it('should normalize known types correctly', () => {
    const cases = [
      ['flowchart', 'flowchart'],
      ['graph', 'flowchart'],
      ['sequenceDiagram', 'sequenceDiagram'],
      ['sequencediagram', 'sequenceDiagram'],
      ['classDiagram', 'classDiagram'],
      ['classdiagram', 'classDiagram'],
      ['stateDiagram-v2', 'stateDiagram-v2'],
      ['statediagram-v2', 'stateDiagram-v2'],
      ['erDiagram', 'erDiagram'],
      ['erdiagram', 'erDiagram'],
      ['gitGraph', 'gitGraph'],
      ['gitgraph', 'gitGraph'],
      ['C4Context', 'C4Context'],
      ['c4context', 'C4Context'],
      ['C4Container', 'C4Container'],
      ['c4container', 'C4Container'],
      ['C4Component', 'C4Component'],
      ['c4component', 'C4Component'],
      ['C4Dynamic', 'C4Dynamic'],
      ['c4dynamic', 'C4Dynamic'],
      ['C4Deployment', 'C4Deployment'],
      ['c4deployment', 'C4Deployment'],
      ['journey', 'journey'],
      ['gantt', 'gantt'],
      ['pie', 'pie'],
      ['mindmap', 'mindmap'],
      ['timeline', 'timeline'],
    ];

    cases.forEach(([input, expected]) => {
      assert.strictEqual(normalizeDiagramTypeKeyword_(input), expected, `Failed for input: ${input}`);
    });
  });

  it('should handle whitespace and extra text', () => {
    assert.strictEqual(normalizeDiagramTypeKeyword_('  flowchart  '), 'flowchart');
    assert.strictEqual(normalizeDiagramTypeKeyword_('graph TD'), 'flowchart');
    assert.strictEqual(normalizeDiagramTypeKeyword_('sequenceDiagram details'), 'sequenceDiagram');
  });

  it('should return the first word for unknown types', () => {
    assert.strictEqual(normalizeDiagramTypeKeyword_('unknown'), 'unknown');
    assert.strictEqual(normalizeDiagramTypeKeyword_('customType extra'), 'customType');
  });
});
