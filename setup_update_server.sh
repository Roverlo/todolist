#!/bin/bash
set -e

DOMAIN="update.xiaohulp.sbs"

echo ">>> 安装 Nginx..."
apt update && apt install nginx -y

echo ">>> 创建目录..."
mkdir -p /var/www/html/releases

echo ">>> 配置 Nginx..."
cat > /etc/nginx/sites-available/$DOMAIN << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location / {
        root /var/www/html;
        add_header Access-Control-Allow-Origin *;
        add_header Cache-Control "no-cache";
    }
}
EOF

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

echo ">>> 创建版本文件..."
cat > /var/www/html/version.json << EOF
{
  "version": "20231228_1510",
  "releaseDate": "2023-12-28",
  "downloadUrl": "https://$DOMAIN/releases/",
  "releaseNotes": "当前版本",
  "mandatory": false
}
EOF

echo ">>> 启动 Nginx..."
nginx -t && systemctl restart nginx && systemctl enable nginx

echo ""
echo "==================================="
echo "  安装完成！"
echo "  测试: https://$DOMAIN/version.json"
echo "==================================="
