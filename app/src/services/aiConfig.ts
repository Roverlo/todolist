import type { AIProviderProfile, AISettings } from '../types';

const LEGACY_SINGLE_PROVIDER_ID = 'custom-primary';

const isCustomProvider = (provider: AIProviderProfile) =>
    provider.type === 'custom' || provider.id.startsWith('custom-');

const hasUserKey = (provider: AIProviderProfile) =>
    provider.id !== 'modelscope-free' && Boolean(provider.apiKey?.trim());

const isGeneratedBlankProfile = (provider: AIProviderProfile) =>
    provider.id === LEGACY_SINGLE_PROVIDER_ID
    && (!provider.name.trim() || provider.name.trim() === '我的 AI 接口')
    && !provider.apiKey?.trim()
    && !provider.model?.trim()
    && !provider.apiEndpoint?.trim();

export function toCustomAISettings(settings?: AISettings): AISettings {
    const providers = (settings?.providers ?? [])
        .filter(provider => provider.id !== 'modelscope-free')
        .filter(provider => !isGeneratedBlankProfile(provider))
        .filter(provider => isCustomProvider(provider) || hasUserKey(provider))
        .map(provider => ({
            id: provider.id,
            type: 'custom' as const,
            name: provider.name.trim() || '未命名接口',
            apiKey: provider.apiKey?.trim() || '',
            model: provider.model?.trim() || '',
            apiEndpoint: provider.apiEndpoint?.trim() || '',
        }));

    const activeProviderId = providers.some(provider => provider.id === settings?.activeProviderId)
        ? settings?.activeProviderId
        : providers[0]?.id;

    return {
        activeProviderId,
        providers,
    };
}

const usesLocalHttp = (value: string) => {
    const authority = value.split('/')[0].replace(/^.*@/, '').toLowerCase();
    const host = authority.startsWith('[')
        ? authority.slice(1, authority.indexOf(']'))
        : authority.split(':')[0];
    const parts = host.split('.').map(Number);

    return host === 'localhost'
        || host === '::1'
        || host.endsWith('.local')
        || host.endsWith('.lan')
        || host.endsWith('.internal')
        || (!host.includes('.') && !host.includes(':'))
        || /^(fc|fd|fe[89ab])/i.test(host)
        || parts[0] === 10
        || parts[0] === 127
        || (parts[0] === 169 && parts[1] === 254)
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168);
};

export function normalizeAIEndpoint(input: string): string {
    const value = input.trim();
    if (!value) throw new Error('请输入接口 URL');

    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
        ? value
        : `${usesLocalHttp(value) ? 'http' : 'https'}://${value}`;

    let url: URL;
    try {
        url = new URL(withProtocol);
    } catch {
        throw new Error('接口 URL 格式不正确');
    }

    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
        throw new Error('接口 URL 仅支持 HTTP 或 HTTPS');
    }
    if (url.username || url.password) {
        throw new Error('请不要在接口 URL 中填写账号或密码');
    }

    url.hash = '';
    const path = url.pathname.replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(path)) {
        url.pathname = path;
    } else if (!path) {
        url.pathname = '/v1/chat/completions';
    } else {
        url.pathname = `${path}/chat/completions`;
    }

    return url.toString();
}
