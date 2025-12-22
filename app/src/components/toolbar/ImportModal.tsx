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
        <div className='create-overlay'>
            <div className='create-dialog' style={{ width: 500 }}>
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

                <div className='create-dialog-body' style={{ background: 'var(--surface)' }}>
                    <div className='create-section'>
                        {/* 文件选择 */}
                        <div className='create-field create-field-span-2'>
                            <label className='create-field-label'>选择文件</label>
                            <div className='export-input-row'>
                                <input
                                    ref={fileInputRef}
                                    type='file'
                                    accept='.json'
                                    onChange={handleFileSelect}
                                    className='create-field-input'
                                    style={{ flex: 1 }}
                                />
                                {importData && (
                                    <button
                                        className='btn btn-light'
                                        type='button'
                                        onClick={handleReset}
                                    >
                                        清除
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* 错误提示 */}
                        {error && (
                            <div className='create-field create-field-span-2'>
                                <div style={{ color: 'var(--danger)', fontSize: 14 }}>
                                    ⚠️ {error}
                                </div>
                            </div>
                        )}

                        {/* 预览信息 */}
                        {importData && (
                            <div className='create-field create-field-span-2'>
                                <label className='create-field-label'>导入预览</label>
                                <div
                                    style={{
                                        background: 'var(--bg)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 8,
                                        padding: 16,
                                    }}
                                >
                                    <div style={{ marginBottom: 8 }}>
                                        <strong>导出时间：</strong>
                                        {new Date(importData.exportedAt).toLocaleString()}
                                    </div>
                                    <div style={{ display: 'flex', gap: 24 }}>
                                        <div>
                                            <strong>项目：</strong>
                                            {importData.data.projects?.length || 0} 个
                                        </div>
                                        <div>
                                            <strong>任务：</strong>
                                            {importData.data.tasks?.length || 0} 条
                                        </div>
                                        <div>
                                            <strong>周期模板：</strong>
                                            {importData.data.recurringTemplates?.length || 0} 个
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 导入说明 */}
                        <div className='create-field create-field-span-2'>
                            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                                <strong>导入说明：</strong>
                                <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                                    <li>所有任务将以新 ID 导入，不会覆盖现有数据</li>
                                    <li>如果项目名称已存在，任务将归入该项目</li>
                                    <li>如果项目不存在，将自动创建新项目</li>
                                </ul>
                            </div>
                        </div>
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
