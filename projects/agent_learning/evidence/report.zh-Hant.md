# Ticket 23：真實模型 Agent 評測報告

## 判定與閘門

**結果：blocked-awaiting-authorization（等待授權，暫時阻塞）。** 未使用任何模型供應商、付費 API 呼叫、需授權門控權重下載或外部副作用。本契約是計畫與證據格式，不是實際執行聲明。`live_eval_contract.json` 中的 `null` 表示沒有可用測量，不表示零。

任何真實呼叫之前，批准人必須按 `authorization_gate.md` 記錄執行路徑、模型識別與固定 revision、資料條件、上限與停止行為。確定性閘門為：

```bash
python projects/agent_learning/evidence/validate_contract.py
python projects/agent_learning/evidence/validate_contract.py --require-authorized  # 目前按預期失敗
```

在取得具體批准前，第二條命令必須失敗，未來執行器也必須在閘門前拒絕啟動。

## 選定計畫與固定任務集

`model_selection_plan.md` 以版本、存取、資料使用與成本條件比較了一個開放權重本地 instruct 模型（推薦）與三個供應商 API 候選；它只是提案，未選定任何模型。契約在 `summarize-notes` 固定裝置上固定六個任務：一個成功任務、兩個畸形請求任務（invalid_arguments 與未註冊工具）、一個缺失資源失敗、一個步驟預算耗盡、一個終止誠實性任務。每個任務都標註 `deterministic-v1` 對應物與可檢查的預期觀測。

## 證據契約與當前觀測

指標可獨立核查，不依賴模型自述：report 內容與固定裝置期望一致（已記錄 SHA-256）、僅出現已註冊工具名、步驟/重試上限、結構化錯誤觀測與誠實的終止、逐任務基線對比、實測成本。基線值來自確定性固定裝置；所有 `live_value` 在授權執行填入前保持 `null`。

目前只存在 deterministic-v1 固定裝置執行，只驗證執行機制（action/observation 軌跡、有界工具、重試、預算、安全終止），不是真實模型證據。不聲稱任何供應商、模型 ID、revision、耗時、token 數、任務結果或成本，這些欄位全為 `null`。`simulated` 與 `live` 的分離由驗證器與 `evidence_kind` 標籤強制保證。授權後按契約設定跑完六個任務，寫入 `live_results`，憑證留在儲存庫外，並同步更新全部四語種報告。
