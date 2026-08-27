import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('../src/services/ai/index.ts', import.meta.url));
const source = await readFile(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const tempDir = await mkdtemp(join(tmpdir(), 'projecttodo-ai-'));
const modulePath = join(tempDir, 'ai.mjs');

try {
    await writeFile(modulePath, output, 'utf8');
    const ai = await import(pathToFileURL(modulePath).href);

    assert.equal(
        ai.withQwen3NoThink('提取任务', 'Qwen/Qwen3-235B-A22B'),
        '提取任务\n/no_think',
    );
    assert.deepEqual(
        ai.getOpenAIRequestOptions('Qwen/Qwen3-235B-A22B', 'https://internal.example/v1/chat/completions', true),
        {},
    );
    assert.deepEqual(
        ai.getOpenAIRequestOptions('qwen3-235b-a22b', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', true),
        { response_format: { type: 'json_object' }, enable_thinking: false },
    );
    assert.deepEqual(
        ai.parseOpenAIJsonResponse({
            choices: [{ message: { content: '<think>分析</think>\n```json\n{"tasks":[]}\n```' } }],
        }),
        { tasks: [] },
    );
    assert.throws(
        () => ai.parseOpenAIJsonResponse({
            choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: '分析中' } }],
        }),
        /输出额度已被思考内容耗尽/,
    );
} finally {
    await rm(tempDir, { recursive: true, force: true });
}

console.log('AI compatibility checks passed');
