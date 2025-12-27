/**
 * ProjectTodo 云端同步服务器 (带认证)
 * 
 * 使用方法:
 * 1. 修改下方 USERS 配置添加用户
 * 2. 运行: node sync-server.js
 * 3. 服务器将在 http://localhost:8080 启动
 * 4. 在 ProjectTodo 应用中配置服务器和用户名密码
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ========== 配置区域 ==========
const PORT = parseInt(process.env.PORT || '8080');
const DATA_DIR = path.join(__dirname, 'sync-data');

// 用户配置（用户名: 密码）
const USERS = {
    'admin': 'admin123',      // 管理员
    'user1': 'password1',     // 用户1
    'user2': 'password2',     // 用户2
    // 添加更多用户...
};
// ==============================

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// CORS 头
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
};

// Basic 认证解析
function parseBasicAuth(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return null;
    }

    try {
        const base64 = authHeader.slice(6);
        const decoded = Buffer.from(base64, 'base64').toString('utf-8');
        const [username, password] = decoded.split(':');
        return { username, password };
    } catch {
        return null;
    }
}

// 验证用户
function authenticate(req, res) {
    const auth = parseBasicAuth(req);

    if (!auth) {
        res.writeHead(401, { ...corsHeaders, 'WWW-Authenticate': 'Basic realm="ProjectTodo Sync"' });
        res.end(JSON.stringify({ success: false, message: '需要认证' }));
        return null;
    }

    if (!USERS[auth.username] || USERS[auth.username] !== auth.password) {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ success: false, message: '用户名或密码错误' }));
        return null;
    }

    return auth.username;
}

// 解析请求体
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

// 获取用户数据文件路径
function getUserDataPath(username) {
    const safeUsername = (username || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(DATA_DIR, `${safeUsername}.json`);
}

// 创建服务器
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] ${req.method} ${pathname}`);

    // CORS 预检
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    try {
        // 状态检查（不需要认证）
        if (pathname === '/api/sync/status' && req.method === 'GET') {
            // 如果提供了认证信息，验证它
            const auth = parseBasicAuth(req);
            if (auth) {
                if (!USERS[auth.username] || USERS[auth.username] !== auth.password) {
                    res.writeHead(401, corsHeaders);
                    res.end(JSON.stringify({ success: false, message: '用户名或密码错误' }));
                    return;
                }
            }

            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({
                success: true,
                message: 'ProjectTodo Sync Server',
                version: '2.0.0',
                authRequired: true,
                timestamp: Date.now(),
            }));
            return;
        }

        // 以下接口需要认证
        const username = authenticate(req, res);
        if (!username) return;

        // 上传数据
        if (pathname === '/api/sync/upload' && req.method === 'POST') {
            const body = await parseBody(req);
            const { timestamp, data } = body;

            if (!data) {
                res.writeHead(400, corsHeaders);
                res.end(JSON.stringify({ success: false, message: '缺少数据' }));
                return;
            }

            const filePath = getUserDataPath(username);
            const saveData = {
                username,
                timestamp: timestamp || Date.now(),
                data,
                uploadedAt: new Date().toISOString(),
            };

            fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2), 'utf-8');
            console.log(`  ✓ 保存数据: ${username}`);

            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({
                success: true,
                message: '上传成功',
                timestamp: saveData.timestamp,
            }));
            return;
        }

        // 获取数据
        if (pathname === '/api/sync/data' && req.method === 'GET') {
            const filePath = getUserDataPath(username);

            if (!fs.existsSync(filePath)) {
                res.writeHead(404, corsHeaders);
                res.end(JSON.stringify({
                    success: false,
                    message: '没有找到数据',
                }));
                return;
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const savedData = JSON.parse(fileContent);

            console.log(`  ✓ 读取数据: ${username}`);

            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({
                success: true,
                timestamp: savedData.timestamp,
                data: savedData.data,
            }));
            return;
        }

        // 404
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ success: false, message: 'Not found' }));

    } catch (error) {
        console.error('错误:', error);
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, message: error.message }));
    }
});

server.listen(PORT, () => {
    console.log('');
    console.log('═'.repeat(50));
    console.log('  ProjectTodo 云端同步服务器 v2.0');
    console.log('═'.repeat(50));
    console.log(`  地址: http://localhost:${PORT}`);
    console.log(`  数据: ${DATA_DIR}`);
    console.log('');
    console.log('  已配置用户:');
    Object.keys(USERS).forEach(u => console.log(`    - ${u}`));
    console.log('');
    console.log('  API:');
    console.log('    GET  /api/sync/status  - 状态检查');
    console.log('    POST /api/sync/upload  - 上传数据 (需认证)');
    console.log('    GET  /api/sync/data    - 下载数据 (需认证)');
    console.log('');
    console.log('  按 Ctrl+C 停止');
    console.log('═'.repeat(50));
    console.log('');
});
