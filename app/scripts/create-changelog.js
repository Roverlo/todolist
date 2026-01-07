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
- 【AI 修复】修复了 AI 任务提取时的“幻觉”问题（如将“郊游”识别为“交友”）。
- 【算法优化】全面优化 System Prompt，加入严禁同音字替换和忠实原文的指令。
- 【参数调优】降低 AI 模型 Temperature 至 0.1，大幅提升提取精准度。
- 【代码清理】移除冗余未使用的旧版 Prompt 和死代码，核心逻辑更纯净。`;

try {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Changelog created successfully at: ${filePath}`);
} catch (err) {
    console.error('Error writing changelog:', err);
    process.exit(1);
}
