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
- 【重大修复】修复云同步不包含 Notes 和 Tags 数据的问题，确保多设备同步完整性。
- 【Prompt 重构】将 AI System Prompt 和 User Prompt 全面中文化，彻底解决拼音转换问题。
- 【规则强化】明确禁止 AI 进行拼音转换、音译、同音字替换。
- 【数据保护】完善云同步数据范围，上传/下载/备份均包含笔记数据。`;

try {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Changelog created successfully at: ${filePath}`);
} catch (err) {
    console.error('Error writing changelog:', err);
    process.exit(1);
}
