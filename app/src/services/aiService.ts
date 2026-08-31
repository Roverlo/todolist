/**
 * AI 服务 - 负责测试用户填写的 OpenAI Chat Completions 兼容接口
 */

import { fetch } from '@tauri-apps/plugin-http';
import type { AIProviderProfile } from '../types';
import { normalizeAIEndpoint } from './aiConfig';
import {
    getOpenAIRequestOptions,
    parseOpenAIJsonResponse,
    type OpenAIChatResponse,
} from './ai';

const sameModel = (left: string, right: string) => {
    const normalize = (value: string) => value.trim().toLowerCase();
    const basename = (value: string) => normalize(value).split('/').pop();
    return normalize(left) === normalize(right) || basename(left) === basename(right);
};

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
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        };
        const modelsEndpoint = new URL(endpoint);
        modelsEndpoint.pathname = modelsEndpoint.pathname.replace(/\/chat\/completions$/i, '/models');

        try {
            const modelsResponse = await fetch(modelsEndpoint.toString(), { headers });
            if (modelsResponse.ok) {
                const modelsData = await modelsResponse.json() as {
                    data?: Array<{ id?: string | null }>;
                };
                const modelIds = modelsData.data
                    ?.map(item => item.id?.trim())
                    .filter((id): id is string => Boolean(id)) ?? [];

                if (modelIds.length > 0 && !modelIds.some(id => sameModel(id, model))) {
                    return {
                        success: false,
                        message: `接口可用，但模型列表中没有“${model}”`,
                    };
                }
            }
        } catch {
            // Some OpenAI-compatible gateways do not expose /models; the probe below still validates the route.
        }

        const probe = crypto.randomUUID();
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'system',
                        content: 'Return valid JSON only. No markdown or explanation.',
                    },
                    {
                        role: 'user',
                        content: `Return exactly this JSON object: {"probe":"${probe}"}`,
                    },
                ],
                temperature: 0,
                max_tokens: 16384,
                stream: false,
                ...getOpenAIRequestOptions(model, true),
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

        const data = await response.json() as OpenAIChatResponse;
        const actualModel = data.model?.trim();

        if (!actualModel) {
            return {
                success: false,
                message: '接口已响应，但没有返回实际模型名称，无法验证所填模型',
            };
        }
        if (!sameModel(actualModel, model)) {
            return {
                success: false,
                message: `服务端实际使用模型“${actualModel}”，与填写的“${model}”不一致`,
            };
        }

        const result = parseOpenAIJsonResponse<{ probe?: string }>(data);
        if (result?.probe !== probe) {
            return {
                success: false,
                message: '模型已响应，但未按要求返回测试 JSON；当前配置不适合任务生成',
            };
        }

        return { success: true, message: '配置验证成功！' };
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
