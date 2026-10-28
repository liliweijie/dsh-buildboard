# buildboard

DeepSeek Harness 的便签板插件：**随手记想法、贴图、看余额用量，还能一键把某条记录交给 AI 分析。**

A buildboard note plugin for DeepSeek Harness — timestamped notes, images, a live
account HUD, and one-click AI analysis of any note in a fresh DeepSeek session.

## 功能

- **顶栏入口**：会话右上角 buildboard 图标，点开即用；`Alt+B` 全局快捷键；`Esc` 关闭
- **自动时间戳**：每条记录自动带上创建时间，按日期分组
- **键盘友好**：`Enter` 保存 · `Ctrl/Cmd+Enter` 或 `Shift+Enter` 换行 · 编辑中 `Esc` 取消
- **图片**：粘贴截图、拖拽文件或点按钮选择；自动压缩为 webp（最长边 1200px，每条最多 6 张）
- **双栏布局**：左侧编辑，右侧历史记录；历史行悬停出现 **✎ 编辑 / ✨ 分析 / × 删除**
- **就地编辑**：点 ✎ 把记录载入左侧修改（图片一并载入，可增删），`Enter` 保存
- **重命名与状态**：双击标题重命名；每条可标记 待办 / 完成
- **实时 HUD**：弹窗左上角显示 DeepSeek 账户**实时余额**与**实时用量**
- **AI 分析**：点某条记录的 ✨，自动新建一个 DeepSeek 会话，读取当前工作区的对话记录作为背景，输出这条记录的分析判断与下一步清单
- **数据本地保存**：localStorage 持久化，升级/更新插件不删除已有记录（见 [存储契约](docs/STORAGE-CONTRACT.md)）

## 安装

要求：DeepSeek Harness（桌面版或 Web 版，0.2.1-rc.3 实测可用）。

本插件是本地私有包（`@local/dsh-buildboard`），通过「从目录安装 bundle」的方式装入当前 profile：

1. 克隆本仓库到任意本地目录：
   ```bash
   git clone https://github.com/liliweijie/dsh-buildboard.git
   ```
2. 在 DeepSeek Harness 里让 Agent 安装该目录，或直接调用插件管理器的
   `install_bundle`（`target` 填仓库目录的**绝对路径**）：
   ```
   plugin_manager install_bundle target=/绝对路径/dsh-buildboard
   ```
3. 安装完成后，会话右上角出现 buildboard 图标即可使用。

开发者也可以把该目录链接进 profile 的 `node_modules` 后重启应用（`link:` 依赖方式）。

## 使用

| 操作 | 快捷键 / 方式 |
| --- | --- |
| 打开 / 关闭 | `Alt+B` 或点顶栏图标；`Esc` 关闭 |
| 保存记录 | `Enter` |
| 换行 | `Ctrl/Cmd+Enter`、`Shift+Enter` |
| 编辑已有记录 | 历史行 ✎ |
| 重命名 | 双击标题 |
| 删除 | 历史行 × |
| AI 分析 | 历史行 ✨（新建 DeepSeek 会话分析该记录） |
| 标记完成 / 待办 | 历史行状态控件 |
| 插入图片 | 粘贴 / 拖拽到编辑区 / 点图片按钮 |

## 数据与兼容性

- 笔记与图片保存在本地 localStorage，**不上传**；存储键名永不改变，升级插件不会丢记录
- 图片以压缩后的 dataURL 存储（webp 有损，单图约 ≤180KB），整个存储超过安全上限时会拒绝写入并提示，而不是静默丢数据
- AI 分析需要客户端 session 远程接口可用；失败时会弹出具体错误信息

## License

[MIT](LICENSE)
