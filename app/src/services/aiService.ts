/**
 * AI 服务 - 负责调用 AI API 生成任务
 */

import { fetch } from '@tauri-apps/plugin-http';
import type { AIProviderType, AIProviderProfile } from '../types';

// ==================== AI 提供商配置 ====================

const AI_PROVIDERS: Record<AIProviderType, {
    name: string;
    defaultEndpoint: string;
    defaultModel: string;
}> = {
    deepseek: {
        name: 'DeepSeek',
        defaultEndpoint: 'https://api.deepseek.com/chat/completions',
        defaultModel: 'deepseek-chat',
    },
    openai: {
        name: 'OpenAI',
        defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o',
    },
    qwen: {
        name: 'Qwen (通义千问)',
        defaultEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        defaultModel: 'qwen-plus',
    },
    moonshot: {
        name: 'Kimi (Moonshot)',
        defaultEndpoint: 'https://api.moonshot.cn/v1/chat/completions',
        defaultModel: 'moonshot-v1-8k',
    },
    yi: {
        name: 'Yi (零一万物)',
        defaultEndpoint: 'https://api.lingyiwanwu.com/v1/chat/completions',
        defaultModel: 'yi-lightning',
    },
    gemini: {
        name: 'Google Gemini',
        defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        defaultModel: 'gemini-2.0-flash-exp',
    },
    anthropic: {
        name: 'Anthropic Claude',
        defaultEndpoint: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-3-5-sonnet-20240620',
    },
    custom: {
        name: '自定义',
        defaultEndpoint: '',
        defaultModel: '',
    },
};

// ==================== 工具函数 ====================

/**
 * 获取 AI 提供商信息
 */
export function getProviderInfo(type: AIProviderType) {
    return AI_PROVIDERS[type] ?? AI_PROVIDERS.custom;
}

/**
 * 获取所有提供商选项
 */
export function getProviderOptions(): { type: AIProviderType; name: string }[] {
    return Object.entries(AI_PROVIDERS).map(([type, config]) => ({
        type: type as AIProviderType,
        name: config.name,
    }));
}

// (Removed unused TASK_EXTRACTION_PROMPT and generateTasksFromNote)

// ==================== 测试连接 ====================

/**
 * 测试 AI 连接
 */
export async function testAIConnection(
    profile: AIProviderProfile
): Promise<{ success: boolean; message: string }> {
    if (!profile.apiKey) {
        return { success: false, message: '请输入 API Key' };
    }

    const providerConfig = getProviderInfo(profile.type);
    const endpoint = profile.apiEndpoint || providerConfig.defaultEndpoint;
    const model = profile.model || providerConfig.defaultModel;

    if (!endpoint) {
        return { success: false, message: '请配置 API 端点' };
    }

    try {
        const isAnthropic = profile.type === 'anthropic';
        let response;

        if (isAnthropic) {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': profile.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: 'user',
                            content: '请回复 OK',
                        },
                    ],
                    max_tokens: 10,
                }),
            });
        } else {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${profile.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: 'user',
                            content: '请回复 OK',
                        },
                    ],
                    max_tokens: 10,
                }),
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                // 尝试从各种可能的错误格式中提取信息
                errorMessage = errorJson.error?.message
                    || errorJson.error?.type
                    || errorJson.message
                    || errorJson.detail
                    || errorJson.msg
                    || `HTTP ${response.status}: ${response.statusText}`;
            } catch {
                // 如果不是JSON，使用原始文本（截断显示）
                if (errorText.length > 100) {
                    errorMessage = `HTTP ${response.status}: ${errorText.substring(0, 100)}...`;
                } else if (errorText) {
                    errorMessage = `HTTP ${response.status}: ${errorText}`;
                }
            }
            console.error('[AI Test] Failed:', { status: response.status, errorText });
            return { success: false, message: errorMessage };
        }

        return { success: true, message: '连接成功！' };
    } catch (error) {
        console.error('[AI Test] Error:', error);
        // 提供更详细的网络错误信息
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('network') || errMsg.includes('fetch')) {
            return { success: false, message: `网络错误: ${errMsg}` };
        }
        if (errMsg.includes('timeout')) {
            return { success: false, message: '连接超时，请检查网络' };
        }
        return {
            success: false,
            message: errMsg || '连接失败',
        };
    }
}
