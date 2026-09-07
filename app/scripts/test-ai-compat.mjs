import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const capabilities = JSON.parse(await readFile(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'));
const httpScope = capabilities.permissions.find(permission => permission.identifier === 'http:default').allow;
for (const url of ['http://127.0.0.1:11434/v1', 'http://internal.example:8080/v1', 'https://internal.example:8443/v1', 'https://internal.example/v1']) {
    assert.ok(httpScope.some(entry => new URLPattern(entry.url).test(url)), 'Native HTTP scope must allow configured endpoint ports: ' + url);
}

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
    ["from './ai';", `from '${aiUrl}';`],
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

const provider = ai.createAIProvider(profile);
const rejected = (message, status = 400) => ({ ok: false, status, text: async () => JSON.stringify({ error: { message } }) });
const successful = content => ({ ok: true, json: async () => ({ model: profile.model, choices: [{ message: { content } }] }) });
const chain = [
    rejected('Unsupported parameter: response_format'),
    rejected("Unsupported value: temperature. Only the default (1) value is supported."),
    rejected('max_tokens is not compatible with this model; use max_completion_tokens instead'),
    rejected('max_completion_tokens must be less than or equal to 8192', 422),
    successful([{ type: 'text', text: '```json\n' }, { type: 'text', text: '{"tasks":[{"title":"周五提交报告"}]}' }, { type: 'text', text: '\n```' }]),
];
calls = [];
fetchHandler = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    assert.equal(init.signal, controller.signal);
    assert.ok(chain.length, 'Compatibility retry must be bounded');
    return chain.shift();
};
assert.deepEqual(await provider.generateJson('提取任务', '周五提交报告', controller.signal), { tasks: [{ title: '周五提交报告' }] });
assert.equal(calls.length, 5);
assert.ok(calls.every(body => body.messages.every(message => typeof message.content === 'string')));
assert.ok(calls.every(body => body.model === profile.model && body.stream === false));
assert.ok(calls.every(body => JSON.stringify(body.messages) === JSON.stringify(calls[0].messages)), 'Retries must preserve the entire note');
assert.equal(calls[1].response_format, undefined);
assert.equal(calls[2].temperature, undefined);
assert.equal(calls[3].max_tokens, undefined);
assert.equal(calls[3].max_completion_tokens, 16384);
assert.equal(calls[4].max_completion_tokens, 8192);

// Connection tests and generation must use the same compatibility behavior.
calls = [];
fetchHandler = async (_url, init = {}) => {
    if (!init.method) return { ok: false };
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.response_format) return rejected('response_format is not supported');
    const probe = body.messages.at(-1).content.match(/"probe":"([^"]+)"/)?.[1];
    return successful(JSON.stringify({ probe }));
};
assert.deepEqual(await testAIConnection(profile), { success: true, message: '配置验证成功！' });
assert.equal(calls.length, 2);
assert.equal(calls[1].response_format, undefined);
assert.equal(calls[1].temperature, 0.1);

// Failures unrelated to parameter support must not issue another model request.
for (const status of [401, 403, 404, 429, 500, 503]) {
    calls = [];
    fetchHandler = async (_url, init) => { calls.push(init); return rejected('Unsupported parameter: response_format', status); };
    await assert.rejects(provider.generateJson('提取任务', '正文'), new RegExp(String(status)));
    assert.equal(calls.length, 1);
}
for (const message of ['Invalid API key', 'Context length exceeded', 'Unknown model', 'Invalid JSON schema']) {
    calls = [];
    fetchHandler = async (_url, init) => { calls.push(init); return rejected(message); };
    await assert.rejects(provider.generateJson('提取任务', '正文'), new RegExp(message));
    assert.equal(calls.length, 1);
}
calls = [];
fetchHandler = async (_url, init) => { calls.push(init); throw new TypeError('network failed'); };
await assert.rejects(provider.generateJson('提取任务', '正文'), /network failed/);
assert.equal(calls.length, 1);

calls = [];
fetchHandler = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return rejected(`max_tokens maximum value is ${16384 - calls.length}`);
};
await assert.rejects(provider.generateJson('提取任务', '正文'), /maximum value/);
assert.equal(calls.length, 5, 'Repeated parameter rejections must stop after five requests');

const cancelled = new AbortController();
calls = [];
fetchHandler = async (_url, init) => { calls.push(init); cancelled.abort(); return rejected('Unsupported parameter: response_format'); };
await assert.rejects(provider.generateJson('提取任务', '正文', cancelled.signal), { name: 'AbortError' });
assert.equal(calls.length, 1, 'Cancellation must stop before a compatibility retry');
await assert.rejects(provider.generateJson('提取任务', '正文', cancelled.signal), { name: 'AbortError' });
assert.equal(calls.length, 1, 'An already cancelled operation must not send a request');

assert.deepEqual(parseOpenAIJsonResponse({ choices: [{ message: { content: '<think>过程</think>\n```json\n{"tasks":[]}\n```' } }] }), { tasks: [] });
for (const content of [null, 123, [{ type: 'image', text: '{"tasks":[]}' }]]) {
    assert.throws(() => parseOpenAIJsonResponse({ choices: [{ message: { content } }] }), /没有返回可用内容/);
}
assert.throws(() => parseOpenAIJsonResponse({ choices: [{ message: { content: '', reasoning_content: '还在思考' } }] }), /只返回了思考过程/);
assert.throws(() => parseOpenAIJsonResponse({ choices: [{ finish_reason: 'length', message: { content: '{"tasks":[]}' } }] }), /被截断/,
    'Even valid-looking JSON must not be accepted when the server reports truncation');
assert.throws(() => parseOpenAIJsonResponse({ choices: [{ message: { refusal: 'declined', content: '' } }] }), /模型未能处理/);
assert.throws(() => parseOpenAIJsonResponse({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }), /模型未能处理/);

console.log('AI compatibility checks passed: text-only requests, bounded parameter fallback, connection probe, cancellation, errors and response variants');
