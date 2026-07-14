# PLAN.md — Seahorse Implementation Plan

> **项目**：Seahorse (Coding Agent Harness)  
> **创建日期**：2026-07-14  
> **最后修订**：2026-07-14（冷启动验证后修订，T0.1 完成，T1.1 拆分）  
> **状态**：In Progress  
> **关联文档**：[SPEC.md](./SPEC.md) | [SPEC_PROCESS.md](./SPEC_PROCESS.md)

---

## 目录

1. [依赖关系图](#1-依赖关系图)
2. [Task 列表](#2-task-列表)
3. [执行顺序建议](#3-执行顺序建议)

---

## 1. 依赖关系图

```
Phase 0: Project Scaffolding
  └─ T0.1: Init project, deps, tsconfig, CI skeleton ✅

Phase 1: Core Infrastructure (No deps between modules)
  ├─ T1.1a: LLM Provider interface + Mock LLM + types ✅
  ├─ T1.1b: Anthropic + OpenAI real providers (需 API Key 验证)
  ├─ T1.2: Action Parser
  └─ T1.3: Stop Judge

Phase 2: Tool System (depends on T1.1a)
  ├─ T2.1: Tool Registry + base types
  ├─ T2.2: File tools (read, write, edit)
  ├─ T2.3: Shell exec tool
  └─ T2.4: Test runner + lint tools

Phase 3: Agent Main Loop (depends on Phase 1 + Phase 2)
  └─ T3.1: Agent Loop (context → LLM → parse → execute → feedback → stop)

Phase 4: Governance ★ (depends on T2.1, T2.3)
  ├─ T4.1: Danger patterns + Guardrail engine
  ├─ T4.2: HITL State Machine
  ├─ T4.3: Sandbox / Path boundary
  ├─ T4.4: Audit log
  └─ T4.5: Governance integration into main loop

Phase 5: Feedback Loop (depends on T2.4, T3.1)
  ├─ T5.1: Test result parser + Lint parser
  ├─ T5.2: Failure classifier
  ├─ T5.3: Feedback injector
  └─ T5.4: Feedback integration into main loop

Phase 6: Memory (independent of Phase 4-5)
  ├─ T6.1: Memory store (file-based)
  └─ T6.2: Retriever + Context builder

Phase 7: Configuration (independent)
  └─ T7.1: Config loader + schema + defaults

Phase 8: Credentials (independent)
  └─ T8.1: Credential manager + setup wizard

Phase 9: CLI (depends on Phase 3-8)
  └─ T9.1: CLI entry point (commander.js)

Phase 10: Web UI (depends on Phase 9)
  └─ T10.1: xterm.js + WebSocket server

Phase 11: Distribution (depends on Phase 9)
  ├─ T11.1: npm package
  └─ T11.2: Docker image

Phase 12: CI/CD
  └─ T12.1: GitHub Actions workflow

Phase 13: Mechanism Demo
  └─ T13.1: Demo script (guardrail + feedback + deep dimension)
```

---

## 2. Task 列表

### Phase 0: Project Scaffolding

#### T0.1 — 项目初始化与基础设施 ✅

| 属性 | 内容 |
|------|------|
| **目标** | 初始化 TypeScript 项目，安装所有依赖，配置 tsconfig、ESLint、Vitest，创建目录结构，编写 CI 骨架 |
| **涉及文件** | `package.json`, `tsconfig.json`, `vitest.config.ts`, `.eslintrc.json`, `.prettierrc`, `.gitignore`, `.github/workflows/ci.yml`, `tsconfig.eslint.json`, 目录结构 |
| **预期实现要点** | Node.js 22 + TypeScript 5.x + ESM；Vitest 配置（80% 覆盖率阈值）；ESLint + Prettier；目录结构按 SPEC §3.1 创建 |
| **验证步骤** | `npm install` 无报错；`npm test` 运行成功；`npm run lint` 通过；`npm run build` 产出 `dist/`；`npm run typecheck` 通过 |
| **依赖** | 无 |
| **可并行** | 无（第一个任务） |
| **完成状态** | ✅ 已完成（冷启动验证 agent 实现） |
| **Commit** | 待提交 |

---

### Phase 1: Core Infrastructure

#### T1.1a — LLM Provider 接口定义 + Mock LLM + 错误类型 ✅

| 属性 | 内容 |
|------|------|
| **目标** | 定义 `LLMProvider` 接口、`MockScript` 接口、所有类型和错误类；实现 `MockLLMProvider`（基于脚本匹配的确定性输出） |
| **涉及文件** | `src/core/llm/types.ts`, `src/core/llm/provider.ts`, `src/core/llm/mock.ts`, `src/core/llm/mock.test.ts` |
| **预期实现要点** | `types.ts`：Message, ToolCall, LLMOptions, LLMResponse, LLMProvider, MockScript 接口定义 + 4 种错误类型（LLMTimeoutError, LLMAuthError, LLMRateLimitError, LLMServerError）；`provider.ts`：接口 re-export + 预留工厂函数；`mock.ts`：MockLLMProvider 实现，按脚本注册顺序匹配，无匹配返回默认响应 |
| **验证步骤** | 17 个单测覆盖：类型定义、错误类型创建、Mock 接口实现、默认响应、脚本匹配、确定性、顺序匹配、工具调用返回、模型列表、自定义 providerId |
| **依赖** | T0.1 |
| **可并行** | 与 T1.1b、T1.2、T1.3 并行 |
| **完成状态** | ✅ 已完成（冷启动验证 agent 实现） |
| **Commit** | 待提交 |

#### T1.1b — Anthropic + OpenAI 真实 Provider 适配器

| 属性 | 内容 |
|------|------|
| **目标** | 实现 `AnthropicProvider` 和 `OpenAIProvider`，封装真实 SDK，包含重试逻辑和错误映射 |
| **涉及文件** | `src/core/llm/anthropic.ts`, `src/core/llm/anthropic.test.ts`, `src/core/llm/openai.ts`, `src/core/llm/openai.test.ts` |
| **预期实现要点** | AnthropicProvider：封装 `@anthropic-ai/sdk`，Messages API 格式转换，tool_use blocks 映射，错误码映射（401→LLMAuthError, 429→LLMRateLimitError, 5xx→LLMServerError），3 次指数退避重试（1s/2s/4s），120s 超时；OpenAIProvider：封装 `openai` SDK，Chat Completions 格式转换，function.arguments 字符串→对象解析，错误映射和重试逻辑同 Anthropic |
| **验证步骤** | 使用 Mock HTTP 服务器测试：错误响应映射（401/429/500/超时）；重试逻辑验证（模拟网络失败→重试→成功）；成功响应格式转换验证；**注意**：端到端集成测试需要 API Key，延后到有 Key 的环境中执行 |
| **依赖** | T1.1a |
| **可并行** | 与 T1.2、T1.3 并行 |
| **完成状态** | ⬜ 待执行 |
| **备注** | 此 task 需要 API Key 才能端到端验证。开发时优先编写代码结构和 Mock HTTP 单元测试，集成测试在凭证模块（T8.1）完成后再执行 |

#### T1.2 — 动作解析器（Action Parser）

| 属性 | 内容 |
|------|------|
| **目标** | 解析 LLM 响应中的工具调用（tool_use）和纯文本回复，输出统一的 `Action` 结构 |
| **涉及文件** | `src/core/action-parser.ts`, `src/core/action-parser.test.ts` |
| **预期实现要点** | 解析 Anthropic tool_use 格式；解析 OpenAI function_call 格式；纯文本回复识别；格式错误时的容错处理 |
| **验证步骤** | 单测：传入含 tool_use 的 LLM 响应 → 正确解析出 Action[]；传入纯文本 → 返回 text_response Action；传入格式错误响应 → 返回解析错误（不崩溃） |
| **依赖** | T0.1 |
| **可并行** | 与 T1.1a、T1.1b、T1.3 并行 |

#### T1.3 — 停机判断器（Stop Judge）

| 属性 | 内容 |
|------|------|
| **目标** | 判断 agent 是否应该停止循环：无工具调用仅文本回复、连续无进展、达到最大轮次 |
| **涉及文件** | `src/core/stop-judge.ts`, `src/core/stop-judge.test.ts` |
| **预期实现要点** | 检测无工具调用（纯文本）→ 判定完成；检测连续 3 轮相同输出 → 建议停止；达到 maxTurns → 强制停止 |
| **验证步骤** | 单测：传入无 tool_calls 的消息 → 返回 `{ shouldStop: true }`；传入有 tool_calls 的消息 → 返回 `{ shouldStop: false }`；传入第 50 轮 → 返回 `{ shouldStop: true, reason: 'max_turns' }` |
| **依赖** | T0.1 |
| **可并行** | 与 T1.1a、T1.1b、T1.2 并行 |

---

### Phase 2: Tool System

#### T2.1 — 工具注册表 + 基础类型

| 属性 | 内容 |
|------|------|
| **目标** | 定义 `Tool` 接口、`ToolResult` 类型；实现 `ToolRegistry`（注册、查找、列出工具） |
| **涉及文件** | `src/tools/registry.ts`, `src/tools/types.ts`, `src/tools/registry.test.ts` |
| **预期实现要点** | `Tool` 接口：`name`, `description`, `parameters` (JSON Schema), `execute()`；`ToolRegistry`：`register()`, `get()`, `list()`, `toToolDefinitions()`（生成 LLM 工具定义） |
| **验证步骤** | 单测：注册工具 → 查找返回正确工具；重复注册 → 抛出错误；`toToolDefinitions()` → 输出符合 Anthropic/OpenAI tool schema |
| **依赖** | T1.1a |
| **可并行** | 与 Phase 1 所有任务并行 |

#### T2.2 — 文件工具（File Read / Write / Edit）

| 属性 | 内容 |
|------|------|
| **目标** | 实现 `read_file`、`write_file`、`edit_file` 三个工具 |
| **涉及文件** | `src/tools/file-read.ts`, `src/tools/file-write.ts`, `src/tools/file-edit.ts`, `src/tools/file-*.test.ts` |
| **预期实现要点** | `read_file`：读取文件，截断至 2000 行，支持 offset/limit；`write_file`：创建/覆盖文件，自动创建父目录；`edit_file`：精确字符串替换（old_string → new_string），检查唯一性 |
| **验证步骤** | 单测：读取存在的文件 → 返回内容；读取不存在的文件 → `FileNotFoundError`；写入文件 → 文件存在且内容正确；编辑文件 → 替换成功；old_string 不唯一 → 报错 |
| **依赖** | T2.1 |
| **可并行** | 与 T2.3、T2.4 并行 |

#### T2.3 — Shell 执行工具

| 属性 | 内容 |
|------|------|
| **目标** | 实现 `shell_exec` 工具，安全执行 shell 命令并返回结果 |
| **涉及文件** | `src/tools/shell-exec.ts`, `src/tools/shell-exec.test.ts` |
| **预期实现要点** | 使用 `child_process.exec`；超时控制（默认 60s）；捕获 stdout/stderr/exit code；工作目录设置；环境变量隔离 |
| **验证步骤** | 单测：执行 `echo hello` → stdout="hello", exitCode=0；执行失败命令 → 捕获 stderr + 非零 exitCode；超时测试 → `CommandTimeoutError` |
| **依赖** | T2.1 |
| **可并行** | 与 T2.2、T2.4 并行 |

#### T2.4 — 测试运行器 + Lint 工具

| 属性 | 内容 |
|------|------|
| **目标** | 实现 `run_tests` 和 `run_lint` 工具 |
| **涉及文件** | `src/tools/test-runner.ts`, `src/tools/lint-runner.ts`, `src/tools/*.test.ts` |
| **预期实现要点** | `run_tests`：执行 `npm test`（或配置的命令），解析输出；`run_lint`：执行 `npm run lint`，解析输出 |
| **验证步骤** | 单测：在测试 fixture 项目中运行 `npm test` → 返回 pass/fail + 详情 |
| **依赖** | T2.1 |
| **可并行** | 与 T2.2、T2.3 并行 |

---

### Phase 3: Agent Main Loop

#### T3.1 — Agent 主循环

| 属性 | 内容 |
|------|------|
| **目标** | 实现完整的主循环：上下文组装 → 调用 LLM → 解析动作 → 分发执行 → 回灌结果 → 停机判断 |
| **涉及文件** | `src/core/agent-loop.ts`, `src/core/agent-loop.test.ts`, `src/core/context-builder.ts` |
| **预期实现要点** | 循环控制（while + 停机条件）；System prompt 构建；消息管理（追加 user/assistant/tool 消息）；工具调用分发；结果回灌；Token 使用率监控（>80% 触发压缩）；轮次/超时限制 |
| **验证步骤** | 使用 Mock LLM 单测：设定 Mock 返回 2 轮 tool_call + 1 轮 text → 验证循环执行 3 轮后停止；验证工具结果正确回灌到消息列表；验证 maxTurns 限制生效；验证超时异常处理 |
| **依赖** | T1.1, T1.2, T1.3, T2.1 |
| **可并行** | 无（Phase 3 是核心集成点） |

---

### Phase 4: Governance ★ (主攻维度)

#### T4.1 — 危险模式 + 护栏引擎

| 属性 | 内容 |
|------|------|
| **目标** | 定义所有危险模式；实现 `guardrail(action)` 函数，多级检查并返回判定 |
| **涉及文件** | `src/governance/danger-patterns.ts`, `src/governance/guardrail.ts`, `src/governance/guardrail.test.ts` |
| **预期实现要点** | 危险模式定义（正则 + 风险等级 + 类别）；四级拦截：白名单 → 模式匹配 → 路径边界 → 语义分析；`checkAction()` 返回 `GuardrailDecision`；支持用户自定义危险模式 |
| **验证步骤** | 单测（覆盖所有危险模式）：`rm -rf /` → BLOCKED；`DROP TABLE` → BLOCKED；`chmod 777` → BLOCKED；`curl ... \| bash` → BLOCKED；正常 `npm test` → ALLOWED；读文件 → ALLOWED |
| **依赖** | T2.1（需要 Tool 类型） |
| **可并行** | 与 T4.3 并行 |

#### T4.2 — HITL 状态机

| 属性 | 内容 |
|------|------|
| **目标** | 实现完整的 HITL 暂停/审批状态机 |
| **涉及文件** | `src/governance/hitl-state-machine.ts`, `src/governance/hitl-state-machine.test.ts` |
| **预期实现要点** | 状态：IDLE → PAUSED → (ALLOWED / DENIED / TERMINATED) → IDLE；超时自动 DENY（300s）；支持用户修改命令后重试；审批提示格式化输出 |
| **验证步骤** | 单测：PAUSE → ALLOW → 返回放行；PAUSE → DENY → 返回跳过；PAUSE → TERMINATE → 抛出 `SessionTerminatedError`；超时 → 自动 DENY；状态转换合法性检查（不允许从 IDLE 直接 TERMINATE） |
| **依赖** | T4.1 |
| **可并行** | 与 T4.3、T4.4 并行 |

#### T4.3 — 沙箱/路径围栏

| 属性 | 内容 |
|------|------|
| **目标** | 实现文件系统路径范围限制 |
| **涉及文件** | `src/governance/sandbox.ts`, `src/governance/sandbox.test.ts` |
| **预期实现要点** | 路径解析（相对→绝对）；白名单/黑名单检查；`allowOutsideProject` 开关；`maxFileSize` 检查；`allowedCommands`/`deniedCommands` 命令过滤 |
| **验证步骤** | 单测：项目内路径 → ALLOWED；`/etc/passwd` → BLOCKED；`~/.ssh/id_rsa` → BLOCKED；`allowOutsideProject=false` 时项目外路径 → BLOCKED；文件大小超限 → BLOCKED |
| **依赖** | T2.1 |
| **可并行** | 与 T4.1、T4.2、T4.4 并行 |

#### T4.4 — 审计日志

| 属性 | 内容 |
|------|------|
| **目标** | 实现审计日志记录（JSONL 格式） |
| **涉及文件** | `src/governance/audit-log.ts`, `src/governance/audit-log.test.ts` |
| **预期实现要点** | JSONL 追加写入；记录每次工具执行 + 护栏判定 + HITL 事件；日志轮转；脱敏（自动移除 API Key 相关内容） |
| **验证步骤** | 单测：执行工具 → 日志文件新增一条记录；HITL 事件 → 日志包含审批决策；日志内容不包含敏感信息 |
| **依赖** | T4.1, T4.2 |
| **可并行** | 与 T4.2、T4.3 并行 |

#### T4.5 — 治理系统集成到主循环

| 属性 | 内容 |
|------|------|
| **目标** | 将护栏、HITL、沙箱、审计日志集成到 Agent 主循环中 |
| **涉及文件** | `src/core/agent-loop.ts`（修改），`src/governance/index.ts` |
| **预期实现要点** | 在工具执行前插入 `guardrail.check()`；被拦截时调用 HITL 状态机；所有事件记录到审计日志；用户审批交互（CLI 中实现） |
| **验证步骤** | 集成测试：Mock LLM 返回 `shell_exec("rm -rf /")` → 循环暂停 → 模拟用户输入 "deny" → 继续循环；全流程审计日志完整 |
| **依赖** | T3.1, T4.1, T4.2, T4.3, T4.4 |
| **可并行** | 无（集成任务） |

---

### Phase 5: Feedback Loop (辅助维度)

#### T5.1 — 测试结果解析器 + Lint 解析器

| 属性 | 内容 |
|------|------|
| **目标** | 解析 Jest/Mocha/Vitest 测试输出和 ESLint 输出，提取结构化信息 |
| **涉及文件** | `src/feedback/test-result-parser.ts`, `src/feedback/lint-parser.ts`, `src/feedback/*.test.ts` |
| **预期实现要点** | 正则匹配测试框架输出（pass/fail 数量、失败用例名、期望值 vs 实际值）；解析 ESLint 输出（规则名、文件、行号、消息） |
| **验证步骤** | 单测：给定真实 Jest 失败输出 → 正确提取 2 个失败用例及其详情；给定 ESLint 输出 → 正确提取 3 个警告；给定空输出 → 返回空结果 |
| **依赖** | T2.4 |
| **可并行** | 与 Phase 4 所有任务并行 |

#### T5.2 — 失败分类器

| 属性 | 内容 |
|------|------|
| **目标** | 将测试/Lint/类型检查的失败信息分类为 `FailureCategory` 枚举 |
| **涉及文件** | `src/feedback/failure-classifier.ts`, `src/feedback/failure-classifier.test.ts` |
| **预期实现要点** | 分类规则：`SyntaxError` → SYNTAX_ERROR；`TS\d{4}:` → TYPE_ERROR；`Cannot find module` → IMPORT_ERROR；断言失败 → LOGIC_ERROR；ESLint 规则 → STYLE_ERROR |
| **验证步骤** | 单测：传入语法错误消息 → 分类为 `syntax_error`；传入类型错误 → `type_error`；传入断言失败 → `logic_error`；传入 lint 警告 → `style_error`；未匹配 → `unknown_error` |
| **依赖** | T5.1 |
| **可并行** | 与 T5.3 并行 |

#### T5.3 — 反馈回灌器

| 属性 | 内容 |
|------|------|
| **目标** | 将分类后的反馈格式化为结构化 Markdown 报告，追加到 LLM 上下文 |
| **涉及文件** | `src/feedback/feedback-injector.ts`, `src/feedback/feedback-injector.test.ts` |
| **预期实现要点** | 根据 `FeedbackCheck[]` 和 `FailureClassification[]` 生成格式化的反馈报告（表格 + 分类 + 建议）；增量回灌（只追加，不修改历史） |
| **验证步骤** | 单测：给定失败的校验结果 → 输出包含表格和分类的 Markdown 报告；给定全部通过的结果 → 输出简洁的 "✅ All checks passed" |
| **依赖** | T5.2 |
| **可并行** | 与 T5.2 并行 |

#### T5.4 — 反馈系统集成到主循环

| 属性 | 内容 |
|------|------|
| **目标** | 将校验器 → 分类器 → 回灌器 pipeline 集成到 Agent 主循环中 |
| **涉及文件** | `src/core/agent-loop.ts`（修改），`src/feedback/index.ts` |
| **预期实现要点** | 工具执行后自动触发校验；校验结果分类；分类结果回灌到下一轮上下文 |
| **验证步骤** | 集成测试：Mock LLM 返回"运行测试"→ 注入测试失败 → 下一轮上下文包含分类反馈 → Mock LLM 返回"修复代码"动作 |
| **依赖** | T3.1, T5.1, T5.2, T5.3 |
| **可并行** | 无（集成任务） |

---

### Phase 6: Memory System

#### T6.1 — 记忆存储（文件系统实现）

| 属性 | 内容 |
|------|------|
| **目标** | 实现基于文件系统的记忆存储：写入、读取、更新、删除 |
| **涉及文件** | `src/memory/store.ts`, `src/memory/file-store.ts`, `src/memory/types.ts`, `src/memory/file-store.test.ts` |
| **预期实现要点** | 每个记忆一个 Markdown 文件（含 frontmatter）；CRUD 操作；自动创建存储目录；原子写入（先写临时文件再 rename） |
| **验证步骤** | 单测：写入记忆 → 文件存在且内容正确；读取记忆 → 返回正确内容；更新记忆 → 内容更新；删除记忆 → 文件被移除；并发写入 → 不损坏数据 |
| **依赖** | T0.1 |
| **可并行** | 与 Phase 4-5 并行 |

#### T6.2 — 检索器 + 上下文组装器

| 属性 | 内容 |
|------|------|
| **目标** | 实现基于关键词的检索器；实现上下文组装器（系统提示词 + 检索到的记忆 + 配置规则 + 用户任务） |
| **涉及文件** | `src/memory/retriever.ts`, `src/memory/context-builder.ts`, `src/memory/retriever.test.ts`, `src/memory/context-builder.test.ts` |
| **预期实现要点** | 关键词提取（从任务描述中）；TF-IDF 相似度匹配；LRU 排序；限制返回 5 条、每条 500 tokens；上下文组装优先级：系统提示词 > 配置规则 > 记忆 > 任务描述 |
| **验证步骤** | 单测：给定任务描述 "fix the type error in parser" → 检索到包含 "type" 和 "parser" 的记忆；检索结果按相关性排序；无匹配记忆 → 返回空数组；上下文组装 → 消息数组格式正确 |
| **依赖** | T6.1 |
| **可并行** | 与 Phase 4-5 并行 |

---

### Phase 7: Configuration System

#### T7.1 — 配置加载器 + Schema + 默认值

| 属性 | 内容 |
|------|------|
| **目标** | 实现 YAML/JSON 配置文件的加载、验证、默认值合并 |
| **涉及文件** | `src/config/loader.ts`, `src/config/schema.ts`, `src/config/defaults.ts`, `src/config/loader.test.ts` |
| **预期实现要点** | 支持 YAML 和 JSON 格式；Zod Schema 验证；默认值合并（deep merge）；格式错误时明确指出行号和原因；配置缓存 |
| **验证步骤** | 单测：加载有效 YAML → 返回正确配置；加载无效 YAML → 抛出格式错误（含行号）；缺失字段 → 使用默认值；类型错误 → 明确提示；配置文件不存在 → 使用全默认配置 |
| **依赖** | T0.1 |
| **可并行** | 与 Phase 4-6 并行 |

---

### Phase 8: Credential Security

#### T8.1 — 凭证管理器 + 首次启动引导

| 属性 | 内容 |
|------|------|
| **目标** | 实现系统 Keychain 存储（主方案）、.env fallback（带风险提示）、交互式 setup wizard |
| **涉及文件** | `src/credentials/manager.ts`, `src/credentials/keychain.ts`, `src/credentials/env-fallback.ts`, `src/credentials/setup-wizard.ts`, `src/credentials/manager.test.ts` |
| **预期实现要点** | `KeychainStore`：封装 keytar（store/get/delete/list）；`EnvFallbackStore`：读取 .env / process.env（打印风险提示）；`setupWizard()`：交互式引导（隐藏输入、验证 Key、存储）；`status()`：显示已配置 Provider 和状态（不显示明文）；`clear()`：清除所有凭证 |
| **验证步骤** | 单测：Mock keytar → 存储成功 → 读取成功；Mock keytar 不可用 → 降级到 .env（打印风险提示）；验证 Key 有效性（mock API 返回 200/401）；测试 `status` 不泄露明文；测试 `clear` 清除所有记录 |
| **依赖** | T0.1 |
| **可并行** | 与 Phase 4-7 并行 |

---

### Phase 9: CLI

#### T9.1 — CLI 入口

| 属性 | 内容 |
|------|------|
| **目标** | 使用 Commander.js 实现 CLI：`run`、`setup`、`status`、`clear`、`config` 命令 |
| **涉及文件** | `src/cli/main.ts`, `src/cli/commands/run.ts`, `src/cli/commands/setup.ts`, `src/cli/commands/status.ts`, `src/cli/commands/clear.ts` |
| **预期实现要点** | `seahorse run "<task>"`：启动 agent 主循环；`--verbose` 输出完整上下文；`--json` 输出结构化日志；`--model` 指定模型；`--max-turns` 指定最大轮次；`seahorse setup`：启动凭证配置向导；`seahorse status`：显示配置状态；`seahorse clear`：清除凭证；`seahorse config`：显示当前配置 |
| **验证步骤** | 手动测试：`seahorse --help` 显示帮助；`seahorse run "echo hello"` 正常执行；`seahorse setup` 启动交互引导；`seahorse status` 显示状态 |
| **依赖** | T3.1, T4.5, T5.4, T6.2, T7.1, T8.1 |
| **可并行** | 无 |

---

### Phase 10: Web UI

#### T10.1 — Web 终端（xterm.js + WebSocket）

| 属性 | 内容 |
|------|------|
| **目标** | 实现一个简单的 Web 终端界面，通过 WebSocket 连接到 Seahorse 进程 |
| **涉及文件** | `src/web/server.ts`, `src/web/public/index.html`, `src/web/public/terminal.js` |
| **预期实现要点** | Express/Node.js HTTP 服务器 + WebSocket (ws)；xterm.js 前端终端模拟；WebSocket 双向通信（用户输入 → Seahorse → 输出 → 终端）；基本认证（可选） |
| **验证步骤** | 手动测试：启动 `seahorse web` → 浏览器打开 `http://localhost:3000` → 终端可以输入命令 → 与 CLI 体验一致 |
| **依赖** | T9.1 |
| **可并行** | 无 |

---

### Phase 11: Distribution

#### T11.1 — npm 包分发

| 属性 | 内容 |
|------|------|
| **目标** | 配置 `package.json` 的发布字段，使 `npm install -g seahorse-harness` 可安装 |
| **涉及文件** | `package.json`, `bin` 字段配置 |
| **预期实现要点** | `bin` 指向 `dist/cli/main.js`；`files` 字段包含 `dist/`；`prepublishOnly` 脚本执行 build + test；semver 版本管理 |
| **验证步骤** | `npm pack` → 生成 `.tgz`；`npm install -g ./seahorse-harness-*.tgz` → `seahorse --help` 可用 |
| **依赖** | T9.1 |
| **可并行** | 与 T11.2 并行 |

#### T11.2 — Docker 镜像分发

| 属性 | 内容 |
|------|------|
| **目标** | 编写 Dockerfile，构建可运行的 Docker 镜像 |
| **涉及文件** | `Dockerfile`, `.dockerignore` |
| **预期实现要点** | 多阶段构建（builder + runtime）；基于 `node:22-alpine`；非 root 用户运行；挂载工作目录和 `~/.seahorse` 卷 |
| **验证步骤** | `docker build -t seahorse .` 成功；`docker run seahorse --help` 显示帮助 |
| **依赖** | T9.1 |
| **可并行** | 与 T11.1 并行 |

---

### Phase 12: CI/CD

#### T12.1 — GitHub Actions 工作流

| 属性 | 内容 |
|------|------|
| **目标** | 配置 CI：每次 push 运行 lint + typecheck + unit-test；PR 时额外运行 build |
| **涉及文件** | `.github/workflows/ci.yml` |
| **预期实现要点** | `unit-test` job：`npm ci` → `npm run lint` → `npm run typecheck` → `npm test`；`build` job（PR 时）：`npm run build`；`docker-build` job（main 分支 push）：构建 Docker 镜像并推送到 ghcr.io |
| **验证步骤** | Push 代码 → GitHub Actions 触发 → 所有 job 绿色 pass |
| **依赖** | T9.1 |
| **可并行** | 无（但可以在任何阶段先创建骨架，后续补充） |

---

### Phase 13: Mechanism Demo

#### T13.1 — 机制演示脚本

| 属性 | 内容 |
|------|------|
| **目标** | 编写确定性演示脚本，在 Mock LLM 下复现三种行为：① 护栏拦截危险动作；② 注入失败 → 反馈闭环驱动修正；③ 深入维度（治理）的一个确定性行为 |
| **涉及文件** | `demo/guardrail-demo.ts`, `demo/feedback-demo.ts`, `demo/governance-demo.ts`, `demo/run-all.ts` |
| **预期实现要点** | 演示 ①：Mock LLM 返回 `shell_exec("rm -rf /")` → 护栏拦截 → HITL 暂停 → 模拟用户 deny → 审计日志记录；演示 ②：Mock LLM 返回 `run_tests` → 注入失败输出 → 分类器识别为 `logic_error` → 回灌 → Mock LLM 返回修复动作；演示 ③：多级护栏拦截流程（Level 1-4 各拦截一个）或沙箱围栏拦截 |
| **验证步骤** | `npm run demo` → 三个演示全部 pass；输出清晰标注每个步骤 |
| **依赖** | T4.5, T5.4 |
| **可并行** | 无 |

---

## 3. 执行顺序建议

### 推荐执行路径

```
Week 1:  Phase 0 ✅ + Phase 1 (T1.1a ✅, T1.1b, T1.2, T1.3 并行) + Phase 2 (并行)
Week 2:  Phase 3 → Phase 4 (并行 T4.1-T4.4) + Phase 5 (并行)
Week 3:  Phase 4.5 + Phase 5.4 (集成) + Phase 6-8 (并行)
Week 4:  Phase 9-11 (顺序) + Phase 12 + Phase 13
```

### 并行机会

以下组可以同时在不同 worktree 中开发：

| 组 | Tasks | 说明 |
|----|-------|------|
| A | T1.1a ✅, T1.1b, T1.2, T1.3 | 核心基础设施，无相互依赖 |
| B | T2.2, T2.3, T2.4 | 工具实现，仅依赖 T2.1 |
| C | T4.1+T4.3, T4.2+T4.4 | 治理模块内部可并行 |
| D | T5.1, T5.2, T5.3 | 反馈模块内部可并行 |
| E | T6.1, T6.2, T7.1, T8.1 | 记忆、配置、凭证完全独立 |
| F | T11.1, T11.2 | 分发方案可并行 |

### 关键路径

```
T0.1 ✅ → T1.1a ✅ → T2.1 → T3.1 → T4.1 → T4.2 → T4.5 → T5.4 → T9.1 → T10.1 → T13.1
```

### 当前进度

| Task | 状态 | 备注 |
|------|------|------|
| T0.1 | ✅ 完成 | 项目脚手架全部就绪，18 个测试通过 |
| T1.1a | ✅ 完成 | Mock LLM + 类型 + 错误类型，17 个测试通过 |
| T1.1b | ⬜ 待执行 | 真实 Provider 需要 API Key 验证 |
| T1.2-T13.1 | ⬜ 待执行 | 后续所有任务 |

---

> **文档版本**：v1.1  
> **创建日期**：2026-07-14  
> **最后修订**：2026-07-14（冷启动验证后修订）  
> **状态**：In Progress（T0.1 ✅, T1.1a ✅, 剩余 25 个 task 待执行）