const test = require('node:test');
const assert = require('node:assert');
const { detectCodeDiagramTypeKeyword_ } = require('../main.js');

test('detectCodeDiagramTypeKeyword_', async (t) => {
    await t.test('should detect standard diagram types', () => {
        assert.strictEqual(detectCodeDiagramTypeKeyword_('flowchart TD'), 'flowchart');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('sequenceDiagram'), 'sequenceDiagram');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('classDiagram'), 'classDiagram');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('stateDiagram-v2'), 'stateDiagram-v2');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('erDiagram'), 'erDiagram');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('gantt'), 'gantt');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('pie'), 'pie');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('gitGraph'), 'gitGraph');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('journey'), 'journey');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('mindmap'), 'mindmap');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('timeline'), 'timeline');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('C4Context'), 'C4Context');
    });

    await t.test('should normalize diagram types', () => {
        assert.strictEqual(detectCodeDiagramTypeKeyword_('graph TD'), 'flowchart');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('statediagram-v2'), 'stateDiagram-v2');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('sequencediagram'), 'sequenceDiagram');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('classdiagram'), 'classDiagram');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('erdiagram'), 'erDiagram');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('gitgraph'), 'gitGraph');
    });

    await t.test('should handle C4 diagram types case-insensitively', () => {
        assert.strictEqual(detectCodeDiagramTypeKeyword_('c4context'), 'C4Context');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('c4container'), 'C4Container');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('c4component'), 'C4Component');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('c4dynamic'), 'C4Dynamic');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('c4deployment'), 'C4Deployment');
    });

    await t.test('should handle leading whitespace', () => {
        assert.strictEqual(detectCodeDiagramTypeKeyword_('\nflowchart TD'), 'flowchart');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('   sequenceDiagram'), 'sequenceDiagram');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('\tgraph TD'), 'flowchart');
    });

    await t.test('should handle empty or null input', () => {
        assert.strictEqual(detectCodeDiagramTypeKeyword_(null), '');
        assert.strictEqual(detectCodeDiagramTypeKeyword_(undefined), '');
        assert.strictEqual(detectCodeDiagramTypeKeyword_(''), '');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('   '), '');
    });

    await t.test('should handle inputs without a valid keyword', () => {
        // If it starts with something else that looks like a word, it returns that word (unless normalized)
        assert.strictEqual(detectCodeDiagramTypeKeyword_('UnknownType'), 'UnknownType');
        assert.strictEqual(detectCodeDiagramTypeKeyword_('123Start'), ''); // Regex expects [A-Za-z] first
        assert.strictEqual(detectCodeDiagramTypeKeyword_('%% Comment'), ''); // Regex expects [A-Za-z] first
    });

    await t.test('should handle auto as empty', () => {
         assert.strictEqual(detectCodeDiagramTypeKeyword_('auto'), '');
    });
});
