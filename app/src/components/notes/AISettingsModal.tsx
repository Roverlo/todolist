import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { AlertDialog } from '../ui/AlertDialog';
import { useAppStore } from '../../state/appStore';
import type { AIProviderProfile } from '../../types';
import { normalizeAIEndpoint } from '../../services/aiConfig';
import { testAIConnection } from '../../services/aiService';
import './AISettingsModal.css';

interface AISettingsModalProps {
    onClose: () => void;
    onSaved?: () => void;
}

const NEW_PROVIDER_ID = '__new__';

export function AISettingsModal({ onClose, onSaved }: AISettingsModalProps) {
    const aiSettings = useAppStore((state) => state.settings.ai);
    const updateAISettings = useAppStore((state) => state.updateAISettings);
    const providers = aiSettings?.providers ?? [];
    const [selectedProviderId, setSelectedProviderId] = useState(
        aiSettings?.activeProviderId ?? providers[0]?.id ?? NEW_PROVIDER_ID
    );
    const activeProvider = providers.find(provider => provider.id === selectedProviderId);

    const [providerName, setProviderName] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('');
    const [endpoint, setEndpoint] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertContent, setAlertContent] = useState('');

    useEffect(() => {
        if (selectedProviderId === NEW_PROVIDER_ID) {
            setProviderName('');
            setApiKey('');
            setModel('');
            setEndpoint('');
            return;
        }

        const provider = aiSettings?.providers.find(item => item.id === selectedProviderId);
        if (provider) {
            setProviderName(provider.name);
            setApiKey(provider.apiKey || '');
            setModel(provider.model || '');
            setEndpoint(provider.apiEndpoint || '');
        }
    }, [aiSettings, selectedProviderId]);

    let endpointPreview = '';
    let endpointError = '';
    if (endpoint.trim()) {
        try {
            endpointPreview = normalizeAIEndpoint(endpoint);
        } catch (error) {
            endpointError = error instanceof Error ? error.message : '接口 URL 格式不正确';
        }
    }

    const clearTestStatus = () => {
        setTestStatus('idle');
        setTestMessage('');
    };

    const showFormError = (message: string) => {
        setTestStatus('error');
        setTestMessage(message);
    };

    const draftProfile = (id = selectedProviderId): AIProviderProfile => ({
        id,
        type: 'custom',
        name: providerName.trim() || '未命名接口',
        apiKey: apiKey.trim(),
        model: model.trim(),
        apiEndpoint: endpoint.trim(),
    });

    const selectProvider = (id: string) => {
        setSelectedProviderId(id);
        setShowKey(false);
        clearTestStatus();
    };

    const handleAdd = () => {
        if (selectedProviderId !== NEW_PROVIDER_ID) selectProvider(NEW_PROVIDER_ID);
    };

    const handleTestConnection = async () => {
        setTestStatus('testing');
        setTestMessage('连接中...');

        try {
            const result = await testAIConnection(draftProfile());
            if (result.success) {
                setTestStatus('success');
                setTestMessage('连接成功');
                setTimeout(clearTestStatus, 2000);
            } else {
                showFormError(result.message);
            }
        } catch {
            showFormError('连接失败');
        }
    };

    const handleSave = () => {
        if (!apiKey.trim()) return showFormError('请输入 API Key');
        if (!model.trim()) return showFormError('请输入模型名称');

        let normalizedEndpoint: string;
        try {
            normalizedEndpoint = normalizeAIEndpoint(endpoint);
        } catch (error) {
            return showFormError(error instanceof Error ? error.message : '接口 URL 格式不正确');
        }

        const id = selectedProviderId === NEW_PROVIDER_ID
            ? `custom-${crypto.randomUUID()}`
            : selectedProviderId;
        const profile = { ...draftProfile(id), apiEndpoint: normalizedEndpoint };
        const updatedProviders = selectedProviderId === NEW_PROVIDER_ID
            ? [...providers, profile]
            : providers.map(provider => provider.id === id ? profile : provider);

        setProviderName(profile.name);
        setEndpoint(normalizedEndpoint);
        setSelectedProviderId(id);
        clearTestStatus();
        updateAISettings({ activeProviderId: id, providers: updatedProviders });
        onSaved?.();
    };

    const handleDelete = () => {
        if (!activeProvider || !window.confirm(`确定删除“${activeProvider.name}”吗？`)) return;

        const updatedProviders = providers.filter(provider => provider.id !== activeProvider.id);
        const nextActiveId = aiSettings?.activeProviderId === activeProvider.id
            ? updatedProviders[0]?.id
            : aiSettings?.activeProviderId;

        updateAISettings({ activeProviderId: nextActiveId, providers: updatedProviders });
        selectProvider(nextActiveId ?? updatedProviders[0]?.id ?? NEW_PROVIDER_ID);
    };

    return (
        <div className="ai-settings-overlay">
            <div className="ai-settings-modal">
                <aside className="ai-settings-sidebar">
                    <div className="ai-settings-sidebar-header">AI 配置列表</div>
                    <div className="ai-settings-provider-list">
                        {providers.map(provider => (
                            <button
                                key={provider.id}
                                type="button"
                                className={`ai-provider-item ${selectedProviderId === provider.id ? 'active' : ''}`}
                                onClick={() => selectProvider(provider.id)}
                            >
                                <span className="ai-provider-info">
                                    <span className="ai-provider-name">{provider.name}</span>
                                    <span className="ai-provider-status">
                                        {provider.apiKey && provider.model && provider.apiEndpoint ? '已配置' : '未完成'}
                                    </span>
                                </span>
                                {aiSettings?.activeProviderId === provider.id && (
                                    <Icon name="check" size={14} className="ai-active-indicator" />
                                )}
                            </button>
                        ))}
                        {selectedProviderId === NEW_PROVIDER_ID && (
                            <button type="button" className="ai-provider-item active">
                                <span className="ai-provider-info">
                                    <span className="ai-provider-name">{providerName.trim() || '新接口'}</span>
                                    <span className="ai-provider-status">未保存</span>
                                </span>
                            </button>
                        )}
                    </div>
                    <div className="ai-settings-sidebar-footer">
                        <button
                            className="ai-btn-add"
                            onClick={handleAdd}
                            disabled={selectedProviderId === NEW_PROVIDER_ID}
                            type="button"
                        >
                            <Icon name="plus" size={14} />
                            <span>新增配置</span>
                        </button>
                    </div>
                </aside>

                <div className="ai-settings-content">
                    <div className="ai-settings-header">
                        <h2 className="ai-settings-title">配置 AI 接口</h2>
                        <button className="ai-settings-close-btn" onClick={onClose} aria-label="关闭">
                            <Icon name="close" size={20} />
                        </button>
                    </div>

                    <div className="ai-settings-form">
                        <div className="ai-form-group">
                            <label htmlFor="ai-provider-name">显示名称</label>
                            <input
                                id="ai-provider-name"
                                type="text"
                                value={providerName}
                                onChange={(event) => setProviderName(event.target.value)}
                                className="ai-input"
                                placeholder="例如：公司内网 Qwen"
                            />
                        </div>

                        <div className="ai-form-group">
                            <label htmlFor="ai-api-key">API Key <span className="required">*</span></label>
                            <div className="ai-input-wrapper">
                                <input
                                    id="ai-api-key"
                                    type={showKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={(event) => {
                                        setApiKey(event.target.value);
                                        clearTestStatus();
                                    }}
                                    placeholder="sk-..."
                                    className="ai-input"
                                />
                                <button
                                    className="ai-eye-btn"
                                    onClick={() => setShowKey(!showKey)}
                                    type="button"
                                    aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                                >
                                    <Icon name={showKey ? 'eye-off' : 'eye'} size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="ai-form-group">
                            <label htmlFor="ai-model">模型名称 (Model) <span className="required">*</span></label>
                            <input
                                id="ai-model"
                                type="text"
                                value={model}
                                onChange={(event) => {
                                    setModel(event.target.value);
                                    clearTestStatus();
                                }}
                                className="ai-input"
                                placeholder="例如：Qwen3-235B-A22B"
                            />
                        </div>

                        <div className="ai-form-group">
                            <label htmlFor="ai-endpoint">接口 URL <span className="required">*</span></label>
                            <input
                                id="ai-endpoint"
                                type="text"
                                value={endpoint}
                                onChange={(event) => {
                                    setEndpoint(event.target.value);
                                    clearTestStatus();
                                }}
                                className={`ai-input ${endpointError ? 'ai-input-error' : ''}`}
                                placeholder="https://your-server.example.com/v1"
                                aria-describedby="ai-endpoint-help"
                            />
                            <div id="ai-endpoint-help" className="ai-endpoint-help">
                                可填写域名、以 /v1 结尾的 Base URL，或完整的 /chat/completions 地址。未写协议时，localhost、内网 IP、.local/.lan/.internal 及单段主机名补 http://，其他地址补 https://；判断不符时可直接写明协议。
                            </div>
                            {endpointError && <div className="ai-endpoint-result error">{endpointError}</div>}
                            {endpointPreview && (
                                <div className="ai-endpoint-result">
                                    实际请求地址：<code>{endpointPreview}</code>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="ai-settings-footer">
                        <div className="ai-footer-row">
                            <div className="ai-test-area">
                                <button
                                    className="btn btn-test"
                                    onClick={handleTestConnection}
                                    disabled={testStatus === 'testing'}
                                    type="button"
                                    data-status={testStatus}
                                >
                                    <Icon name="refresh" size={14} className={testStatus === 'testing' ? 'spin' : ''} />
                                    <span>{testStatus === 'testing' ? '测试中...' : '测试连接'}</span>
                                </button>
                                {testStatus === 'success' && (
                                    <span className="ai-test-status-text success">
                                        <Icon name="check" size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                                        成功
                                    </span>
                                )}
                                {testStatus === 'error' && (
                                    <button
                                        className="ai-test-error-btn"
                                        onClick={() => {
                                            setAlertContent(testMessage);
                                            setAlertOpen(true);
                                        }}
                                        type="button"
                                    >
                                        <Icon name="warning" size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                                        失败 - 查看详情
                                    </button>
                                )}
                            </div>
                            {activeProvider && (
                                <button className="btn btn-danger-ghost" onClick={handleDelete} type="button">
                                    <Icon name="trash" size={14} />
                                    删除
                                </button>
                            )}
                            <button className="btn btn-primary" onClick={handleSave} type="button">
                                <Icon name="check" size={14} />
                                保存并选中
                            </button>
                        </div>
                    </div>
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
