import { normalizeAIEndpoint } from '../aiConfig';

const customFetch = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : fetch;

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIProvider {
    chat(messages: AIMessage[]): Promise<string>;
    generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T>;
}

interface ChatCompletionResponse {
    choices?: Array<{ message?: { content?: string } }>;
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

        const data = await response.json() as ChatCompletionResponse;
        return data.choices?.[0]?.message?.content || '';
    }

    async generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
        this.ensureConfigured();
        const messages: AIMessage[] = [
            {
                role: 'system',
                content: `${systemPrompt}\n\nIMPORTANT: You must response with valid JSON only. No markdown code blocks, no explanations. Just the raw JSON string.`,
            },
            { role: 'user', content: userPrompt },
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
                max_tokens: 4000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI 请求失败 (${response.status}): ${errorText}`);
        }

        const data = await response.json() as ChatCompletionResponse;
        const content = (data.choices?.[0]?.message?.content || '')
            .replace(/^```json\s*/, '')
            .replace(/^```\s*/, '')
            .replace(/\s*```$/, '');

        try {
            return JSON.parse(content) as T;
        } catch (error) {
            console.error('JSON Parse Error:', error, 'Raw Content:', content);
            throw new Error('AI 返回的格式不是有效的 JSON');
        }
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
