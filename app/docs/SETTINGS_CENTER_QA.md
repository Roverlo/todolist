# 统一设置中心交付验收

验收日期：2026-10-12。结论：通过，可交付本机单文件 EXE。

## 产物

- 文件：`portable/01_Offline_Portable/ProjectTodo_20261012_1450.exe`（仓库根目录下）。
- 应用版本：2.3.0；界面构建版本：20261012_1450。
- 产品源码对应提交：`92046d2c8029f059234a99686b07cfae3267f1b2`。
- 大小：31,421,952 字节。
- SHA-256：`9F066FAD4853031B11E3367D724D313B3656270FECA80B24F8F4F04EC110CC56`。
- 原生自动化使用该文件的相同哈希副本；Computer Use 直接操作交付目录中的 EXE。验收完成后再次核对哈希。

## 本次变更

三个页面使用同一个设置入口，内容整合为通用与外观、待办与提醒、AI 配置、下载、数据与同步、关于与更新六类。分类切换保留 AI、下载和更新地址的编辑草稿，关闭中心放弃未保存修改；保留原来的配置格式和数据目录。

AI 保存或删除等待写盘，失败时恢复原配置、保留编辑并提示错误。下载继续保留常用目录、批量开始/暂停/删除和原生失败恢复；随记工具栏的“时间”设置仍在原位置。

## 检查结果

| 检查 | 结果与覆盖 |
| --- | --- |
| `npm run lint`、`npm run build`、`git diff --check` | 通过；构建仅有既有分包体积与动态导入提示 |
| `npm run test:notes` | 完整套件通过，覆盖编辑器、表格、正式构建装饰对象及待办时间行为 |
| `node scripts/test-settings-center.mjs` | 三页面共用入口、收起侧栏、六分类、草稿、子窗口返回、键盘与响应布局通过 |
| `node scripts/test-downloads.mjs` | 常用目录、批量操作及下载回归通过 |
| `node scripts/test-note-workflow.mjs` | 随记、AI 入口及相关交互通过 |
| `node scripts/test-weekly-report.mjs` | 周报范围、日期、生成、草稿与保存回归通过 |
| `node scripts/test-update-settings.mjs` | 更新设置、错误恢复和正式构建更新入口通过 |
| `npm run tauri:build -- --no-bundle` | Windows 单文件 EXE 构建通过 |
| EXE `-SettingsCenter` | AI 与下载写入失败恢复、常用目录、实际重启及 1440/1100/760px 布局通过 |
| EXE `-Downloads` | 批量操作、部分失败重试、HTTP/HTTPS 文件哈希、分片续传、设置重启、记录删除及随记数据保留通过 |
| EXE `-UpdateSettings -EditorWorkflow -WeeklyReport` | 更新源、超时/保存失败、原生模拟 AI、随记编辑保存、周报生成取消/保存重载通过 |
| Computer Use | 直接操作最终 EXE，三页面设置入口、六类内容、草稿保留、常用目录、保存反馈、子窗口返回、版本号及退出重启通过 |

编辑器完整套件首次运行遇到代码块键盘选区超时，未改产品代码重跑后全套通过。周报测试的历史数据使用上海日期边界，本次将测试进程及隔离 WebView 的时区与该数据统一，结束时恢复 WebView 原时区；不修改产品和操作系统时区。

## 最终 EXE 证据

下列路径均相对 `app/`，原始结果和截图保留在本机，不随源码提交：

| 证据目录 | 用途 |
| --- | --- |
| `ui-check.local/portable-20261011-235340-731/result.json` | 原生统一设置中心，PASS，交付 EXE 哈希一致 |
| `ui-check.local/settings-center-native/` | 分类及 1440/1100/760px 截图、设置用例结果 |
| `ui-check.local/portable-20261011-235727-530/result.json` | 原生下载回归，PASS，交付 EXE 哈希一致 |
| `ui-check.local/downloads-native/result.json` | 下载范围与文件校验记录 |
| `ui-check.local/portable-20261012-000020-532/result.json` | 原生更新、编辑器与周报，PASS，交付 EXE 哈希一致 |
| `ui-check.local/cua-settings-20261012_1450/result.json` | Computer Use、备份哈希、最终退出及产物哈希核验 |
| `ui-check.local/cua-settings-20261012_1450/screenshots/` | 01–17 编号的真实 EXE 窗口截图 |

Computer Use 重启后再次确认：清新绿主题、“直接退出”选择、512 KiB/s 总限速、常用目录均保留。“关于与更新”显示构建版本 20261012_1450。

## 数据隔离与清理

每次原生验证使用独立的 `PROJECTTODO_TEST_DATA_DIR` 和 `WEBVIEW2_USER_DATA_FOLDER`，仅使用虚构资料及本机模拟 AI。真实 `Documents/ProjectTodo` 在验证前完整备份，逐文件核对 SHA-256；最终 9 个真实文件的数量及哈希完全一致。测试 EXE 和下载引擎均已退出。

Computer Use 的备份及恢复命令保存在 `ui-check.local/cua-settings-20261012_1450/user-data-before/` 和 `RESTORE.ps1`；本次无需恢复。原生自动化各次备份保留在对应的 `portable-*` 证据目录。

本轮交付是本机 EXE；未发布更新服务。真实模型质量、真实远程同步与其他 Windows/WebView 版本不在本轮模拟服务验证范围内。

新版验收通过后，交付目录按构建时间保留最新 4 个 EXE；仅清理匹配 `ProjectTodo_YYYYMMDD_HHmm.exe` 的更早文件，原始报告和其他文件保留。
