import assert from 'node:assert/strict';
import { normalizeAIEndpoint, toCustomAISettings } from '../src/services/aiConfig.ts';

assert.equal(normalizeAIEndpoint('api.example.com'), 'https://api.example.com/v1/chat/completions');
assert.equal(normalizeAIEndpoint('192.168.1.8:8000/v1'), 'http://192.168.1.8:8000/v1/chat/completions');
assert.equal(normalizeAIEndpoint('qwen-internal:8000/v1'), 'http://qwen-internal:8000/v1/chat/completions');
assert.equal(normalizeAIEndpoint('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
assert.equal(normalizeAIEndpoint('https://api.example.com/v1/chat/completions?key=x'), 'https://api.example.com/v1/chat/completions?key=x');
assert.throws(() => normalizeAIEndpoint('ftp://api.example.com'), /HTTP/);

const migrated = toCustomAISettings({
    activeProviderId: 'custom-backup',
    providers: [
        { id: 'deepseek-default', type: 'deepseek', name: '企业模型', apiKey: 'user-key', model: 'qwen3', apiEndpoint: 'ai.lan/v1' },
        { id: 'custom-backup', type: 'custom', name: '备用接口', apiKey: 'backup-key', model: 'qwen3', apiEndpoint: 'backup.lan/v1' },
        { id: 'gemini-default', type: 'gemini', name: '未配置的内置项', apiKey: '' },
        { id: 'modelscope-free', type: 'openai', name: '共享接口', apiKey: 'built-in-key' },
    ],
});
assert.equal(migrated.providers.length, 2);
assert.ok(migrated.providers.every(provider => provider.type === 'custom'));
assert.equal(migrated.providers[0].apiKey, 'user-key');
assert.equal(migrated.activeProviderId, 'custom-backup');

const removedDefaults = toCustomAISettings({
    activeProviderId: 'deepseek-default',
    providers: [
        { id: 'deepseek-default', type: 'deepseek', name: 'DeepSeek', apiKey: '' },
        { id: 'custom-primary', type: 'custom', name: '我的 AI 接口', apiKey: '', model: '', apiEndpoint: '' },
    ],
});
assert.deepEqual(removedDefaults, { activeProviderId: undefined, providers: [] });

console.log('AI config compatibility checks passed.');
