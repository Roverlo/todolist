import { useState, useEffect } from 'react';
import { Icon } from '../ui/Icon';
import { AlertDialog } from '../ui/AlertDialog';
import { useAppStore } from '../../state/appStore';
import type { AIProviderProfile } from '../../types';
import { nanoid } from 'nanoid';
import './AISettingsModal.css';

interface AISettingsModalProps {
    onClose: () => void;
}

export function AISettingsModal({ onClose }: AISettingsModalProps) {
    const aiSettings = useAppStore((state) => state.settings.ai);
    const updateAISettings = useAppStore((state) => state.updateAISettings);

    // Initial Default Providers
    // 注意：endpoint 必须包含完整路径（包含 /chat/completions），因为 aiService 会直接使用该地址
    // 模型版本更新于 2026-01-05，请定期检查各厂商最新模型
    const defaultProviders: AIProviderProfile[] = [
        {
            id: 'deepseek-default',
            type: 'deepseek',
            name: 'DeepSeek',
            model: 'deepseek-chat',
            apiEndpoint: 'https://api.deepseek.com/chat/completions',
            apiKey: ''
        },
        {
            id: 'moonshot-default',
            type: 'moonshot',
            name: 'Kimi (Moonshot)',
            model: 'moonshot-v1-8k',
            apiEndpoint: 'https://api.moonshot.cn/v1/chat/completions',
            apiKey: ''
        },
        {
            id: 'qwen-default',
            type: 'qwen',
            name: '通义千问 (Qwen)',
            model: 'qwen-plus',
            apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            apiKey: ''
        },
        {
            id: 'yi-default',
            type: 'yi',
            name: '零一万物 (Yi)',
            model: 'yi-lightning',
            apiEndpoint: 'https://api.lingyiwanwu.com/v1/chat/completions',
            apiKey: ''
        },
        {
            id: 'gemini-default',
            type: 'gemini',
            name: 'Google Gemini',
            model: 'gemini-2.0-flash-exp',
            apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            apiKey: ''
        },
        {
            id: 'anthropic-default',
            type: 'anthropic',
            name: 'Anthropic Claude',
            model: 'claude-3-5-sonnet-20240620',
            apiEndpoint: 'https://api.anthropic.com/v1/messages',
            apiKey: ''
        },
        {
            id: 'openai-default',
            type: 'openai',
            name: 'OpenAI',
            model: 'gpt-4o',
            apiEndpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: ''
        }
    ];



    // Merge existing settings with defaults
    // If settings exist, ensure all default providers are present and fix legacy endpoints
    let initialProviders = defaultProviders;

    if (aiSettings?.providers && aiSettings.providers.length > 0) {
        // 1. 保留自定义 Provider
        const customProviders = aiSettings.providers.filter(p => p.id.startsWith('custom-'));

        // 2. 对默认 Provider，始终使用代码中硬编码的配置（确保 Endpoint 正确），但保留用户的 API Key
        const mergedDefaultProviders = defaultProviders.map(def => {
            const saved = aiSettings.providers.find(p => p.id === def.id);
            return saved ? { ...def, apiKey: saved.apiKey } : def;
        });

        // 3. 合并
        initialProviders = [...mergedDefaultProviders, ...customProviders];
    }

    const [providers, setProviders] = useState<AIProviderProfile[]>(initialProviders);
    const [selectedProviderId, setSelectedProviderId] = useState<string>(aiSettings?.activeProviderId || 'deepseek-default');

    // Ensure selected provider exists
    useEffect(() => {
        if (!providers.find(p => p.id === selectedProviderId)) {
            setSelectedProviderId(providers[0]?.id || '');
        }
    }, [providers, selectedProviderId]);

    const activeProvider = providers.find(p => p.id === selectedProviderId);

    const [providerName, setProviderName] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('');
    const [endpoint, setEndpoint] = useState('');
    const [showKey, setShowKey] = useState(false);

    // Sync state with selected provider
    useEffect(() => {
        if (activeProvider) {
            setProviderName(activeProvider.name);
            setApiKey(activeProvider.apiKey || '');
            setModel(activeProvider.model || '');
            setEndpoint(activeProvider.apiEndpoint || '');
        }
    }, [activeProvider]);

    const handleAddCustom = () => {
        const newId = `custom-${nanoid()}`;
        const newProvider: AIProviderProfile = {
            id: newId,
            type: 'openai',
            name: '自定义接口',
            model: 'gpt-3.5-turbo',
            apiEndpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: ''
        };
        setProviders([...providers, newProvider]);
        setSelectedProviderId(newId);
    };

    const handleDelete = (id: string) => {
        const newProviders = providers.filter(p => p.id !== id);
        setProviders(newProviders);
        // Also update store immediately? Or wait for save?
        // Logic suggests likely wait for save, but usage in original code might have been direct.
        // Let's assume updating local state is enough until Save is clicked, EXCEPT the UI might depend on it.
        // However, the original code I see usually had separate delete. 
        // Re-reading context, `handleDelete` was passed `activeProvider.id`.
        // To be safe and consistent with `handleSave`, let's just update local providers state.
        // But wait, if I delete the active one, I need to switch selection.
        if (selectedProviderId === id) {
            setSelectedProviderId(newProviders[0]?.id || '');
        }
    };

    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertContent, setAlertContent] = useState('');

    const handleTestConnection = async () => {
        if (!apiKey) {
            setTestStatus('error');
            setTestMessage('请输入 API Key');
            return;
        }

        setTestStatus('testing');
        setTestMessage('连接中...');

        try {
            const result = await import('../../services/aiService').then(m => m.testAIConnection({
                id: activeProvider?.id || 'temp',
                type: activeProvider?.type || 'openai',
                name: providerName,
                apiKey,
                model,
                apiEndpoint: endpoint
            }));

            if (result.success) {
                setTestStatus('success');
                setTestMessage('连接成功');
                setTimeout(() => {
                    setTestStatus('idle');
                    setTestMessage('');
                }, 2000);
            } else {
                setTestStatus('error');
                setTestMessage(result.message);
            }
        } catch (err) {
            setTestStatus('error');
            setTestMessage('连接失败');
        }
    };

    const handleSave = () => {
        if (!activeProvider) return;

        const updatedProviders = providers.map(p => {
            if (p.id === selectedProviderId) {
                return {
                    ...p,
                    name: providerName,
                    apiKey: apiKey.trim(),
                    model: model.trim(),
                    apiEndpoint: endpoint.trim()
                };
            }
            return p;
        });

        setProviders(updatedProviders); // Update local state

        // Push to store
        updateAISettings({
            activeProviderId: selectedProviderId,
            providers: updatedProviders
        });

        // Optional: Close on save or just show success? For now close roughly matching standard behavior
        // But user might want to configure multiple. Let's just save.
        // onClose(); 
    };

    return (
        <div className="ai-settings-overlay">
            <div className="ai-settings-modal">
                {/* Left Sidebar */}
                <div className="ai-settings-sidebar">
                    <div className="ai-settings-sidebar-header">
                        <span>AI 服务列表</span>
                    </div>
                    <div className="ai-settings-provider-list">
                        {providers.map(p => (
                            <div
                                key={p.id}
                                className={`ai-provider-item ${selectedProviderId === p.id ? 'active' : ''}`}
                                onClick={() => {
                                    setSelectedProviderId(p.id);
                                    setTestStatus('idle');
                                    setTestMessage('');
                                }}
                            >
                                <div className="ai-provider-info">
                                    <span className="ai-provider-name">{p.name}</span>
                                    <span className="ai-provider-status">
                                        {p.apiKey ? '已配置' : '去配置'}
                                    </span>
                                </div>
                                {aiSettings?.activeProviderId === p.id && (
                                    <Icon name="check" size={14} className="ai-active-indicator" />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="ai-settings-sidebar-footer">
                        <button className="ai-btn-add" onClick={handleAddCustom}>
                            <Icon name="plus" size={14} />
                            <span>添加自定义接口</span>
                        </button>
                    </div>
                </div>

                {/* Right Content */}
                <div className="ai-settings-content">
                    <div className="ai-settings-header">
                        <h2 className="ai-settings-title">配置服务商</h2>
                        <button className="ai-settings-close-btn" onClick={onClose}>
                            <Icon name="close" size={20} />
                        </button>
                    </div>

                    {activeProvider ? (
                        <>
                            <div className="ai-settings-form">
                                {/* Provider Name (Editable for custom) */}
                                <div className="ai-form-group">
                                    <label>显示名称</label>
                                    <input
                                        type="text"
                                        value={providerName}
                                        onChange={(e) => setProviderName(e.target.value)}
                                        className="ai-input"
                                        placeholder="例如：我的私有部署"
                                    />
                                </div>

                                <div className="ai-form-group">
                                    <label>API Key <span className="required">*</span></label>
                                    <div className="ai-input-wrapper">
                                        <input
                                            type={showKey ? "text" : "password"}
                                            value={apiKey}
                                            onChange={(e) => {
                                                setApiKey(e.target.value);
                                                setTestStatus('idle');
                                                setTestMessage('');
                                            }}
                                            placeholder="sk-..."
                                            className="ai-input"
                                        />
                                        <button
                                            className="ai-eye-btn"
                                            onClick={() => setShowKey(!showKey)}
                                            type="button"
                                        >
                                            <Icon name={showKey ? "eye-off" : "eye"} size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="ai-form-group">
                                    <label>模型名称 (Model)</label>
                                    <input
                                        type="text"
                                        value={model}
                                        onChange={(e) => {
                                            setModel(e.target.value);
                                            setTestStatus('idle');
                                            setTestMessage('');
                                        }}
                                        className="ai-input"
                                        placeholder="如: deepseek-chat"
                                    />
                                </div>

                                <div className="ai-form-group">
                                    <label>API 代理地址 (Base URL)</label>
                                    <div className="ai-input-wrapper">
                                        <input
                                            type="text"
                                            value={endpoint}
                                            onChange={(e) => setEndpoint(e.target.value)}
                                            className={`ai-input ${!activeProvider?.id.startsWith('custom-') ? 'ai-input-disabled' : ''}`}
                                            placeholder="https://api..."
                                            disabled={!activeProvider?.id.startsWith('custom-')}
                                            title={!activeProvider?.id.startsWith('custom-') ? "官方接口地址不可修改，如需使用代理请添加自定义接口" : ""}
                                        />
                                        {!activeProvider?.id.startsWith('custom-') && (
                                            <Icon name="lock" size={14} className="ai-input-lock-icon" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="ai-settings-footer">
                                {/* 第一行：测试连接区域 */}
                                <div className="ai-footer-row">
                                    <div className="ai-test-area">
                                        <button
                                            className="btn btn-test"
                                            onClick={handleTestConnection}
                                            disabled={testStatus === 'testing'}
                                            type="button"
                                            data-status={testStatus}
                                            style={{ width: 'auto', minWidth: '120px' }}
                                        >
                                            {testStatus === 'testing' ? (
                                                <Icon name="refresh" size={14} className="spin" />
                                            ) : (
                                                <Icon name="refresh" size={14} />
                                            )}
                                            <span>{testStatus === 'testing' ? '测试中...' : '测试连接'}</span>
                                        </button>

                                        {/* 测试结果状态显示 */}
                                        {(testStatus === 'success' || testStatus === 'error') && (
                                            <div className="ai-test-result">
                                                {testStatus === 'success' ? (
                                                    <span className="ai-test-status-text success">
                                                        <Icon name="check" size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                                                        连接成功
                                                    </span>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                                                        <span className="ai-test-status-text error">
                                                            <Icon name="warning" size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                                                            连接失败
                                                        </span>
                                                        {testMessage && (
                                                            <button
                                                                className="ai-view-details-btn"
                                                                onClick={() => {
                                                                    setAlertContent(testMessage);
                                                                    setAlertOpen(true);
                                                                }}
                                                                type="button"
                                                            >
                                                                查看详情
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 第二行：操作按钮 */}
                                <div className="ai-footer-row">
                                    {activeProvider.id.startsWith('custom-') ? (
                                        <button
                                            className="btn btn-danger-ghost"
                                            onClick={() => handleDelete(activeProvider.id)}
                                            type="button"
                                        >
                                            删除此配置
                                        </button>
                                    ) : (
                                        <div></div>
                                    )}

                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSave}
                                        type="button"
                                    >
                                        保存并选中
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="ai-empty-state">请选择左侧服务商</div>
                    )}
                </div>
            </div>

            <AlertDialog
                open={alertOpen}
                title="连接测试失败"
                message={alertContent}
                variant="danger"
                onClose={() => setAlertOpen(false)}
            />
        </div>
    );
}
