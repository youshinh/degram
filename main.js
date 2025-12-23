/**
 * 設定: APIキーはスクリプトプロパティから取得
 * キー名: GEMINI_API_KEY
 */
const SCRIPT_PROP_KEY = 'GEMINI_API_KEY';

// --- Diagram History (User Properties) ---
const DIAGRAM_HISTORY_INDEX_KEY = 'DIAGRAM_HISTORY_INDEX_V1';
const DIAGRAM_HISTORY_ITEM_PREFIX = 'DIAGRAM_HISTORY_ITEM_V1_';
const DIAGRAM_HISTORY_MAX_ENTRIES = 30;
const DIAGRAM_HISTORY_MAX_CODE_CHARS = 8000;
const DIAGRAM_HISTORY_MAX_PROMPT_CHARS = 2000;

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
 */
function callGeminiAPI(userPrompt, modelVersion, diagramType = 'auto', fileData = null, currentCode = null, errorMessage = null, retryHistoryJson = null, uiLang = null) {
    const apiKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_KEY);
    if (!apiKey) {
        throw new Error('API Keyが設定されていません。スクリプトプロパティに GEMINI_API_KEY を設定してください。');
    }

    // モデルのマッピング
    const modelMap = {
        'flash': 'gemini-flash-latest',
        'flash-lite': 'gemini-flash-lite-latest',
        'pro': 'gemini-pro-latest'
    };
    const model = modelMap[modelVersion] || 'gemini-flash-lite-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
        extraExamples = `\n# ADDITIONAL ER RULES\n- ENTITY { type name }`;
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
    if (errorMessage && currentCode) {
        let retryHistoryText = "";
        if (retryHistoryJson) {
            try {
                const rh = JSON.parse(retryHistoryJson);
                if (Array.isArray(rh) && rh.length) {
                    const lastFail = rh[rh.length - 1];
                    retryHistoryText = `\nLast Attempt Error:\nError: ${lastFail.error}\nCode Snippet causing error:\n${String(lastFail.code).slice(0, 500)}...`;
                }
            } catch (e) { }
        }

        promptContent = `
[SYSTEM: RECOVERY MODE]
The previous Mermaid code generation FAILED.
The compiler returned this error:
"${errorMessage}"

${retryHistoryText}

Original User Request:
"${userPrompt}"

${languageConstraint}

Current Broken Code (DO NOT COPY THIS BLINDLY):
${currentCode}

### INSTRUCTIONS FOR RECOVERY
1. **ANALYZE THE ERROR**: Look at the error message and the Current Code. Identify strictly why it failed (e.g., lines merged together, missing newlines, unescaped quotes).
2. **DISCARD BAD STRUCTURE**: The Current Code is likely structurally broken (e.g., '5 5subgraph'). **IGNORE IT** and regenerate the diagram entirely from scratch using the "Original User Request".
3. **SYNTAX RULES**:
   - **NEWLINES**: Ensure every statement (subgraph, node, style) is on its own line.
   - **QUOTES**: Wrap all node labels in double quotes. Example: id["Label Text"]
   - **BRACKETS**: Do NOT use braces {} inside flowchart node labels. Use rectangles [] or rounds ().
4. **OUTPUT FORMAT**:
   - Return **ONLY** the corrected Mermaid code.
   - **NO** markdown fences (no \`\`\`).
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

    const payload = {
        contents: [
            {
                role: "user",
                parts: userParts
            }
        ],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
        }
    };

    try {
        const options = {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, options);
        const json = JSON.parse(response.getContentText());

        if (json.error) {
            throw new Error(json.error.message);
        }

        if (!json.candidates || json.candidates.length === 0) {
            throw new Error("No response candidates generated.");
        }

        let rawText = json.candidates[0].content.parts[0].text;
        console.log("🤖 [Gemini] Raw Response:", rawText);

        // --- Post-Processing ---
        let cleanedText = stripMarkdownCodeFences_(rawText);
        cleanedText = decodeHtmlEntities_(cleanedText);
        cleanedText = extractMermaidDiagram_(cleanedText); // 強化版抽出
        cleanedText = decodeHtmlEntities_(cleanedText);
        cleanedText = cleanedText.replace(/\uFEFF/g, '').trim();

        if (/^(flowchart|graph)\b/i.test(cleanedText)) {
            cleanedText = sanitizeFlowchartMermaid_(cleanedText); // 強化版サニタイズ
        }

        console.log("📦 [Main] Final Response to Client:", cleanedText);
        return cleanedText;

    } catch (e) {
        console.error("🔥 [Main] Error:", e.message);
        throw new Error('Gemini API Error: ' + e.message);
    }
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

    // ★追加修正1: AIが生成しがちな subgraph["Title"] を subgraph "Title" に補正
    // これをやらないと、前の行とくっついた時にパースエラーになりやすい
    out = out.replace(/(\s*subgraph)\s*\["([^"]+)"\]/gi, '$1 "$2"');

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

    // 8. 単独ノード定義の正規化
    out = out.replace(/^\s*([A-Za-z0-9_]+)\s+["']([^"']+)["']\s*$/gm, function (_, id, label) {
        return id + '["' + escapeFlowLabel_(label) + '"]';
    });

    // 9. subgraphタイトルの引用符処理
    const lines = out.split('\n');
    for (let i = 0; i < lines.length; i++) {
        // classDef行などはスキップ
        if (/^\s*classDef\b/.test(lines[i])) continue;

        const m = lines[i].match(/^(\s*subgraph)\s+(.+?)\s*$/i);
        if (!m) continue;
        const head = m[1];
        const tail = m[2];
        const t = tail.trim();
        if (!t) continue;
        if (t.startsWith('"') || t.startsWith("'")) continue;
        if (t.indexOf('[') !== -1 || t.indexOf(']') !== -1) continue;
        lines[i] = head + ' "' + escapeFlowLabel_(t) + '"';
    }
    out = lines.join('\n');

    // 10. 決定ノード(ひし形)の修正
    out = out.replace(/([A-Za-z0-9_]+)\{([^}]*)\}/g, function (_, id, rawLabel) {
        let t = String(rawLabel == null ? '' : rawLabel).trim();
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
            t = t.slice(1, -1).trim();
        }
        t = t.replace(/\\+\"/g, "'").replace(/"/g, "'");
        t = t.replace(/'/g, '’');
        t = t.replace(/\(/g, '（').replace(/\)/g, '）');
        t = t.replace(/\s*\n+\s*/g, ' ').trim();
        if (!t) t = '?';
        if (/[{}\[\]]/.test(t)) {
            return id + '["' + escapeFlowLabel_(t) + '"]';
        }
        return id + '{' + t + '}';
    });

    // 11. 角括弧ノード [ ... ] の修正 (引用符内無視版)
    out = out.replace(/([A-Za-z0-9_]+)\[(?!\[)((?:[^"\]]|"[^"]*")*)\]/g, function (_, id, label) {
        let t = String(label == null ? '' : label).trim();
        if (!t) return id + '[""]';
        if (/^".*"$/.test(t)) {
            let inner = t.slice(1, -1);
            inner = inner.replace(/\\+"/g, "'").replace(/"/g, "'");
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
        .replace(/[“”„‟❝❞]/g, '"')
        .replace(/[‘’‚‛❛❜]/g, "'");
    s = s.replace(/\uFEFF/g, '');
    s = s.replace(/\\+\"/g, "'");
    s = s.replace(/"/g, "'");
    s = s.replace(/\s*\n+\s*/g, ' ');
    return s.trim();
}

// --- History Functions (Unchanged) ---
function saveDiagramHistory(entry) {
    const userProps = PropertiesService.getUserProperties();
    const normalized = fitHistoryEntrySize_(normalizeHistoryEntry_(entry));
    const id = Utilities.getUuid();
    normalized.id = id;
    normalized.createdAt = Date.now();
    userProps.setProperty(DIAGRAM_HISTORY_ITEM_PREFIX + id, JSON.stringify(normalized));
    const index = getHistoryIndex_(userProps);
    index.unshift(id);
    const toDelete = index.slice(DIAGRAM_HISTORY_MAX_ENTRIES);
    const nextIndex = index.slice(0, DIAGRAM_HISTORY_MAX_ENTRIES);
    userProps.setProperty(DIAGRAM_HISTORY_INDEX_KEY, JSON.stringify(nextIndex));
    for (const oldId of toDelete) {
        userProps.deleteProperty(DIAGRAM_HISTORY_ITEM_PREFIX + oldId);
    }
    return { ok: true, id };
}

function listDiagramHistory() {
    const userProps = PropertiesService.getUserProperties();
    const index = getHistoryIndex_(userProps);
    if (!index.length) return [];
    const items = [];
    for (const id of index) {
        const raw = userProps.getProperty(DIAGRAM_HISTORY_ITEM_PREFIX + id);
        if (!raw) continue;
        try { items.push(JSON.parse(raw)); } catch (e) { }
    }
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return items;
}

function listDiagramHistoryPage(limit, offset) {
    const userProps = PropertiesService.getUserProperties();
    const index = getHistoryIndex_(userProps);
    const total = index.length;
    const rawLimit = Number(limit);
    const rawOffset = Number(offset);
    const safeLimit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(30, Math.floor(rawLimit))) : 10;
    const safeOffset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
    const slice = index.slice(safeOffset, safeOffset + safeLimit);
    const items = [];
    for (const id of slice) {
        const raw = userProps.getProperty(DIAGRAM_HISTORY_ITEM_PREFIX + id);
        if (!raw) continue;
        try { items.push(JSON.parse(raw)); } catch (e) { }
    }
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return { items, total, offset: safeOffset, limit: safeLimit, hasMore: (safeOffset + slice.length) < total };
}

function getDiagramHistoryItem(id) {
    if (!id) return null;
    const userProps = PropertiesService.getUserProperties();
    const raw = userProps.getProperty(DIAGRAM_HISTORY_ITEM_PREFIX + id);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

function deleteDiagramHistory(id) {
    if (!id) return { ok: false };
    const userProps = PropertiesService.getUserProperties();
    userProps.deleteProperty(DIAGRAM_HISTORY_ITEM_PREFIX + id);
    const index = getHistoryIndex_(userProps).filter((x) => x !== id);
    userProps.setProperty(DIAGRAM_HISTORY_INDEX_KEY, JSON.stringify(index));
    return { ok: true };
}

function clearDiagramHistory() {
    const userProps = PropertiesService.getUserProperties();
    const index = getHistoryIndex_(userProps);
    for (const id of index) {
        userProps.deleteProperty(DIAGRAM_HISTORY_ITEM_PREFIX + id);
    }
    userProps.deleteProperty(DIAGRAM_HISTORY_INDEX_KEY);
    return { ok: true };
}

function getHistoryIndex_(userProps) {
    try {
        const raw = userProps.getProperty(DIAGRAM_HISTORY_INDEX_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (e) { return []; }
}

function normalizeHistoryEntry_(entry) {
    const safe = entry && typeof entry === 'object' ? entry : {};
    const prompt = typeof safe.prompt === 'string' ? safe.prompt : '';
    const code = typeof safe.code === 'string' ? safe.code : '';
    return {
        prompt: prompt.slice(0, DIAGRAM_HISTORY_MAX_PROMPT_CHARS),
        code: code.slice(0, DIAGRAM_HISTORY_MAX_CODE_CHARS),
        diagramType: typeof safe.diagramType === 'string' ? safe.diagramType : null,
        model: typeof safe.model === 'string' ? safe.model : null,
        theme: typeof safe.theme === 'string' ? safe.theme : null,
        fileName: typeof safe.fileName === 'string' ? safe.fileName : null,
        meta: safe.meta && typeof safe.meta === 'object' ? safe.meta : {},
    };
}

function fitHistoryEntrySize_(normalized) {
    const MAX_JSON_CHARS = 8500;
    let json = JSON.stringify(normalized);
    if (json.length <= MAX_JSON_CHARS) return normalized;
    const code = typeof normalized.code === 'string' ? normalized.code : '';
    const overflow = json.length - MAX_JSON_CHARS;
    const nextCodeLen = Math.max(0, code.length - overflow - 50);
    const trimmed = { ...normalized, code: code.slice(0, nextCodeLen) };
    json = JSON.stringify(trimmed);
    return json.length <= MAX_JSON_CHARS ? trimmed : { ...trimmed, code: '' };
}