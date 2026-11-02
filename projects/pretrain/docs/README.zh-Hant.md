# 本地可恢復小型語言模型預訓練與檢查點恢復 (Small-Model Pretraining & Resumption)

[English](./README.en.md) | [简体中文](./README.zh-Hans.md) | [日本語](./README.ja.md)

本專案提供一個可在消費級普通 CPU 上運行的極簡生成式 Transformer（nanoGPT 架構）預訓練與評估完整閉環。學員可以在本地運行小型預訓練、人為中斷、並透過原子化檢查點恢復訓練，同時掌握張量形狀台賬、記憶體與算力估算、因果注意力掩碼與數據/配置相容性校驗。

---

## 1. 核心目標與前置依賴

### 學習目標
1. **完整預訓練閉環**：掌握字元級分詞、資料集確定性劃分（90% 訓練集 / 10% 驗證集）、自迴歸因果預測與交叉熵損失計算。
2. **因果注意力約束**：驗證上三角未來掩碼保證當前 token 絕不洩露未來位置的資訊（前向 logits 不受未來微擾影響，反向梯度為零）。
3. **原子檢查點與安全恢復**：掌握基於原子替換（atomic replace）的安全檢查點保存機制，即使行程意外中斷也不會破壞既有檢查點；恢復時完整還原模型權重、AdamW 優化器一階與二階矩、全局步數與隨機數生成器（RNG）狀態。
4. **架構與數據相容性防護**：在嘗試從檢查點恢復時，若超參數（如 `n_embd`, `vocab_size`）與保存的狀態不符，立即拒絕並報錯，絕不靜默損壞權重。
5. **算力與資源台賬**：透過理論公式精確核算模型參數量、顯存/記憶體佔用與訓練 FLOPs。

### 運行環境
- Python 3.10+
- PyTorch 2.0+ (`.venv/bin/python`)
- 零 GPU 依賴（可在純 CPU 上數秒內完成冒煙測試）

---

## 2. 公共命令列介面 (CLI Interface)

本專案提供獨立解耦的訓練與評估命令列入口，可從任意工作目錄調用：

### 2.1 啟動小型 CPU 冒煙預訓練
```bash
.venv/bin/python projects/pretrain/train.py \
  --smoke \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/smoke_pretrain \
  --max-iters 10
```
- `--smoke`：自動配置輕量級 CPU 冒煙參數（`n_layer=2`, `n_head=2`, `n_embd=16`, `block_size=16`, `batch_size=4`）。
- 運行完畢後，將在 `--work-dir` 生成 `latest.pt`、`step_*.pt` 以及結構化元數據 `run_artifact.json`。

### 2.2 啟動標準預訓練
```bash
.venv/bin/python projects/pretrain/train.py \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/pretrain \
  --block-size 64 \
  --n-layer 4 \
  --n-head 4 \
  --n-embd 64 \
  --batch-size 32 \
  --max-iters 1000 \
  --eval-interval 200 \
  --checkpoint-interval 200
```

### 2.3 中斷後恢復訓練 (Resume from Checkpoint)
```bash
.venv/bin/python projects/pretrain/train.py \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/pretrain \
  --max-iters 2000 \
  --resume auto
```
- `--resume auto`：自動尋找 `--work-dir` 下的 `latest.pt` 檢查點並接續訓練（如從第 1000 步平滑繼續訓練至第 2000 步）。
- `--resume <path>`：指定特定檢查點路徑。

### 2.4 模型評估與文本採樣生成
```bash
.venv/bin/python projects/pretrain/evaluate.py \
  --checkpoint runs/smoke_pretrain/latest.pt \
  --data-path data/tinyshakespeare.txt \
  --prompt "ROMEO:" \
  --max-new-tokens 50 \
  --output-json runs/smoke_pretrain/eval_results.json
```
- 計算留出驗證集（Val split）交叉熵損失與字元級困惑度（Perplexity）。
- 自迴歸採樣續寫文本並列印展示。

---

## 3. 張量形狀與參數量台賬 (Parameter & Resource Ledger)

### 3.1 理論參數量精確公式

設詞表大小 $V$，上下文長度 $T$，隱藏嵌入維度 $C$，注意力頭數 $nh$（單頭維度 $hs = C / nh$），網路層數 $L$：

| 模組組件 | 計算公式 (bias=False) | 計算公式 (bias=True) | 冒煙配置 ($V=65, T=16, C=16, L=2$) | 標準配置 ($V=65, T=64, C=64, L=4$) |
|---|---|---|---|---|
| **詞向量矩陣 (wte)** | $V \times C$ | $V \times C$ | $65 \times 16 = 1,040$ | $65 \times 64 = 4,160$ |
| **位置編碼 (wpe)** | $T \times C$ | $T \times C$ | $16 \times 16 = 256$ | $64 \times 64 = 4,096$ |
| **單層自注意力 (Attn)** | $C \times (3C) + C \times C$ | $C \times (3C) + 3C + C \times C + C + 2C$ | $16 \times 48 + 16 \times 16 = 1,024$ | $64 \times 192 + 64 \times 64 = 16,384$ |
| **單層前饋網路 (MLP)** | $C \times (4C) + (4C) \times C$ | $C \times (4C) + 4C + 4C \times C + C + 2C$ | $16 \times 64 + 64 \times 16 = 2,048$ | $64 \times 256 + 256 \times 64 = 32,768$ |
| **全部 $L$ 層合計** | $L \times (\text{Attn} + \text{MLP})$ | 同左 | $2 \times (1,024 + 2,048) = 6,144$ | $4 \times (16,384 + 32,768) = 196,608$ |
| **最終層歸一化 (ln_f)** | $0$ (無偏置與縮放) | $2 \times C$ | $0$ | $0$ |
| **輸出分類頭 (lm_head)** | **與 wte 共享權重 (0 額外參數)** | **與 wte 共享權重** | $0$ (Weight Tied) | $0$ (Weight Tied) |
| **模型總參數量 $N$** | **$\text{wte} + \text{wpe} + \text{Layers} + \text{ln\_f}$** | **同左** | **7,440** | **204,864** |

> **關鍵設計**：`wte.weight == lm_head.weight`。權重綁定（Weight Tying）直接節省了 $V \times C$ 的獨立參數量，不僅減輕記憶體壓力，還利於詞向量空間在輸入與輸出層間保持表徵一致性。

### 3.2 記憶體與算力消耗理論推導

1. **靜態模型權重記憶體**：
   $$\text{Memory}_{\text{weights}} = N \times 4 \text{ bytes (FP32)} \quad (\text{標準配置約 } 0.8 \text{ MB})$$
2. **AdamW 優化器記憶體**：
   維護一階矩 $m$ 與二階矩 $v$：
   $$\text{Memory}_{\text{optim}} = 2 \times N \times 4 \text{ bytes} = 8N \text{ bytes} \quad (\text{標準配置約 } 1.6 \text{ MB})$$
3. **梯度記憶體**：
   $$\text{Memory}_{\text{grad}} = N \times 4 \text{ bytes} \quad (\text{標準配置約 } 0.8 \text{ MB})$$
4. **單步浮點運算量 (FLOPs)**：
   每個 token 的前向傳播約為 $2N$ FLOPs，反向傳播約為 $4N$ FLOPs，合計單 token 每次更新消耗 $\approx 6N$ FLOPs。
   每個批次（Batch Size $B$, 序列長度 $T$）單步訓練消耗：
   $$\text{FLOPs/step} \approx 6 \times N \times B \times T$$

---

## 4. 原子檢查點與恢復機制

在長週期預訓練中，機器斷電、系統搶佔或行程被殺是常見故障。本專案採用兩層保護機制：
1. **原子保存（Atomic Save via PID Tempfile & Replace）**：
   - 檢查點先寫入同目錄下的臨時檔案 `latest.pt.tmp.<pid>`。
   - 寫入並同步落盤後，透過作業系統底層的原子檔案重命名操作（`os.replace`）將其替換為 `latest.pt`。
   - 若寫入過程中遭遇 `SIGKILL`，磁碟上原本的 `latest.pt` 毫髮無損，絕對不會產生 0 位元組損壞檔案。
2. **狀態完整性恢復**：
   檢查點不僅保存模型參數，還完整保存：
   - 全局步數 `step`
   - 當前損失 `loss`
   - 超參數配置 `config_dict`
   - 資料集詞表與資料校驗雜湊 `data_hash`
   - PyTorch CPU/CUDA 與 Python `random` 模組的 RNG 狀態
3. **架構與數據相容性防護**：
   載入檢查點時，嚴格比對當前訓練配置與檢查點元數據。若發現 `n_embd`、`vocab_size` 或 `block_size` 衝突，立即拋出明確異常中止，杜絕載入錯誤權重引發靜默發散。

---

## 5. 動手實戰練習與參考答案

### 練習 1：啟動 CPU 冒煙測試並檢查運行產物
- **任務**：運行 10 步 CPU 冒煙預訓練，檢查生成的 `runs/smoke_pretrain/run_artifact.json`。
- **驗證**：確認 `completed_steps == 10`，`parameter_ledger.total_parameters == 7440`，且 `train_loss` 呈下降趨勢。

### 練習 2：斷點恢復實戰
- **任務**：
  1. 運行預訓練至第 5 步（`--max-iters 5`）。
  2. 模擬行程終止後，重新運行並加入 `--resume auto --max-iters 10`。
- **驗證**：觀察終端輸出確認顯示 `Resumed successfully from step 5`，並且第 6 步至第 10 步平滑接續，步數未回滾。

### 練習 3：超參數篡改防禦測試
- **任務**：以 `n_embd=16` 保存檢查點後，嘗試以 `n_embd=32` 和 `--resume auto` 啟動恢復。
- **預期反饋**：程式必須立即報錯退出，並明確列印出：
  `Resumption rejected due to incompatible configuration: field 'n_embd': expected 32, got 16`
  同時檢查磁碟上的原始 `latest.pt` 檢查點未受任何更改。

---

## 6. 誠實範圍聲明 (Truthful Scope Disclaimer)

> **重要學術與工程聲明**：  
> 本專案的 CPU 冒煙配置與短步數測試是用於驗證**分詞機制、張量維度流轉、因果自注意力掩碼、交叉熵損失下降以及原子檢查點恢復機制**的演算法與工程正確性。短步數冒煙測試產生的結果**絕不等於收斂的大語言模型，也不能替代真實的多卡 GPU 集群預訓練**。
