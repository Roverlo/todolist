// 智能选择 fetch 实现：Tauri 环境使用 Tauri HTTP，浏览器环境使用标准 fetch
// 注意：由于动态导入的复杂性，我们在这里直接使用浏览器的 fetch
// 在 Tauri 构建时，会使用 @tauri-apps/plugin-http 的 fetch
const customFetch = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : fetch;

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
            { role: 'user', content: userPrompt }
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
                    temperature: 0.3, // Lower temperature for structured output
                    max_tokens: 4000,
                    response_format: { type: 'json_object' }, // DeepSeek 支持此参数
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI 请求失败 (${response.status}): ${errorText}`);
            }

            const data = await response.json() as any;
            let content = data.choices?.[0]?.message?.content || '';

            // 清理可能的 Markdown 标记
            content = content.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

            try {
                return JSON.parse(content) as T;
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError, 'Raw Content:', content);
                throw new Error('AI 返回的格式不是有效的 JSON');
            }
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
