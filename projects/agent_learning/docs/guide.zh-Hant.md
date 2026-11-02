# 有界 Agent 專案——繁體中文版

Ticket 23 的真實模型評測證據包（授權閘門、固定任務集、未測量值 null、四語種報告）位於 [`../evidence/`](../evidence/)。目前沒有真實模型呼叫，仍等待授權。

**目標：** 在不連接真實 LLM 的情況下，建立並評估一個有用的小型工具呼叫 Agent。

**執行：** `python -m projects.agent_learning.cli evaluate --fixture summarize-notes --output /tmp/agent-run.json`

**練習：** 先預測 `list_notes → read_note(alpha.txt) → read_note(beta.txt) → write_report`；執行命令；檢查每個動作與觀察；再在一次性的暫存目錄中練習 `DeterministicModelAdapter(fault="invalid_arguments")`、`fault="missing_note"` 與 `fault="loop"`。

**回饋：** `invalid_arguments` 必須可見並在重試預算內修正；`not_found` 必須安全失敗且不產生報告；`budget_exhausted` 必須在宣告的步驟上限停止。不要把程序退出碼 0 或模型文字當作評測證據。

**評量：** 獨立核對報告內容、已註冊工具與參數、步驟/重試上限、結構化失敗觀察，以及沒有隱藏推理欄位。資源限制不是作業系統沙箱保證；真實模型/供應商成功不在本專案範圍內。
