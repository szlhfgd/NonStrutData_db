# NonStrutData_db — LightRAG Fork 工作副本

基于 [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG)（`lightrag-hku`）的二次开发仓库。LightRAG 是一个基于**图知识图谱**的检索增强生成（RAG）框架：从文档中抽取实体与关系、构建知识图谱，并提供 `local` / `global` / `hybrid` / `mix` / `naive` 多种检索模式进行问答。

本副本默认带 WebUI（文档管理 + 图谱可视化 + 对话），并针对实际使用做了本地化与界面改动。

## 目录结构

```
├── ui.cmd                 # 一键启动/关闭 WebUI + 后端（Windows）
├── AGENTS.md / CONTEXT.md # 仓库说明与领域术语
├── docs/                  # 本地 agent 工作流文档
├── .scratch/              # 本地 markdown issue 追踪器
├── .env                   # 环境变量配置（LLM / Embedding 等）
├── env.example            # 后端配置模板（复制为 .env 使用）
├── requirements.txt       # pip 运行时依赖（由 .venv 冻结，含 api）
├── requirements-test.txt  # 测试依赖（可选）
├── tests/                 # pytest 测试
├── lightrag_webui/        # React 19 + TypeScript Web 前端（Vite + Tailwind）
└── lightrag/              # ★ 项目本体
    ├── lightrag/          #   Python 核心包（LightRAG 类、存储后端、LLM 绑定、解析器）
    ├── scripts/           #   测试/安装脚本
    ├── rag_storage/       #   运行时知识图谱与存储数据
    ├── inputs/            #   文档输入目录
    └── pyproject.toml     #   包与依赖定义（api / test / offline-* 等 extras）
```

## 安装

要求：Python ≥ 3.10，Node ≥ 20（前端）。推荐用 [uv](https://docs.astral.sh/uv/)。

```bash
# 1) 进入项目本体
cd lightrag

# 2) 安装依赖（后端核心 + 测试）
uv sync --extra test
# 需要 API 服务/文档解析时额外装：uv sync --extra api

# 2b) 或用 pip（需 Python ≥ 3.10；在仓库根目录执行）
# pip install -r requirements.txt            # 运行后端
# pip install -r requirements-test.txt       # 测试依赖（可选）
# pip install -e ./lightrag                  # 安装本项目 lightrag-hku

# 3) 配置环境变量
# 在根目录编辑 .env（已配置好 SiliconFlow 的 LLM/Embedding/Rerank 绑定）
```

前端（`lightrag_webui`）：

```bash
cd lightrag_webui
bun install --frozen-lockfile   # 或 npm install --legacy-peer-deps（无 bun 时）
```

> 本副本根目录已有现成环境：`.venv`（Python 3.12 + lightrag-hku 已装好），`.env` 已配置 SiliconFlow 的 LLM/Embedding/Rerank 绑定，`lightrag_webui/node_modules` 已安装。通常无需重装，直接进入下一节。

## 使用

### 一键启停（Windows，`ui.cmd`）

在仓库根目录：

```
ui.cmd start      # 弹出两个窗口启动：后端(9621) + 前端(5173)
ui.cmd stop       # 按端口关闭前端与后端
ui.cmd restart    # 先停后起
```

### 手动启动

```bash
# 后端 API（生产/日常使用）—— 必须从仓库根目录启动（server 在启动目录加载 .env）
.venv\Scripts\lightrag-server   # 需要根目录的 .env；默认 127.0.0.1:9621

# 前端开发服务器（Vite HMR，端口 5173，代理到 9621）
cd lightrag_webui
npx vite --host          # 或 bun run dev
```

启动后：

- WebUI（开发态）：**http://localhost:5173**
- WebUI（生产内嵌）：后端 9621 自带打包好的前端页面
- 后端 API 文档：`http://localhost:9621/docs`（Swagger）
- 未配置 `AUTH_ACCOUNTS`/`LIGHTRAG_API_KEY` 时后端**无鉴权**，仅建议本机使用

### 用 Python 直接调用

所有用例都必须先 `await rag.initialize_storages()`，否则会报 `AttributeError: __aenter__`：

```python
import asyncio
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import gpt_4o_mini_complete, openai_embed

async def main():
    rag = LightRAG(
        working_dir="./rag_storage",
        llm_model_func=gpt_4o_mini_complete,
        embedding_func=openai_embed,
    )
    await rag.initialize_storages()          # 必须

    await rag.ainsert("LightRAG 是一个图 RAG 框架……")
    ans = await rag.aquery("LightRAG 的核心思想？", param=QueryParam(mode="hybrid"))
    print(ans)

    await rag.finalize_storages()

asyncio.run(main())
```

## WebUI 界面功能

浏览器打开后按顶部标签切换四个页面：

### 文档（Documents）

- **文档库概览卡片**：总计 / 已完成 / 处理中 / 待处理 / 失败的数量分布，处理时显示批次进度
- **上传文档**：拖拽或浏览多文件（限制文件类型与单文件大小），上传后进入流水线自动处理
- **扫描 / 重试**：扫描 `inputs/` 输入目录，并自动重试已失败的文档
- **文档清单表格**：文件名 / 摘要 / 状态 / 长度 / 分块数 / 创建与更新时间 / 元数据，支持状态筛选、分页、按行查看状态详情（可复制）
- **批量操作**：勾选多行删除（可勾选"同时删除上传文件"和"实体抽取 LLM 缓存"）；"清空"一键移除全部文档（需输入 `yes` 确认，可选清空 LLM 缓存）
- **流水线对话框**：查看当前处理作业与进度，可一键点击"中断"取消处理

### 知识图谱（Knowledge Graph）

- **交互式图谱**（Sigma.js）：实体节点 + 关系边按类型着色，支持图例、缩放/旋转、全屏
- **节点搜索**：按实体名搜索并定位子图；加载整个图谱并支持按 **深度 / 节点数上限** 剪裁
- **布局**：环形 / 圆形打包 / 随机 / 无重叠 / 力导向 / 力地图，动画可启停
- **属性面板**：点击节点/边查看 ID、类型、描述、权重、关键词等属性；可**编辑属性、重命名实体**（重名时自动合并）、扩展/隐藏/删除节点
- **侧边栏设置**：显示属性面板/搜索栏/标签、节点拖拽、边事件、边粗细等

### 检索（Retrieval）

- **对话式问答**：多轮会话历史、流式输出（可随时停止/清空），回复卡片显示首字时间、响应时间与检索阶段进度（提取关键词 → 检索实体/关系/文本块 → 重排序 → 生成回复）
- **查询模式**：输入框支持 `/naive` `/local` `/global` `/hybrid` `/mix` `/bypass` 前缀，或在下拉中切换
- **查询参数设置**：Top-K、`max_entity/relation/total_tokens`、历史轮次、是否只取上下文、是否流式、自定义输出提示词、是否启用重排

### 系统（System）

- **服务器状态**：健康检查、服务器信息、输入目录、解析器（MinerU/Docling）、LLM / 嵌入 / 重排序配置（绑定、端点、模型）、存储后端（KV / 文档状态 / 图 / 向量）、工作空间、锁状态
- 顶部提供 **API 文档**（Swagger）与**项目仓库**入口，右下角可切换**语言**（11 种，默认中文）与**主题**（浅色/深色/跟随系统）

> 未配置 `AUTH_ACCOUNTS`/`LIGHTRAG_API_KEY` 时无登录页，直接进入即可。

## 开发

```bash
# 后端测试：只跑与你改动模块对应的子目录（全套约 7000 个 >6 分钟）
cd lightrag
./scripts/test.sh ../tests/api/config        # 例：改了 api/config
./scripts/test.sh ../tests/kg/redis_impl     # 例：改了 kg/redis_impl.py
./scripts/test.sh ../tests                   # 全量（里程碑或跨模块改动时才跑）

# 代码风格
ruff check .

# 前端
cd ../lightrag_webui
bun run lint          # ESLint
bun test              # Bun 内置测试
bun run build         # 生产构建
```

- 前端领域术语见根目录 `CONTEXT.md`；本地 issue/triage 流程见 `docs/agents/`。

## 本副本的本地改动

- WebUI 默认语言改为**中文**（`settings.ts` 默认 `language: 'zh'`，`i18n` fallback 为 `zh`）；已存储的用户偏好不受影响。
- 文档管理页的 LibrarySummary（文档库摘要卡片）正在做**三套 UI 原型**（dev 环境可用 `?variant=A|B|C` 或底部浮条切换，生产环境不显示），选定后落地产物。
- `src/api/*` 已完成传输层解耦重构（`configureTransport`，移除前端对 zustand store 的耦合），`AppRouter` 在模块作用域统一注入凭据。

## 相关文档

- 上游项目：[HKUDS/LightRAG](https://github.com/HKUDS/LightRAG)
- WebUI 前端安装 / 构建 / 排错：见下文「WebUI 前端附录」（由 `lightrag_webui/WEBUI-README.md` 合并而来）

## WebUI 前端附录

### 安装

要求 Node ≥ 20。推荐用 [Bun](https://bun.sh)：

```bash
cd lightrag_webui
bun install --frozen-lockfile
bun run build
```

构建产物输出到 `lightrag/lightrag/api/webui`（后端在生产模式内嵌服务该目录）。

无 Bun 或 Bun 构建异常时可用 Node.js/npm：

```bash
cd lightrag_webui
npm install
npm run build
```

> 测试（`bun test`）仍需 Bun；其余脚本（`dev` / `build` / `preview` / `lint`）Bun 与 Node.js/npm 均可。

### 开发

```bash
cd lightrag_webui
bun run dev        # 或 npm run dev（Vite HMR，端口 5173）
```

### 常用脚本

| 命令                                    | 说明            |
| ------------------------------------- | ------------- |
| `bun run dev` / `npm run dev`         | 启动开发服务器       |
| `bun run build` / `npm run build`     | 生产构建          |
| `bun run lint` / `npm run lint`       | 运行 linter     |
| `bun run preview` / `npm run preview` | 预览生产构建        |
| `bun run build:bun`                   | 显式用 Bun 运行时构建 |
| `bun test`                            | 运行测试（仅 Bun）   |

### 排错

**`bun run build` 静默失败或 exit code 1** — 多为 Bun 版本不兼容或受限环境导致，改用 `npm install && npm run build`。

**WSL 下 `could not open bin metadata file` / node_modules 损坏** — 已知 Bun 问题（路径在 `/mnt/c`、`/mnt/d` 等 Windows 挂载盘时，`drvfs`/`9p` 文件系统不支持 Bun 需要的链接/元数据操作）。按优先级修复：

1. 把项目移到 Linux 文件系统（如 `~/LightRAG`）再 `rm -rf node_modules && bun install --frozen-lockfile && bun run build`（推荐）；
2. 留在挂载盘则改用 Node.js/npm：`rm -rf node_modules && npm install && npm run build`；
3. 升级 Bun（`bun upgrade`）。

**`Cannot find package '@/lib'`** — 旧版本 vite 配置在加载时使用仅 Bun 可解析的 `@/` 别名导致，已在 `vite.config.ts` 改用相对导入修复。