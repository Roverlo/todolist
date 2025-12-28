## 目标
- 在绿色版 exe（Tauri 桌面应用）中，导出 CSV 时不再触发浏览器目录限制，确保任何路径都能可靠保存。

## 关键改动
- `ExportModal.tsx`
  - 引入 `saveCsvWithTauri`，在点击“确定”时优先调用保存对话框获取完整路径并写入。
  - 移除浏览器的 `showDirectoryPicker` 分支与相关状态（`dirHandle`）。
  - 保留 Tauri 的“选择文件夹”功能作为备选：若用户已选目录则直接拼接文件名并写入。
  - 失败时自动降级为浏览器下载（理论上不会在 exe 内触发，但保留兼容）。

## 验证
- 在桌面版 exe 内通过保存对话框选择 `C:\temp\tasks-*.csv` 成功写入。
- 选择桌面/下载目录时也能成功写入（权限范围已在 `capabilities/default.json` 配置）。

## 交付
- 构建并重新生成绿色版到 `C:\personal\task\portable\ProjectTodo.exe`，完成后告知路径与验证结果。