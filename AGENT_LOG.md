# AGENT_LOG.md — Seahorse Development Log

> 项目：Seahorse (Coding Agent Harness)  
> 仓库：https://github.com/4-3-7/ai4se-project  
> 总开发时间：2026-07-14

---

## 开发日志

### Phase 0: 项目脚手架

**T0.1 — 项目初始化** ✅
- `npm init`，TypeScript 5.x + ESM + Vitest + ESLint + Prettier
- GitHub Actions CI 骨架（lint → typecheck → test → build → docker）

### Phase 1: 核心基础设施

**T1.1a — Mock LLM + 类型系统** ✅
- 定义了 `Message`、`ToolCall`、`LLMProvider`、`LLMResponse` 核心类型
- 4 种错误类型：`LLMTimeoutError`、`LLMAuthError`、`LLMRateLimitError`、`LLMServerError`
- `MockLLMProvider`：基于 `MockScript` 的脚本匹配，`match` 回调 + `response`
- 17 个测试，完全确定性，无需网络

**T1.1b — Anthropic + OpenAI 真实 Provider** ✅
- `AnthropicProvider`：Messages API 封装，消息格式转换（system → 顶层参数，tool → tool_result）
- `OpenAIProvider`：Chat Completions API 封装，tool_calls JSON 解析
- 两者都有：3 次指数退避重试（1s/2s/4s），120s 超时，401/429/5xx 错误映射
- 23 个测试

**T1.2 — Action Parser** ✅
- `parseActions(response)`：从 `LLMResponse` 提取 `Action[]`
- toolCalls 优先于 text content

**T1.3 — Stop Judge** ✅
- `shouldStop(input)`：优先级 `max_turns > staleness(3) > task_complete`
- 15 个测试

### Phase 2: 工具系统

**T2.1 — Tool Registry** ✅
- `register()`、`get()`、`has()`、`list()`、`execute()`、`toToolDefinitions()`
- 重复注册报错

**T2.2 — File Tools** ✅
- `read_file`：offset/limit/truncation
- `write_file`：auto-mkdir
- `edit_file`：unique old_string 匹配

**T2.3 — Shell Exec** ✅
- `child_process.exec` 封装，timeout、stdout/stderr/exitCode

**T2.4 — Test Runner + Lint** ✅
- `run_tests`、`run_lint` 薄封装

### Phase 3: Agent 主循环

**T3.1 — AgentLoop** ✅
- 完整流程：context → LLM → parse → guardrail → execute → feedback → stop
- 支持 guardrailMode: 'deny' | 'interactive'
- 可选 HITL 状态机集成

### Phase 4: 治理系统 ★（主维度）

**T4.1 — 危险模式 + 护栏引擎** ✅
- 13 种危险模式：rm_root、mkfs、dd_device、drop_table、drop_database、truncate、delete_without_where、chmod_777、chown_root、curl_pipe_bash、wget_pipe_shell、fork_bomb、overwrite_system_file
- 28 个测试

**T4.2 — HITL 状态机** ✅
- IDLE → PAUSED → ALLOW/DENY/TERMINATE
- `waitForResolution()` Promise 机制
- 超时自动 deny

**T4.3 — Sandbox 路径边界** ✅
- 3 规则优先级：denied 先、allowed 后、allowOutsideProject 判断

**T4.4 — 审计日志** ✅
- JSONL 持久化，API Key 脱敏（`sk-ant-*`、`sk-proj-*`、`Bearer`）

**T4.5 — 治理集成** ✅
- HITL 交互模式集成到 AgentLoop
- `onHITLPause` 回调

### Phase 5: 反馈闭环（辅助维度）

**T5.1 — 解析器** ✅
- `parseTestResult`：Vitest/Jest/Mocha 格式
- `parseLintResult`：ESLint 格式

**T5.2 — 失败分类器** ✅
- 8 类：syntax、type、import、logic、style、runtime、timeout、unknown

**T5.3 — 回灌器** ✅
- Markdown 表格 + 分类 + 建议

**T5.4 — 反馈集成** ✅
- 覆盖 `run_tests`、`run_lint`、`shell_exec`
- 修复 turn number

### Phase 6: 记忆系统

**T6.1 — 文件存储** ✅
- Markdown 文件 + YAML frontmatter CRUD

**T6.2 — 检索器** ✅
- 关键词 + 标签评分，max 5 条

### Phase 7-9: 配置、凭据、CLI

**T7.1 — 配置加载器** ✅
- YAML/JSON + deep merge 默认值

**T8.1 — 凭据管理器** ✅
- AES-256-GCM 加密文件存储

**T9.1 — CLI** ✅
- Commander.js，7 个命令：run、setup、status、clear、config、demo、web

### Phase 10: Web UI

**T10.1 — xterm.js + WebSocket** ✅
- WebSocket 服务器（ws 库）
- xterm.js 终端前端，暗色 Seahorse 主题
- 自适应窗口，断线自动重连
- `seahorse web` 命令

### Phase 11: 分发

**T11.1 — npm 包** ✅
- package.json 配置完善（bin、exports、files、prepublishOnly）
- 仅 2 个运行时依赖（commander + js-yaml）

**T11.2 — Docker 镜像** ✅
- 多阶段构建，非 root 用户，volume 挂载

### Phase 12: CI/CD

**T12.1 — GitHub Actions** ✅
- lint → typecheck → test → build → docker-build

### Phase 13: 机制演示

**T13.1 — 3 个 Demo** ✅
- Demo 1：护栏拦截危险命令
- Demo 2：反馈循环驱动自我修正
- Demo 3：多层治理系统（模式匹配 + 沙箱 + HITL + 审计）

---

## 技术决策记录

1. **MockLLM 使用 `match` 回调而非 hash 匹配**：更灵活，支持顺序匹配、条件匹配
2. **Provider 使用原生 `fetch` 而非 SDK**：减少依赖，代码更透明
3. **HITL 使用 Promise 机制**：`waitForResolution()` 让 AgentLoop 可以 `await` 用户决策
4. **审计日志与 AgentLoop 解耦**：AgentLoop 返回 `auditEntries` 数组，调用方决定是否持久化
5. **Web UI 动态 import**：ws 依赖仅在 `seahorse web` 时加载
6. **依赖最小化**：从 10 个运行时依赖减到 2 个（commander + js-yaml）

---

## 统计

| 指标 | 数值 |
|------|------|
| 总任务数 | 27 |
| 总测试数 | 233 |
| 测试文件 | 22 |
| 源代码文件 | 30+ |
| Feature Branches | 7 |
| 运行时依赖 | 3（commander、js-yaml、ws） |
| 项目代码行数 | ~5000 |