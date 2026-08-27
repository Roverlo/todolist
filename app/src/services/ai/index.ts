import { normalizeAIEndpoint } from '../aiConfig';

const customFetch = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : fetch;

export interface OpenAIChatResponse {
    choices?: Array<{
        finish_reason?: string | null;
        message?: {
            content?: string | null;
            reasoning_content?: string | null;
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
    return Boolean(message?.content?.trim() || message?.reasoning_content?.trim());
}

export function parseOpenAIJsonResponse<T>(data: OpenAIChatResponse): T {
    const choice = data.choices?.[0];
    let content = choice?.message?.content?.trim() ?? '';

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

export interface AIProvider {
    chat(messages: AIMessage[]): Promise<string>;
    generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T>;
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

    async chat(messages: AIMessage[]): Promise<string> {
        this.ensureConfigured();

        const response = await customFetch(this.chatCompletionsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages,
                temperature: 0.7,
                max_tokens: 2000,
                stream: false,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI 请求失败 (${response.status}): ${errorText}`);
        }

        const data = await response.json() as OpenAIChatResponse;
        return data.choices?.[0]?.message?.content || '';
    }

    async generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
        this.ensureConfigured();
        const messages: AIMessage[] = [
            {
                role: 'system',
                content: `${systemPrompt}\n\nIMPORTANT: You must response with valid JSON only. No markdown code blocks, no explanations. Just the raw JSON string.`,
            },
            { role: 'user', content: userPrompt }
        ];

        const response = await customFetch(this.chatCompletionsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages,
                temperature: 0.1,
                max_tokens: 16384,
                stream: false,
                ...getOpenAIRequestOptions(this.model, true),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI 请求失败 (${response.status}): ${errorText}`);
        }

        const data = await response.json() as OpenAIChatResponse;
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
