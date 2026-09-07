import { fetch } from '@tauri-apps/plugin-http';
import { normalizeAIEndpoint } from '../aiConfig';

export interface OpenAIChatResponse {
    model?: string | null;
    choices?: Array<{
        finish_reason?: string | null;
        message?: {
            content?: string | Array<{ type: string; text?: string }> | null;
            reasoning_content?: string | null;
            refusal?: string | null;
        };
    }>;
}

export function isQwen3Model(model: string): boolean {
    return /qwen3/i.test(model);
}

export function getOpenAIRequestOptions(
    model: string,
    jsonMode: boolean,
): Record<string, unknown> {
    return jsonMode && !isQwen3Model(model)
        ? { response_format: { type: 'json_object' } }
        : {};
}

export function hasOpenAIReply(data: OpenAIChatResponse): boolean {
    const message = data.choices?.[0]?.message;
    return Boolean(replyText(data) || message?.reasoning_content?.trim());
}

function replyText(data: OpenAIChatResponse): string {
    const content = data?.choices?.[0]?.message?.content;
    return (typeof content === 'string' ? content : Array.isArray(content)
        ? content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('')
        : '').trim();
}

export function parseOpenAIJsonResponse<T>(data: OpenAIChatResponse): T {
    const choice = data?.choices?.[0];
    let content = replyText(data);

    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') {
        throw new Error('模型未能处理这段内容，请检查笔记或更换模型后重试');
    }
    if (content && choice?.finish_reason === 'length') {
        throw new Error('AI 返回的 JSON 被截断（输出额度不足）；请缩短笔记后重试');
    }

    if (!content) {
        if (choice?.finish_reason === 'length') {
            throw new Error('AI 的思考过程耗尽了输出额度，尚未返回最终 JSON；请缩短笔记后重试');
        }
        if (choice?.message?.reasoning_content?.trim()) {
            throw new Error('接口只返回了思考过程，未返回最终 JSON；请检查服务端是否会继续返回 content');
        }
        throw new Error('AI 接口响应成功，但没有返回可用内容');
    }

    content = content
        .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
        .replace(/^[\s\S]*?<\/think>\s*/i, '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    const json = firstBrace >= 0 && lastBrace > firstBrace
        ? content.slice(firstBrace, lastBrace + 1)
        : content;

    try {
        return JSON.parse(json) as T;
    } catch (error) {
        console.error('JSON Parse Error:', error, { finishReason: choice?.finish_reason });
        throw new Error('AI 返回的格式不是有效的 JSON');
    }
}

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface OpenAIChatRequest {
    model: string;
    messages: AIMessage[];
    temperature?: number;
    max_tokens?: number;
    max_completion_tokens?: number;
    stream: false;
    response_format?: unknown;
}

// Retry only explicit parameter rejections, never a failed generation or transport error.
// Five requests cover JSON mode, temperature, token-name and token-limit adjustments.
export async function requestOpenAIChat(
    endpoint: string, apiKey: string, request: OpenAIChatRequest, signal?: AbortSignal,
): Promise<OpenAIChatResponse> {
    const body = { ...request };
    for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        const response = await fetch(endpoint, {
            signal, method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
        });
        if (response.ok) return await response.json() as OpenAIChatResponse;

        const errorText = await response.text();
        const failure = new Error(`AI 请求失败 (${response.status}): ${errorText.slice(0, 1000)}`);
        if (attempt >= 4 || ![400, 422].includes(response.status)) throw failure;
        signal?.throwIfAborted();
        const mentions = (parameter: string) => new RegExp(`\\b${parameter}\\b`, 'i').test(errorText);
        const unsupported = /unsupported|not[ _-]+supported|not[ _-]+compatible|does not support|unknown (?:field|parameter)|unrecognized|extra_forbidden|extra inputs are not permitted|not allowed/i.test(errorText);
        const tokenField = body.max_completion_tokens !== undefined ? 'max_completion_tokens' : 'max_tokens';
        const limit = errorText.match(/(?:maximum(?: (?:allowed|value))?(?:\s*(?:is|of|:|=))?|at most|less than or equal to|<=|"(?:le|limit_value)"\s*:)\s*(\d+)/i);
        if (unsupported && mentions('response_format') && body.response_format !== undefined) {
            delete body.response_format;
        } else if (unsupported && mentions('temperature') && body.temperature !== undefined) {
            delete body.temperature;
        } else if (unsupported && mentions('max_tokens') && body.max_tokens !== undefined) {
            body.max_completion_tokens = body.max_tokens;
            delete body.max_tokens;
        } else if (mentions(tokenField) && limit && Number(limit[1]) > 0 && Number(limit[1]) < (body[tokenField] ?? 0)) {
            body[tokenField] = Number(limit[1]);
        } else {
            throw failure;
        }
    }
}

export interface AIProvider {
    chat(messages: AIMessage[], signal?: AbortSignal): Promise<string>;
    generateJson<T>(systemPrompt: string, userPrompt: string, signal?: AbortSignal): Promise<T>;
}

class OpenAICompatibleProvider implements AIProvider {
    private apiKey: string;
    private chatCompletionsUrl: string;
    private model: string;

    constructor(apiKey: string, endpoint: string, model: string) {
        this.apiKey = apiKey.trim();
        this.chatCompletionsUrl = normalizeAIEndpoint(endpoint);
        this.model = model.trim();
    }

    private ensureConfigured() {
        if (!this.apiKey) throw new Error('API Key 未配置');
        if (!this.model) throw new Error('模型名称未配置');
    }

    async chat(messages: AIMessage[], signal?: AbortSignal): Promise<string> {
        this.ensureConfigured();

        const data = await requestOpenAIChat(this.chatCompletionsUrl, this.apiKey, {
            model: this.model, messages, temperature: 0.7, max_tokens: 2000, stream: false,
        }, signal);
        return replyText(data);
    }

    async generateJson<T>(systemPrompt: string, userPrompt: string, signal?: AbortSignal): Promise<T> {
        this.ensureConfigured();
        const messages: AIMessage[] = [
            {
                role: 'system',
                content: `${systemPrompt}\n\nIMPORTANT: You must response with valid JSON only. No markdown code blocks, no explanations. Just the raw JSON string.`,
            },
            { role: 'user', content: userPrompt }
        ];

        const data = await requestOpenAIChat(this.chatCompletionsUrl, this.apiKey, {
            model: this.model, messages, temperature: 0.1, max_tokens: 16384, stream: false,
            ...getOpenAIRequestOptions(this.model, true),
        }, signal);
        return parseOpenAIJsonResponse<T>(data);
    }
}

export function createAIProvider(config: {
    type: string;
    apiKey: string;
    endpoint?: string;
    apiEndpoint?: string;
    model?: string;
}): AIProvider {
    return new OpenAICompatibleProvider(
        config.apiKey,
        config.apiEndpoint || config.endpoint || '',
        config.model || ''
    );
}
