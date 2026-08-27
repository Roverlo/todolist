import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('../src/services/ai/index.ts', import.meta.url));
const source = (await readFile(sourcePath, 'utf8')).replace(
    "import { normalizeAIEndpoint } from '../aiConfig';",
    'const normalizeAIEndpoint = value => value;',
);
const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
let requestBody;
globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return {
        ok: true,
        json: async () => ({
            choices: [{ message: { reasoning_content: '分析', content: '{"tasks":[]}' } }],
        }),
    };
};
const ai = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
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
assert.deepEqual(
    await ai.createAIProvider({
        apiKey: 'test-key',
        apiEndpoint: 'https://internal.example/v1/chat/completions',
        model: 'Qwen3-235B-A22B',
        type: 'custom',
    }).generateJson('提取任务', '笔记正文'),
    { tasks: [] },
);
assert.equal(requestBody.messages.at(-1).content, '笔记正文');
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

console.log('AI compatibility checks passed');
