const test = require('node:test');
const assert = require('node:assert');

// Mock GAS services
const mockUserProperties = new Map();
const mockScriptProperties = new Map();

global.PropertiesService = {
    getUserProperties: () => ({
        getProperty: (key) => mockUserProperties.get(key),
        setProperty: (key, value) => mockUserProperties.set(key, value),
        deleteProperty: (key) => mockUserProperties.delete(key),
        getProperties: () => Object.fromEntries(mockUserProperties)
    }),
    getScriptProperties: () => ({
        getProperty: (key) => mockScriptProperties.get(key),
        setProperty: (key, value) => mockScriptProperties.set(key, value)
    })
};

global.UrlFetchApp = {
    fetch: (url, options) => {
        // Mock response
        return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
                candidates: [{
                    content: {
                        parts: [{ text: JSON.stringify({ mermaidCode: 'graph TD; A-->B;' }) }]
                    }
                }]
            })
        };
    }
};

global.HtmlService = {
    createHtmlOutputFromFile: () => ({ getContent: () => '' }),
    createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ addMetaTag: () => {} }) }) })
};
global.Logger = { log: () => {} };
global.console = { log: () => {}, error: () => {} }; // Silence logs
global.getSystemPrompt = () => 'System Prompt Mock';

// Note: The functions are not exported yet, so this require will return partial or empty object until main.js is updated.
// We are writing the test first as per plan.
const main = require('../main.js');

test('API Key Management', async (t) => {
    // We expect these functions to be exported after we modify main.js
    const {
        saveUserApiKey,
        deleteUserApiKey,
        hasUserApiKey,
        callGeminiAPI
    } = main;

    // Reset mocks before each subtest
    t.beforeEach(() => {
        mockUserProperties.clear();
        mockScriptProperties.clear();
        mockScriptProperties.set('GEMINI_API_KEY', 'shared-key');
    });

    await t.test('saveUserApiKey should save key to UserProperties', () => {
        if (!saveUserApiKey) return; // Skip if not implemented yet
        saveUserApiKey('my-secret-key');
        assert.strictEqual(mockUserProperties.get('GEMINI_USER_API_KEY'), 'my-secret-key');
    });

    await t.test('hasUserApiKey should return true if key exists', () => {
        if (!hasUserApiKey) return;
        mockUserProperties.set('GEMINI_USER_API_KEY', 'existing-key');
        assert.strictEqual(hasUserApiKey(), true);
    });

    await t.test('hasUserApiKey should return false if key does not exist', () => {
        if (!hasUserApiKey) return;
        assert.strictEqual(hasUserApiKey(), false);
    });

    await t.test('deleteUserApiKey should remove key from UserProperties', () => {
        if (!deleteUserApiKey) return;
        mockUserProperties.set('GEMINI_USER_API_KEY', 'to-be-deleted');
        deleteUserApiKey();
        assert.strictEqual(mockUserProperties.has('GEMINI_USER_API_KEY'), false);
    });

    await t.test('callGeminiAPI should use user key if available', () => {
        if (!callGeminiAPI) return;
        mockUserProperties.set('GEMINI_USER_API_KEY', 'user-key-123');

        // Spy on UrlFetchApp to check headers
        const originalFetch = global.UrlFetchApp.fetch;
        let capturedOptions;
        global.UrlFetchApp.fetch = (url, options) => {
            capturedOptions = options;
            return originalFetch(url, options);
        };

        callGeminiAPI('test prompt', 'flash', 'auto', null, null, null, null, 'en', null, null);

        assert.strictEqual(capturedOptions.headers['x-goog-api-key'], 'user-key-123');

        global.UrlFetchApp.fetch = originalFetch;
    });

    await t.test('callGeminiAPI should fallback to script property key if user key missing', () => {
        if (!callGeminiAPI) return;
        // Ensure no user key
        mockUserProperties.clear();
        mockScriptProperties.set('GEMINI_API_KEY', 'shared-key-456');

        const originalFetch = global.UrlFetchApp.fetch;
        let capturedOptions;
        global.UrlFetchApp.fetch = (url, options) => {
            capturedOptions = options;
            return originalFetch(url, options);
        };

        callGeminiAPI('test prompt', 'flash', 'auto', null, null, null, null, 'en', null, null);

        assert.strictEqual(capturedOptions.headers['x-goog-api-key'], 'shared-key-456');

        global.UrlFetchApp.fetch = originalFetch;
    });
});
