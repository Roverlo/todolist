import assert from 'node:assert/strict';
import { normalizeAIEndpoint, toSingleCustomAISettings } from '../src/services/aiConfig.ts';

assert.equal(normalizeAIEndpoint('api.example.com'), 'https://api.example.com/v1/chat/completions');
assert.equal(normalizeAIEndpoint('192.168.1.8:8000/v1'), 'http://192.168.1.8:8000/v1/chat/completions');
assert.equal(normalizeAIEndpoint('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
assert.equal(normalizeAIEndpoint('https://api.example.com/v1/chat/completions?key=x'), 'https://api.example.com/v1/chat/completions?key=x');
assert.throws(() => normalizeAIEndpoint('ftp://api.example.com'), /HTTP/);

const migrated = toSingleCustomAISettings({
    activeProviderId: 'deepseek-default',
    providers: [{ id: 'deepseek-default', type: 'deepseek', name: '企业模型', apiKey: 'user-key', model: 'qwen3', apiEndpoint: 'ai.lan/v1' }],
});
assert.equal(migrated.providers.length, 1);
assert.equal(migrated.providers[0].type, 'custom');
assert.equal(migrated.providers[0].apiKey, 'user-key');

const removedBuiltInKey = toSingleCustomAISettings({
    activeProviderId: 'modelscope-free',
    providers: [{ id: 'modelscope-free', type: 'openai', name: '内置接口', apiKey: 'built-in-key' }],
});
assert.equal(removedBuiltInKey.providers[0].apiKey, '');

console.log('AI config compatibility checks passed.');
