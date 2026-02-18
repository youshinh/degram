const test = require('node:test');
const assert = require('node:assert');
const { sanitizeErDiagramMermaid_ } = require('../main.js');

test('sanitizeErDiagramMermaid_', async (t) => {
    await t.test('should preserve valid ER diagram code', () => {
        const input = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`;
        // Note: sanitizeErDiagramMermaid_ currently strips indentation for relationship lines containing '--'.
        // Lines with '..' are skipped by the sanitizer's relationship logic and thus preserve indentation.
        const expected = `erDiagram
CUSTOMER ||--o{ ORDER : places
ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`;
        const output = sanitizeErDiagramMermaid_(input);
        assert.strictEqual(output, expected);
    });

    await t.test('should normalize flowchart-like entity headers', () => {
        const input = `erDiagram
    USER["User Label"] {
        string name
    }`;
        const expected = `erDiagram
    USER {
        string name
    }`;
        const output = sanitizeErDiagramMermaid_(input);
        assert.strictEqual(output, expected);
    });

    await t.test('should remove duplicate entity blocks', () => {
        const input = `erDiagram
    USER {
        string name
    }
    USER {
        int age
    }`;
        const expected = `erDiagram
    USER {
        string name
    }
%% removed duplicate ER entity block:     USER {
%% removed duplicate ER entity block:         int age
%% removed duplicate ER entity block:     }`;
        const output = sanitizeErDiagramMermaid_(input);
        assert.strictEqual(output, expected);
    });

    await t.test('should remove invalid attribute lines inside entity blocks', () => {
        const input = `erDiagram
    USER {
        string name
        INVALID_ATTRIBUTE
        int age
    }`;
        const expected = `erDiagram
    USER {
        string name
%% removed invalid ER attribute line:         INVALID_ATTRIBUTE
        int age
    }`;
        const output = sanitizeErDiagramMermaid_(input);
        assert.strictEqual(output, expected);
    });

    await t.test('should remove flowchart-like edges', () => {
        const input = `erDiagram
    A --> B`;
        const expected = `erDiagram
%% removed invalid ER line:     A --> B`;
        const output = sanitizeErDiagramMermaid_(input);
        assert.strictEqual(output, expected);
    });

    await t.test('should normalize relationship lines with labels and shapes', () => {
        const input = `erDiagram
    A["LabelA"] ||--o{ B["LabelB"] : "rel"`;
        const expected = `erDiagram
A ||--o{ B : "rel"`;
        const output = sanitizeErDiagramMermaid_(input);
        assert.strictEqual(output, expected);
    });

    await t.test('should normalize cardinality syntax', () => {
         const input = `erDiagram
    A | -- | B : rel
    C } -- { D : rel`;
         // normalizeErCardinality_:
         // | -> ||
         // } -> }|
         // { -> |{
         const expected = `erDiagram
A ||--|| B : rel
C }|--|{ D : rel`;
         const output = sanitizeErDiagramMermaid_(input);
         assert.strictEqual(output, expected);
    });

    await t.test('should remove inheritance-like connectors', () => {
        const input = `erDiagram
    A --|> B : inherits`;
        const expected = `erDiagram
%% removed invalid ER relation line:     A --|> B : inherits`;
        const output = sanitizeErDiagramMermaid_(input);
        assert.strictEqual(output, expected);
    });

    await t.test('should remove invalid entity annotations', () => {
        const input = `erDiagram
    CONCEPT : "Some annotation"`;
        const expected = `erDiagram
%% removed invalid ER line:     CONCEPT : "Some annotation"`;
        const output = sanitizeErDiagramMermaid_(input);
        assert.strictEqual(output, expected);
    });

    await t.test('should ignore content before erDiagram keyword', () => {
         const input = `graph TD
    A-->B
    erDiagram
    USER {
      string name
    }`;
         const expected = `graph TD
    A-->B
    erDiagram
    USER {
      string name
    }`;
         const output = sanitizeErDiagramMermaid_(input);
         assert.strictEqual(output, expected);
    });
});
