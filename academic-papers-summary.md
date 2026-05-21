# 學術論文參考整理：Agent 架構與 Context Routing

這份文件整理了前面討論到的核心論文，涵蓋了「動態語意工具路由 (Description-driven Routing)」、「動態角色與脈絡注入 (Context-injected Subagents)」，以及「基於合約的智能體編排 (Contract-based Orchestration)」。

## 1. Description-driven Routing (動態上下文檢索與工具路由)

### [Gorilla: Large Language Model Connected with Massive APIs](https://arxiv.org/abs/2305.15334)
* **核心概念**：Semantic Tool Retrieval (語意工具檢索)
* **摘要 (Summary)**：
這篇來自 UC Berkeley 的論文探討了當系統面對成百上千個外部 API（或領域能力）時，硬編碼或手寫規則是無法擴展的。Gorilla 提出讓 LLM 結合 Document Retriever，動態「閱讀」API 的文件說明（類似 `your-legion` 讀取 `DOMAIN.md`）。只要給予正確的描述文件，LLM 就能精準判斷是否調用該工具，同時大幅降低幻覺 (Hallucination) 並提升適應性。

### [Tool-Augmented Reward Modeling (Themis)](https://arxiv.org/abs/2310.01045)
* **核心概念**：Dynamic Reasoning to Tools (動態推理調用)
* **摘要 (Summary)**：
這篇論文指出傳統依賴靜態內部表徵的模型容易受限。研究提出透過讓模型進行「動態推理 (Dynamic Reasoning)」，使其能夠根據高階的計畫與外部工具進行互動。這印證了讓 Agent 自己評估需求，再決定要載入哪些外部資訊或能力，比起寫死的判斷邏輯更為優越。

* **對 `your-legion` 的定位**：
目前 `your-legion` 只落地了 deterministic runtime checks 和 trace evidence，尚未實作 Themis 式 reward model 或 evaluator。這篇適合作為未來「用 trace + domain refs + output quality 做評估」的延伸參考，不應宣稱目前已完整實作。

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
這篇 2026 年的最新論文指出，在多 Agent 編排系統中，自然語言的非結構化溝通容易導致「角色偏移 (Role Drift)」與協作失敗。論文提出為 Agent 執行過程加入「合約 (Contracts)」與「Message-Action Traces」。每一次交辦任務，都有明確的邊界條件，並由系統進行機器驗證 (Machine-checkable verdicts)。這完全對應了 `your-legion` 中嚴格的 **Task Context Envelope** 與 Runtime Validation 設計。

### [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
* **核心概念**：Structured Reasoning & Context Maintenance (推理與行動結合)
* **摘要 (Summary)**：
這是 Agent 領域的基石論文。ReAct 提出讓 LLM 在「推理 (Reasoning)」與「行動 (Acting)」之間交替進行。其核心目的之一，就是在面對複雜任務時，透過明確輸出思考過程與行動計畫，來避免 Context Drift（脈絡偏移）。這為後續需要嚴格狀態定義（如 Task Envelope）的 Agent 架構奠定了理論基礎。
