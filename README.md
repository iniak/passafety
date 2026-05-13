# Passafety — 安全的本地密码管理器

Passafety 是一个基于 **Tauri 2 + React 18 + Rust** 构建的离线密码管理器。所有数据以 AES-256-GCM 加密后存储于本地 SQLite 数据库，主密钥仅在解锁期间驻留内存，并在锁定时被显式擦除。整体风格参考 KeePassXC,但加入了 amber + ink 的暗色 vault-grade 视觉系统，并提供完整浅色模式。

> **版本**：v3.4.0  ·  **平台**：Windows（绿色版 + NSIS 安装包）  ·  **许可**：[MIT](./LICENSE)  ·  **运行模式**：portable · `vault.db` 与 exe 同目录

---

## 目录

- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [架构](#架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [构建发布版](#构建发布版)
- [Tauri 命令清单](#tauri-命令清单)
- [键盘快捷键](#键盘快捷键)
- [安全设计](#安全设计)
- [数据存储](#数据存储)
- [数据库 Schema](#数据库-schema)
- [CSV 导入/导出格式](#csv-导入导出格式)
- [开发说明](#开发说明)
- [已知限制](#已知限制)

---

## 核心特性

### 加密 & 持久化
- **主密码加密**：PBKDF2-HMAC-SHA256（100,000 轮）派生 256 位密钥
- **逐条目加密**：每条密码记录使用独立随机 12 字节 nonce 进行 AES-256-GCM 加密
- **密码验证**：通过测试密文验证主密码正确性，避免误解密
- **密钥擦除**：锁定或退出时通过 `zeroize::Zeroize` 安全清空内存中的密钥
- **修改主密码**：原密码验证后，事务化重加密所有条目，密码库保持解锁状态

### 数据管理
- **分组管理**：创建、删除分组；删除分组时其条目自动归入「默认分组」
- **拖拽排序**：表格内任意拖动条目调整顺序（amber 插入线指示），顺序持久化到 `position` 列
- **拖到分组**：直接把条目拖到左侧任意分组按钮即可移动归属
- **批量操作**：勾选条目后支持批量删除 / 批量修改分组
- **CSV 导入/导出**：自动尝试 UTF-8 / GBK / GB18030 / Windows-1252 多种编码；导入时自动创建未存在的分组
- **搜索过滤**：前端实时筛选标题 / 用户名 / 备注 / 分组

### 界面
- **浅色 / 深色双主题**：解锁页和主界面顶栏 / 应用菜单都可切换；偏好持久化到 localStorage；首次启动默认浅色
- **列宽可调**：表头列分界处拖动调整列宽，每列宽度保存到 localStorage
- **密码生成器**：可配置长度（8–64）、大小写、数字、符号；预览框 + 一键复制
- **应用菜单**：左上角汉堡菜单包含「修改主密码 / 切换主题 / 导出 CSV / 关于」
- **键盘快捷键**：← / → 切换分组，空格切换选中行密码显示，Ctrl + C 复制选中行密码
- **系统托盘**：关闭窗口最小化至托盘；单实例运行；托盘菜单可显示窗口或退出

### 安全提示
- 密码字段始终以遮罩呈现，长度固定（避免泄露实际长度）
- 解锁页内置合规提示：**禁止保存非本人操作账号 / 管理员账号密码**
- 主界面状态栏始终显示加密算法和数据库位置

---

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18 · TypeScript · TailwindCSS 3.4 · Zustand 5 · lucide-react · Vite 5 |
| 桌面框架 | Tauri 2.x |
| 后端语言 | Rust 2021 edition |
| 加密 | `aes-gcm` · `pbkdf2` · `sha2` · `rand` · `zeroize` |
| 数据库 | `rusqlite`（bundled SQLite） |
| CSV | `csv` · `encoding_rs` |
| Tauri 插件 | `shell` · `clipboard-manager` · `dialog` · `single-instance` |
| 字体 | Space Grotesk · JetBrains Mono · Noto Sans SC（Google Fonts CDN） |

---

## 架构

```
┌─────────────────────────────────────────┐
│  React 前端 (TypeScript)                 │
│  - UnlockScreen / MainLayout / Sidebar  │
│  - EntryTable / EntryForm / Generator   │
│  - About / ChangePassword 模态           │
│  - Zustand store (vaultStore.ts)        │
└──────────────────┬──────────────────────┘
                   │  @tauri-apps/api invoke()
                   ▼
┌─────────────────────────────────────────┐
│  Tauri Commands (Rust)                  │
│  src-tauri/src/commands/vault.rs        │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│  Vault 核心 (Rust)                       │
│  ├── crypto.rs    PBKDF2 + AES-256-GCM  │
│  ├── db.rs        SQLite 持久化 + CSV    │
│  ├── state.rs     解锁/锁定状态机         │
│  └── password_gen.rs 随机口令生成        │
└──────────────────┬──────────────────────┘
                   ▼
              vault.db (SQLite, 与 exe 同目录)
```

前端通过 `invoke` 直接调用 Rust 命令，无任何子进程或外部 IPC。所有加密与持久化逻辑在 Rust 单进程内同步完成。

---

## 项目结构

```
PasSafety/
├── src/                                  # React 前端
│   ├── App.tsx                           # 路由：锁定 → UnlockScreen / 解锁 → MainLayout
│   ├── main.tsx                          # 入口（同步应用主题类避免闪烁）
│   ├── index.css                         # 完整设计系统 + 浅色模式覆盖
│   ├── components/
│   │   ├── unlock/UnlockScreen.tsx       # 解锁 / 初始化双模式
│   │   ├── layout/
│   │   │   ├── MainLayout.tsx            # 顶栏 + 应用菜单 + 三栏布局 + 状态栏
│   │   │   └── Sidebar.tsx               # 分组列表 + 健康度面板
│   │   ├── entries/
│   │   │   ├── EntryTable.tsx            # 表格 + 拖拽 + 选择 + 列宽 + 右键菜单
│   │   │   ├── EntryForm.tsx             # 新增/编辑条目弹窗
│   │   │   ├── PasswordGenerator.tsx     # 密码生成器弹窗
│   │   │   └── DetailPanel.tsx           # (保留, 默认未启用)
│   │   └── ui/
│   │       ├── ConfirmDialog.tsx         # 通用确认对话框
│   │       ├── AboutModal.tsx            # 关于弹窗
│   │       └── ChangePasswordModal.tsx   # 修改主密码弹窗
│   ├── stores/vaultStore.ts              # Zustand 全局状态 + 主题 + 所有 invoke 调用
│   └── types/index.ts
│
├── src-tauri/                            # Rust + Tauri 桌面层
│   ├── Cargo.toml                        # 版本号 3.4.0
│   ├── tauri.conf.json                   # dragDropEnabled: false（启用 HTML5 DnD）
│   ├── capabilities/default.json
│   ├── icons/                            # 全套图标（PNG + ICO + Square*）
│   └── src/
│       ├── main.rs
│       ├── lib.rs                        # tauri::Builder + 托盘 + 命令注册
│       ├── commands/vault.rs             # 所有 #[tauri::command]
│       └── vault/
│           ├── crypto.rs                 # PBKDF2 + AES-256-GCM + zeroize
│           ├── db.rs                     # SQLite + 迁移 + CSV + 重排序 + 批量
│           ├── state.rs                  # VaultState（含修改主密码逻辑）
│           └── password_gen.rs
│
├── build/                                # 一键构建产物副本（gitignore）
│   ├── passafety.exe                     # 绿色版（运行后同目录会生成 vault.db）
│   └── Passafety_3.4.0_x64-setup.exe     # NSIS 安装包
├── app-icon.png                          # 图标源 (1024×1024)
├── test-passwords.csv                    # 100 条测试数据（可导入演练）
├── public/ · dist/                       # 静态资源 / 前端构建产物
├── index.html · vite.config.ts · package.json · ...
└── build.bat / build.sh                  # 一键构建脚本
```

---

## 快速开始

### 环境要求

| 依赖 | 版本 |
| --- | --- |
| Node.js | 18 或更高 |
| npm | 与 Node 配套 |
| Rust toolchain | stable（通过 [rustup](https://rustup.rs) 安装） |
| Tauri CLI | 2.x（随 `@tauri-apps/cli` devDependency 安装） |
| Windows 构建工具 | MSVC 构建工具（Windows 平台） |
| WebView2 Runtime | Windows 10/11 自带，老系统需手动安装 |

### 安装依赖

```bash
npm install
```

> 该项目纯 JS + Rust，不需要 Python 或额外子进程。

### 启动开发模式

```bash
npm run tauri dev
```

启动 Vite 开发服务器（`http://localhost:1420`，端口固定）+ Tauri 调试可执行文件。前端热重载生效；Rust 改动会触发 cargo 重编译。

---

## 构建发布版

```bash
# 一键脚本（执行 npm install → npm run build → npm run tauri build）
./build.sh        # Linux / macOS / Git Bash
build.bat         # Windows cmd

# 或手动
npm run build           # 仅前端（输出至 dist/）
npm run tauri build     # 生成 NSIS 安装包 + 绿色版 exe
```

构建产物（Windows）：

| 文件 | 路径 | 大小 |
| --- | --- | --- |
| 可执行文件 | `src-tauri/target/release/passafety.exe` | ~6 MB |
| 安装包 | `src-tauri/target/release/bundle/nsis/Passafety_3.4.0_x64-setup.exe` | ~2.3 MB |

Release profile 已启用 `lto = true`、`codegen-units = 1`、`panic = "abort"`、`opt-level = "s"`、`strip = true`，体积与启动速度均经过权衡。

### 替换应用图标

1. 替换 `app-icon.png`（任意 PNG，推荐 1024×1024）
2. 运行 `npm run tauri -- icon app-icon.png` 自动生成全套尺寸（17 个 PNG + ICO + ICNS + iOS/Android 资源）
3. **强制刷新构建脚本**：`touch src-tauri/build.rs` 确保 `tauri-build` 重跑（否则 cargo 缓存会让旧图标继续嵌入 exe）
4. 重新 `npm run tauri build`
5. Windows 资源管理器若仍显示旧图标，是 Explorer 缓存：`ie4uinit.exe -ClearIconCache` 后刷新即可

---

## Tauri 命令清单

所有命令实现于 `src-tauri/src/commands/vault.rs`，通过 `tauri::generate_handler!` 在 `lib.rs` 中注册。

| 命令 | 用途 | 是否需要解锁 |
| --- | --- | :-: |
| `is_vault_initialized` | 检查是否已存在主记录 | ✗ |
| `setup_vault(password, hint)` | 创建新密码库 | ✗ |
| `unlock_vault(password)` | 解锁现有密码库 | ✗ |
| `lock_vault` | 锁定（擦除内存密钥） | ✓ |
| `get_password_hint` | 读取主密码提示 | ✗ |
| `change_master_password(old, new, hint)` | 修改主密码并事务化重加密所有条目 | ✓ |
| `get_entries(group?)` | 列出条目（按分组过滤，按 position 排序） | ✓ |
| `add_entry(...)` | 新增条目（自动落到末尾） | ✓ |
| `update_entry(id, ...)` | 更新条目（含组归属） | ✓ |
| `delete_entry(id)` | 删除条目 | ✓ |
| `reorder_entries(ordered_ids)` | 拖拽排序时调用，按新顺序重分配 position | ✓ |
| `move_entries_to_group(ids, group)` | 批量改组（事务化） | ✓ |
| `get_groups` | 列出分组及条目计数 | ✗ |
| `add_group(name)` | 新建分组（INSERT OR IGNORE） | ✗ |
| `delete_group(name)` | 删除分组（条目转移到「默认分组」） | ✗ |
| `export_csv(path)` | 导出全部条目为 CSV | ✓ |
| `import_csv(path)` | 从 CSV 导入条目（自动建分组） | ✓ |
| `generate_password_cmd(options)` | 生成随机口令 | ✗ |

---

## 键盘快捷键

在主界面（非输入框获焦、无弹窗）下：

| 快捷键 | 行为 |
| --- | --- |
| **←** / **→** | 在分组列表中循环切换（包含「全部」） |
| **空格** | 切换当前选中行的密码显示 / 隐藏 |
| **Ctrl + C** | 复制当前选中行的密码到剪贴板 |
| **Enter**（表单内） | 提交解锁 / 创建 / 保存 |

输入框 / 文本域 / 下拉 获焦时这些键不被劫持，输入正常。

---

## 安全设计

| 措施 | 说明 |
| --- | --- |
| 密钥派生 | PBKDF2-HMAC-SHA256，盐 16 字节随机生成，迭代 100,000 轮，密钥 32 字节 |
| 对称加密 | AES-256-GCM；每条密码独立 nonce（12 字节随机） |
| 完整性 | GCM 自带认证标签（16 字节），ciphertext / nonce / tag 在数据库中分列存储 |
| 主密码验证 | 创建库时用主密钥加密固定字符串 `test_password`，解锁时尝试解密验证 |
| 密钥擦除 | `VaultCrypto` 实现 `Drop` + `zeroize::Zeroize`；`lock_vault` 立即覆盖内存中的密钥 |
| 修改主密码 | 验旧密码 → 派生新密钥 → 事务化重加密所有条目 + 替换 master 记录；过程中老密钥用完即擦 |
| 进程隔离 | 单实例插件防止多次启动；窗口关闭最小化至托盘而非退出 |
| 前端权限 | `capabilities/default.json` 仅声明剪贴板、对话框、shell-open 等最小权限 |
| 网络隔离 | 完全离线，无任何外部 API 调用；唯一外部资源是首次加载 Google Fonts（可改本地） |

> **威胁模型提示**：本工具旨在抵御本地文件被复制后的离线破解；不防御内存提取攻击、按键记录、被劫持的系统等高级威胁。锁屏环境下解锁后请及时点击「锁定」。

---

## 数据存储

`vault.db` 采用 **portable 模式** — 与 `passafety.exe` 同目录存储。具体解析逻辑（`src-tauri/src/lib.rs`）：

1. **首选**：可执行文件所在目录下的 `vault.db`
2. **回退**：若 `current_exe()` 解析失败，使用 Tauri 应用数据目录（Windows: `%APPDATA%\com.passafety.app\vault.db`）

这意味着：
- **绿色版**：双击 `passafety.exe` 后会在同目录创建 `vault.db`，整个文件夹拷走即可迁移
- **NSIS 安装版**：默认安装到 `Program Files`，`vault.db` 也会在该目录下；如需多用户隔离，建议绿色版

> 多个 `passafety.exe` 放在不同目录可拥有各自独立的密码库。

---

## 数据库 Schema

```sql
-- 主记录（单行）
CREATE TABLE master (
    id INTEGER PRIMARY KEY,
    salt BLOB,                         -- 16 字节
    iterations INTEGER,                -- 100,000
    test_password_encrypted BLOB,      -- 验证密文
    test_nonce BLOB,                   -- 12 字节
    test_tag BLOB,                     -- 16 字节
    password_hint TEXT
);

-- 分组
CREATE TABLE groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- 密码条目
CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website TEXT NOT NULL,             -- 明文：标题/网站
    username TEXT NOT NULL,            -- 明文：用户名
    password_encrypted BLOB NOT NULL,  -- AES-256-GCM 密文
    nonce BLOB NOT NULL,               -- 12 字节
    tag BLOB NOT NULL,                 -- 16 字节
    comment TEXT,                      -- 明文：备注
    `group` TEXT DEFAULT '默认分组',
    position INTEGER DEFAULT 0         -- 拖拽排序用
);
```

`db.rs::migrate_columns` 会在打开旧版本数据库时自动补齐 `test_nonce` / `test_tag` / `password_hint` / `comment` / `group` / `position` 等列，并将历史的 `未分组` 重命名为 `默认分组`，保证向后兼容。

> ⚠️ **明文字段**：标题、用户名、备注、分组名以明文存储，仅密码字段加密。如果这些字段含敏感信息，请考虑放入备注前自行加密或避免存储。

---

## CSV 导入/导出格式

导出文件采用 UTF-8（BOM）编码，**列顺序固定（中文表头）**：

```csv
标题,用户名,密码,备注,分组
GitHub,alice,p@ssw0rd,工作账号,工作
邮箱,bob@example.com,******,,默认分组
```

导入逻辑：

- 按顺序读取前 5 列；缺省字段回退为空字符串或「默认分组」
- 编码尝试顺序：`UTF-8 → GBK → GB18030 → Windows-1252`（兼容 Excel 中文环境导出）
- **未存在的分组自动创建**到 groups 表（INSERT OR IGNORE）
- 行级容错：单行解析失败不中断整体导入

项目自带 `test-passwords.csv`（100 条覆盖 12 个分组的测试数据）可用来演练大数据量下的体验。

---

## 开发说明

### 端口

Vite dev server 固定监听 `1420`（`strictPort: true`）。该端口与 `tauri.conf.json` 中的 `devUrl` 必须保持一致。

### 添加新的 Tauri 命令

1. 在 `src-tauri/src/commands/vault.rs` 中实现 `#[tauri::command] pub async fn ...`
2. 在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler!` 宏中追加命令名
3. 在 `src/stores/vaultStore.ts` 中通过 `invoke('command_name', { ... })` 调用

> Tauri 默认以函数名作为命令标识符。前端 `invoke()` 的参数名使用 **camelCase**，Rust 端通过 `serde` 自动转换为 `snake_case`。

### 拖拽功能与 Tauri DnD

`tauri.conf.json` 设置了 **`"dragDropEnabled": false`**。Tauri 2 默认开启 OS 级 drag-drop 拦截（用于 `tauri://drag-drop` 事件），会让 WebView 内的 HTML5 DnD API 失效。本项目内部使用 HTML5 DnD 实现条目排序和拖到分组，因此必须关闭这一拦截。代价是无法接收来自系统的文件拖入事件（本项目不需要）。

### 测试

加密与口令生成模块带有单元测试：

```bash
cd src-tauri
cargo test
```

覆盖：密钥派生一致性、加解密往返、错误密码拒绝、口令长度 / 字符集约束等。

### 主题系统

- CSS 自定义属性定义在 `:root`（深色为默认）
- 浅色覆盖通过 `body.theme-light` 选择器
- 首次启动同步在 `main.tsx` 应用 body 类，避免主题闪烁
- 偏好持久化键：`localStorage["passafety:theme"]`
- 切换入口：解锁页右上角 / 主界面顶栏 / 应用菜单（三处均可触发）

### 列宽持久化

- 5 个可调列（标题 / 用户名 / 密码 / 分组 / 备注），固定列（复选框 44px、操作 110px）
- 拖动表头列分界处调整
- 持久化键：`localStorage["passafety:col-widths:v4"]`
- 升级默认值时建议提升版本号（v4 → v5）让旧偏好失效

---

## 已知限制

- 仅打包 Windows NSIS 安装器；macOS / Linux 需自行调整 `tauri.conf.json` 的 `bundle.targets`
- 主密码长度仅校验前端最小 6 位，没有强制强度评估
- 没有自动锁定计时器（解锁后需手动点击「锁定」或退出）
- 没有内置同步、备份或云端存储；建议自行备份 `vault.db`
- 网络字体（Google Fonts）首次加载需要联网；如需完全离线可将 woff2 文件下载到本地并改用 `@font-face` 引用

---

## 历史

- **v3.4.0** — 浅色 / 深色双主题，拖拽排序，拖到分组，批量改组，键盘快捷键，应用菜单，修改主密码，portable 模式，列宽可调，新图标
- **v3.0.0** — 完全移除 Python 后端，加密与持久化全部迁移到 Rust；新 vault-grade 视觉系统
- ≤ v2.x — Python + JSON-RPC over stdin/stdout 架构（已废弃）

