/**
 * AI 服务 - 负责调用 AI API 生成任务
 */

import { fetch } from '@tauri-apps/plugin-http';
import type { AISettings, AIGeneratedTask, Priority, AIProviderType, AIProviderProfile } from '../types';

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

// ... (PROMPT constant remains unchanged) ...
const TASK_EXTRACTION_PROMPT = `你是一个任务提取助手。请从以下内容中提取所有可操作的待办事项。

内容：
{content}

当前日期：{currentDate}

请返回 JSON 数组格式，每个任务包含：
- title: 任务标题（简洁明了）
- priority: 优先级 (high/medium/low)
- dueDate: 截止日期 (YYYY-MM-DD 格式)，如果内容中提到"明天"、"下周"等相对时间，请转换为具体日期。如无法确定则为 null
- owner: 责任人（如有提及）

注意：
1. 只提取明确的待办事项，不要把描述性内容当作任务
2. 如果内容中包含多个子项或编号列表，通常每个子项都是一个独立任务
3. 优先级判断规则：含有"紧急"、"立即"、"尽快"等词的为 high；含有"重要"、"关键"的为 medium；其他为 low

请仅返回 JSON 数组，不要添加任何其他说明或代码块标记。`;

// ==================== 类型定义 ====================

export interface AIServiceResult {
    success: boolean;
    tasks?: AIGeneratedTask[];
    error?: string;
}

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

// ==================== 核心服务函数 ====================

/**
 * 调用 AI 生成任务
 */
export async function generateTasksFromNote(
    content: string,
    settings: AISettings,
    currentDate: string = new Date().toISOString().split('T')[0]
): Promise<AIServiceResult> {
    // 获取活跃的提供商
    const activeProvider = settings.providers.find(p => p.id === settings.activeProviderId);

    if (!activeProvider) {
        return {
            success: false,
            error: '请先配置 AI 提供商',
        };
    }

    if (!activeProvider.apiKey) {
        return {
            success: false,
            error: '请配置 API Key',
        };
    }

    const providerConfig = getProviderInfo(activeProvider.type);
    const endpoint = activeProvider.apiEndpoint || providerConfig.defaultEndpoint;
    const model = activeProvider.model || providerConfig.defaultModel;

    if (!endpoint) {
        return {
            success: false,
            error: '请配置 API 端点',
        };
    }

    // 构建 prompt
    const prompt = TASK_EXTRACTION_PROMPT
        .replace('{content}', content)
        .replace('{currentDate}', currentDate);

    try {
        let response;
        const isAnthropic = activeProvider.type === 'anthropic';

        if (isAnthropic) {
            // Anthropic Header & Body
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': activeProvider.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    max_tokens: 2000,
                }),
            });
        } else {
            // OpenAI Compatible
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeProvider.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    temperature: 0.3,
                    max_tokens: 2000,
                }),
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('AI API Error:', errorText);
            return {
                success: false,
                error: `API 调用失败: ${response.status} ${response.statusText}`,
            };
        }

        const data = await response.json();
        let messageContent = '';

        if (isAnthropic) {
            // Anthropic Response: { content: [{ type: 'text', text: '...' }] }
            if (Array.isArray(data.content) && data.content[0]?.text) {
                messageContent = data.content[0].text;
            }
        } else {
            // OpenAI Response
            messageContent = data.choices?.[0]?.message?.content;
        }

        if (!messageContent) {
            return {
                success: false,
                error: '未能获取 AI 响应内容',
            };
        }

        // 解析返回的 JSON
        const tasks = parseAIResponse(messageContent);

        return {
            success: true,
            tasks: tasks.map(t => ({ ...t, selected: true })),
        };
    } catch (error) {
        console.error('AI Service Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误',
        };
    }
}

/**
 * 解析 AI 返回的 JSON 内容
 */
function parseAIResponse(content: string): AIGeneratedTask[] {
    try {
        // 尝试直接解析
        let jsonContent = content.trim();

        // 如果包含代码块标记，提取其中的内容
        const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            jsonContent = codeBlockMatch[1].trim();
        }

        const parsed = JSON.parse(jsonContent);

        if (!Array.isArray(parsed)) {
            console.warn('AI response is not an array:', parsed);
            return [];
        }

        return parsed.map((item: any) => ({
            title: String(item.title || '').trim(),
            priority: validatePriority(item.priority),
            dueDate: validateDate(item.dueDate),
            owner: item.owner ? String(item.owner).trim() : undefined,
        })).filter(task => task.title);
    } catch (error) {
        console.error('Failed to parse AI response:', error, content);
        return [];
    }
}

/**
 * 验证优先级
 */
function validatePriority(value: any): Priority | undefined {
    const validPriorities: Priority[] = ['high', 'medium', 'low'];
    if (typeof value === 'string' && validPriorities.includes(value as Priority)) {
        return value as Priority;
    }
    return undefined;
}

/**
 * 验证日期格式
 */
function validateDate(value: any): string | undefined {
    if (!value || value === 'null') return undefined;

    const dateStr = String(value);
    // 检查 YYYY-MM-DD 格式
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return dateStr;
        }
    }
    return undefined;
}

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
