# SPEC.md — Seahorse: A Coding Agent Harness

> **项目代号**：Seahorse（海马）  
> **项目类型**：A · Coding Agent Harness  
> **核心命题**：Agent = LLM + Harness — 当 LLM 能完成大部分"思考"时，工程师的价值落在 harness 这层工程上。

---

## 目录

1. [问题陈述](#1-问题陈述)
2. [用户故事](#2-用户故事)
3. [功能规约](#3-功能规约)
4. [非功能性需求](#4-非功能性需求)
5. [系统架构](#5-系统架构)
6. [数据模型](#6-数据模型)
7. [凭证与分发设计](#7-凭证与分发设计)
8. [技术选型与理由](#8-技术选型与理由)
9. [领域与机制设计](#9-领域与机制设计)
10. [验收标准](#10-验收标准)
11. [风险与未决问题](#11-风险与未决问题)

---

## 1. 问题陈述

### 1.1 要解决的问题

当前，大语言模型（LLM）已经能够完成相当程度的代码生成与推理工作。然而，一个仅能"产生下一步设想"的 LLM 距离一个真正**可稳定、可靠地完成编码任务**的系统，还差一层关键的工程封装——这层封装就是 **Harness**。

Harness 负责：
- **决策封装**：组织上下文、调用 LLM、解析动作、回灌结果
- **工具分发**：让 agent 能真正作用于外部世界（读写文件、执行命令、运行测试）
- **安全治理**：在危险动作执行前拦截，必要时暂停等待人工审批
- **反馈闭环**：获取客观信号（测试/lint/类型检查），驱动自我修正
- **记忆管理**：跨会话记住项目约定与历史决策
- **配置注入**：让用户通过声明式规则约束 agent 行为

**Seahorse** 是一个聚焦于软件开发场景的 Coding Agent Harness。它将这些工程机制落地为确定性代码——而非依赖 LLM 的提示词遵循——从而构建一个可测试、可审计、可信任的 agent 运行时。

### 1.2 目标用户

| 用户角色 | 场景 | 核心诉求 |
|---------|------|---------|
| **软件开发者** | 使用 AI 辅助日常编码 | 需要一个可靠、安全的 coding agent；不希望 agent 执行危险操作；需要 agent 能根据测试失败自动修正 |
| **工程团队管理者** | 为团队引入 AI 编码工具 | 需要可配置的安全护栏、可审计的操作日志；需要可控的 agent 行为边界 |
| **Harness 开发者/研究者** | 研究或扩展 agent 工程机制 | 需要清晰的 LLM 抽象层、可替换的组件、可 mock 测试的架构 |

### 1.3 为什么值得做

- **安全缺口**：现有 coding agent 的安全机制大多依赖提示词约束，存在不确定性。Seahorse 将安全治理落地为代码级护栏。
- **可测试性缺失**：大多数 agent 框架的行为验证依赖真实 LLM，无法做确定性单测。Seahorse 的 mock LLM 抽象层使每个机制都可独立验证。
- **工程教育价值**：Seahorse 展示了"用 harness 造 harness"的方法论，使开发者对 agent 系统工程形成第一手批判性理解。

---

## 2. 用户故事

遵循 INVEST 原则（Independent, Negotiable, Valuable, Estimable, Small, Testable）。

| ID | 用户故事 | 验收条件 | 优先级 |
|----|---------|---------|--------|
| **US-1** | 作为开发者，我希望通过 CLI 向 Seahorse 下达一个编码任务（如"修复这个 bug"），agent 能够自主读取代码、分析问题、生成修复，并在 loop 中完成自我修正 | agent 能完成至少一轮"读取代码→生成修改→运行测试→根据失败修正"的完整闭环 | P0 |
| **US-2** | 作为开发者，我希望 Seahorse 在执行 `rm -rf`、`DROP TABLE` 等危险命令时**自动拦截并等待我确认**，而不是直接执行 | 危险动作被护栏拦截，终端显示确认提示，仅当用户输入 `yes` 后才放行 | P0 |
| **US-3** | 作为开发者，我希望 Seahorse 能自动运行测试/lint，将失败结果分类（如语法错误 vs 逻辑错误），并回灌给 agent 驱动修正 | 注入一个已知失败测试后，agent 收到分类后的反馈并据此调整其下一步动作 | P0 |
| **US-4** | 作为开发者，我希望首次使用时，Seahorse 能引导我安全录入 API Key（隐藏输入），并安全存储到系统 Keychain 中，后续无需重复输入 | 首次运行弹出交互式引导，输入为密码星号，存储后可通过命令查看状态（不显示明文） | P1 |
| **US-5** | 作为开发者，我希望 Seahorse 能记住我的项目约定（如"使用 2 空格缩进"、"禁止使用 any 类型"），并在后续会话中自动应用这些约束 | 配置规则写入项目记忆文件，后续会话中 agent 的行为受其约束 | P1 |
| **US-6** | 作为工程管理者，我希望 Seahorse 提供一个声明式配置文件，让我定义允许/禁止的命令、文件路径范围、最大执行轮次等边界 | 修改配置文件后，agent 的行为边界随之改变（护栏识别新规则） | P1 |
| **US-7** | 作为 Harness 研究者，我希望将真实 LLM 替换为 Mock LLM 后，能通过确定性单元测试验证主循环、护栏、反馈闭环等所有核心机制 | 所有核心机制在 mock 模式下有覆盖率 ≥ 80% 的确定性单测 | P0 |

---

## 3. 功能规约

### 3.1 模块总览

```
seahorse/
├── core/                    # 核心引擎
│   ├── agent-loop.ts        # 主循环（决策封装）
│   ├── llm/                 # LLM 抽象层
│   │   ├── types.ts           # 所有类型定义（Message, ToolCall, LLMProvider, 错误类型, MockScript）
│   │   ├── provider.ts         # 接口 re-export + Provider 工厂函数
│   │   ├── mock.ts             # Mock LLM（确定性脚本匹配，用于测试）
│   │   ├── anthropic.ts        # Anthropic 适配器（封装 @anthropic-ai/sdk）
│   │   └── openai.ts           # OpenAI 适配器（封装 openai SDK）
│   ├── action-parser.ts     # 动作解析器（LLM 输出 → 结构化动作）
│   └── stop-judge.ts        # 停机判断器
├── tools/                   # 工具系统
│   ├── registry.ts          # 工具注册表
│   ├── file-read.ts         # 文件读取
│   ├── file-write.ts        # 文件写入
│   ├── shell-exec.ts        # Shell 命令执行
│   └── test-runner.ts       # 测试运行
├── governance/              # 治理系统（★ 主攻维度）
│   ├── guardrail.ts         # 护栏引擎
│   ├── danger-patterns.ts   # 危险模式定义
│   ├── sandbox.ts           # 沙箱/范围围栏
│   ├── hitl-state-machine.ts # HITL 暂停审批状态机
│   └── audit-log.ts         # 审计日志
├── feedback/                # 反馈闭环（辅助维度）
│   ├── validator.ts         # 校验器基类
│   ├── test-result-parser.ts # 测试结果解析
│   ├── lint-parser.ts       # Lint 输出解析
│   ├── failure-classifier.ts # 失败分类器
│   └── feedback-injector.ts # 反馈回灌器
├── memory/                  # 记忆系统
│   ├── store.ts             # 记忆存储接口
│   ├── file-store.ts        # 文件系统存储实现
│   ├── retriever.ts         # 相关性检索器
│   └── context-builder.ts   # 上下文组装器
├── config/                  # 配置系统
│   ├── loader.ts            # 配置加载器
│   ├── schema.ts            # 配置 Schema 定义
│   └── defaults.ts          # 默认配置
├── credentials/             # 凭证安全
│   ├── manager.ts           # 凭证管理器接口
│   ├── keychain.ts          # 系统 Keychain 实现
│   ├── env-fallback.ts      # .env fallback（带风险提示）
│   └── setup-wizard.ts      # 首次启动交互引导
├── cli/                     # CLI 入口
│   └── main.ts              # CLI 主入口
└── index.ts                 # 公共 API 导出
```

### 3.2 模块一：LLM 抽象层

**职责**：提供一个可注入 mock 的 LLM 抽象接口，隔离真实 LLM 的不确定性。

**文件职责划分**：
- `types.ts`：所有类型定义（Message, ToolCall, LLMProvider, LLMResponse, LLMOptions, 错误类型, MockScript）
- `provider.ts`：接口 re-export + Provider 工厂函数（`createProvider(type, config)`）
- `mock.ts`：`MockLLMProvider` 实现，基于脚本匹配（MockScript），确定性输出
- `anthropic.ts`：`AnthropicProvider` 实现，封装 `@anthropic-ai/sdk`
- `openai.ts`：`OpenAIProvider` 实现，封装 `openai` SDK

**接口定义**：
```typescript
interface LLMProvider {
  /** 发送单次对话补全请求 */
  complete(messages: Message[], options?: LLMOptions): Promise<LLMResponse>;
  /** 提供商标识 */
  readonly providerId: string;
  /** 可用模型列表 */
  readonly models: string[];
}

interface LLMResponse {
  content: string;           // 原始文本输出
  toolCalls?: ToolCall[];    // 解析出的工具调用
  usage: { input: number; output: number };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}
```

**Mock LLM 脚本匹配机制**（MockScript）：
```typescript
interface MockScript {
  /** 返回 true 时，此脚本处理当前消息 */
  match: (messages: Message[]) => boolean;
  /** 匹配时返回的确定性响应 */
  response: LLMResponse;
}
```
Mock LLM 按脚本注册顺序依次匹配，返回第一个命中的脚本的响应；无匹配时返回默认响应。此机制确保在无网络、无 API Key 的环境下，所有核心机制的单元测试可以 100% 确定性通过。

**输入**：消息数组（system + user + assistant + tool 交替）
**输出**：`LLMResponse`（含文本内容 + 可选工具调用）
**边界条件**：
- Mock LLM 必须返回**确定性**输出（通过 `MockScript` 脚本匹配机制，而非依赖 LLM 推断）
- 真实 Provider 的网络超时设为 120s，超时后抛出 `LLMTimeoutError`
- API 返回 4xx/5xx 时，封装为类型化错误（`LLMAuthError`, `LLMRateLimitError`, `LLMServerError`）
**错误处理**：
- 网络错误 → 重试最多 3 次（指数退避 1s/2s/4s）
- 速率限制 → 等待 `Retry-After` 头后重试
- 认证失败 → 立即终止并提示用户检查 API Key

**Anthropic 适配器实现要点**：
```typescript
class AnthropicProvider implements LLMProvider {
  readonly providerId = 'anthropic';
  readonly models = ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5'];

  constructor(private apiKey: string, private defaultModel: string) {}

  async complete(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    // 1. 将 Message[] 转换为 Anthropic Messages API 格式
    // 2. 调用 client.messages.create()（设置超时 120s）
    // 3. 将 Anthropic 响应映射为 LLMResponse
    //    - content blocks → LLMResponse.content
    //    - tool_use blocks → LLMResponse.toolCalls
    //    - stop_reason → LLMResponse.finishReason
    // 4. 错误映射：
    //    - 401 → LLMAuthError
    //    - 429 → LLMRateLimitError（含 retryAfterSeconds）
    //    - 5xx → LLMServerError（含 statusCode）
    //    - 超时 → LLMTimeoutError
    // 5. 网络错误重试（3 次，指数退避 1s/2s/4s）
  }
}
```

**OpenAI 适配器实现要点**：
```typescript
class OpenAIProvider implements LLMProvider {
  readonly providerId = 'openai';
  readonly models = ['gpt-4o', 'gpt-4o-mini', 'o4-mini'];

  constructor(private apiKey: string, private defaultModel: string) {}

  async complete(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    // 1. 将 Message[] 转换为 OpenAI Chat Completions 格式
    // 2. 调用 client.chat.completions.create()（设置超时 120s）
    // 3. 将 OpenAI 响应映射为 LLMResponse
    //    - message.content → LLMResponse.content
    //    - tool_calls → LLMResponse.toolCalls（转换 function.arguments 为 object）
    //    - finish_reason → LLMResponse.finishReason
    // 4. 错误映射（同 Anthropic 适配器）
    // 5. 网络错误重试（同 Anthropic 适配器）
  }
}
```

> **注意**：真实 Provider（Anthropic / OpenAI）的实现**不需要在冷启动验证阶段完成**。它们需要 API Key 才能进行端到端验证。在无 API Key 的环境中，应优先完成代码结构和单元测试（使用 Mock 验证错误映射和重试逻辑），集成测试延后到有 Key 的环境中进行。

### 3.3 模块二：Agent 主循环

**职责**：实现"组织上下文 → 调用 LLM → 解析动作 → 分发执行 → 回灌结果 → 停机判断"的完整循环。

**流程**：
```
1. 加载系统提示词 + 记忆 + 配置规则 → 组装上下文
2. 调用 LLM Provider，获取响应
3. 解析响应中的动作（工具调用 or 文本回复）
4. 若为工具调用：
   a. 将动作送入治理护栏（Guardrail）检查
   b. 若被拦截 → 进入 HITL 状态机，等待用户审批
   c. 若放行 → 分发到对应工具执行
   d. 获取执行结果，送入反馈校验器
   e. 将结果 + 反馈回灌到上下文，回到步骤 2
5. 若为文本回复（无工具调用）→ 停机判断
   a. 若判定任务完成 → 退出循环，输出结果
   b. 若未完成 → 追加 prompt 引导继续，回到步骤 2
6. 最大轮次达到上限 → 强制停机并报告
```

**输入**：用户任务描述（string）
**输出**：最终执行结果 + 执行日志
**边界条件**：
- 最大循环轮次：默认 50，可配置
- 上下文 Token 使用率超过 80% 时触发压缩（摘要旧消息）
- 单次循环超时：300s（含 LLM 调用 + 工具执行）
**错误处理**：
- LLM 返回无法解析的输出 → 重试一次（追加格式纠正 prompt），仍失败则终止
- 工具执行异常 → 捕获异常信息，作为反馈回灌给 LLM

### 3.4 模块三：工具系统

**职责**：注册、分发、执行 agent 可用的所有操作。

**工具清单**：

| 工具名 | 功能 | 输入 | 输出 |
|--------|------|------|------|
| `read_file` | 读取文件内容 | 文件路径（相对/绝对） | 文件内容（截断至 2000 行） |
| `write_file` | 写入文件 | 文件路径 + 内容 | 成功/失败状态 |
| `edit_file` | 精确字符串替换 | 文件路径 + old_str + new_str | 替换成功/失败 |
| `shell_exec` | 执行 shell 命令 | 命令字符串 + 工作目录 | stdout + stderr + exit code |
| `run_tests` | 运行测试套件 | 测试命令（默认 `npm test`） | 测试结果（pass/fail + 详情） |
| `run_lint` | 运行 Lint | Lint 命令（默认 `npm run lint`） | Lint 输出 |
| `search_code` | 搜索代码库 | 正则模式 + 文件 glob | 匹配结果列表 |
| `list_files` | 列出目录 | 目录路径 | 文件列表 |

**输入**：工具名 + 参数对象
**输出**：`ToolResult { success: boolean; data: unknown; error?: string }`
**边界条件**：
- `read_file` 限制单次读取 2000 行，超出需分页
- `shell_exec` 默认超时 60s，可配置
- `write_file` / `edit_file` 操作前自动备份（可选）
**错误处理**：
- 文件不存在 → `FileNotFoundError`
- 权限不足 → `PermissionDeniedError`
- 命令执行超时 → `CommandTimeoutError`

### 3.5 模块四：治理系统（★ 主攻维度）

#### 3.5.1 护栏引擎（Guardrail）

**核心设计**：一个硬编码的多级拦截器，在工具执行前对动作进行安全检查。

**拦截层级**：

```
Level 0: 白名单（始终允许）— 如 read_file, list_files, search_code
Level 1: 模式匹配（正则）    — 如 shell_exec 中的危险命令模式
Level 2: 路径边界检查        — 如 write_file 是否在允许的目录范围内
Level 3: 语义分析            — 如 SQL 中的 DROP/TRUNCATE 操作
Level 4: 网络/外部调用检查   — 如 curl 到外部 URL
```

**危险模式定义**（`danger-patterns.ts`）：

| 类别 | 危险模式 | 示例 | 拦截级别 |
|------|---------|------|---------|
| 文件系统破坏 | `rm -rf /` 或 `rm -rf /*` | `rm -rf / --no-preserve-root` | Level 1 |
| 文件系统破坏 | 递归删除家目录 | `rm -rf ~` 或 `rm -rf $HOME` | Level 1 |
| 文件系统破坏 | 格式化命令 | `mkfs.*`, `dd if=.* of=/dev/` | Level 1 |
| 数据库破坏 | DROP DATABASE/TABLE | `DROP TABLE users;` | Level 3 |
| 数据库破坏 | TRUNCATE 操作 | `TRUNCATE TABLE users;` | Level 3 |
| 数据库破坏 | DELETE 无 WHERE | `DELETE FROM users;` | Level 3 |
| 权限变更 | chmod 777 | `chmod 777 /etc/passwd` | Level 1 |
| 权限变更 | chown 到 root | `chown root:root /` | Level 1 |
| 网络危险 | curl 管道到 bash | `curl ... \| bash` | Level 4 |
| 网络危险 | 敏感数据外传 | `curl -X POST ... @~/secrets` | Level 4 |
| 系统破坏 | fork bomb | `:(){ :\|:& };:` | Level 1 |
| 系统破坏 | 修改系统配置 | `> /etc/passwd`, `/etc/shadow` | Level 2 |

**HITL 确认请求模板**：
```
⚠️  DANGEROUS ACTION DETECTED
  Action:  {action_type}
  Command: {command_string}
  Risk:    {risk_level} - {risk_description}
  File:    {file_path} (if applicable)

  [A]llow once   [D]eny   [S]kip & continue   [T]erminate session
```

#### 3.5.2 HITL 状态机

**状态图**：

```
                    ┌─────────────┐
                    │  EXECUTING  │ ← 正常执行
                    └──────┬──────┘
                           │ guardrail.check(action)
                           │ → 返回 BLOCKED
                    ┌──────▼──────┐
                    │   PAUSED    │ ← 暂停，等待人工输入
                    └──┬──┬──┬───┘
            ┌──────────┘  │  │  └──────────┐
            │ Allow       │  │ Deny        │ Terminate
    ┌───────▼──────┐      │  ┌▼──────────┐ ┌▼──────────┐
    │  EXECUTING   │      │  │  SKIPPED   │ │ TERMINATED│
    │ (放行执行)    │      │  │ (跳过继续)  │ │ (终止会话) │
    └──────────────┘      │  └────────────┘ └──────────┬──┘
                          │                             │
                          └─────────────────────────────┘
                               (Deny 后可选择 Skip
                                或手动修改后重试)
```

**状态转换规则**：
- `EXECUTING → PAUSED`：护栏检测到危险动作（Level 1-4）
- `PAUSED → EXECUTING`：用户输入 `Allow` / `A`（放行本次）
- `PAUSED → SKIPPED`：用户输入 `Deny` / `D`（拒绝本次，继续下一动作）
- `PAUSED → TERMINATED`：用户输入 `Terminate` / `T`（终止整个会话）
- 暂停超时（默认 300s）→ 自动 `Deny` 并跳过

**HITL 输入接口**：
```typescript
interface HITLDecision {
  action: 'allow' | 'deny' | 'terminate';
  reason?: string;          // 用户备注
  modifiedCommand?: string;  // 用户修改后的安全命令（可选）
}
```

#### 3.5.3 沙箱/范围围栏（Sandbox）

**职责**：限制 agent 的文件系统操作范围。

**围栏配置**：
```typescript
interface SandboxConfig {
  allowedPaths: string[];      // 白名单路径（默认：[cwd]）
  deniedPaths: string[];       // 黑名单路径（默认：[/etc, /System, ~/.ssh, ~/.aws]）
  allowOutsideProject: boolean; // 是否允许访问项目目录之外
  maxFileSize: number;         // 最大读写文件大小（默认 10MB）
  allowedCommands: string[];   // 允许的 shell 命令白名单
  deniedCommands: string[];    // 禁止的 shell 命令黑名单
}
```

**路径检查逻辑**：
1. 解析目标路径为绝对路径
2. 检查是否命中 `deniedPaths` 中任一前缀 → 拒绝
3. 若 `allowOutsideProject === false`，检查是否在 `allowedPaths` 内 → 不在则拒绝
4. 通过 → 放行

#### 3.5.4 审计日志

**职责**：记录所有工具执行和治理决策，用于事后审计。

**日志格式**（JSONL）：
```json
{
  "timestamp": "2026-07-14T10:30:00.000Z",
  "sessionId": "sess_abc123",
  "turnNumber": 12,
  "action": { "type": "shell_exec", "command": "npm test" },
  "guardrailDecision": "allowed",
  "hitlEvent": null,
  "executionResult": { "success": true, "duration": 3200 },
  "feedback": { "testPassed": false, "failures": 2 }
}
```

### 3.6 模块五：反馈闭环（辅助维度）

#### 3.6.1 校验器（Validator）

**职责**：解析 agent 的工具执行结果，提取客观的"正确/错误"信号。

**校验器类型**：

| 校验器 | 输入 | 输出 | 判定逻辑 |
|--------|------|------|---------|
| `TestResultValidator` | `run_tests` 的输出 | `TestFeedback` | 解析测试框架输出（Jest/Mocha/Vitest），提取 pass/fail 数量和失败用例详情 |
| `LintValidator` | `run_lint` 的输出 | `LintFeedback` | 解析 ESLint/TSLint 输出，提取错误/警告数量和详情 |
| `TypeCheckValidator` | `shell_exec("tsc --noEmit")` 的输出 | `TypeCheckFeedback` | 解析 TypeScript 编译器输出，提取类型错误 |
| `ExitCodeValidator` | 任意 shell 执行的 exit code | `ExitCodeFeedback` | exit code 0 → 成功，非 0 → 失败 |

#### 3.6.2 失败分类器（Failure Classifier）

**职责**：将校验结果分类为有意义的失败类别，帮助 agent 理解问题本质。

**失败类别枚举**：
```typescript
enum FailureCategory {
  SYNTAX_ERROR = 'syntax_error',         // 语法错误（缺少分号、括号不匹配等）
  TYPE_ERROR = 'type_error',             // 类型错误（TypeScript 类型不匹配）
  IMPORT_ERROR = 'import_error',         // 模块导入错误
  LOGIC_ERROR = 'logic_error',           // 逻辑错误（测试断言失败）
  STYLE_ERROR = 'style_error',           // 代码风格问题（lint）
  RUNTIME_ERROR = 'runtime_error',       // 运行时错误
  TIMEOUT_ERROR = 'timeout_error',       // 超时
  UNKNOWN_ERROR = 'unknown_error',       // 未分类
}
```

**分类规则**（确定性代码）：
- 正则匹配 `SyntaxError:` → `SYNTAX_ERROR`
- 正则匹配 `TS[0-9]{4}:` → `TYPE_ERROR`
- 正则匹配 `Cannot find module` → `IMPORT_ERROR`
- 测试框架断言失败（`Expected X but got Y`）→ `LOGIC_ERROR`
- ESLint 规则违反 → `STYLE_ERROR`
- 非零 exit code 且无上述匹配 → `RUNTIME_ERROR`

#### 3.6.3 反馈回灌器（Feedback Injector）

**职责**：将分类后的反馈以结构化格式追加到 LLM 上下文，指导下一步修正。

**回灌格式**：
```markdown
## Feedback Report (Turn {N})

| Check | Status | Details |
|-------|--------|---------|
| Tests | ❌ 2/5 failed | `test_parse_input`: Expected "foo" but got "bar" |
| Lint  | ⚠️ 3 warnings | `no-unused-vars`: variable `x` is unused |
| Types | ✅ Passed | - |

**Failure Classification**:
- `LOGIC_ERROR` (1): test_parse_input — assertion mismatch
- `LOGIC_ERROR` (1): test_validate — expected exception not thrown
- `STYLE_ERROR` (3): unused variables

**Suggested Next Actions**:
1. Fix `test_parse_input`: check the return value of `parseInput("foo")`
2. Fix `test_validate`: ensure `validate()` throws on invalid input
3. Remove or use unused variables
```

### 3.7 模块六：记忆系统

**职责**：跨会话存储和检索项目相关信息，按需提供给 LLM（而非全量载入）。

**存储内容**：
- 项目约定（代码风格、命名规范、架构决策）
- 历史决策记录（为什么选择方案 A 而非方案 B）
- 用户偏好（常用命令、测试框架偏好）
- 代码库知识摘要（目录结构、关键模块职责）

**存储格式**：文件系统上的 Markdown 文件（每文件一个事实，含 frontmatter 元数据）

**检索方式**：
- 关键词匹配（基于当前任务描述提取关键词）
- 最近使用优先（LRU）
- 关联链接（记忆文件可通过 `[[link]]` 相互引用）

**输入**：当前任务描述 + 项目上下文
**输出**：相关记忆片段（拼接为 system prompt 的一部分）
**边界条件**：
- 单次检索返回最多 5 条记忆
- 每条记忆截断至 500 tokens
- 记忆文件总大小不限制，但检索只返回最相关的

### 3.8 模块七：配置系统

**职责**：加载和解析声明式配置，将约束注入 agent 运行时。

**配置文件**：`seahorse.config.yaml`（或 `.json`）

**配置 Schema**：
```yaml
# seahorse.config.yaml
model:
  provider: anthropic          # anthropic | openai
  model: claude-sonnet-5       # 模型 ID
  maxTokens: 8192
  temperature: 0.3

loop:
  maxTurns: 50                 # 最大循环轮次
  maxContextTokens: 100000     # 上下文 token 上限
  turnTimeout: 300000          # 单轮超时 (ms)

governance:
  sandbox:
    allowedPaths: ["./"]       # 允许访问的路径
    deniedPaths:               # 禁止访问的路径
      - "/etc"
      - "~/.ssh"
      - "~/.aws"
    allowOutsideProject: false
    maxFileSize: 10485760      # 10MB
  commands:
    allowedCommands: []        # 空 = 全部允许（受护栏约束）
    deniedCommands:
      - "rm -rf"
      - "chmod 777"
      - "mkfs"
    requireApproval:           # 需要审批的命令模式
      - "git push"
      - "npm publish"
      - "docker push"

rules:
  - "Always use 2-space indentation"
  - "Never use `any` type in TypeScript"
  - "Write tests before implementation"
  - "Use async/await, not raw Promises"
```

**输入**：配置文件路径（默认 `./seahorse.config.yaml`）
**输出**：解析后的 `SeahorseConfig` 对象
**边界条件**：
- 配置文件不存在 → 使用默认配置
- 配置字段缺失 → 使用默认值
- 配置格式错误 → 报错并提示修正
**错误处理**：
- YAML/JSON 解析错误 → 明确指出错误行号和原因
- 配置值类型错误 → 类型检查 + 友好的错误提示

### 3.9 模块八：凭证安全

**职责**：安全存储、读取、更新、清除 API Key。

**方案**：系统原生 Keychain（主方案）+ `.env` fallback（带风险提示）

**交互流程**：
```
首次运行:
  1. 检测 Keychain 中是否有存储的 key
  2. 若无 → 启动交互式引导（setup-wizard）
  3. 引导用户选择 Provider（Anthropic / OpenAI）
  4. 提示用户输入 API Key（隐藏输入，密码星号）
  5. 验证 Key 有效性（发送一个最小请求）
  6. 验证通过 → 存储到系统 Keychain
  7. 验证失败 → 提示重新输入（最多 3 次）

后续运行:
  1. 从 Keychain 读取 key
  2. 若 Keychain 不可用 → 检查 .env 文件（打印风险提示）
  3. 若均无 → 提示运行 setup 命令
```

**CLI 命令**：
- `seahorse setup` — 启动凭证配置向导
- `seahorse status` — 查看已配置的 Provider 和 Key 状态（不显示明文）
- `seahorse clear` — 清除所有存储的凭证

**输入**：用户在终端输入（隐藏回显）
**输出**：存储成功/失败状态
**边界条件**：
- Keychain 不可用（如无桌面环境的 Linux 服务器）→ 降级到加密文件方案
- 多次输入错误 Key → 给出排查建议
**错误处理**：
- Keychain 写入失败 → 提示权限问题
- API 验证请求失败 → 区分网络错误 vs 认证错误

---

## 4. 非功能性需求

### 4.1 性能

| 指标 | 目标 | 测试方法 |
|------|------|---------|
| 主循环单轮延迟（不含 LLM） | < 50ms | 单元测试计时 |
| Mock LLM 响应时间 | < 5ms | 单元测试计时 |
| 护栏检查延迟 | < 10ms | 单元测试（含全量危险模式匹配） |
| 记忆检索延迟 | < 100ms | 单测（100 条记忆文件） |
| 上下文 Token 计数 | < 50ms | 单测（100K tokens 上下文） |

### 4.2 安全（含凭证威胁模型）

**凭证威胁模型**：

| 威胁 | 风险等级 | 缓解措施 |
|------|---------|---------|
| 源代码/配置文件泄露 API Key | 高 | Key 绝不硬编码；`.env` 文件加入 `.gitignore`；pre-commit hook 扫描 |
| 日志/终端历史泄露 API Key | 高 | 日志中自动脱敏；隐藏输入不回显；不通过命令行 `export` 传递 |
| 进程内存 dump 泄露 | 中 | 使用后立即清零内存中的 Key 字符串 |
| 第三方依赖窃取环境变量 | 中 | `.env` 仅在启动时加载一次，不在全局暴露 |
| Keychain 被恶意读取 | 低 | 依赖操作系统级的访问控制 |
| 网络传输被中间人截获 | 低 | 所有 LLM API 调用使用 HTTPS |

**安全编码规范**：
- 内存中的 Key 变量在读取后立即置零（`key = null`，依赖 GC）
- 错误消息中绝不包含完整 Key（只显示前 4 位 + 后 4 位）
- 审计日志中不记录任何 Key 相关内容

### 4.3 可用性

- CLI 界面清晰，每个命令有 `--help` 说明
- 错误消息面向开发者友好（明确指出问题、原因、建议操作）
- 首次运行体验流畅（交互式引导 ≤ 5 步完成配置）
- 配置文件支持 JSON 和 YAML 两种格式

### 4.4 可观测性

- 主循环每轮输出状态摘要（当前轮次、动作类型、护栏判定、反馈结果）
- 支持 `--verbose` 模式输出完整上下文
- 支持 `--json` 模式输出结构化日志（用于 pipeline）
- 审计日志持久化到 `~/.seahorse/audit/` 目录

---

## 5. 系统架构

### 5.1 组件图

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI (main.ts)                             │
│  用户输入 → "修复 src/parser.ts 中的 bug"                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     Agent Loop (core/agent-loop.ts)              │
│                                                                  │
│  ┌─────────────┐   ┌──────────────┐   ┌────────────────────┐   │
│  │ Context      │   │ LLM Provider │   │ Action Parser      │   │
│  │ Builder      │──▶│ (抽象层)      │──▶│ (解析 LLM 输出)    │   │
│  │ (记忆+配置)  │   │              │   │                    │   │
│  └─────────────┘   └──────────────┘   └─────────┬──────────┘   │
│                                                  │               │
│                    ┌─────────────────────────────┘               │
│                    ▼                                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               Governance System (治理系统)                │    │
│  │                                                          │    │
│  │  Action → Guardrail → [Allowed] → Execute                │    │
│  │                │                                         │    │
│  │                └→ [Blocked] → HITL State Machine         │    │
│  │                     │                                     │    │
│  │                     ├→ Allow → Execute                    │    │
│  │                     ├→ Deny  → Skip                       │    │
│  │                     └→ Terminate → Exit                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                  │               │
│  ┌───────────────────────────────────────────────▼──────────┐   │
│  │               Feedback System (反馈系统)                  │   │
│  │                                                          │   │
│  │  Execute Result → Validator → Failure Classifier         │   │
│  │                                      │                    │   │
│  │                                      ▼                    │   │
│  │                           Feedback Injector               │   │
│  │                           (回灌到下一轮上下文)              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                  │               │
│  ┌───────────────────────────────────────────────▼──────────┐   │
│  │               Stop Judge (停机判断)                       │   │
│  │  - 无工具调用 + 文本回复 → 任务完成？                      │   │
│  │  - 达到最大轮次 → 强制停机                                │   │
│  │  - 连续 3 轮无进展 → 建议停机                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 数据流

```
                    ┌──────────┐
                    │  User    │  "Fix the bug in parser.ts"
                    └────┬─────┘
                         │
          ┌──────────────▼──────────────┐
          │  1. Context Builder          │
          │  - System Prompt (built-in)  │
          │  - Memory (retrieved)        │
          │  - Config Rules (injected)   │
          │  - User Task                 │
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  2. LLM Provider             │
          │  Messages → LLM → Response   │
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  3. Action Parser            │
          │  LLM Response → Action[]     │
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  4. Guardrail Check          │
          │  ┌─────────┐                │
          │  │Allowed? ├─── Yes ────────▶ 5. Execute Tool
          │  └────┬────┘                │
          │       │ No                  │
          │  ┌────▼────┐                │
          │  │  HITL   │                │
          │  │ Paused  │─── User Input  │
          │  └─────────┘                │
          └─────────────────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  6. Feedback Validator       │
          │  Tool Result → Validation   │
          │  → Failure Classification   │
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  7. Feedback Injector        │
          │  Classified Feedback →       │
          │  Formatted Report →          │
          │  Append to Context           │
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  8. Stop Judge               │
          │  ┌──────────┐               │
          │  │Done?     │─── No ───────▶ Back to Step 2
          │  └────┬─────┘               │
          │       │ Yes                 │
          │       ▼                     │
          │  Output Final Result         │
          └─────────────────────────────┘
```

### 5.3 外部依赖

| 依赖 | 用途 | 版本 |
|------|------|------|
| `@anthropic-ai/sdk` | Anthropic Claude API 调用 | ^0.40 |
| `openai` | OpenAI API 调用 | ^4.70 |
| `keytar` | 系统 Keychain 凭证存储 | ^7.9 |
| `yaml` | YAML 配置文件解析 | ^2.6 |
| `commander` | CLI 框架 | ^12.0 |
| `chalk` | 终端彩色输出 | ^5.3 |
| `tiktoken` (或 `js-tiktoken`) | Token 计数 | ^1.0 |
| `minimatch` | Glob 路径匹配（沙箱路径检查） | ^9.0 |
| `dotenv` | .env 文件加载（fallback） | ^16.4 |

**开发依赖**：

| 依赖 | 用途 |
|------|------|
| `typescript` | 语言 |
| `vitest` | 测试框架 |
| `eslint` | Lint |
| `prettier` | 格式化 |
| `tsx` | TypeScript 执行（开发时） |

---

## 6. 数据模型

### 6.1 核心实体

```typescript
// ── 消息 ──
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;            // 工具名（role=tool 时）
  toolCallId?: string;      // 工具调用 ID
  toolCalls?: ToolCall[];   // 工具调用（role=assistant 时）
}

// ── 工具调用 ──
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ── Mock LLM 脚本 ──
interface MockScript {
  /** 返回 true 时，此脚本处理当前消息 */
  match: (messages: Message[]) => boolean;
  /** 匹配时返回的确定性响应 */
  response: LLMResponse;
}

// ── 工具结果 ──
interface ToolResult {
  toolCallId: string;
  success: boolean;
  data: unknown;
  error?: string;
  duration: number;         // 执行耗时 (ms)
}

// ── 动作（内部表示） ──
interface Action {
  type: 'tool_call' | 'text_response';
  toolCall?: ToolCall;
  textContent?: string;
}

// ── 护栏判定 ──
interface GuardrailDecision {
  allowed: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  matchedPattern?: string;  // 命中的危险模式
  reason?: string;
  requiresApproval: boolean;
}

// ── HITL 事件 ──
interface HITLEvent {
  sessionId: string;
  turnNumber: number;
  action: Action;
  decision: GuardrailDecision;
  userResponse?: HITLDecision;
  timestamp: Date;
  resolved: boolean;
}

// ── 反馈 ──
interface Feedback {
  turnNumber: number;
  checks: FeedbackCheck[];
  classifications: FailureClassification[];
  summary: string;
}

interface FeedbackCheck {
  type: 'test' | 'lint' | 'typecheck' | 'exitcode';
  status: 'pass' | 'fail' | 'warn';
  details: string;
}

interface FailureClassification {
  category: FailureCategory;
  count: number;
  items: string[];  // 具体失败项描述
}

// ── 会话状态 ──
interface SessionState {
  sessionId: string;
  status: 'running' | 'paused' | 'completed' | 'terminated';
  currentTurn: number;
  maxTurns: number;
  messages: Message[];
  hitlQueue: HITLEvent[];
  auditEntries: AuditEntry[];
  startedAt: Date;
}

// ── 审计日志 ──
interface AuditEntry {
  timestamp: Date;
  sessionId: string;
  turnNumber: number;
  action: Action;
  guardrailDecision: GuardrailDecision;
  hitlEvent?: HITLEvent;
  executionResult?: ToolResult;
  feedback?: Feedback;
}

// ── 记忆条目 ──
interface MemoryEntry {
  id: string;
  content: string;
  metadata: {
    type: 'convention' | 'decision' | 'preference' | 'knowledge';
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    relevance: number;    // 0-1
  };
}

// ── 配置 ──
interface SeahorseConfig {
  model: ModelConfig;
  loop: LoopConfig;
  governance: GovernanceConfig;
  rules: string[];
}

interface ModelConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  maxTokens: number;
  temperature: number;
}

interface LoopConfig {
  maxTurns: number;
  maxContextTokens: number;
  turnTimeout: number;
}

interface GovernanceConfig {
  sandbox: SandboxConfig;
  commands: CommandConfig;
}
```

### 6.2 实体关系

```
Session (1) ──── (N) Message
Session (1) ──── (N) AuditEntry
Session (1) ──── (N) HITLEvent
Session (1) ──── (1) SeahorseConfig

MemoryEntry (N) ──── tagged_by ──── (N) Tag

GuardrailDecision (1) ──── triggers ──── (0..1) HITLEvent
ToolResult (1) ──── produces ──── (0..1) Feedback
Feedback (1) ──── contains ──── (N) FailureClassification
```

---

## 7. 凭证与分发设计

### 7.1 凭证安全存储

**主方案：系统原生 Keychain**

```
┌─────────────────────────────────────┐
│         Credential Manager           │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  KeychainStore (keytar)      │   │
│  │  - store(service, key, val)  │   │
│  │  - get(service, key) → val   │   │
│  │  - delete(service, key)      │   │
│  │  - list(service) → keys      │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  EnvFallbackStore            │   │
│  │  ⚠️ 打印风险提示             │   │
│  │  - 从 .env 读取              │   │
│  │  - 从 process.env 读取       │   │
│  └──────────────────────────────┘   │
│                                      │
│  Service names:                      │
│    "seahorse-anthropic"              │
│    "seahorse-openai"                 │
└─────────────────────────────────────┘
```

**首次启动引导流程**：

```
$ seahorse setup

  🐴  Welcome to Seahorse! Let's set up your API keys.

  Select LLM Provider:
    [1] Anthropic (Claude)
    [2] OpenAI
    [3] Both

  > 1

  Enter your Anthropic API Key: ********
  (Your key will be stored securely in the system keychain)

  Verifying key... ✅ Valid!

  Configuration saved successfully.
  Run `seahorse status` to check your setup.
```

### 7.2 分发方案

**方案 A：npm 包**

```bash
# 全局安装
npm install -g seahorse-harness

# 使用
seahorse run "Fix the type error in src/utils.ts"
seahorse setup
seahorse status
```

**方案 B：Docker 镜像**

```bash
# 拉取镜像
docker pull ghcr.io/username/seahorse:latest

# 运行（挂载项目目录，传递 Keychain 或 .env）
docker run -it --rm \
  -v $(pwd):/workspace \
  -v ~/.seahorse:/root/.seahorse \
  -e ANTHROPIC_API_KEY \
  ghcr.io/username/seahorse:latest \
  run "Fix the bug in parser.ts"
```

**Dockerfile 要点**：
- 基于 `node:22-alpine`（体积小）
- 多阶段构建（builder + runtime）
- 以非 root 用户运行

---

## 8. 技术选型与理由

| 维度 | 选择 | 理由 |
|------|------|------|
| **语言** | TypeScript 5.x | 类型安全适合 harness 精确控制；Node.js 生态对文件系统、shell、HTTP 操作成熟；Anthropic/OpenAI 官方 SDK 对 TS 支持一流 |
| **运行时** | Node.js 22 LTS | 长期支持、性能稳定、跨平台 |
| **LLM 抽象** | 自研 `LLMProvider` 接口 | 满足 A.4-A 要求（必须自己实现），不依赖框架 agent runner |
| **LLM 供应商** | Anthropic (Claude) + OpenAI | 双供应商保障可用性；通过抽象层可扩展更多 |
| **测试框架** | Vitest | 快速、原生 ESM 支持、与 TypeScript 零配置集成 |
| **CLI 框架** | Commander.js | 成熟稳定、声明式定义、生态丰富 |
| **凭证存储** | keytar (系统 Keychain) | 跨平台原生安全存储；Windows Credential Manager / macOS Keychain / Linux Secret Service |
| **配置解析** | yaml (js-yaml) | YAML 可读性优于 JSON，适合配置文件 |
| **分发** | npm + Docker 双形态 | npm 给开发者直接使用；Docker 给不想装 Node.js 的用户 |
| **CI/CD** | GitHub Actions | 免费、与 GitHub 仓库深度集成 |

---

## 9. 领域与机制设计

> 本节为 Coding Agent Harness 项目（A）的 SPEC 额外要求（对应 A.5）。

### 9.1 领域分析：Coding 场景的四类机制

#### 9.1.1 动作 / 工具

Coding agent 需要的核心操作能力：

| 类别 | 工具 | 必要性 |
|------|------|--------|
| 代码理解 | 读取文件、搜索代码、列出目录 | 必须 |
| 代码修改 | 写入文件、精确编辑 | 必须 |
| 执行验证 | 运行 shell 命令、运行测试、运行 lint | 必须 |
| 外部信息 | 网络搜索（可选）、Git 操作（可选） | 可选 |

#### 9.1.2 客观反馈信号

Coding 场景的独特优势：**反馈信号天生是客观、确定、可编程的**。

| 信号源 | 确定性 | 可回灌性 | 实现方式 |
|--------|--------|---------|---------|
| 测试结果（pass/fail） | ✅ 100% | ✅ 直接 | 解析测试框架输出 |
| Lint 输出 | ✅ 100% | ✅ 直接 | 解析 ESLint 输出 |
| 类型检查（tsc） | ✅ 100% | ✅ 直接 | 解析编译器输出 |
| Exit code | ✅ 100% | ✅ 直接 | 检查进程退出码 |
| 代码覆盖率 | ✅ 100% | ⚠️ 间接 | 解析覆盖率报告 |

#### 9.1.3 危险动作

Coding 场景中的典型危险操作：

| 危险等级 | 动作类别 | 示例 | 处理方式 |
|---------|---------|------|---------|
| 🔴 Critical | 文件系统破坏 | `rm -rf /`, `dd`, `mkfs` | 硬拦截 + HITL |
| 🔴 Critical | 数据库破坏 | `DROP TABLE`, `DELETE FROM ...` | 硬拦截 + HITL |
| 🟠 High | 权限变更 | `chmod 777`, `chown root` | 硬拦截 + HITL |
| 🟠 High | 敏感文件访问 | 读取 `~/.ssh`, `~/.aws`, `.env` | 硬拦截（沙箱） |
| 🟡 Medium | 外部发布 | `git push --force`, `npm publish` | 软拦截（可配置） |
| 🟡 Medium | 网络外传 | `curl -X POST` 发送文件内容 | 硬拦截 + HITL |
| 🟢 Low | 正常文件操作 | 读写项目目录内文件 | 放行 |

#### 9.1.4 记忆需求

Coding 场景中需要跨会话记住的内容：

| 类别 | 示例 | 生命周期 |
|------|------|---------|
| 项目约定 | "使用 2 空格缩进"、"禁止 any 类型" | 项目级，持久 |
| 架构决策 | "选择使用 Repository 模式" | 项目级，持久 |
| 用户偏好 | "偏好使用 async/await 而非 Promise.then" | 用户级，持久 |
| 代码库知识 | "`src/core/` 是核心引擎，`src/utils/` 是工具函数" | 项目级，随代码变化更新 |
| 会话上下文 | 当前任务的历史操作 | 会话级，临时 |

### 9.2 重点维度选择与理由

**主攻维度：治理（Governance）**

选择理由：
1. **工程深度最大**：需要实现多级拦截器、HITL 状态机、沙箱路径检查、审计日志——全部是确定性代码
2. **最契合"机制必须是代码"**：护栏的每个拦截规则都是可单测的纯函数，不依赖 LLM 的"智能判断"
3. **实际价值最高**：coding agent 最大的落地障碍就是安全信任问题，硬编码护栏直接解决这一痛点
4. **可演示性强**：注入一个危险命令，护栏拦截 → HITL 暂停 → 用户确认 → 放行执行，整个流程清晰可见

**辅助维度：反馈闭环（Feedback Loop）**

选择理由：
1. **与治理互补**：治理解决"能做什么"，反馈解决"做对了没"
2. **Coding 场景天然适配**：测试/lint/类型检查都是客观信号，解析和分类逻辑是确定性代码
3. **形成完整闭环**：护栏 → 执行 → 校验 → 分类 → 回灌，一条完整的 pipeline

**实现策略**：

| 组件 | 实现方式 | 可 mock 测试？ |
|------|---------|--------------|
| 护栏模式匹配 | 正则 + 字符串匹配，纯函数 | ✅ 100% |
| 危险等级分类 | 查表映射，纯函数 | ✅ 100% |
| HITL 状态机 | 显式状态转换，纯逻辑 | ✅ 100% |
| 沙箱路径检查 | 路径解析 + 前缀匹配，纯函数 | ✅ 100% |
| 测试结果解析 | 正则匹配框架输出 | ✅ 100% |
| 失败分类器 | 模式匹配 + 查表，纯函数 | ✅ 100% |
| 反馈回灌 | 格式化字符串模板 | ✅ 100% |

### 9.3 机制编码实现概要

**护栏拦截（代码示例）**：

```typescript
// governance/guardrail.ts
function checkAction(action: Action, config: GovernanceConfig): GuardrailDecision {
  if (action.type !== 'tool_call') {
    return { allowed: true, riskLevel: 'none', requiresApproval: false };
  }

  const { name, arguments: args } = action.toolCall!;

  // Level 1: 命令模式匹配
  if (name === 'shell_exec') {
    const command = String(args.command);
    for (const pattern of DANGER_PATTERNS) {
      if (pattern.regex.test(command)) {
        return {
          allowed: false,
          riskLevel: pattern.riskLevel,
          matchedPattern: pattern.name,
          reason: pattern.description,
          requiresApproval: true,
        };
      }
    }
  }

  // Level 2: 路径边界检查
  if (name === 'write_file' || name === 'edit_file' || name === 'read_file') {
    const targetPath = resolvePath(String(args.path));
    if (!isPathAllowed(targetPath, config.sandbox)) {
      return {
        allowed: false,
        riskLevel: 'high',
        reason: `Path "${targetPath}" is outside allowed boundaries`,
        requiresApproval: true,
      };
    }
  }

  // Level 3-4: 其他检查...

  return { allowed: true, riskLevel: 'none', requiresApproval: false };
}
```

**HITL 状态机（代码示例）**：

```typescript
// governance/hitl-state-machine.ts
class HITLStateMachine {
  private state: 'idle' | 'paused' = 'idle';
  private pendingAction: Action | null = null;

  pause(action: Action, decision: GuardrailDecision): HITLEvent {
    this.state = 'paused';
    this.pendingAction = action;
    return { /* HITLEvent */ };
  }

  async waitForDecision(): Promise<HITLDecision> {
    // 显示确认提示，等待用户输入
    // 超时 300s 自动返回 deny
  }

  resolve(userDecision: HITLDecision): void {
    switch (userDecision.action) {
      case 'allow': this.state = 'idle'; break;
      case 'deny': this.state = 'idle'; break;
      case 'terminate': throw new SessionTerminatedError();
    }
  }
}
```

---

## 10. 验收标准

| ID | 验收项 | 判定标准 | 测试方式 |
|----|--------|---------|---------|
| AC-1 | Agent 主循环可运行 | 给定 mock LLM 返回预设动作，主循环能完成"接收→解析→执行→回灌→停机"的完整流程 | 确定性单测 |
| AC-2 | Mock LLM 可替换真实 LLM | 将 `MockLLMProvider` 注入 `AgentLoop`，所有核心机制单测 pass | 确定性单测 |
| AC-3 | 护栏拦截危险命令 | `guardrail(shell_exec("rm -rf /"))` 返回 `{ allowed: false }` | 确定性单测 |
| AC-4 | 护栏拦截危险 SQL | `guardrail(shell_exec("DROP TABLE users"))` 返回 `{ allowed: false }` | 确定性单测 |
| AC-5 | HITL 状态机完整流转 | 模拟 PAUSE → ALLOW/DENY/TERMINATE 全路径 | 确定性单测 |
| AC-6 | 沙箱路径拦截 | 尝试写入 `/etc/passwd` 被拦截 | 确定性单测 |
| AC-7 | 反馈闭环驱动修正 | 注入测试失败 → agent 收到分类反馈 → 下一步动作包含修复 | 确定性单测 |
| AC-8 | 失败分类正确 | 给定 Jest 失败输出，分类器返回 `LOGIC_ERROR` | 确定性单测 |
| AC-9 | 记忆可跨会话读写 | 写入记忆 → 重启 → 检索到相同记忆 | 集成测试 |
| AC-10 | 配置文件加载并生效 | 修改 `maxTurns: 3` → agent 在第 3 轮后强制停机 | 确定性单测 |
| AC-11 | API Key 安全存储 | 存入 Keychain → 读取成功 → 状态显示不暴露明文 | 集成测试 |
| AC-12 | 首次启动引导 | 无 Key 时运行 setup → 交互式引导 → Key 存储成功 | 手动测试 |
| AC-13 | npm 包可安装运行 | `npm install -g` → `seahorse --help` 显示帮助 | 手动测试 |
| AC-14 | Docker 镜像可运行 | `docker run` → 正常启动 | 手动测试 |
| AC-15 | 机制演示可复现 | 运行演示脚本 → 护栏拦截、反馈闭环、深入维度行为全部可复现 | 确定性脚本 |

---

## 11. 风险与未决问题

### 11.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| LLM 输出格式不稳定 | 动作解析器无法提取有效动作 | 中 | 使用结构化输出（tool_use / function calling）；添加格式纠正重试 |
| `keytar` 在无桌面 Linux 上不可用 | 凭证存储方案失效 | 中 | 降级到加密文件方案（AES-256-GCM + 主密码） |
| 上下文 Token 超限 | LLM 调用失败 | 高 | 实现上下文压缩（摘要旧消息）；限制记忆检索数量 |
| 危险模式遗漏 | 新型危险命令未被拦截 | 中 | 支持用户自定义危险模式；默认拒绝未知高危命令类别 |
| npm 包体积过大 | 安装慢 | 低 | 使用 `node:alpine` 基础镜像；排除 devDependencies |

### 11.2 未决问题

1. **多 Agent 协作**：当前 scope 为单 agent，是否需要在后续版本支持多 agent 编排？
2. **流式输出**：LLM 响应的流式（streaming）模式是否在第一版实现？流式输出对动作解析器有额外要求。
3. **插件系统**：工具系统是否需要支持第三方插件扩展？当前 scope 为内置工具集。
4. **Web UI**：是否需要 Web 界面？纯 CLI 可以满足 MVP 需求，但项目要求中提到"必须提供应用可访问的 WebUI 接口"。**需要确认**：对于 CLI 工具，是否可以通过简单的 Web 终端（如 xterm.js + WebSocket）来满足此要求？
5. **Windows 兼容性**：`keytar` 在 Windows 上的 Credential Manager 集成需要测试。

### 11.3 修订历史

| 版本 | 日期 | 修订内容 | 触发原因 |
|------|------|---------|---------|
| v1.0 | 2026-07-14 | 初始版本，完整 SPEC | Brainstorming 产出 |
| v1.1 | 2026-07-14 | §3.1 文件结构：明确 `types.ts`（类型定义）、`provider.ts`（工厂函数）、`mock.ts`（Mock 实现）的职责划分；§3.2 新增 `MockScript` 接口定义、Anthropic/OpenAI 适配器实现要点、重试和错误映射详情；§6.1 数据模型新增 `MockScript` 接口；§11.2 Web UI 方案确认（xterm.js + WebSocket）；§11.3 新增修订历史 | 冷启动验证：T1.1 颗粒度过大导致真实 Provider 未实现；`provider.ts` 职责模糊；`MockScript` 设计良好需要回写 |

---

> **文档版本**：v1.1  
> **创建日期**：2026-07-14  
> **最后修订**：2026-07-14（冷启动验证后修订，详见 §11.3）  
> **状态**：Revised — 冷启动验证完成，修订已合并