import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const compile = async (relativePath, replacements) => {
    let source = await readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
    for (const [from, to] of replacements) source = source.replace(from, to);
    const output = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText;
    return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
};

let requestBody;
let requestSignal;
let fetchHandler;
globalThis.window = { fetch: async () => { throw new Error('WebView fetch must not be used'); } };
globalThis.fetch = (...args) => fetchHandler(...args);
fetchHandler = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    requestSignal = init.signal;
    return {
        ok: true,
        json: async () => ({
            choices: [{ message: { reasoning_content: '分析', content: '{"tasks":[]}' } }],
        }),
    };
};
const aiUrl = await compile('../src/services/ai/index.ts', [
    ["import { fetch } from '@tauri-apps/plugin-http';", 'const fetch = globalThis.fetch;'],
    ["import { normalizeAIEndpoint } from '../aiConfig';", 'const normalizeAIEndpoint = value => value;'],
]);
const ai = await import(aiUrl);
const aiServiceUrl = await compile('../src/services/aiService.ts', [
    ["import { fetch } from '@tauri-apps/plugin-http';", 'const fetch = globalThis.fetch;'],
    ["import { normalizeAIEndpoint } from './aiConfig';", 'const normalizeAIEndpoint = value => value;'],
    [
        /import \{\s*getOpenAIRequestOptions,\s*parseOpenAIJsonResponse,\s*type OpenAIChatResponse,\s*\} from '\.\/ai';/,
        `import { getOpenAIRequestOptions, parseOpenAIJsonResponse } from '${aiUrl}';`,
    ],
]);
const { testAIConnection } = await import(aiServiceUrl);
const { getOpenAIRequestOptions, hasOpenAIReply, parseOpenAIJsonResponse } = ai;

assert.deepEqual(
    getOpenAIRequestOptions('Qwen/Qwen3-235B-A22B', true),
    {},
);
assert.deepEqual(
    getOpenAIRequestOptions('custom-model', true),
    { response_format: { type: 'json_object' } },
);
assert.equal(
    hasOpenAIReply({
        choices: [{ message: { content: '', reasoning_content: '正在思考' } }],
    }),
    true,
);
const controller = new AbortController();
assert.deepEqual(
    await ai.createAIProvider({
        apiKey: 'test-key',
        apiEndpoint: 'https://internal.example/v1/chat/completions',
        model: 'Qwen3-235B-A22B',
        type: 'custom',
    }).generateJson('提取任务', '笔记正文', controller.signal),
    { tasks: [] },
);
assert.equal(requestBody.messages.at(-1).content, '笔记正文');
assert.equal(requestSignal, controller.signal, 'Native fetch must receive the cancellation signal');
assert.equal(requestBody.max_tokens, 16384);
assert.equal(requestBody.stream, false);
assert.equal(requestBody.enable_thinking, undefined);
assert.deepEqual(
    parseOpenAIJsonResponse({
        choices: [{ message: { reasoning_content: '分析', content: '```json\n{"tasks":[]}\n```' } }],
    }),
    { tasks: [] },
);
assert.throws(
    () => parseOpenAIJsonResponse({
        choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: '分析中' } }],
    }),
    /思考过程耗尽了输出额度/,
);
assert.throws(
    () => parseOpenAIJsonResponse({
        choices: [{ finish_reason: 'length', message: { content: '{"tasks":[', reasoning_content: '分析完成' } }],
    }),
    /JSON 被截断/,
);

const profile = {
    id: 'custom-test',
    type: 'custom',
    name: '测试接口',
    apiKey: 'test-key',
    apiEndpoint: 'https://internal.example/v1/chat/completions',
    model: 'custom-model',
};
let calls = [];
fetchHandler = async (url, init = {}) => {
    calls.push({ url, init });
    if (!init.method) {
        return { ok: true, json: async () => ({ data: [{ id: 'custom-model' }] }) };
    }
    requestBody = JSON.parse(init.body);
    const probe = requestBody.messages.at(-1).content.match(/"probe":"([^"]+)"/)?.[1];
    return {
        ok: true,
        json: async () => ({
            model: 'custom-model',
            choices: [{ message: { content: JSON.stringify({ probe }) } }],
        }),
    };
};
assert.deepEqual(await testAIConnection(profile), { success: true, message: '配置验证成功！' });
assert.equal(calls.length, 2);
assert.equal(calls[0].url, 'https://internal.example/v1/models');
assert.deepEqual(requestBody.response_format, { type: 'json_object' });

fetchHandler = async (_url, init = {}) => !init.method
    ? { ok: true, json: async () => ({ data: [{ id: 'real-model' }] }) }
    : (() => { throw new Error('invalid model must not reach chat completions'); })();
assert.deepEqual(
    await testAIConnection({ ...profile, model: 'made-up-model' }),
    { success: false, message: '接口可用，但模型列表中没有“made-up-model”' },
);

fetchHandler = async (_url, init = {}) => {
    if (!init.method) return { ok: false };
    const body = JSON.parse(init.body);
    const probe = body.messages.at(-1).content.match(/"probe":"([^"]+)"/)?.[1];
    return {
        ok: true,
        json: async () => ({
            model: 'server-fallback-model',
            choices: [{ message: { content: JSON.stringify({ probe }) } }],
        }),
    };
};
assert.deepEqual(
    await testAIConnection(profile),
    {
        success: false,
        message: '服务端实际使用模型“server-fallback-model”，与填写的“custom-model”不一致',
    },
);

console.log('AI compatibility checks passed');
