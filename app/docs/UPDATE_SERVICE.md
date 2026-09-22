# ProjectTodo 更新服务与界面设计

## 已确认要求

2026-09-22，用户要求：“把软件更新的服务端地址改成vps03的地址”，“做成可配置的”，“后面有新版本就传到vps03去了”，并提供设置 → 关于的截图，要求使用 ui-ux-pro-max 设计界面。

- 后续已验收新版本的发布位置为 VPS03；发布时更新同一个版本清单，不再为每个版本更换更新源。
- 客户端需要可编辑的更新服务器地址；默认使用下述 VPS03 HTTPS 地址。
- 保留检查更新、历史版本、启动检查和定时检查。
- 本次没有要求自动覆盖正在运行的 EXE；现有下载后关闭旧版、替换 EXE 的流程仍适用。
- 以上仅适用于 ProjectTodo 更新功能，不扩展为其他项目或其他服务的部署授权。

## 当前状态

- 服务端：2026-09-22 已增加独立 `/projecttodo/` 静态更新路径，使用现有 Caddy，不新增监听端口或安装 Nginx。
- 首个版本：已验收的 `20260922_1040`，源码 `b7452aeb397e5cb6310604a148966c70fb4b5ad2`，19,395,584 字节，SHA-256 `D2AF2D5E00562B52F81B357D124852B48496647A3234DF399198BBE8C2D758FC`。
- 客户端：仍使用原先写死的地址，尚未接入新的可配置更新源；当前 EXE 不会因服务端调整自动切换地址。
- 界面：已给出三张独立示例，尚未选定或实施。用户选图不等于实际客户端验收。

服务地址：`https://word-route.188-255-156-112.sslip.io/projecttodo`

版本清单：`https://word-route.188-255-156-112.sslip.io/projecttodo/versions.json`

域名中保留历史名称是为了复用已验证的 HTTPS 入口，不代表仍部署 Word Route 应用。SSH 登录信息仅从本机运维指引读取，不写入本文件。

## 发布约定

1. 在 main 本机构建，按 [Windows 验收](RELEASE_QA.md) 测试最终 EXE，记录提交、字节数和 SHA-256。
2. 只向 VPS03 上传已验收产物。每个版本使用独立目录 `/srv/projecttodo/releases/<YYYYMMDD_HHmm>/`，上传时使用临时文件名，核对字节数和 SHA-256 后再转为最终名称；不覆盖已经发布的同名 EXE。
3. 修改版本清单前完整备份现有清单并验证可读。先发布 EXE，再写清单临时文件，验证 JSON 后原子替换 `versions.json`，避免客户端下载到未上传完的文件。
4. `latest` 指向 `versions` 中确实存在的最大有效版本；`downloadUrl` 使用永久 HTTPS 版本路径。记录 `version`、`releaseDate`、`downloadUrl`、`releaseNotes`、`mandatory`，同时提供 `sha256`、`size`、`sourceCommit`。
5. 公网验证清单 HTTP 200、无缓存、JSON 类型和版本字段；验证 EXE 完整下载哈希，以及 Range 请求 HTTP 206。只验证服务器上的文件不足以证明公网下载完整。
6. 回滚某次发布时，恢复已经备份并验证的旧版本清单；保留旧版 EXE。不自动删除历史服务器目录。客户端是否提示版本回退另行定义，不把恢复旧清单等同于自动降级用户程序。

当前服务通过既有 Caddy 的独立 `handle /projecttodo/*` 提供文件，文件根目录为 `/srv`。清单响应使用 `Cache-Control: no-store`、JSON 内容类型和 CORS；下载响应带 `Content-Disposition: attachment`。备份位于 Web 根目录之外。

仓库根目录的 `setup_update_server.sh`、`setup_update_server_v2.sh`、`add_version.sh` 仍针对旧域名和 Nginx，不能用于此 VPS03 服务。后续自动化发布工具应遵循以上流程，不能直接复用旧脚本去覆盖当前服务配置。

## 本轮设计来源与状态

输入：用户提供的 `codex-clipboard-a760187e-b522-415b-a584-7454e5df6bc8.png`（设置 → 关于）。

三张示例按聊天中实际出现的顺序编号：

1. `exec-daa4f887-6311-4404-8253-a5ec2c8609a6.png`
2. `exec-74dfc8c1-c710-4b2e-ab43-eeec61c9d024.png`
3. `exec-ea33c133-790d-4768-841f-156197aa07c2.png`

这些是本机生成图片，不是运行截图；完整本地路径及选图状态保存在 `app/ui-check.local/update-service-20260922/design-and-backup.json`。设计中的“尚未测试”等为示例状态，不能视为真实服务检测结果。

实现建议（尚未经过用户选图）：沿用现有紫色主题，缩小顶部；地址字段提供测试连接、恢复默认及保存；字段错误就近显示，保存前不覆盖当前生效地址。用户明确选择或修正后更新此记录，保持用户要求和实现选择的区别。
