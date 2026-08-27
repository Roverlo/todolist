import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { AlertDialog } from '../ui/AlertDialog';
import { useAppStore } from '../../state/appStore';
import type { AIProviderProfile } from '../../types';
import {
    CUSTOM_AI_PROVIDER_ID,
    normalizeAIEndpoint,
    toSingleCustomAISettings,
} from '../../services/aiConfig';
import { testAIConnection } from '../../services/aiService';
import './AISettingsModal.css';

interface AISettingsModalProps {
    onClose: () => void;
}

export function AISettingsModal({ onClose }: AISettingsModalProps) {
    const aiSettings = useAppStore((state) => state.settings.ai);
    const updateAISettings = useAppStore((state) => state.updateAISettings);
    const initialProvider = toSingleCustomAISettings(aiSettings).providers[0];

    const [providerName, setProviderName] = useState(initialProvider.name);
    const [apiKey, setApiKey] = useState(initialProvider.apiKey || '');
    const [model, setModel] = useState(initialProvider.model || '');
    const [endpoint, setEndpoint] = useState(initialProvider.apiEndpoint || '');
    const [showKey, setShowKey] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertContent, setAlertContent] = useState('');

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

    const draftProfile = (): AIProviderProfile => ({
        id: CUSTOM_AI_PROVIDER_ID,
        type: 'custom',
        name: providerName.trim() || '我的 AI 接口',
        apiKey: apiKey.trim(),
        model: model.trim(),
        apiEndpoint: endpoint.trim(),
    });

    const showFormError = (message: string) => {
        setTestStatus('error');
        setTestMessage(message);
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
        const profile = draftProfile();
        if (!profile.apiKey) return showFormError('请输入 API Key');
        if (!profile.model) return showFormError('请输入模型名称');

        try {
            profile.apiEndpoint = normalizeAIEndpoint(profile.apiEndpoint || '');
        } catch (error) {
            return showFormError(error instanceof Error ? error.message : '接口 URL 格式不正确');
        }

        setProviderName(profile.name);
        setEndpoint(profile.apiEndpoint);
        clearTestStatus();
        updateAISettings({
            activeProviderId: CUSTOM_AI_PROVIDER_ID,
            providers: [profile],
        });
    };

    return (
        <div className="ai-settings-overlay">
            <div className="ai-settings-modal">
                <div className="ai-settings-content">
                    <div className="ai-settings-header">
                        <h2 className="ai-settings-title">配置 AI 接口</h2>
                        <button className="ai-settings-close-btn" onClick={onClose} aria-label="关闭">
                            <Icon name="close" size={20} />
                        </button>
                    </div>

                    <div className="ai-settings-form">
                        <div className="ai-info-card">
                            <Icon name="info" size={18} />
                            <p>仅使用你自己填写的 OpenAI Chat Completions 兼容接口；应用不再提供内置服务商或共享密钥。</p>
                        </div>

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
                                可填写域名、以 /v1 结尾的 Base URL，或完整的 /chat/completions 地址。缺少协议时，内网地址自动补 http://，公网地址自动补 https://。
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
                            <button className="btn btn-primary" onClick={handleSave} type="button">
                                <Icon name="check" size={14} />
                                保存配置
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
