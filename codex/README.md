# buildboard · Codex 版

与仓库根目录的 DeepSeek Harness 版并存，所有 Codex 实现放在本目录。

- 便签、时间分组、重命名、编辑、待办/完成、图片粘贴/拖入/选择、备份导出。
- **便签板右上角：当前账户 5 小时额度剩余百分比**，进度条、重置时间，每 30 秒刷新。
- Codex MCP 工具可打开便签板、读取/保存便签、查询额度、把选中便签及图片交给当前对话分析。
- 窗口内的“分析”使用当前 Codex CLI 登录，支持指定项目目录，成功时结果直接显示在便签板；网络或 CLI 调用失败会明确提示，可改用当前聊天的分析工具。macOS 下自动沿用现有系统 HTTPS 代理，显式设置的代理环境变量优先。

## 固定界面入口（1.1.0）

已注册官方 MCP Apps 原生入口：

- **侧栏应用**：在全局导航中点击“便签板 · Codex”，直接打开便签板。
- **对话面板**：在对话的内容面板入口中选择“便签板 · Codex”，与聊天并排使用。

这些操作由界面直接调用插件，不需要输入提示词，也不产生模型回合；刷新额度和保存便签不消耗模型额度。主动点击“开始分析”仍会调用 Codex 模型。入口的具体位置由客户端决定，不能指定任意顶栏位置。

本地 MCP Apps 需要客户端支持并启用 `enable_mcp_apps`。可执行 `codex features enable enable_mcp_apps`；安装更新后**重启客户端一次**，让原生入口重新发现。自动化检查能验证资源与入口协议；实际侧栏入口仍需在支持该扩展的桌面客户端中确认。

原生 UI 是自包含 MCP 资源，通过 MCP Apps 桥直接调用本插件，不嵌入本地网页、不依赖随机 localhost 端口、不向聊天发送操作消息。浏览器备用版仍可使用。

[官方固定入口说明](https://developers.openai.com/plugins/build/extensions)。

## 安装

要求 Node.js 22+、已登录 ChatGPT 账户的 Codex CLI，以及支持本地插件的 Codex 客户端。

在**仓库根目录**运行：

```sh
codex plugin marketplace add .
codex plugin add buildboard-codex@dsh-buildboard
```

安装后重启客户端，在侧栏或对话面板入口中点击“便签板 · Codex”。无需先发消息。若客户端不支持 MCP Apps，可在聊天里说“打开 buildboard 便签板”，使用返回的本地 URL 作为浏览器备用入口。

也可在本目录运行 `npm start`，手动在 Codex 浏览器打开打印的地址。无需 npm install，无第三方运行时依赖。服务只监听本机，端口随机，每次启动产生新的访问令牌。

更新代码后再次运行 `codex plugin add buildboard-codex@dsh-buildboard`，并重新加载插件；已保存的便签独立于安装目录。

## 额度口径

通过官方 Codex App Server 的 `account/rateLimits/read` 查询，使用已有登录，不读取或复制登录密钥。

1. 优先处理 `rateLimitsByLimitId`，缺失时回退到 `rateLimits`。
2. 只使用 `windowDurationMins === 300` 的窗口；不把 primary 假定为 5 小时，也不使用每周额度。
3. 剩余度 = `clamp(100 - usedPercent, 0, 100)`。界面向下取整，进度条保留原始比例。
4. 多个额度桶优先展示 `codex`；其他桶信息放在右上角悬停说明中。
5. 未登录、API key 登录、网络失败、没有 300 分钟窗口时显示“暂不可用”或说明，绝不假装有 100%。到期的数据不推算成已重置额度。
6. 账户额度在同一登录账户间共享。若 CLI 与桌面应用登录不同账户，本插件显示的是所用 CLI 账户的额度。

## 与原版的区别

Codex 当前公开接口不能注册 DeepSeek 的 `conversation.session.header.utilities` 插槽。因此 1.1.0 通过官方 **侧栏应用 + 对话面板** 入口接入界面，同时保留本地浏览器备用版。不会向 Codex 主程序顶部注入按钮。右上角额度属于原生便签板，窄窗口也会固定在顶部。

窗口内“分析”先显示说明，由用户点击“开始分析”才调用 `codex exec`，会消耗 Codex 账户额度。运行在只读模式，最长等待三分钟；可指定项目目录，不自动获取本聊天历史。需要当前对话背景时，让 Codex 使用 `prepare_note_analysis` 在当前聊天内分析。

原版 DeepSeek localStorage 不会被改动或自动迁移。图片会压缩成 webp，最长边 1200px，每条最多 6 张，正文最多 4000 字。文件选择限单张原图 20MB。

## 数据位置与恢复

默认保存到 `~/.codex/buildboard/notes.v1.json`，写入前生成 `notes.v1.json.backup`，主文件使用原子替换，多窗口写入通过文件锁串行化。主文件损坏时读取有效备份；两者都损坏时停止写入，不清空数据。可用“导出备份”下载 JSON；需要手动恢复时先停止所有便签板服务，备份损坏文件，再将导出的 JSON 或 `.backup` 复制为 `notes.v1.json`。

本地 URL 中的随机令牌允许访问本机便签，只用于打开自己的窗口，不要公开分享。便签不会上传到本插件的服务器；主动点击“开始分析”时选中便签和图片会交给已配置的 Codex 服务。

可选环境变量：

| 名称 | 用途 |
| --- | --- |
| `BUILDBOARD_DATA_DIR` | 独立数据目录 |
| `BUILDBOARD_CODEX_BIN` | Codex 可执行文件绝对路径；默认优先桌面应用提供的 CLI，其次 PATH 中的 codex |
| `BUILDBOARD_WORKSPACE` | 窗口分析的默认项目目录 |

## 验证

```sh
npm test
```

覆盖额度多桶/窗口选择、空值、非法值、存储并发、损坏恢复、MCP 握手与工具发现、侧栏/对话入口元数据、自包含资源、原生桥直连读写、HTTP 身份校验、便签读写和附件验证。界面手动验证保存、编辑、完成、图片压缩与刷新持久化、真实额度、窗口内的真实 Codex 分析，以及 381px 窄屏与 1024px 桌面布局。代码不包含凭证、用户便签或使用量快照。

官方接口说明：[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[插件打包](https://developers.openai.com/plugins/build/plugins)。
