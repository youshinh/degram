/**
 * 設定: APIキーはスクリプトプロパティから取得（デフォルト共有キー）
 * ユーザーが個人キーを設定している場合はそちらを優先
 */
const SCRIPT_PROP_KEY = 'GEMINI_API_KEY';

function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet() {
    return HtmlService.createTemplateFromFile('Index')
        .evaluate()
        .setTitle('De:gram')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

/**
 * Gemini APIを呼び出してMermaidコードを生成する関数
 * @param {string} userPrompt
 * @param {string} modelVersion - 'flash-lite' or 'flash'
 * @param {string} diagramType
 * @param {object} fileData
 * @param {string} currentCode - リカバリーモード用（廃止方向だが互換性維持）
 * @param {string} errorMessage - リカバリーモード用
 * @param {string} retryHistoryJson
 * @param {string} uiLang
 * @param {string} customApiKey - ユーザー個人のAPIキー（空ならスクリプトプロパティを使用）
 * @param {number} temperatureOverride - リトライ時のtemperature上書き
 */
function callGeminiAPI(userPrompt, modelVersion, diagramType, fileData, currentCode, errorMessage, retryHistoryJson, uiLang, customApiKey, temperatureOverride) {
    // --- APIキー取得: 個人キー優先 → スクリプトプロパティ ---
    const userKey = customApiKey || null;
    const scriptKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_KEY);
    const apiKey = userKey || scriptKey;
    const usingPersonalKey = !!userKey;

    if (!apiKey) {
        throw new Error('API Keyが設定されていません。管理者にお問い合わせください。');
    }

    // モデルのマッピング
    const modelMap = {
        'flash': 'gemini-flash-latest',
        'flash-lite': 'gemini-flash-lite-latest'
    };
    const model = modelMap[modelVersion] || 'gemini-flash-lite-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // getSystemPrompt() is defined in Prompts.js
    let systemPrompt = getSystemPrompt();

    // --- Dynamic Example Injection ---
    let extraExamples = "";
    const type = String(diagramType).toLowerCase();
    if (type === 'flowchart' || type === 'graph') {
        extraExamples = `\n# ADDITIONAL FLOWCHART RULES\n- Use \`id["Label"]\` (Rect), \`id{"Label"}\` (Rhombus), \`id[("Label")]\` (Cylinder).\n- Connectivity: \`A --> B\`.`;
    } else if (type === 'sequencediagram') {
        extraExamples = `\n# ADDITIONAL SEQUENCE RULES\n- Use \`autonumber\`.\n- Define participants: \`participant A as "Label"\`.`;
    } else if (type === 'statediagram-v2') {
        extraExamples = `\n# ADDITIONAL STATE RULES\n- Use \`[*] --> State\`.`;
    } else if (type === 'erdiagram') {
        extraExamples = `\n# ADDITIONAL ER RULES\n- ENTITY { type attributeName "Comment(Japanese)" }\n- Attribute names MUST be ASCII (e.g. string category "カテゴリ"). Do NOT use Japanese for attribute variable names.`;
    } else if (type === 'gantt') {
        extraExamples = `\n# ADDITIONAL GANTT RULES\n- **NEVER** use colons (:) in task titles. Use full-width colon (：) or hyphen (-) instead.\n- Syntax: \`Task Name : [crit,] [active,] [after id,] [duration]\``;
    } else if (type === 'gitGraph') {
        extraExamples = `\n# ADDITIONAL GITGRAPH RULES\n- **NEVER** use direction specifiers like \`TD\`, \`LR\`, etc. with \`gitGraph\`. Syntax is just \`gitGraph\`. \n- Branch names MUST be double-quoted if they contain non-ASCII characters. Example: \`branch "開発"\`\n- Use \`checkout\` after creating a branch if you intend to commit to it immediately.`;
    } else if (type === 'journey') {
        extraExamples = `\n# ADDITIONAL JOURNEY RULES\n- Syntax: \`Task name : Score : Person1, Person2\` or \`Task name : Score : Status\`\n- **NEVER** use more than two colons per task line. If you need to add details, include them in the Task name or comma-separated list.\n- Example: \`DB cleanup : 5 : done\` (CORRECT), \`DB: cleanup: 5: done\` (INCORRECT - too many colons)`;
    } else if (type.startsWith('c4')) {
        extraExamples = `\n# ADDITIONAL C4 RULES\n- **NEVER** use \`Note(...)\` or \`note\` statements. They cause lexical errors in this version.\n- Use standard C4 syntax: \`Person(alias, "Label")\`, \`System(alias, "Label")\`, \`Rel(from, to, "Label")\`.`;
    }

    if (extraExamples) {
        systemPrompt += extraExamples;
    }

    let typeConstraint = "";
    if (diagramType && diagramType !== 'auto') {
        typeConstraint = `\n\n# IMPORTANT CONSTRAINT: DIAGRAM TYPE\nUser explicitly requested: "${diagramType}".\nYou MUST generate a valid "${diagramType}" code.\nDo NOT generate any other type of diagram.`;
    }

    const lang = (uiLang === 'en' || uiLang === 'ja') ? uiLang : null;
    const languageConstraint = lang === 'ja'
        ? `\n\n# OUTPUT LANGUAGE\n- Output labels/text primarily in Japanese.\n- Keep proper nouns / product names / technical terms (API, HTTP, OAuth, DB, JSON, etc.) as-is.\n- Do NOT translate diagram keywords (flowchart, sequenceDiagram, etc.).`
        : lang === 'en'
            ? `\n\n# OUTPUT LANGUAGE\n- Output labels/text primarily in English.\n- Keep proper nouns / product names / technical terms as-is.\n- Do NOT translate diagram keywords (flowchart, sequenceDiagram, etc.).`
            : `\n\n# OUTPUT LANGUAGE\n- Output labels/text in the same language as the user's request.\n- Keep proper nouns / product names / technical terms as-is.\n- Do NOT translate diagram keywords (flowchart, sequenceDiagram, etc.).`;

    let promptContent = "";
    const retryHistoryContext = buildRetryHistoryContext_(retryHistoryJson);
    if (errorMessage) {
        // リカバリーモード: エラーの種類だけ伝え、壊れたコードには依存しない
        promptContent = `
[SYSTEM: RECOVERY MODE]
A previous attempt to generate a Mermaid diagram FAILED with this error:
"${errorMessage}"

Original User Request:
"${userPrompt}"

${typeConstraint}
${languageConstraint}
${retryHistoryContext}

### INSTRUCTIONS FOR RECOVERY
1. **DO NOT** try to fix the previous code. Generate the diagram **entirely from scratch** based on the Original User Request above.
2. Pay special attention to avoid the error type mentioned above.
3. Common fixes:
   - Ensure every statement is on its own line.
   - Wrap ALL labels in double quotes: id["Label"]
   - Balance all brackets, subgraph/end, alt/end.
   - Use ASCII-only node IDs.
   - **NEVER** use \`subgraph["Title"]\`. Use \`subgraph Title\` or \`subgraph id["Title"]\`.
4. Output ONLY the JSON object as specified.
`;
    } else {
        promptContent = `
[SYSTEM: GENERATION MODE]
Input Description:
"${userPrompt}"

${typeConstraint}
${languageConstraint}

Generate the Mermaid diagram code accordingly.
`;
    }

    const userParts = [];

    if (fileData && fileData.data) {
        userParts.push({
            inline_data: {
                mime_type: fileData.mimeType,
                data: fileData.data
            }
        });
        promptContent = `[Analyzed the attached file]\n` + promptContent;
    }

    userParts.push({
        text: systemPrompt + "\n\n" + promptContent
    });

    // --- Temperature ---
    const temp = (typeof temperatureOverride === 'number' && temperatureOverride > 0)
        ? temperatureOverride
        : 0.2;

    const payload = {
        contents: [
            {
                role: "user",
                parts: userParts
            }
        ],
        generationConfig: {
            temperature: temp,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    diagramType: {
                        type: "STRING",
                        description: "The Mermaid diagram type keyword, e.g. flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, gantt, pie, mindmap, etc."
                    },
                    mermaidCode: {
                        type: "STRING",
                        description: "The complete, syntactically valid Mermaid diagram code. Each statement must be on its own line (use newline characters). Do NOT include markdown fences."
                    }
                },
                required: ["mermaidCode"]
            }
        }
    };

    try {
        const options = {
            method: 'post',
            contentType: 'application/json',
            headers: {
                'x-goog-api-key': apiKey
            },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, options);
        const httpCode = response.getResponseCode();
        const json = JSON.parse(response.getContentText());

        // --- レート制限 / クォータエラー検出 ---
        if (json.error) {
            const errMsg = json.error.message || '';
            const errCode = json.error.code || httpCode;
            if (errCode === 429 || /quota/i.test(errMsg) || /rate/i.test(errMsg) || /Resource has been exhausted/i.test(errMsg)) {
                const hint = usingPersonalKey
                    ? 'APIキーの利用上限に達しました。しばらく待ってから再試行してください。'
                    : 'APIキーの利用上限に達しました。設定画面（⚙）から個人のAPIキーを設定すると引き続き利用できます。';
                throw new Error(hint);
            }
            throw new Error(json.error.message);
        }

        if (!json.candidates || json.candidates.length === 0) {
            throw new Error("No response candidates generated.");
        }

        let rawText = json.candidates[0].content.parts[0].text;
        console.log("🤖 [Gemini] Raw Response:", rawText);

        // --- JSON構造化出力からMermaidコードを抽出 ---
        let cleanedText = '';
        try {
            const parsed = JSON.parse(rawText);
            if (parsed && parsed.mermaidCode) {
                cleanedText = String(parsed.mermaidCode);
                console.log("✅ [Main] JSON structured output extracted successfully");
            } else {
                throw new Error("mermaidCode field missing");
            }
        } catch (jsonErr) {
            // フォールバック: 従来のテキスト抽出
            console.log("⚠️ [Main] JSON parse failed, falling back to text extraction:", jsonErr.message);
            cleanedText = stripMarkdownCodeFences_(rawText);
            cleanedText = decodeHtmlEntities_(cleanedText);
            cleanedText = extractMermaidDiagram_(cleanedText);
        }

        // --- Post-Processing ---
        cleanedText = decodeHtmlEntities_(cleanedText);
        cleanedText = cleanedText.replace(/\uFEFF/g, '').trim();

        if (/^(flowchart|graph)\b/i.test(cleanedText)) {
            cleanedText = sanitizeFlowchartMermaid_(cleanedText);
        }
        if (/^\s*erDiagram\b/i.test(cleanedText)) {
            cleanedText = sanitizeErDiagramMermaid_(cleanedText);
        }

        const valid = validateGeneratedMermaid_(cleanedText, diagramType);
        if (!valid.ok) {
            throw new Error(valid.message);
        }

        console.log("📦 [Main] Final Response to Client:", cleanedText);
        return cleanedText;

    } catch (e) {
        console.error("🔥 [Main] Error:", e.message);
        throw new Error(e.message);
    }
}

function buildRetryHistoryContext_(retryHistoryJson) {
    try {
        const raw = String(retryHistoryJson == null ? '' : retryHistoryJson).trim();
        if (!raw) return '';
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || arr.length === 0) return '';
        const compact = arr.slice(-3).map((item, idx) => {
            const n = idx + 1;
            const m = item && item.model ? String(item.model) : 'unknown-model';
            const e = item && item.error ? String(item.error).replace(/\s+/g, ' ').slice(0, 220) : 'unknown-error';
            return `- Attempt ${n} (${m}): ${e}`;
        }).join('\n');
        return `\n\n# PREVIOUS FAILED ATTEMPTS\nAvoid repeating these failure patterns:\n${compact}`;
    } catch (_) {
        return '';
    }
}

const DIAGRAM_TYPE_MAP_ = {
    'graph': 'flowchart',
    'flowchart': 'flowchart',
    'sequencediagram': 'sequenceDiagram',
    'classdiagram': 'classDiagram',
    'statediagram-v2': 'stateDiagram-v2',
    'erdiagram': 'erDiagram',
    'gitgraph': 'gitGraph',
    'c4context': 'C4Context',
    'c4container': 'C4Container',
    'c4component': 'C4Component',
    'c4dynamic': 'C4Dynamic',
    'c4deployment': 'C4Deployment',
    'journey': 'journey',
    'gantt': 'gantt',
    'pie': 'pie',
    'mindmap': 'mindmap',
    'timeline': 'timeline'
};

function normalizeDiagramTypeKeyword_(typeText) {
    const raw = String(typeText == null ? '' : typeText).trim();
    if (!raw || raw.toLowerCase() === 'auto') return '';
    const first = raw.split(/\s+/)[0];
    const low = first.toLowerCase();
    return DIAGRAM_TYPE_MAP_[low] || first;
}

function detectCodeDiagramTypeKeyword_(code) {
    const src = String(code == null ? '' : code).trim();
    if (!src) return '';
    const m = /^\s*([A-Za-z][A-Za-z0-9-]*)\b/.exec(src);
    if (!m) return '';
    return normalizeDiagramTypeKeyword_(m[1]);
}

function validateGeneratedMermaid_(code, requestedType) {
    const src = String(code == null ? '' : code).trim();
    if (!src) {
        return { ok: false, message: 'Mermaidコードの生成結果が空です。' };
    }

    const detected = detectCodeDiagramTypeKeyword_(src);
    const requested = normalizeDiagramTypeKeyword_(requestedType);
    if (requested && requested !== detected) {
        return {
            ok: false,
            message: `図タイプ不一致: requested=${requested}, generated=${detected || 'unknown'}`
        };
    }

    if (detected === 'erDiagram') {
        const lines = src.split('\n');
        let inEntityBlock = false;
        let depth = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = String(lines[i] || '').trim();
            if (!line || line.startsWith('%%')) continue;
            const raw = String(lines[i] || '');

            if (!inEntityBlock) {
                if (/^\s*[A-Za-z][A-Za-z0-9_.-]*\s*\{\s*$/.test(raw)) {
                    inEntityBlock = true;
                    depth = 1;
                    continue;
                }
                if (/--/.test(line)) continue; // relationship line
                if (/^[A-Za-z0-9_.-]+\s*:\s*/.test(line)) {
                    return {
                        ok: false,
                        message: `erDiagram構文エラー候補(line ${i + 1}): "ENTITY : ..." 形式は無効です`
                    };
                }
                continue;
            }

            if (line.includes('{')) depth++;
            if (line.includes('}')) {
                depth--;
                if (depth <= 0) {
                    inEntityBlock = false;
                    depth = 0;
                }
                continue;
            }

            if (!/^\s*[A-Za-z][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+(?:PK|FK|UK))?(?:\s+"[^"]*")?\s*$/.test(raw)) {
                return {
                    ok: false,
                    message: `erDiagram属性構文エラー候補(line ${i + 1}): "type name [PK|FK|UK] \"comment\"" 形式で記述してください`
                };
            }
        }
    }

    return { ok: true };
}

function sanitizeErDiagramMermaid_(code) {
    const src = String(code == null ? '' : code).replace(/\r/g, '');
    const lines = src.split('\n');
    let inEr = false;
    let inEntityBlock = false;
    let entityDepth = 0;
    let suppressCurrentEntityBlock = false;
    const seenEntities = new Set();

    for (let i = 0; i < lines.length; i++) {
        const raw = String(lines[i] || '');
        const line = raw.trim();
        if (!line) continue;

        if (/^\s*erDiagram\b/i.test(raw)) {
            inEr = true;
            continue;
        }
        if (!inEr) continue;

        // Entity block start: ENTITY_NAME {
        if (!inEntityBlock) {
            // Flowchart-like entity header: ENTITY["label"] {
            const mEntityStartWithLabel = raw.match(/^\s*([A-Za-z][A-Za-z0-9_.-]*)\s*\[[^\]]*\]\s*\{\s*$/);
            if (mEntityStartWithLabel) {
                const entityName = String(mEntityStartWithLabel[1] || '').trim();
                lines[i] = raw.replace(/^(\s*)([A-Za-z][A-Za-z0-9_.-]*)\s*\[[^\]]*\]\s*\{\s*$/, '$1$2 {');
                inEntityBlock = true;
                entityDepth = 1;
                suppressCurrentEntityBlock = seenEntities.has(entityName);
                if (suppressCurrentEntityBlock) {
                    lines[i] = '%% removed duplicate ER entity block: ' + raw;
                } else {
                    seenEntities.add(entityName);
                }
                continue;
            }

            const mEntityStart = raw.match(/^\s*([A-Za-z][A-Za-z0-9_.-]*)\s*\{\s*$/);
            if (mEntityStart) {
                const entityName = String(mEntityStart[1] || '').trim();
                inEntityBlock = true;
                entityDepth = 1;
                suppressCurrentEntityBlock = seenEntities.has(entityName);
                if (suppressCurrentEntityBlock) {
                    lines[i] = '%% removed duplicate ER entity block: ' + raw;
                } else {
                    seenEntities.add(entityName);
                }
                continue;
            }
        }

        if (inEntityBlock) {
            if (line.includes('{')) entityDepth++;
            if (line.includes('}')) {
                entityDepth--;
                if (suppressCurrentEntityBlock) {
                    lines[i] = '%% removed duplicate ER entity block: ' + raw;
                }
                if (entityDepth <= 0) {
                    inEntityBlock = false;
                    entityDepth = 0;
                    suppressCurrentEntityBlock = false;
                }
                continue;
            }

            // Drop all inner lines for duplicate entity blocks
            if (suppressCurrentEntityBlock) {
                lines[i] = '%% removed duplicate ER entity block: ' + raw;
                continue;
            }

            // Keep only valid ER attribute syntax inside entity blocks.
            // valid examples:
            //   string userId PK "ユーザーID"
            //   int amount
            //   datetime createdAt FK
            const mAttr = raw.match(/^\s*[A-Za-z][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+(?:PK|FK|UK))?(?:\s+"[^"]*")?\s*$/);
            if (!mAttr) {
                lines[i] = '%% removed invalid ER attribute line: ' + raw;
            }
            continue;
        }

        if (line.startsWith('%%')) continue;
        // Invalid flowchart-like edge in ER
        if (/-->\s*/.test(line)) {
            lines[i] = '%% removed invalid ER line: ' + raw;
            continue;
        }
        if (/--/.test(line)) {
            // Normalize flowchart-like entity labels in relationship lines:
            // A["label"] ||--o{ B["label"] : "rel"  -> A ||--o{ B : "rel"
            let normalizedRel = raw
                .replace(/([A-Za-z][A-Za-z0-9_.-]*)\s*\[[^\]]*]/g, '$1')
                .replace(/([A-Za-z][A-Za-z0-9_.-]*)\s*\{[^}]*}/g, '$1')
                .replace(/([A-Za-z][A-Za-z0-9_.-]*)\s*\([^)]*\)/g, '$1');

            normalizedRel = normalizeErRelationshipLine_(normalizedRel);

            // Drop unsupported inheritance-like connectors from flowchart in ER context.
            // Example: A --|> B : "x" -> comment out.
            if (/--\s*\|>/.test(normalizedRel)) {
                lines[i] = '%% removed invalid ER relation line: ' + raw;
                continue;
            }
            lines[i] = normalizedRel;
            continue;
        } // relationship line

        // Invalid entity annotation like: CONCEPT : "..."
        if (/^[A-Za-z0-9_.-]+\s*:\s*/.test(line)) {
            lines[i] = '%% removed invalid ER line: ' + raw;
            continue;
        }

        // Invalid node-like declaration such as NAME[TYPE] : ...
        if (/^[A-Za-z0-9_.-]+\[[^\]]+\]\s*:\s*/.test(line)) {
            lines[i] = '%% removed invalid ER line: ' + raw;
            continue;
        }
    }
    return lines.join('\n').trim();
}

function normalizeErCardinality_(token, side) {
    const t = String(token == null ? '' : token).replace(/\s+/g, '');
    if (!t) return '';
    const valid = new Set(['||', '|o', 'o|', '|{', '}|', '}o', 'o{']);
    if (valid.has(t)) return t;
    if (t === '|') return '||';
    if (t === 'o') return side === 'left' ? 'o|' : 'o{';
    if (t === '{') return '|{';
    if (t === '}') return '}|';
    if (t === '|o|') return '|o';
    if (t === '|{|' || t === '|{|') return '|{';
    if (t === '}o|' || t === '}o') return '}o';
    if (t === 'o{|') return 'o{';
    return t.slice(0, 2);
}

function normalizeErRelationshipLine_(line) {
    const raw = String(line == null ? '' : line);
    const m = raw.match(/^\s*([A-Za-z][A-Za-z0-9_.-]*)\s*([|o{}]{1,2})\s*--\s*([|o{}]{1,2})\s*([A-Za-z][A-Za-z0-9_.-]*)(\s*:\s*.*)?\s*$/);
    if (!m) return raw;

    const from = m[1];
    const leftRaw = m[2];
    const rightRaw = m[3];
    const to = m[4];
    const tail = m[5] || '';

    const left = normalizeErCardinality_(leftRaw, 'left');
    const right = normalizeErCardinality_(rightRaw, 'right');
    return `${from} ${left}--${right} ${to}${tail}`;
}

function stripMarkdownCodeFences_(text) {
    const raw = String(text == null ? '' : text);
    return raw
        .replace(/^\s*```(?:mermaid)?\s*/i, '')
        .replace(/\s*```[\s\r\n]*$/i, '')
        .trim();
}

function decodeHtmlEntities_(text) {
    let s = String(text == null ? '' : text);
    s = s
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ');
    return s;
}

// 強化版: 不要なヘッダー除去機能付き
function extractMermaidDiagram_(text) {
    let raw = String(text == null ? '' : text);

    // 1. HTMLエンティティのデコード
    raw = decodeHtmlEntities_(raw);

    // 2. Markdown除去
    raw = raw.replace(/```mermaid/gi, '').replace(/```/g, '');

    // 3. 全角スペースや特殊な空白を半角スペースに正規化
    raw = raw.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');

    const keywords = [
        'flowchart', 'graph', 'sequenceDiagram', 'gantt', 'classDiagram', 'stateDiagram-v2',
        'erDiagram', 'journey', 'mindmap', 'timeline', 'pie', 'gitGraph',
        'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'
    ];

    // 文頭、または改行の直後にキーワードがある場所を検索
    const pattern = new RegExp(`(^|\\n)\\s*(${keywords.join('|')})\\b`, 'i');
    const match = raw.match(pattern);

    if (match && typeof match.index === 'number') {
        // キーワードが見つかった位置から末尾までを切り出す
        let start = match.index + match[1].length;
        let extracted = raw.slice(start).trim();
        return extracted;
    }

    return raw.trim();
}

// 強化版: subgraph記法修正、強力な改行挿入付き
function sanitizeFlowchartMermaid_(code) {
    // 1. ログ用に元のコードを保持
    const original = String(code == null ? '' : code);

    // 2. 特殊スペースの完全正規化と改行コード統一
    let out = original
        .replace(/\r/g, '')
        .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');

    // 3. セミコロンを改行に変換
    out = out.replace(/;\s*/g, '\n');

    // 4. subgraph["..."]:::class -> subgraph["..."] (drop invalid style attachment)
    out = out.replace(/(\s*subgraph)\s*\["([^"]+)"\]:::([^\s]*)/gi, '$1["$2"]');

    // ★追加修正2: 行の結合を強制分離 (数字/文字 + subgraph/end/classDef/style)
    // \b ではなく、後ろにアルファベットが続かないことを条件にして強力に分離
    // 例: "5 5subgraph" -> "5 5\nsubgraph"
    out = out.replace(/([^\n])\s*(subgraph|end|classDef|style)(?![A-Za-z0-9_])/g, '$1\n$2');

    // 5. 一般的なエスケープされた引用符の修正
    out = out.replace(/\\+\"/g, "'");

    // 6. ラベル付きエッジの修正
    out = out.replace(/(\b[A-Za-z0-9_]+\b)\s+--\s*([^-\n|>]{1,60}?)\s*--\s+(\b[A-Za-z0-9_]+\b)/g, function (_, from, label, to) {
        const t = escapeFlowLabel_(label).replace(/\|/g, ' ');
        return from + ' -->|' + t + '| ' + to;
    });

    // 7. "flowchart LR subgraph ..." のような1行書きを分離
    out = out.replace(/^(flowchart|graph)\s+(TB|TD|BT|RL|LR)\s+(.+)$/im, function (_, kw, dir, rest) {
        return kw + ' ' + dir + '\n' + rest;
    });

    // 8. 単独ノード定義の正規化 (予約語は除外)
    out = out.replace(/^(\s*)([A-Za-z0-9_]+)\s+["']([^"']+)["']\s*$/gm, function (full, indent, id, label) {
        if (/^(subgraph|end|classDef|class|style|linkStyle|click)$/i.test(id)) {
            return full;
        }
        return indent + id + '["' + escapeFlowLabel_(label) + '"]';
    });

    // 9. subgraphヘッダーの正規化
    const lines = out.split('\n');
    let autoSubgraphId = 1;
    for (let i = 0; i < lines.length; i++) {
        // classDef行などはスキップ
        if (/^\s*classDef\b/.test(lines[i])) continue;

        // Remove trailing ::: from lines (invalid style attachment to subgraph start)
        lines[i] = lines[i].replace(/:::$/, '').replace(/:::\s*$/, '');

        const m = lines[i].match(/^(\s*)subgraph\s*(.+?)\s*$/i);
        if (!m) continue;
        const indent = m[1];
        const tail = String(m[2] || '').trim();
        if (!tail) continue;

        // subgraph["Title"] / subgraph['Title'] -> subgraph SGx["Title"]
        let mm = tail.match(/^\[(["'])([\s\S]*?)\1\]\s*$/);
        if (mm) {
            const title = escapeFlowLabel_(mm[2]);
            lines[i] = indent + 'subgraph SG' + (autoSubgraphId++) + '["' + title + '"]';
            continue;
        }

        // subgraph ID["Title"] / subgraph ID['Title']
        mm = tail.match(/^([A-Za-z0-9_]+)\s*\[(["'])([\s\S]*?)\2\]\s*$/);
        if (mm) {
            const id = mm[1];
            const title = escapeFlowLabel_(mm[3]);
            lines[i] = indent + 'subgraph ' + id + '["' + title + '"]';
            continue;
        }

        // subgraph "Title" / subgraph 'Title'
        mm = tail.match(/^(["'])([\s\S]*?)\1\s*$/);
        if (mm) {
            const title = escapeFlowLabel_(mm[2]);
            lines[i] = indent + 'subgraph SG' + (autoSubgraphId++) + '["' + title + '"]';
            continue;
        }

        // subgraph ID
        mm = tail.match(/^([A-Za-z0-9_]+)\s*$/);
        if (mm) {
            lines[i] = indent + 'subgraph ' + mm[1];
            continue;
        }

        // subgraph ID title words...
        mm = tail.match(/^([A-Za-z0-9_]+)\s+(.+)$/);
        if (mm) {
            const id = mm[1];
            const title = escapeFlowLabel_(mm[2]);
            lines[i] = indent + 'subgraph ' + id + '["' + title + '"]';
            continue;
        }

        // Fallback: whole tail as title
        lines[i] = indent + 'subgraph SG' + (autoSubgraphId++) + '["' + escapeFlowLabel_(tail) + '"]';
    }
    out = lines.join('\n');

    // 10. 決定ノード(ひし形)の修正
    out = out.replace(/([A-Za-z0-9_]+)\{([^}]*)\}/g, function (_, id, rawLabel) {
        let t = String(rawLabel == null ? '' : rawLabel).trim();
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
            t = t.slice(1, -1).trim();
        }
        t = t.replace(/\\+\"/g, "'").replace(/"/g, "'");
        t = t.replace(/'/g, '\u2019');
        t = t.replace(/\(/g, '\uFF08').replace(/\)/g, '\uFF09');
        t = t.replace(/\s*\n+\s*/g, ' ').trim();
        if (!t) t = '?';
        if (/[{}\[\]]/.test(t)) {
            return id + '["' + escapeFlowLabel_(t) + '"]';
        }
        return id + '{' + t + '}';
    });

    // 11. 角括弧ノード [ ... ] の修正 (引用符内無視版)
    out = out.replace(/([A-Za-z0-9_]+)\[(?!\[)((?:[^"\]]|"[^"]*")*)]/g, function (_, id, label) {
        let t = String(label == null ? '' : label).trim();
        if (!t) return id + '[""]';
        if (/^".*"$/.test(t)) {
            let inner = t.slice(1, -1);
            inner = inner.replace(/\\+"/g, "'").replace(/"/g, "'");
            inner = inner.replace(/'{2,}/g, "'");
            return id + '["' + inner + '"]';
        }
        return id + '["' + escapeFlowLabel_(t) + '"]';
    });

    // 12. 丸括弧ノード ( ... ) の修正
    out = out.replace(/([A-Za-z0-9_]+)\((?!\()((?:[^"\)]|"[^"]*")*)\)/g, function (_, id, label) {
        let t = String(label == null ? '' : label).trim();
        if (!t) return id + '("")';
        if (/^".*"$/.test(t)) {
            let inner = t.slice(1, -1);
            inner = inner.replace(/\\+"/g, "'").replace(/"/g, "'");
            return id + '("' + inner + '")';
        }
        return id + '("' + escapeFlowLabel_(t) + '")';
    });

    // 13. 括弧ノード補正の副作用で角括弧ラベル内に再混入した " を再正規化
    out = out.replace(/([A-Za-z0-9_]+)\[(?!\[)((?:[^"\]]|"[^"]*")*)]/g, function (_, id, label) {
        let t = String(label == null ? '' : label).trim();
        if (!t) return id + '[""]';
        if (/^".*"$/.test(t)) {
            let inner = t.slice(1, -1);
            inner = inner.replace(/\\+"/g, "'").replace(/"/g, "'");
            inner = inner.replace(/'{2,}/g, "'");
            return id + '["' + inner + '"]';
        }
        return id + '["' + escapeFlowLabel_(t) + '"]';
    });

    // ★追加修正3: 閉じ忘れた引用符の補正 (簡易版)
    const linesFinal = out.split('\n');
    for (let i = 0; i < linesFinal.length; i++) {
        const line = linesFinal[i];
        const quoteCount = (line.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0 && line.includes('"')) {
            linesFinal[i] = line + '"';
        }
    }
    out = linesFinal.join('\n');

    // 変更があった場合のみログ出力
    if (original !== out) {
        console.log("🛠️ [Sanitizer] Code Modified");
        console.log("BEFORE:", original);
        console.log("AFTER: ", out);
    }

    return out.trim();
}

function escapeFlowLabel_(label) {
    let s = String(label == null ? '' : label);
    s = s
        .replace(/[\u201C\u201D\u201E\u201F\u275D\u275E]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B\u275B\u275C]/g, "'");
    s = s.replace(/\uFEFF/g, '');
    s = s.replace(/\\+\"/g, "'");
    s = s.replace(/"/g, "'");
    s = s.replace(/'{2,}/g, "'");
    s = s.replace(/\s*\n+\s*/g, ' ');
    return s.trim();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        decodeHtmlEntities_,
        normalizeDiagramTypeKeyword_
    };
}
