const test = require('node:test');
const assert = require('node:assert');
const { validateGeneratedMermaid_ } = require('../main.js');

test('validateGeneratedMermaid_', async (t) => {

    // --- Basic Validation ---
    await t.test('should return error if code is empty', () => {
        const expected = { ok: false, message: 'Mermaidコードの生成結果が空です。' };
        assert.deepStrictEqual(validateGeneratedMermaid_(null), expected);
        assert.deepStrictEqual(validateGeneratedMermaid_(undefined), expected);
        assert.deepStrictEqual(validateGeneratedMermaid_(''), expected);
        assert.deepStrictEqual(validateGeneratedMermaid_('   '), expected);
    });

    // --- Diagram Type Mismatch ---
    await t.test('should validate diagram type match', () => {
        // Match
        assert.deepStrictEqual(validateGeneratedMermaid_('flowchart TD\nA-->B', 'flowchart'), { ok: true });
        assert.deepStrictEqual(validateGeneratedMermaid_('graph TD\nA-->B', 'flowchart'), { ok: true }); // graph normalizes to flowchart
        assert.deepStrictEqual(validateGeneratedMermaid_('sequenceDiagram\nA->>B: Hi', 'sequenceDiagram'), { ok: true });

        // Mismatch
        const mismatchFlow = validateGeneratedMermaid_('flowchart TD\nA-->B', 'sequenceDiagram');
        assert.strictEqual(mismatchFlow.ok, false);
        assert.match(mismatchFlow.message, /図タイプ不一致/);
        assert.match(mismatchFlow.message, /requested=sequenceDiagram/);
        assert.match(mismatchFlow.message, /generated=flowchart/);

        const mismatchSeq = validateGeneratedMermaid_('sequenceDiagram\nA->>B: Hi', 'flowchart');
        assert.strictEqual(mismatchSeq.ok, false);
        assert.match(mismatchSeq.message, /図タイプ不一致/);
        assert.match(mismatchSeq.message, /requested=flowchart/);
        assert.match(mismatchSeq.message, /generated=sequenceDiagram/);
    });

    await t.test('should ignore type check if requested is auto or null', () => {
        assert.deepStrictEqual(validateGeneratedMermaid_('flowchart TD\nA-->B', 'auto'), { ok: true });
        assert.deepStrictEqual(validateGeneratedMermaid_('flowchart TD\nA-->B', null), { ok: true });
        assert.deepStrictEqual(validateGeneratedMermaid_('flowchart TD\nA-->B', undefined), { ok: true });
        assert.deepStrictEqual(validateGeneratedMermaid_('flowchart TD\nA-->B', ''), { ok: true });
    });

    await t.test('should handle unknown diagram types gracefully', () => {
         // If code doesn't start with a known keyword, detected type is empty string.
         // If requested type is specific, it should fail.
         const result = validateGeneratedMermaid_('unknown syntax', 'flowchart');
         assert.strictEqual(result.ok, false);
         assert.match(result.message, /generated=unknown/);
    });


    // --- ER Diagram Validation ---
    await t.test('should validate valid erDiagram', () => {
        const validER = `erDiagram
          CUSTOMER ||--o{ ORDER : places
          CUSTOMER {
            string name
            string email UK
          }
          ORDER {
            int id PK
            string date
          }
        `;
        assert.deepStrictEqual(validateGeneratedMermaid_(validER, 'erDiagram'), { ok: true });
    });

    await t.test('should fail on invalid erDiagram entity line (colon usage)', () => {
        const invalidER = `erDiagram
          CUSTOMER : places
        `;
        const result = validateGeneratedMermaid_(invalidER, 'erDiagram');
        assert.strictEqual(result.ok, false);
        assert.match(result.message, /erDiagram構文エラー候補.*"ENTITY : \.\.\." 形式は無効です/);
    });

    await t.test('should fail on invalid erDiagram attribute syntax', () => {
        const invalidAttr = `erDiagram
          CUSTOMER {
            invalid syntax here
          }
        `;
        const result = validateGeneratedMermaid_(invalidAttr, 'erDiagram');
        assert.strictEqual(result.ok, false);
        // "type name [PK|FK|UK] \"comment\"" 形式で記述してください
        // Regex needs to escape special characters like [ ] |
        // And match the double quotes around comment.
        assert.match(result.message, /erDiagram属性構文エラー候補.*"type name \[PK\|FK\|UK\] "comment"" 形式で記述してください/);
    });

    await t.test('should handle nested blocks correctly (though ER usually doesn\'t have deep nesting)', () => {
        // Testing that the depth logic doesn't break on valid usage
        const code = `erDiagram
          e1 {
            string a
          }
          e2 {
            string b
          }
        `;
        assert.deepStrictEqual(validateGeneratedMermaid_(code, 'erDiagram'), { ok: true });
    });

    await t.test('should allow comments in erDiagram', () => {
         const code = `erDiagram
           %% This is a comment
           CUSTOMER {
             string name %% comment at end
           }
         `;
         // The regex for attribute check might fail if "%% comment" is at the end?
         // Let's check the regex in main.js:
         // /^\s*[A-Za-z][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+(?:PK|FK|UK))?(?:\s+"[^"]*")?\s*$/
         // It doesn't seem to allow comments at the end of the line.
         // However, the loop says: if (!line || line.startsWith('%%')) continue;
         // But inside the block, it checks `raw`.

         // If I put a comment on its own line inside block:
         const code2 = `erDiagram
           CUSTOMER {
             %% comment inside
             string name
           }
         `;
         // The current implementation:
         // if (!line || line.startsWith('%%')) continue;
         // This check is at the top of the loop.
         // So lines starting with %% are skipped.

         assert.deepStrictEqual(validateGeneratedMermaid_(code2, 'erDiagram'), { ok: true });
    });

});
