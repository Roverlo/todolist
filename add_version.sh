#!/bin/sh
# 自动扫描并添加所有版本到 versions.json
# 用法: ./add_version.sh
#
# 文件规范:
#   exe 文件: ProjectTodo_YYYYMMDD_HHmm.exe
#   说明文件: ProjectTodo_YYYYMMDD_HHmm.txt (可选，同名txt文件)
#
# 示例:
#   /var/www/html/releases/ProjectTodo_20251228_1657.exe
#   /var/www/html/releases/ProjectTodo_20251228_1657.txt (内容: 修复网络错误)

set -e

DOMAIN="update.xiaohulp.sbs"
WEB_ROOT="/var/www/html"
VERSIONS_FILE="$WEB_ROOT/versions.json"
RELEASES_DIR="$WEB_ROOT/releases"
MAX_VERSIONS=5

echo ""
echo "==================================="
echo "  自动扫描版本"
echo "==================================="
echo ""

# 检查是否有 exe 文件
FILE_COUNT=$(ls -1 $RELEASES_DIR/ProjectTodo_*.exe 2>/dev/null | wc -l)

if [ "$FILE_COUNT" -eq 0 ]; then
    echo "❌ 未找到 exe 文件，请先上传到 $RELEASES_DIR/"
    exit 1
fi

echo "📁 扫描到 $FILE_COUNT 个版本文件"
echo ""

# 清空 versions.json
echo '{"latest": "", "versions": []}' > "$VERSIONS_FILE"

RELEASE_DATE=$(date +%Y-%m-%d)
COUNT=0

# 遍历文件（按时间倒序）
ls -1t $RELEASES_DIR/ProjectTodo_*.exe 2>/dev/null | head -n $MAX_VERSIONS | while read FILE; do
    EXE_FILE=$(basename "$FILE")
    VERSION=$(echo "$EXE_FILE" | sed 's/ProjectTodo_\([0-9]*_[0-9]*\)\.exe/\1/')
    DOWNLOAD_URL="https://$DOMAIN/releases/$EXE_FILE"
    
    # 尝试读取同名 txt 文件作为更新说明
    TXT_FILE="$RELEASES_DIR/ProjectTodo_${VERSION}.txt"
    if [ -f "$TXT_FILE" ]; then
        NOTES=$(cat "$TXT_FILE" | tr '\n' ' ' | sed 's/"/\\"/g')
        echo "   [$COUNT] $VERSION ✓ 有说明"
    else
        NOTES="版本 $VERSION"
        echo "   [$COUNT] $VERSION"
    fi
    
    # 写入 versions.json
    jq --arg ver "$VERSION" \
       --arg date "$RELEASE_DATE" \
       --arg url "$DOWNLOAD_URL" \
       --arg notes "$NOTES" \
       '.versions += [{"version": $ver, "releaseDate": $date, "downloadUrl": $url, "releaseNotes": $notes, "mandatory": false}]' \
       "$VERSIONS_FILE" > "${VERSIONS_FILE}.tmp"
    mv "${VERSIONS_FILE}.tmp" "$VERSIONS_FILE"
    
    COUNT=$((COUNT + 1))
done

# 获取第一个版本作为 latest
LATEST_VERSION=$(jq -r '.versions[0].version // ""' "$VERSIONS_FILE")

# 更新 latest
jq --arg ver "$LATEST_VERSION" '.latest = $ver' "$VERSIONS_FILE" > "${VERSIONS_FILE}.tmp"
mv "${VERSIONS_FILE}.tmp" "$VERSIONS_FILE"

# 同步 version.json
jq '.versions[0] // {}' "$VERSIONS_FILE" > "$WEB_ROOT/version.json"

FINAL_COUNT=$(jq '.versions | length' "$VERSIONS_FILE")

echo ""
echo "==================================="
echo "  ✅ 完成！共添加 $FINAL_COUNT 个版本"
echo "  📌 最新版本: $LATEST_VERSION"
echo "==================================="
echo ""
