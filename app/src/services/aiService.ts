/**
 * AI 服务 - 负责测试用户填写的 OpenAI Chat Completions 兼容接口
 */

import { fetch } from '@tauri-apps/plugin-http';
import type { AIProviderProfile } from '../types';
import { normalizeAIEndpoint } from './aiConfig';

export async function testAIConnection(
    profile: AIProviderProfile
): Promise<{ success: boolean; message: string }> {
    const apiKey = profile.apiKey?.trim();
    const model = profile.model?.trim();

    if (!apiKey) return { success: false, message: '请输入 API Key' };
    if (!model) return { success: false, message: '请输入模型名称' };

    let endpoint: string;
    try {
        endpoint = normalizeAIEndpoint(profile.apiEndpoint || '');
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : '接口 URL 格式不正确',
        };
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: '请回复 OK' }],
                max_tokens: 10,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error?.message
                    || errorJson.error?.type
                    || errorJson.message
                    || errorJson.detail
                    || errorJson.msg
                    || `HTTP ${response.status}: ${response.statusText}`;
            } catch {
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
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('network') || errMsg.includes('fetch')) {
            return { success: false, message: `网络错误: ${errMsg}` };
        }
        if (errMsg.includes('timeout')) {
            return { success: false, message: '连接超时，请检查网络' };
        }
        return { success: false, message: errMsg || '连接失败' };
    }
}
