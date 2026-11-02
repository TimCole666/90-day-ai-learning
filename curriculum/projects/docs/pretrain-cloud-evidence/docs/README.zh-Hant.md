# Ticket 19：經授權的雲端 GPU 預訓練證據

這是現有可恢復小模型專案 `projects/pretrain` 的雲端延伸。目前交付物是**已準備但受阻的證據包**，不是雲端執行聲明。`evidence-package.json` 刻意將 provider、GPU、耗時、指標和花費保留為 `null`。

## 付費前審批閘門

在人工明確批准 provider、區域、GPU 型號、模型/資料/執行環境假設、25 美元上限和停止行為前，不得租用 GPU、上傳資料或建立付費儲存。審批請求位於 `approval_gate.request_text`；批准必須包含範圍、批准人與時間。憑證、帳戶 ID、資源 ID 和私有 provider 頁面不得進入倉庫。

方案是 `cloud-run-config.json` 的四層、四頭、64 維模型，資料為 `tinyshakespeare.txt`（已記錄雜湊），Python >=3.10、PyTorch >=2.0，並在啟動前記錄確切 CUDA/驅動版本。理論估算為 2 GPU 小時和 5 GB-日儲存；provider 報價、配額、稅費、最低計費和帳單延遲必須先核實。不假設免費配額，也不保證 provider 能強制硬上限。

## 授權執行與恢復

批准後，在私有執行日誌記錄 git、設定/資料雜湊、映像摘要、CUDA/驅動版本與 GPU 身份。按證據包中的 provider 命令執行；達到上限、健康檢查失敗或計畫結束時停止/釋放計算。僅在獲得授權時保留儲存，並報告後續儲存費用；破壞性刪除需另外確認。

在檢查點（例如 step 200）後中斷，不要刪除 `latest.pt`，再用 `--resume auto` 恢復至同一目標。用獨立程序執行 `evaluate.py` 評估留出集。報告必須包含中斷/恢復步數、獨立 loss/perplexity、失敗案例、耗時、GPU 身份與實際帳單快照。

## 證據紀律

理論值來自設定與 provider 報價；測量值只能來自授權執行。不得把 CPU 冒煙測試、合成日誌或價格網頁填入測量欄位。

```sh
PYTHONPATH=. python3 -m unittest discover -s tests/unit -p 'test_cloud_evidence.py'
```

此確定性測試只驗證中繼資料契約，不是雲端或 GPU 證據。在取得批准並完成真實執行前，Ticket 19 的實際執行驗收仍未完成。
