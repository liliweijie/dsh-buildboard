# Handoff

## Current Context

2026-10-28（最新）：用户明确要求界面固定入口，不要每次通过对话调用。1.1.0 已改用官方 MCP Apps `_meta["openai/ui"].entrypoints` 注册 global（侧栏应用）及 thread（对话面板）入口，名称“便签板 · Codex”。自包含 `ui://buildboard/codex.html` 资源通过 `ui/initialize` 和 `tools/call` 桥直接操作 user-only `buildboard_ui` 工具；日常操作不发送聊天消息、不调用模型。已启用本机 `enable_mcp_apps` 并安装新版，客户端需重启一次发现入口。工具安全限制不允许自动操作 Codex 主界面，因此不能声称实际侧栏按钮已经显示；协议与原生桥自动检查通过。旧 localhost 页保留为不支持 MCP Apps 时的备用方式。

## Previous context

2026-10-28：用户要求将 buildboard 改装成 Codex 可用版，仓库内标注 Codex 版，并在右上角显示当前 5 小时用量剩余度。

实现位于 `codex/`；根目录 DeepSeek 版不变，根 README 添加入口，`.agents/plugins/marketplace.json` 提供本地安装。通过 MCP 打开本机便签板；额度通过 Codex App Server `account/rateLimits/read` 读取，只用 300 分钟窗口。Codex 无对应 DeepSeek 顶栏插槽，额度显示在便签板右上角。详情与操作命令见 `codex/README.md`。

本机已实际看到额度从 94% 更新至 92%，保存、编辑、完成和刷新后持久化已通过界面检查。使用既有 CLI 登录，不读取或打包认证文件。分析功能使用只读 CLI 调用，不自动传入当前聊天历史。

初期独立 CLI 请求未沿用 macOS 系统代理，导致分析请求与额度查询不稳定（已修复）。Codex 子进程现自动沿用系统 HTTPS 代理，显式代理环境变量优先。修复后窗口实际分析已返回判断、待澄清问题和下一步；PATH CLI 与桌面 CLI 均实际读到相同的 5 小时剩余额度。7 项自动检查通过，图片压缩、保存、刷新读取与窄屏/桌面布局已验证。
