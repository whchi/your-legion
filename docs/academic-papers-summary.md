# 學術論文參考整理：Agent 架構與 Context Routing

這份文件整理了前面討論到的核心論文，涵蓋了「動態語意工具路由 (Description-driven Routing)」、「動態角色與脈絡注入 (Context-injected Subagents)」，以及「基於合約的智能體編排 (Contract-based Orchestration)」。

## Repo Mapping

這份文件是 `your-legion` domain/runtime 設計的論文來源索引。README 與 docs 中提到的 Domain Catalog、Task Context Envelope、trace evidence、fixed scenario validation，都應回到這份文件確認理論來源與宣稱邊界。

| Paper | Production concept used in this repo | Implemented / documented in |
|---|---|---|
| Gorilla | Description-driven capability selection; domain routing should come from `DOMAIN.md` descriptions, not hand-written trigger rules. | `src/runtime/domain-packs.ts`, `src/agents/orchestrator.ts`, `docs/CONFIGURATION.md` |
| ReAct | Explicit reasoning/action boundary through a compact delegation envelope and verifiable follow-up actions. | `src/agents/orchestrator.ts`, `src/runtime/domain-usage-contract.ts`, `docs/DOMAIN_OBSERVABILITY.md` |
| Trace-Based Assurance | Runtime evidence, contract warnings, doctor diagnostics, usage stats, and regression scenarios for orchestration behavior. | `src/runtime/domain-usage-contract.ts`, `src/runtime/doctor.ts`, `tests/doctor.test.ts` |
| Themis | Future reference for evaluator/reward-model style quality checks over traces and outputs. | Not implemented as a reward model today; current implementation is deterministic checks only. |
| PERSONA | Analogy for composable inference-time control without creating one agent per domain. | Architectural analogy only; `your-legion` uses prompt/catalog context boundaries, not activation-vector persona control. |

Claim boundary: the parts currently implemented and verifiable in this repo are description-driven domain cataloging, warn-only runtime validation, trace evidence, and fixed acceptance scenarios. Themis-style learned evaluation, PERSONA-style activation control, and a full governance/evaluator framework are not implemented claims.

## 1. Description-driven Routing (動態上下文檢索與工具路由)

### [Gorilla: Large Language Model Connected with Massive APIs](https://arxiv.org/abs/2305.15334)
* **核心概念**：Semantic Tool Retrieval (語意工具檢索)
* **摘要 (Summary)**：
這篇來自 UC Berkeley 的論文探討了當系統面對成百上千個外部 API（或領域能力）時，硬編碼或手寫規則是無法擴展的。Gorilla 提出讓 LLM 結合文件化的 API 描述與檢索機制來選擇工具。`your-legion` 沒有實作 Gorilla 的 retriever；它套用的是同一個設計精神：domain routing 不靠手寫 trigger，而是把 `DOMAIN.md` 描述放進 Domain Catalog，讓 agent 依描述判斷是否啟用 domain context。

### [Tool-Augmented Reward Modeling (Themis)](https://arxiv.org/abs/2310.01045)
* **核心概念**：Dynamic Reasoning to Tools (動態推理調用)
* **摘要 (Summary)**：
這篇論文指出傳統依賴靜態內部表徵的模型容易受限。研究提出透過讓模型進行「動態推理 (Dynamic Reasoning)」，使其能夠根據高階的計畫與外部工具進行互動。對 `your-legion` 來說，它只提供「不要寫死 domain trigger、讓 agent 根據 catalog 判斷」的設計參考；目前程式碼沒有 Themis 的 reward model、learned evaluator，或工具增強式評分流程。

* **對 `your-legion` 的定位**：
目前 `your-legion` 只落地了 deterministic runtime diagnostics 和 trace evidence，尚未實作 Themis 式 reward model 或 evaluator。這篇適合作為未來「用 trace + domain refs + output quality 做評估」的延伸參考，不應宣稱目前已完整實作。

---

## 2. Context-injected Subagents (解決 Agent Explosion)

### [PERSONA: Dynamic and Compositional Inference-Time Personality Control](https://arxiv.org/abs/2602.15669)
* **核心概念**：Dynamic Persona Injection (動態角色注入)
* **摘要 (Summary)**：
現有的 Multi-Agent 框架（如 AutoGen 等）往往為每一個職位創建獨立的模型實例，這會導致成本暴增（Agent Explosion）。本論文提出一種在 Inference-Time（推論期）動態控制與注入角色性格（Persona）的框架。

* **對 `your-legion` 的定位**：
這篇只能作為「動態、可組合控制」的類比，不是 `your-legion` domain 架構的直接實作依據。PERSONA 的核心是 activation vector persona control；`your-legion` 的 domain 是 prompt/catalog 層級的 knowledge boundary。兩者精神相近，但技術層級不同。

---

## 3. Contract-based Orchestration (結構化合約驗證)

### [A Trace-Based Assurance Framework for Agentic AI Orchestration: Contracts, Testing, and Governance](https://arxiv.org/abs/2603.18096)
* **核心概念**：Message-Action Traces & Step Contracts (合約驗證與追蹤)
* **摘要 (Summary)**：
這篇 2026 年的最新論文指出，在多 Agent 編排系統中，自然語言的非結構化溝通容易導致「角色偏移 (Role Drift)」與協作失敗。論文提出為 Agent 執行過程加入「合約 (Contracts)」與「Message-Action Traces」。這對應到 `your-legion` 中的 **Task Context Envelope**、warn-only runtime validation、JSONL trace evidence，以及 `doctor` / `doctor --scenarios` 診斷面；目前尚未實作論文中的完整 governance 或 learned verdict framework。

### [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
* **核心概念**：Structured Reasoning & Context Maintenance (推理與行動結合)
* **摘要 (Summary)**：
這是 Agent 領域的基石論文。ReAct 提出讓 LLM 在「推理 (Reasoning)」與「行動 (Acting)」之間交替進行。`your-legion` 不要求或保存完整 hidden reasoning；它採用的是較窄的工程化做法：用 Task Context Envelope 明確寫出 delegation 的 objective、domain refs、domain skills、constraints 和 verification，再用 trace evidence 驗證後續是否真的讀取宣告的 domain context。
