import type { AppData, Project, Task, RecurringTemplate, Settings, Dictionary, SortScheme, Filters, GroupBy, SortRule, SavedFilter, ColumnConfig } from '../types';

// 统一版本号
export const BACKUP_VERSION = '1.2';

// 备份文件接口
export interface BackupFile {
    version: string;
    exportedAt: string;
    checksum?: string;
    data: {
        projects: Project[];
        tasks: Task[];
        settings?: Settings;
        recurringTemplates?: RecurringTemplate[];
        sortSchemes?: SortScheme[];
        dictionary?: Dictionary;
        filters?: Filters;
        groupBy?: GroupBy;
        sortRules?: SortRule[];
        savedFilters?: SavedFilter[];
        columnConfig?: ColumnConfig;
    };
}

// 验证结果接口
export interface ValidationResult {
    valid: boolean;
    error?: string;
    errorType?: 'format' | 'checksum' | 'version' | 'data';
    data?: BackupFile;
    preview?: {
        exportedAt: string;
        projectCount: number;
        taskCount: number;
        hasSettings: boolean;
        hasRecurringTemplates: boolean;
        recurringTemplateCount: number;
    };
}

/**
 * 计算简单校验和（使用 djb2 哈希算法）
 * 用于检测备份文件是否被意外修改
 */
export const calculateChecksum = (data: string): string => {
    let hash = 5381;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) + hash) ^ data.charCodeAt(i);
    }
    // 转换为 16 进制字符串
    return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * 验证备份文件
 */
export const validateBackupFile = (content: string): ValidationResult => {
    try {
        const parsed = JSON.parse(content) as BackupFile;

        // 检查基本格式
        if (!parsed.version || !parsed.data) {
            return {
                valid: false,
                error: '无效的备份文件格式：缺少版本号或数据',
                errorType: 'format',
            };
        }

        // 检查必要数据
        if (!parsed.data.projects || !parsed.data.tasks) {
            return {
                valid: false,
                error: '无效的备份文件格式：缺少项目或任务数据',
                errorType: 'data',
            };
        }

        if (!Array.isArray(parsed.data.projects) || !Array.isArray(parsed.data.tasks)) {
            return {
                valid: false,
                error: '无效的备份文件格式：项目或任务数据格式错误',
                errorType: 'data',
            };
        }

        // 验证校验和（如果存在）
        if (parsed.checksum) {
            // 从文件中提取校验和，然后计算数据部分的校验和
            const dataString = JSON.stringify(parsed.data);
            const calculatedChecksum = calculateChecksum(dataString);
            if (calculatedChecksum !== parsed.checksum) {
                return {
                    valid: false,
                    error: '备份文件校验失败：文件可能已损坏或被修改',
                    errorType: 'checksum',
                };
            }
        }

        // 生成预览信息
        const preview = {
            exportedAt: parsed.exportedAt,
            projectCount: parsed.data.projects.length,
            taskCount: parsed.data.tasks.length,
            hasSettings: !!parsed.data.settings && Object.keys(parsed.data.settings).length > 0,
            hasRecurringTemplates: !!parsed.data.recurringTemplates && parsed.data.recurringTemplates.length > 0,
            recurringTemplateCount: parsed.data.recurringTemplates?.length ?? 0,
        };

        return {
            valid: true,
            data: parsed,
            preview,
        };
    } catch (err) {
        return {
            valid: false,
            error: `文件解析失败：${err instanceof Error ? err.message : '未知错误'}`,
            errorType: 'format',
        };
    }
};

/**
 * 创建带校验和的备份数据
 */
export const createBackupData = (appData: Partial<AppData>): BackupFile => {
    const data = {
        projects: appData.projects ?? [],
        tasks: appData.tasks ?? [],
        settings: appData.settings,
        recurringTemplates: appData.recurringTemplates ?? [],
        sortSchemes: appData.sortSchemes ?? [],
        dictionary: appData.dictionary,
        filters: appData.filters,
        groupBy: appData.groupBy,
        sortRules: appData.sortRules,
        savedFilters: appData.savedFilters,
        columnConfig: appData.columnConfig,
    };

    const dataString = JSON.stringify(data);
    const checksum = calculateChecksum(dataString);

    return {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        checksum,
        data,
    };
};

/**
 * 自动备份当前数据到临时文件
 * 返回备份文件路径
 */
export const createAutoBackup = async (appData: Partial<AppData>): Promise<string | null> => {
    try {
        const { appDataDir, join } = await import('@tauri-apps/api/path');
        const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');

        // 获取应用数据目录
        const dataDir = await appDataDir();
        const backupDir = await join(dataDir, 'auto_backups');

        // 确保备份目录存在
        const dirExists = await exists(backupDir);
        if (!dirExists) {
            await mkdir(backupDir, { recursive: true });
        }

        // 生成备份文件名（带时间戳）
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `auto_backup_${timestamp}.json`;
        const filePath = await join(backupDir, filename);

        // 创建备份数据并写入文件
        const backupData = createBackupData(appData);
        await writeTextFile(filePath, JSON.stringify(backupData, null, 2));

        // 清理旧的自动备份（只保留最近5个）
        await cleanupOldAutoBackups(backupDir, 5);

        return filePath;
    } catch (err) {
        console.error('自动备份失败:', err);
        return null;
    }
};

/**
 * 清理旧的自动备份文件
 */
const cleanupOldAutoBackups = async (backupDir: string, keepCount: number): Promise<void> => {
    try {
        const { readDir, remove } = await import('@tauri-apps/plugin-fs');
        const { join } = await import('@tauri-apps/api/path');

        const entries = await readDir(backupDir);
        const backupFiles = entries
            .filter(e => e.name?.startsWith('auto_backup_') && e.name?.endsWith('.json'))
            .sort((a, b) => (b.name ?? '').localeCompare(a.name ?? '')); // 按名称倒序（最新的在前）

        // 删除超出保留数量的文件
        for (let i = keepCount; i < backupFiles.length; i++) {
            const filePath = await join(backupDir, backupFiles[i].name ?? '');
            await remove(filePath);
        }
    } catch (err) {
        console.error('清理旧备份失败:', err);
    }
};

/**
 * 格式化错误类型为用户友好的提示
 */
export const getErrorMessage = (errorType?: string): string => {
    switch (errorType) {
        case 'format':
            return '请确保选择正确的备份文件（JSON格式）';
        case 'checksum':
            return '文件可能已损坏，建议使用其他备份文件';
        case 'version':
            return '备份文件版本不兼容，可能需要更新应用';
        case 'data':
            return '备份文件数据不完整，请检查文件来源';
        default:
            return '请检查文件并重试';
    }
};
