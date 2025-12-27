import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../state/appStore';
import type { Task, RecurringTemplate, Project } from '../../types';

interface Props {
    open: boolean;
    onClose: () => void;
}

interface ImportData {
    version: string;
    exportedAt: string;
    data: {
        projects: Project[];
        tasks: Task[];
        recurringTemplates: RecurringTemplate[];
    };
}

export const ImportModal = ({ open, onClose }: Props) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importData, setImportData] = useState<ImportData | null>(null);
    const [error, setError] = useState<string>('');
    const [importing, setImporting] = useState(false);

    // 从 appStore 获取数据和 actions
    const projects = useAppStore((state) => state.projects);
    const addProject = useAppStore((state) => state.addProject);
    const addTask = useAppStore((state) => state.addTask);
    const addRecurringTemplate = useAppStore((state) => state.addRecurringTemplate);

    // 处理文件选择
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            setError('请选择 JSON 格式的文件');
            return;
        }

        try {
            const text = await file.text();
            const data = JSON.parse(text) as ImportData;

            // 验证数据结构
            if (!data.version || !data.data) {
                setError('无效的导出文件格式');
                return;
            }

            if (!data.data.tasks || !Array.isArray(data.data.tasks)) {
                setError('文件中没有找到任务数据');
                return;
            }

            setImportData(data);
            setError('');
        } catch {
            setError('文件解析失败，请确认是有效的 JSON 文件');
        }
    };

    // 生成新 ID
    const generateId = () => {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    };

    // 执行导入
    const handleImport = async () => {
        if (!importData) return;

        setImporting(true);

        try {
            // 建立项目 ID 映射（旧 ID -> 新 ID）
            const projectIdMap = new Map<string, string>();

            // 处理项目
            for (const project of importData.data.projects || []) {
                // 检查是否已存在同名项目
                const existing = projects.find(p => p.name === project.name);
                if (existing) {
                    projectIdMap.set(project.id, existing.id);
                } else {
                    // 创建新项目（addProject 返回新创建的 Project 对象）
                    const newProject = addProject(project.name);
                    projectIdMap.set(project.id, newProject.id);
                }
            }

            // 处理任务
            let taskCount = 0;
            for (const task of importData.data.tasks || []) {
                const newProjectId = projectIdMap.get(task.projectId);
                // 如果没有映射到项目，放入未分类
                const uncategorized = projects.find(p => p.name === '未分类');
                const finalProjectId = newProjectId || uncategorized?.id || projects[0]?.id;

                if (finalProjectId) {
                    const newTask: Task = {
                        ...task,
                        id: generateId(),
                        projectId: finalProjectId,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                    addTask(newTask);
                    taskCount++;
                }
            }

            // 处理周期任务模板
            let recurringCount = 0;
            for (const template of importData.data.recurringTemplates || []) {
                const newProjectId = projectIdMap.get(template.projectId);
                const uncategorized = projects.find(p => p.name === '未分类');
                const finalProjectId = newProjectId || uncategorized?.id || projects[0]?.id;

                if (finalProjectId) {
                    const newTemplate: RecurringTemplate = {
                        ...template,
                        id: generateId(),
                        projectId: finalProjectId,
                    };
                    addRecurringTemplate(newTemplate);
                    recurringCount++;
                }
            }

            alert(`导入完成！\n- 任务：${taskCount} 条\n- 周期任务模板：${recurringCount} 条`);
            onClose();
        } catch (err) {
            setError('导入过程中发生错误: ' + String(err));
        } finally {
            setImporting(false);
        }
    };

    // 重置状态
    const handleReset = () => {
        setImportData(null);
        setError('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Handle Esc key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (open && e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className='create-overlay' style={{ zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
            <div className='create-dialog' style={{ width: 500 }} onClick={(e) => e.stopPropagation()}>
                <header className='create-dialog-header'>
                    <div className='create-dialog-title-block'>
                        <div className='create-dialog-title'>📥 导入任务</div>
                        <div className='create-dialog-subtitle'>
                            从 JSON 文件导入任务和周期任务模板
                        </div>
                    </div>
                    <button
                        className='create-btn-icon'
                        aria-label='关闭导入弹窗'
                        type='button'
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </header>

                <div className='create-dialog-body' style={{ background: 'var(--surface)', padding: '20px 24px' }}>
                    {/* 现代化拖拽上传区域 */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            border: '2px dashed var(--border)',
                            borderRadius: 12,
                            padding: '32px 24px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: 'var(--bg)',
                            transition: 'all 0.2s ease',
                            marginBottom: 16,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--primary)';
                            e.currentTarget.style.background = 'var(--primary-bg)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.background = 'var(--bg)';
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type='file'
                            accept='.json'
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                        <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.7 }}>📁</div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-main)', marginBottom: 4 }}>
                            {importData ? `已选择: ${fileInputRef.current?.files?.[0]?.name || 'JSON 文件'}` : '点击选择文件或拖拽到此处'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                            支持 .json 格式的导出文件
                        </div>
                        {importData && (
                            <button
                                className='btn btn-light'
                                type='button'
                                onClick={(e) => { e.stopPropagation(); handleReset(); }}
                                style={{ marginTop: 12 }}
                            >
                                重新选择
                            </button>
                        )}
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div style={{
                            padding: '12px 16px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 8,
                            color: '#dc2626',
                            fontSize: 13,
                            marginBottom: 16,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <span>⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {/* 预览信息卡片 */}
                    {importData && (
                        <div style={{
                            background: 'linear-gradient(135deg, var(--primary-bg) 0%, var(--surface) 100%)',
                            border: '1px solid var(--primary)',
                            borderRadius: 12,
                            padding: 16,
                            marginBottom: 16,
                        }}>
                            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 12 }}>
                                📅 导出时间：{new Date(importData.exportedAt).toLocaleString()}
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{
                                    flex: 1,
                                    background: 'var(--surface)',
                                    borderRadius: 8,
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>
                                        {importData.data.projects?.length || 0}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>📁 项目</div>
                                </div>
                                <div style={{
                                    flex: 1,
                                    background: 'var(--surface)',
                                    borderRadius: 8,
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>
                                        {importData.data.tasks?.length || 0}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>✅ 任务</div>
                                </div>
                                <div style={{
                                    flex: 1,
                                    background: 'var(--surface)',
                                    borderRadius: 8,
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--warning)' }}>
                                        {importData.data.recurringTemplates?.length || 0}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>🔄 周期</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 导入说明卡片 */}
                    <div style={{
                        background: 'var(--bg)',
                        borderRadius: 10,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)', marginBottom: 2 }}>
                            💡 导入说明
                        </div>
                        {[
                            { icon: '🆕', text: '所有任务将以新 ID 导入，不会覆盖现有数据' },
                            { icon: '📂', text: '如果项目名称已存在，任务将归入该项目' },
                            { icon: '➕', text: '如果项目不存在，将自动创建新项目' },
                        ].map((item, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                fontSize: 12,
                                color: 'var(--text-subtle)',
                            }}>
                                <span style={{ fontSize: 14 }}>{item.icon}</span>
                                <span>{item.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <footer className='create-dialog-footer'>
                    <div className='create-footer-actions export-footer-actions'>
                        <button className='btn btn-light' type='button' onClick={onClose}>
                            取消
                        </button>
                        <button
                            className='btn btn-primary'
                            type='button'
                            onClick={handleImport}
                            disabled={!importData || importing}
                        >
                            {importing ? '导入中...' : '导入'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};
