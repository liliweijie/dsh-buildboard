# buildboard 数据存储约定（升级必读）

> 后续任何版本改动都必须遵守本文件，目标：**升级/调整插件不删除用户已有记录**。

## 存储位置

- 桌面端 localStorage 的 origin：`dsh-app://app`（固定，不随端口变化）
- 浏览器/Web 端：同源 localStorage

## 键名（禁止改名、禁止删除）

| 键 | 用途 |
| --- | --- |
| `dsh.blackboard.notes.v1` | 笔记主数据（JSON 数组） |
| `dsh.blackboard.notes.backup.v1` | 主数据备份，写入时先写备份再写主键 |
| `dsh.buildboard.history.folded.v1` | 历史面板折叠偏好 |

## 数据结构

```json
[{ "id": "string", "title": "string|null", "text": "string",
   "images": [{ "id": "string", "src": "data:image/webp;base64,...", "w": 0, "h": 0 }],
   "createdAt": 0, "status": "open|done" }]
```

图片以压缩后的 dataURL 存在 JSON 里（最长边 1200、webp 有损、单图上限约 240KB 字符），
单条最多 6 张；整个存储超过约 2MB 字符时会拒绝写入并提示用户，不会静默丢数据。

## 修改规则

1. **键名永不改变**；如需迁移，先复制旧键数据到新键并校验成功后再切换读取。
2. **只做增量兼容**：缺字段补默认值；未知字段、超长文本、较早的记录必须原样保留（`Object.assign({}, item, {...})`）。
3. 载入顺序：主键 → 备份键；主键损坏时用备份恢复，**绝不返回空数组回写覆盖**。
4. 写入只发生在用户真实改动后（dirty 标记），初次加载不回写。
5. 不允许出现 `localStorage.clear()` 或删除笔记主键的代码。
6. 发布前用真实 localStorage 数据做一次"升级后重新打开仍完整"的验证。
