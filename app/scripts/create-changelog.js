import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
if (args.length < 3) {
    console.error('Usage: node create-changelog.js <filepath> <version> <timestamp>');
    process.exit(1);
}

const [filePath, version, timestamp] = args;

const content = `版本: ${version}
时间: ${timestamp}
更新内容:
- 【新功能】添加自动更新检查功能，支持启动时检查和定时检查。
- 【新设置】在"设置 → 关于"中新增更新设置区块，可配置检查间隔（10分钟~每天）。
- 【用户体验】支持"此版本不再提醒"功能，跳过特定版本的更新提示。
- 【数据修复】修复云同步不包含 Notes 和 Tags 数据的问题。`;

try {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Changelog created successfully at: ${filePath}`);
} catch (err) {
    console.error('Error writing changelog:', err);
    process.exit(1);
}
