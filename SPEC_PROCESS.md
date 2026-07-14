# SPEC_PROCESS.md — Seahorse 规约与计划过程文档

> **项目**：Seahorse (Coding Agent Harness)  
> **创建日期**：2026-07-14  
> **关联文档**：[SPEC.md](./SPEC.md) | [PLAN.md](./PLAN.md)

---

## 目录

1. [Brainstorming 关键节点](#1-brainstorming-关键节点)
2. [关键迭代轮次](#2-关键迭代轮次)
3. [AI 建议采纳与推翻](#3-ai-建议采纳与推翻)
4. [冷启动验证报告](#4-冷启动验证报告)
5. [SPEC / PLAN 修订记录](#5-spec--plan-修订记录)
6. [反思](#6-反思)

---

## 1. Brainstorming 关键节点

### 1.1 初始需求澄清

**主 agent（Claude Code）追问的关键问题**：

| 问题 | 用户回答 | 影响 |
|------|---------|------|
| 编程语言选择？ | TypeScript | 确定了整个技术栈方向 |
| LLM 供应商？ | Anthropic + OpenAI 双供应商 | LLM 抽象层设计为可替换 |
| 主攻维度？ | 治理（Governance），辅助反馈闭环 | 决定了 60% 的工程精力分配 |
| 分发方案？ | npm + Docker 双形态 | 影响 CI/CD 和打包配置 |
| 凭证存储？ | 系统 Keychain + .env fallback | 影响 credential 模块设计 |
| 项目名称？ | Seahorse（海马） | 确定了命名空间和品牌 |

### 1.2 设计决策中的关键转折

**转折 1：从"六个维度平均用力"到"治理为主攻"**

最初 agent 建议六个维度都做中等深度。用户根据文档建议（A.4-D），明确要求治理作为主攻维度。这一决策显著影响了后续的模块设计——治理系统从简单的护栏函数扩展为四级拦截器 + HITL 状态机 + 沙箱 + 审计日志的完整体系。

**转折 2：Web UI 的定位**

文档要求"必须提供应用可访问的 WebUI 接口"，但 Seahorse 本质是 CLI 工具。经过讨论，确定采用 xterm.js + WebSocket 方案，将 CLI 体验搬到浏览器中，而非构建一个完整的 Web 管理后台。

**转折 3：Mock LLM 的确定性策略**

在 SPEC 中最初描述为"基于输入内容的 hash 或预定义脚本"，实际实现时 agent 选择了基于 `match` 函数回调的脚本模式——这比 hash 更灵活（可以匹配语义而非精确字符串），也比纯脚本更可编程。这一设计值得回写到 SPEC 中。

---

## 2. 关键迭代轮次

### 第 1 轮：项目定位与范围

- **对话摘要**：主 agent 先阅读了两份 PDF 文档，然后给出了总体理解、六维度分析和详细步骤计划
- **用户反馈**：确认理解正确，要求进入阶段 1
- **决策**：确定了"先理解 → 再问卷 → 后 SPEC"的流程

### 第 2 轮：设计决策问卷

- **对话摘要**：主 agent 提出了 6 个设计决策问题（语言、供应商、深入维度、分发、凭证、命名），每个给出了推荐选项和理由
- **用户反馈**：全部确认，给出了具体细化决策（如"硬编码的多级拦截器"、"确定性的单测结果/Lint 校验器"等）
- **决策**：所有推荐方案被采纳，形成了 SPEC 的骨架

### 第 3 轮：SPEC 编写

- **对话摘要**：主 agent 根据所有决策，编写了完整的 SPEC.md（11 章，涵盖问题陈述、用户故事、功能规约、非功能性需求、系统架构、数据模型、凭证与分发、技术选型、领域与机制设计、验收标准、风险）
- **用户反馈**：确认 Web UI 方案（xterm.js + WebSocket），对 SPEC 整体满意
- **决策**：SPEC v1.0 定稿，进入 PLAN 编写

### 第 4 轮：PLAN 编写

- **对话摘要**：主 agent 编写了 PLAN.md（26 个 task，14 个 Phase，依赖关系图，并行策略，4 周执行建议）
- **用户反馈**：确认进入阶段 3（冷启动验证）
- **决策**：PLAN v1.0 定稿

### 第 5 轮：冷启动验证（本轮）

- **对话摘要**：用户用另一个 agent 在全新 session 中实现了 T0.1 + T1.1；主 agent 审查结果并记录发现
- **关键发现**：见 §4

---

## 3. AI 建议采纳与推翻

### 采纳的 AI 建议

| 建议 | 来源 | 理由 |
|------|------|------|
| TypeScript 作为编程语言 | 主 agent 推荐 | 类型安全、生态成熟、双供应商 SDK 支持好 |
| 治理作为主攻维度 | 文档建议 + 主 agent 分析 | 工程深度最大、最契合"机制必须是代码" |
| 四级护栏拦截模型 | 主 agent 设计 | 从白名单到语义分析，逐级递进，覆盖全面 |
| HITL 状态机设计 | 主 agent 设计 | 状态转换清晰，超时自动 deny，安全默认 |
| xterm.js + WebSocket 方案 | 主 agent 建议 | 保持 CLI 本质，满足 Web UI 要求 |
| npm + Docker 双分发 | 主 agent 推荐 | 覆盖两种用户场景 |
| 项目命名为 Seahorse | 主 agent 建议 | 生动、好记、与 Harness 谐音 |

### 推翻或修正的 AI 建议

| 建议 | 来源 | 修正 | 理由 |
|------|------|------|------|
| 六维度平均用力 | 主 agent 初步建议 | 改为治理主攻 + 反馈辅助 | 文档明确要求"选一个深入" |
| 反馈闭环也作为主攻 | 主 agent 初步建议 | 降级为辅助维度 | 用户明确要求治理为主攻 |
| T1.1 包含真实 Provider 实现 | 原始 PLAN | 拆分为 T1.1a（Mock）+ T1.1b（真实 Provider） | 冷启动验证暴露了颗粒度问题 |

---

## 4. 冷启动验证报告

### 4.1 验证环境

| 项目 | 详情 |
|------|------|
| **验证用 Agent** | 与主 agent 不同的编码智能体（全新 session） |
| **提供材料** | 仅 `SPEC.md` + `PLAN.md`（无对话历史，无口头补充） |
| **指定任务** | T0.1（项目初始化）+ T1.1（LLM Provider 接口 + Mock LLM） |
| **验证时间** | 约 30 分钟 |
| **预期产出** | 完整的项目脚手架 + LLM 抽象层（接口 + Mock + Anthropic + OpenAI） |

### 4.2 实际产出

| 文件 | 状态 | 说明 |
|------|------|------|
| `package.json` | ✅ 完整 | 所有依赖正确，scripts 完备，bin 和 exports 配置正确 |
| `tsconfig.json` | ✅ 完整 | strict mode, ES2022, NodeNext, 声明文件生成 |
| `vitest.config.ts` | ✅ 完整 | 80% 覆盖率阈值，10s 超时 |
| `.gitignore` | ✅ 完整 | 排除了 .env, secrets, 构建产物, IDE 文件 |
| `.eslintrc.json` | ✅ 完整 | TypeScript ESLint 配置正确 |
| `.prettierrc` | ✅ 完整 | 2 空格缩进，单引号，尾逗号 |
| `.github/workflows/ci.yml` | ✅ 完整 | unit-test + build + docker-build 三个 job |
| `tsconfig.eslint.json` | ✅ 完整 | ESLint 专用 tsconfig |
| `src/core/llm/types.ts` | ✅ 完整 | Message, ToolCall, LLMOptions, LLMResponse, LLMProvider, 4 种错误类型, MockScript |
| `src/core/llm/provider.ts` | ⚠️ 仅 re-export | 实际只是 `export type {...} from './types.js'`，不是独立实现 |
| `src/core/llm/mock.ts` | ✅ 完整 | `MockLLMProvider` 基于脚本匹配，确定性输出 |
| `src/core/llm/mock.test.ts` | ✅ 完整 | 17 个测试用例，覆盖类型、错误、Mock 全功能 |
| `src/index.ts` | ✅ 完整 | 版本导出 |
| `src/index.test.ts` | ✅ 完整 | 基础冒烟测试 |
| `src/core/llm/anthropic.ts` | ❌ 缺失 | PLAN 中 T1.1 要求但未实现 |
| `src/core/llm/openai.ts` | ❌ 缺失 | PLAN 中 T1.1 要求但未实现 |

### 4.3 第二个 Agent 在哪里受阻

#### 受阻点 1：真实 Provider 实现缺乏 API Key

**现象**：Agent 在实现了 Mock 和类型后，没有继续实现 `anthropic.ts` 和 `openai.ts`。

**根因分析**：
- SPEC 中对真实 Provider 的实现描述不够具体——只说了"封装 Anthropic SDK / OpenAI SDK"，但没有说明在无 API Key 的情况下应该如何编写代码
- 冷启动环境下没有 API Key，agent 无法验证真实 Provider 是否工作
- 这暴露了 SPEC 的一个缺陷：**SPEC 没有区分"需要 API Key 的集成任务"和"纯代码的单元任务"**

**这是 SPEC 的缺陷**：是的。SPEC 应该在 T1.1 中明确将 Mock 和真实 Provider 分开，并说明真实 Provider 可以先写代码结构，不要求立即验证。

#### 受阻点 2：`provider.ts` 的职责不明确

**现象**：`provider.ts` 只做了 re-export，没有自己的内容。

**根因分析**：
- SPEC 说 `provider.ts` 包含"抽象接口"，但实际接口定义在 `types.ts` 中
- Agent 将 `provider.ts` 理解为 barrel 文件（聚合导出），而非独立模块
- 这暴露了 SPEC 的文件结构描述不够精确

**这是 SPEC 的缺陷**：部分是的。SPEC 应该明确 `types.ts`（类型定义）和 `provider.ts`（接口 + 工厂函数）的职责划分。

#### 受阻点 3：任务边界模糊

**现象**：Agent 在完成了 Mock + 类型 + 测试后自然停止，没有继续做真实 Provider。

**根因分析**：
- PLAN 中 T1.1 的描述是"定义 LLMProvider 接口；实现 MockLLMProvider；实现 AnthropicProvider 和 OpenAIProvider"
- 一个 task 包含 4 个文件，但其中 2 个需要 API key 验证，2 个不需要
- Agent 实现了不需要 API key 的部分，将需要 API key 的部分留给了"下一次"

**这是 SPEC/PLAN 的缺陷**：是的。T1.1 应该拆分为两个 task。

### 4.4 Agent 的自主解读与预期差异

| 方面 | SPEC 原意 | Agent 实际解读 | 差异分析 |
|------|----------|---------------|---------|
| `complete()` 方法的 `options` 参数 | 应被使用（temperature, maxTokens 等） | Mock 中 `_options` 前缀表示忽略 | Mock 不需要这些参数，但接口设计上应保留。Agent 的做法是正确的 |
| `MockScript` 接口 | SPEC 未定义（只说"基于 hash 或预定义脚本"） | Agent 自行设计了 `match` + `response` 的脚本接口 | Agent 的设计比 SPEC 原意更好，应回写 |
| `provider.ts` 的职责 | SPEC 暗示它是接口定义文件 | Agent 将其作为 re-export barrel | SPEC 描述不够精确 |
| 测试覆盖率 | SPEC 要求 80% | Agent 在 vitest 中配置了 80% 阈值 | 对齐，但当前测试距离 80% 还有差距（只有 2 个源文件有测试） |

### 4.5 测试运行结果

```
✓ src/index.test.ts (1 test)
✓ src/core/llm/mock.test.ts (17 tests)
Test Files  2 passed (2)
Tests  18 passed (18)
```

所有 18 个测试通过。Mock LLM 的 17 个测试覆盖了：
- 类型定义验证（5 个）
- 错误类型创建（4 个）
- MockLLMProvider 功能（8 个）：接口实现、默认响应、脚本匹配、确定性、顺序匹配、工具调用、模型列表、自定义 providerId

### 4.6 核心发现总结

1. **T1.1 颗粒度过大**：Mock + 类型 + 两个真实 Provider 放在一个 task 中不合理，应拆分
2. **SPEC 缺少 MockScript 接口定义**：Agent 自行设计的 `match` 回调模式应回写到 SPEC
3. **`provider.ts` 职责模糊**：需要明确它是工厂函数文件还是 barrel 文件
4. **真实 Provider 实现需要更详细的 SPEC**：重试策略、错误码映射、API key 注入方式需要具体化
5. **SPEC 对"冷启动"场景考虑不足**：没有区分"需要 API key 的集成任务"和"纯代码的单元任务"

---

## 5. SPEC / PLAN 修订记录

### 5.1 SPEC.md 修订

| 修订点 | 修订前 | 修订后 | 原因 |
|--------|--------|--------|------|
| §3.2 Mock LLM 描述 | "基于输入内容的 hash 或预定义脚本" | 增加 `MockScript` 接口定义（`match` + `response`），明确脚本匹配模式 | 回写 Agent 实际采用的设计，比 hash 方案更灵活 |
| §3.2 文件结构 | `provider.ts` 为抽象接口 | 明确 `types.ts`（类型定义）/ `provider.ts`（接口 re-export + 工厂函数）/ `mock.ts`（Mock 实现）的职责划分 | 消除模糊 |
| §3.2 真实 Provider | 一句话描述 | 增加 Anthropic/OpenAI 适配器的具体实现要求：重试策略（3 次指数退避）、错误码映射表、API key 注入方式 | 冷启动验证暴露了描述不足 |
| §6.1 数据模型 | 无 `MockScript` | 新增 `MockScript` 接口 | 与实际实现对齐 |

### 5.2 PLAN.md 修订

| 修订点 | 修订前 | 修订后 | 原因 |
|--------|--------|--------|------|
| T0.1 | 状态：待执行 | 状态：✅ 已完成 | 第二个 Agent 已实现 |
| T1.1 | 一个 task | 拆分为 T1.1a（✅ Mock + 类型）和 T1.1b（待执行：Anthropic + OpenAI 适配器） | 颗粒度过大，冷启动受阻 |
| T1.1a | 不存在 | 新增：Mock LLM + 类型定义 + 错误类型（已完成） | 回写实际进度 |
| 任务总览 | 26 个 task | 27 个 task（拆分后 +1） | T1.1 拆分 |

---

## 6. 反思

### 6.1 Brainstorming 技能的表现

**做得好的地方**：
- 主 agent 在输出 SPEC 前主动追问了 6 个设计决策，避免了方向性错误
- 对每个决策都给出了推荐选项和理由，帮助用户快速做出判断
- SPEC 结构完整，覆盖了文档要求的所有章节

**可以改进的地方**：
- 对"冷启动"场景的考虑不足——在设计 Mock 和真实 Provider 时，没有预见到一个 agent 在无 API Key 环境下的行为
- 文件结构的描述不够精确（`provider.ts` vs `types.ts` 的职责划分），导致 agent 出现了不同的理解
- 任务颗粒度评估不够准确——T1.1 明显过大，应该在设计 PLAN 时就拆分

### 6.2 冷启动验证的价值

这次冷启动验证是 SPEC 质量最有价值的反馈信号。关键收获：

1. **"换一个 agent"确实暴露了隐性假设**：主 agent 和我在 brainstorming 过程中积累了大量的共享上下文（如"T1.1 包含了 Mock 和真实 Provider，但 Mock 优先"），这些在 SPEC 中并没有明确写出来。第二个 agent 只能看到 SPEC 的字面意思，因此选择了"完成能做的，跳过需要 API key 的"。

2. **SPEC 的"完整性"不等于"清晰性"**：SPEC 写了 11 章，但在文件级别描述上仍然不够精确。一个好的 SPEC 应该让一个完全不了解背景的开发者能准确复现设计意图。

3. **PLAN 的任务拆分需要更细**：2-5 分钟/task 的颗粒度建议是对的，但 T1.1 实际需要 15-20 分钟（Mock 部分约 10 分钟，真实 Provider 约 10 分钟），应该拆分。

### 6.3 对后续工作的启示

1. 每个 task 应该只包含一个"可独立验证"的产出物
2. 需要 API key 的 task 应该在 PLAN 中明确标注，并提供"先写代码结构，后续验证"的指导
3. SPEC 中的文件级描述应该精确到"这个文件包含什么，不包含什么"
4. 冷启动验证应该尽早进行——在 PLAN 完成后立即进行，而不是等到实现了一半才发现问题

---

> **文档版本**：v1.0  
> **创建日期**：2026-07-14  
> **状态**：Complete（冷启动验证完成，SPEC/PLAN 已修订）