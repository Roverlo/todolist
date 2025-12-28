#!/bin/bash
# 多版本更新服务器部署脚本 v2
# 支持多版本管理，用户可选择任意版本下载

set -e

DOMAIN="update.xiaohulp.sbs"
WEB_ROOT="/var/www/html"

echo ">>> 安装 Nginx..."
apt update && apt install nginx jq -y

echo ">>> 创建目录..."
mkdir -p $WEB_ROOT/releases

echo ">>> 配置 Nginx..."
cat > /etc/nginx/sites-available/$DOMAIN << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location / {
        root $WEB_ROOT;
        add_header Access-Control-Allow-Origin *;
        add_header Cache-Control "no-cache";
    }
}
EOF

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

echo ">>> 创建多版本配置文件..."
cat > $WEB_ROOT/versions.json << EOF
{
  "latest": "",
  "versions": []
}
EOF

# 保留旧的 version.json 用于兼容
echo ">>> 创建兼容性 version.json..."
cat > $WEB_ROOT/version.json << EOF
{
  "version": "",
  "releaseDate": "",
  "downloadUrl": "",
  "releaseNotes": "暂无可用版本",
  "mandatory": false
}
EOF

echo ">>> 启动 Nginx..."
nginx -t && systemctl restart nginx && systemctl enable nginx

echo ""
echo "==================================="
echo "  多版本更新服务器安装完成！"
echo "  测试: https://$DOMAIN/versions.json"
echo ""
echo "  添加新版本请使用:"
echo "  ./add_version.sh <版本号> <更新说明> <exe文件名>"
echo "==================================="
