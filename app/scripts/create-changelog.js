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
- 【重大修复】彻底解决 AI 任务提取将中文人名转换为拼音的问题（如"小红"变"lxiao'h"）。
- 【Prompt 重构】将 System Prompt 和 User Prompt 全面中文化，消除跨语言处理歧义。
- 【规则强化】明确禁止拼音转换、音译、同音字替换，人名地名必须原样保留。
- 【代码清理】移除冗余未使用的旧版英文 Prompt。`;

try {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Changelog created successfully at: ${filePath}`);
} catch (err) {
    console.error('Error writing changelog:', err);
    process.exit(1);
}
