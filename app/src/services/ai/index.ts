// 智能选择 fetch 实现：Tauri 环境使用 Tauri HTTP，浏览器环境使用标准 fetch
// 注意：由于动态导入的复杂性，我们在这里直接使用浏览器的 fetch
// 在 Tauri 构建时，会使用 @tauri-apps/plugin-http 的 fetch
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

export function withQwen3NoThink(prompt: string, model: string): string {
    return isQwen3Model(model) && !/\/no_think\b/i.test(prompt)
        ? `${prompt}\n/no_think`
        : prompt;
}

export function getOpenAIRequestOptions(
    model: string,
    endpoint: string,
    jsonMode: boolean,
): Record<string, unknown> {
    const qwen3 = isQwen3Model(model);
    const dashScope = /dashscope[^/]*\.aliyuncs\.com/i.test(endpoint);

    return {
        ...(jsonMode && (!qwen3 || dashScope)
            ? { response_format: { type: 'json_object' } }
            : {}),
        ...(qwen3 && dashScope ? { enable_thinking: false } : {}),
    };
}

export function parseOpenAIJsonResponse<T>(data: OpenAIChatResponse): T {
    const choice = data.choices?.[0];
    let content = choice?.message?.content?.trim() ?? '';

    if (!content) {
        if (choice?.finish_reason === 'length') {
            throw new Error('AI 未返回最终结果：输出额度已被思考内容耗尽，请关闭思考模式后重试');
        }
        if (choice?.message?.reasoning_content?.trim()) {
            throw new Error('AI 只返回了思考过程，未返回最终 JSON，请关闭思考模式后重试');
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

export class DeepSeekProvider implements AIProvider {
    private apiKey: string;
    private chatCompletionsUrl: string;  // 存储完整的 API URL
    private model: string;

    constructor(apiKey: string, endpoint: string = 'https://api.deepseek.com', model: string = 'deepseek-chat') {
        this.apiKey = apiKey;

        // 智能处理 endpoint：
        // 1. 移除尾部斜杠
        // 2. 判断是否已经是完整的 chat/completions URL
        let cleanEndpoint = (endpoint || 'https://api.deepseek.com').replace(/\/$/, '');

        // 检查是否已经是完整的 chat/completions URL
        if (cleanEndpoint.endsWith('/chat/completions')) {
            // 已经是完整 URL，直接使用
            this.chatCompletionsUrl = cleanEndpoint;
        } else if (cleanEndpoint.includes('/chat/completions')) {
            // 包含但不是结尾（不太可能发生），直接使用
            this.chatCompletionsUrl = cleanEndpoint;
        } else {
            // 是 base URL，需要拼接 /chat/completions
            this.chatCompletionsUrl = `${cleanEndpoint}/chat/completions`;
        }

        this.model = model;
    }

    async chat(messages: AIMessage[]): Promise<string> {
        if (!this.apiKey) {
            throw new Error('API Key 未配置');
        }

        try {
            const response = await customFetch(this.chatCompletionsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 2000,
                    stream: false,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI 请求失败 (${response.status}): ${errorText}`);
            }

            const data = await response.json() as any;
            const content = data.choices?.[0]?.message?.content || '';
            return content;
        } catch (error) {
            console.error('DeepSeek API Error:', error);
            throw error;
        }
    }

    async generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
        // 强制要求 JSON 格式的 System Prompt
        const jsonSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must response with valid JSON only. No markdown code bocks, no explanations. Just the raw JSON string.`;

        // 对于 DeepSeek，通常建议在 messages 中明确包含 json 格式要求
        // 也可以利用 response_format: { type: 'json_object' } 如果 API 支持

        const messages: AIMessage[] = [
            { role: 'system', content: jsonSystemPrompt },
            { role: 'user', content: withQwen3NoThink(userPrompt, this.model) }
        ];

        if (!this.apiKey) {
            throw new Error('API Key 未配置');
        }

        try {
            const response = await customFetch(this.chatCompletionsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    temperature: 0.1, // Low temperature for factual extraction
                    max_tokens: 4000,
                    ...getOpenAIRequestOptions(this.model, this.chatCompletionsUrl, true),
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI 请求失败 (${response.status}): ${errorText}`);
            }

            const data = await response.json() as OpenAIChatResponse;
            return parseOpenAIJsonResponse<T>(data);
        } catch (error) {
            console.error('DeepSeek API Error:', error);
            throw error;
        }
    }
}

// Anthropic Provider (使用 Messages API)
export class AnthropicProvider implements AIProvider {
    private apiKey: string;
    private messagesUrl: string;
    private model: string;

    constructor(apiKey: string, endpoint: string = 'https://api.anthropic.com/v1/messages', model: string = 'claude-3-5-sonnet-20240620') {
        this.apiKey = apiKey;

        // Anthropic 使用 /v1/messages 端点
        let cleanEndpoint = (endpoint || 'https://api.anthropic.com/v1/messages').replace(/\/$/, '');

        if (cleanEndpoint.endsWith('/messages')) {
            this.messagesUrl = cleanEndpoint;
        } else if (cleanEndpoint.includes('/messages')) {
            this.messagesUrl = cleanEndpoint;
        } else {
            // 是 base URL，拼接 /v1/messages
            if (!cleanEndpoint.includes('/v1')) {
                cleanEndpoint = `${cleanEndpoint}/v1`;
            }
            this.messagesUrl = `${cleanEndpoint}/messages`;
        }

        this.model = model;
    }

    async chat(messages: AIMessage[]): Promise<string> {
        if (!this.apiKey) {
            throw new Error('API Key 未配置');
        }

        try {
            const response = await customFetch(this.messagesUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    max_tokens: 2000,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI 请求失败 (${response.status}): ${errorText}`);
            }

            const data = await response.json() as any;
            // Anthropic 响应格式: { content: [{ type: 'text', text: '...' }] }
            const content = data.content?.[0]?.text || '';
            return content;
        } catch (error) {
            console.error('Anthropic API Error:', error);
            throw error;
        }
    }

    async generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
        if (!this.apiKey) {
            throw new Error('API Key 未配置');
        }

        try {
            // Anthropic 支持 system 参数
            const response = await customFetch(this.messagesUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: this.model,
                    system: systemPrompt + '\n\nIMPORTANT: You must response with valid JSON only. No markdown code blocks, no explanations. Just the raw JSON string.',
                    messages: [
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 4000,
                    temperature: 0.1
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI 请求失败 (${response.status}): ${errorText}`);
            }

            const data = await response.json() as any;
            let content = data.content?.[0]?.text || '';

            // 清理可能的 Markdown 标记
            content = content.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

            try {
                return JSON.parse(content) as T;
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError, 'Raw Content:', content);
                throw new Error('AI 返回的格式不是有效的 JSON');
            }
        } catch (error) {
            console.error('Anthropic API Error:', error);
            throw error;
        }
    }
}

// Factory to get provider instance
// 支持两种参数名：endpoint (旧) 和 apiEndpoint (来自 AIProviderProfile)
export function createAIProvider(config: {
    type: string,
    apiKey: string,
    endpoint?: string,
    apiEndpoint?: string,  // AIProviderProfile 使用这个字段名
    model?: string
}): AIProvider {
    // 优先使用 apiEndpoint，如果没有则使用 endpoint
    const effectiveEndpoint = config.apiEndpoint || config.endpoint;

    switch (config.type) {
        case 'anthropic':
            return new AnthropicProvider(config.apiKey, effectiveEndpoint, config.model);
        case 'deepseek':
            return new DeepSeekProvider(config.apiKey, effectiveEndpoint, config.model);
        default:
            // 所有其他 OpenAI 兼容接口都使用 DeepSeekProvider
            return new DeepSeekProvider(config.apiKey, effectiveEndpoint, config.model);
    }
}
