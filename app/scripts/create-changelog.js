import fs from 'fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length < 3) {
    console.error('Usage: node create-changelog.js <filepath> <version> <timestamp>');
    process.exit(1);
}

const [filePath, version, timestamp] = args;

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
const content = `ProjectTodo 免安装版
应用版本: ${version}
构建版本: ${timestamp}
源码提交: ${commit}
双击 EXE 即可运行，无需安装。
本次功能及验证结果请参阅随包验收报告。`;

try {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Changelog created successfully at: ${filePath}`);
} catch (err) {
    console.error('Error writing changelog:', err);
    process.exit(1);
}
