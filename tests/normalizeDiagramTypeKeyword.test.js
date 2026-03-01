const test = require('node:test');
const assert = require('node:assert');
const { normalizeDiagramTypeKeyword_ } = require('../main.js');

test('normalizeDiagramTypeKeyword_', async (t) => {
    await t.test('should handle null and undefined', () => {
        assert.strictEqual(normalizeDiagramTypeKeyword_(null), '');
        assert.strictEqual(normalizeDiagramTypeKeyword_(undefined), '');
    });

    await t.test('should handle empty or whitespace strings', () => {
        assert.strictEqual(normalizeDiagramTypeKeyword_(''), '');
        assert.strictEqual(normalizeDiagramTypeKeyword_('   '), '');
    });

    await t.test('should handle "auto" case-insensitively', () => {
        assert.strictEqual(normalizeDiagramTypeKeyword_('auto'), '');
        assert.strictEqual(normalizeDiagramTypeKeyword_('AUTO'), '');
        assert.strictEqual(normalizeDiagramTypeKeyword_(' Auto '), '');
    });

    await t.test('should normalize graph and flowchart to flowchart', () => {
        assert.strictEqual(normalizeDiagramTypeKeyword_('graph'), 'flowchart');
        assert.strictEqual(normalizeDiagramTypeKeyword_('flowchart'), 'flowchart');
        assert.strictEqual(normalizeDiagramTypeKeyword_('GRAPH'), 'flowchart');
        assert.strictEqual(normalizeDiagramTypeKeyword_('FlowChart'), 'flowchart');
    });

    await t.test('should normalize other specific diagram types', () => {
        assert.strictEqual(normalizeDiagramTypeKeyword_('sequencediagram'), 'sequenceDiagram');
        assert.strictEqual(normalizeDiagramTypeKeyword_('classdiagram'), 'classDiagram');
        assert.strictEqual(normalizeDiagramTypeKeyword_('statediagram-v2'), 'stateDiagram-v2');
        assert.strictEqual(normalizeDiagramTypeKeyword_('erdiagram'), 'erDiagram');
        assert.strictEqual(normalizeDiagramTypeKeyword_('gitgraph'), 'gitGraph');
        assert.strictEqual(normalizeDiagramTypeKeyword_('c4context'), 'C4Context');
        assert.strictEqual(normalizeDiagramTypeKeyword_('c4container'), 'C4Container');
        assert.strictEqual(normalizeDiagramTypeKeyword_('c4component'), 'C4Component');
        assert.strictEqual(normalizeDiagramTypeKeyword_('c4dynamic'), 'C4Dynamic');
        assert.strictEqual(normalizeDiagramTypeKeyword_('c4deployment'), 'C4Deployment');
        assert.strictEqual(normalizeDiagramTypeKeyword_('journey'), 'journey');
        assert.strictEqual(normalizeDiagramTypeKeyword_('gantt'), 'gantt');
        assert.strictEqual(normalizeDiagramTypeKeyword_('pie'), 'pie');
        assert.strictEqual(normalizeDiagramTypeKeyword_('mindmap'), 'mindmap');
        assert.strictEqual(normalizeDiagramTypeKeyword_('timeline'), 'timeline');
    });

    await t.test('should handle case-insensitivity for all types', () => {
        assert.strictEqual(normalizeDiagramTypeKeyword_('SEQUENCEdiagram'), 'sequenceDiagram');
        assert.strictEqual(normalizeDiagramTypeKeyword_('GITgraph'), 'gitGraph');
    });

    await t.test('should return the first word if type is unrecognized', () => {
        assert.strictEqual(normalizeDiagramTypeKeyword_('unknown'), 'unknown');
        assert.strictEqual(normalizeDiagramTypeKeyword_('UnknownType'), 'UnknownType');
        assert.strictEqual(normalizeDiagramTypeKeyword_('flowchart TD'), 'flowchart');
        assert.strictEqual(normalizeDiagramTypeKeyword_('custom diagram'), 'custom');
    });

    await t.test('should handle leading/trailing whitespace with recognized types', () => {
        assert.strictEqual(normalizeDiagramTypeKeyword_('  flowchart  '), 'flowchart');
        assert.strictEqual(normalizeDiagramTypeKeyword_('\ngitgraph\t'), 'gitGraph');
    });
});
