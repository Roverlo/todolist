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
const ai = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const { getOpenAIRequestOptions, parseOpenAIJsonResponse, withQwen3NoThink } = ai;

assert.equal(
    withQwen3NoThink('提取任务', 'Qwen/Qwen3-235B-A22B'),
    '提取任务\n/no_think',
);
assert.deepEqual(
    getOpenAIRequestOptions('Qwen/Qwen3-235B-A22B', 'https://internal.example/v1/chat/completions', true),
    {},
);
assert.deepEqual(
    getOpenAIRequestOptions('qwen3-235b-a22b', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', true),
    { response_format: { type: 'json_object' }, enable_thinking: false },
);
assert.deepEqual(
    parseOpenAIJsonResponse({
        choices: [{ message: { content: '<think>分析</think>\n```json\n{"tasks":[]}\n```' } }],
    }),
    { tasks: [] },
);
assert.throws(
    () => parseOpenAIJsonResponse({
        choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: '分析中' } }],
    }),
    /输出额度已被思考内容耗尽/,
);

console.log('AI compatibility checks passed');
