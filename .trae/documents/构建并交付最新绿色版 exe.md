## 操作
- 执行桌面打包：`npm run tauri:build`
- 将 `src-tauri/target/release/app.exe` 拷贝到 `C:\personal\task\portable`，命名为 `Task-green-YYYYMMDD-HHmmss.exe`
- 保留历史 exe 以便回滚；若你需要我每次只保留最新一个，我可以自动清理旧文件

## 说明
- 我会在后续每次代码修改完成后，自动执行以上打包流程并把新的 exe 路径回复给你