# 使用真实開放模型進行 LoRA 微調

Ticket 21 的證據包（授權閘門、權利、上限、未測量值 null、四語言報告）位於 [`../evidence/`](../evidence/)。目前沒有雲端執行，仍等待授權。

本專案明確區分兩種執行模式。`--smoke` 在本機建立隨機權重的小型 Transformer，以確定性的 CPU LoRA 訓練、儲存並重新載入 adapter，不會下載任何內容；它只驗證機制。真實模式使用 Hugging Face 因果語言模型與 PEFT。範例模型為 `openai-community/gpt2`（模型卡：https://huggingface.co/openai-community/gpt2，發布者標示 MIT 授權）。執行前請檢查最新模型卡及存取條款。附帶的指令範例是原創合成練習資料，並非基準，不可據此宣稱品質提升。

## 環境

需要 Python 3.10+、PyTorch 2.2+、Transformers 4.46.3、PEFT 0.13.2。冒煙模式沿用儲存庫現有 PyTorch 環境；只有真實模型執行才安裝 `projects/lora/requirements.txt`。GPU 為選用。範例模型下載數百 MB，需要網路；CPU 訓練可能較慢。命令不需要雲端服務商、付費 GPU 或外部變更，也未獲准進行這些操作。模型下載會佔用本機儲存空間。使用 `--local-files-only` 可強制只用快取模型。

## 重現本機冒煙測試

```bash
.venv/bin/python projects/lora/train.py --smoke \
  --data-path data/instruction_sample.jsonl --work-dir runs/lora-smoke \
  --seed 42 --max-iters 4 --max-length 96
.venv/bin/python projects/lora/evaluate.py \
  --adapter-dir runs/lora-smoke --data-path data/instruction_sample.jsonl \
  --output-json runs/lora-smoke/eval_results.json
```

預期檔案包括 `adapter_model.pt`、`adapter_config.json`、`base_model.pt`、`tokenizer.json`、`run_artifact.json` 和 `telemetry.jsonl`（每個最佳化步驟一行 JSON：`step`、`train_loss`、`lr`、`elapsed_seconds`、`mode`；可用 `tail -f` 追蹤執行中的訓練；`--resume` 會追加）。中繼資料標記 `smoke: true`、零下載、隨機本機基座，並要求 `adapter_round_trip_verified: true`。評估會報告留出集損失/困惑度及生成範例；微小結果不代表模型品質。

## 訓練真實開放模型 adapter

先檢查模型卡及可用磁碟、記憶體和顯示記憶體。每次執行使用新的輸出目錄。

```bash
.venv/bin/python -m pip install -r projects/lora/requirements.txt
.venv/bin/python projects/lora/train.py \
  --model openai-community/gpt2 --revision <已審閱的提交雜湊> \
  --data-path data/instruction_sample.jsonl --work-dir runs/gpt2-lora \
  --device cpu --max-iters 10 --batch-size 1 --max-length 128 --seed 42
.venv/bin/python projects/lora/evaluate.py \
  --adapter-dir runs/gpt2-lora --data-path data/instruction_sample.jsonl \
  --model openai-community/gpt2 --revision <相同的已審閱提交雜湊> \
  --device cpu --output-json runs/gpt2-lora/eval_results.json
```

將佔位值換成已檢查的修訂版本；省略 `--revision` 雖可執行，但模型來源會變動。`--local-files-only` 禁止提供者下載。訓練會凍結基座，只訓練 PEFT adapter；執行中繼資料記錄模型/修訂版、資料雜湊、切分數量、隨機種子、秩/縮放、參數台帳、損失及下載策略。評估會重新載入 adapter，並在確定性的獨立測試集上比較基座與適配模型的損失。少於十筆資料時可能沒有測試集，評估會失敗，不會洩漏驗證或訓練資料。結果可能變差，應如實報告。真實訓練尚不支援恢復；該模式使用 `--resume` 會被拒絕。失敗後請改用新的工作目錄。

## 數學與參數核算

凍結基座矩陣 $W_0 \in \mathbb{R}^{d_{out}\times d_{in}}$，LoRA 學習 $A \in \mathbb{R}^{r\times d_{in}}$ 與 $B \in \mathbb{R}^{d_{out}\times r}$：

$$W = W_0 + (\alpha/r)BA.$$

每個目標線性層新增 $r(d_{in}+d_{out})$ 個 adapter 參數，而不是訓練 $d_{out}d_{in}$ 個參數。GPT-2 的注意力投影名稱可能不同於含有 `q_proj`/`v_proj` 的架構；請檢查模型模組，必要時使用 `--target-modules` 指定。參數台帳提供實際數量；最佳化器狀態和啟動值仍佔用記憶體，因此 adapter 參數量不等於執行總記憶體。

批次中的 `input_ids`、`attention_mask`、`labels` 形狀為 `[batch, sequence]`。提示文字的標籤設為 `-100`，因果語言模型損失只訓練回答 token。確定性切分沿用文字/資料專案邏輯，並以記錄雜湊與種子識別。

## 練習與回饋

1. 使用相同種子執行兩次冒煙訓練，比較中繼資料中的資料雜湊、指標及 adapter 往返校驗。時間戳與序列化中繼資料可能不同；相同 PyTorch 環境中的預測與指標應一致。冒煙模式不會存取 Transformers、PEFT 或網路。
2. 計算輸入寬 768、輸出寬 2304、秩 8 的線性層 adapter 參數數：$8(768+2304)=24,576$。與基座矩陣的 $768\cdot2304=1,769,472$ 個參數比較，比例約 1.39%；不含偏差及模型其他層。
3. 檢查一筆分詞範例的標籤：所有提示位置必須為 `-100`，且至少保留一個回答 token。若截斷移除了整個回答，請增加 `--max-length`。
4. 比較評估的 `held_out_samples`、`data_hash` 和切分數量。缺少測試集是錯誤，不代表可以重用訓練樣本。
5. 不挑選範例解釋失敗或損失變差：檢查基線、資料量、目標模組、最佳化步數及獨立評估。沒有規定必須提升。

答案：練習 1-2 依照上述可重複性要求及矩陣維度公式核對。練習 3 中提示標籤會被遮罩，回答標籤則是 token ID；回答標籤為零時會觸發明確驗證錯誤。練習 4 使用至少十筆不同記錄及預設 80/10/10 切分。練習 5 報告觀測值與限制；不能只憑生成範例宣稱成功。

驗收邊界：測試以確定性的本機資料執行公開命令。測試不證明遠端模型已下載、授權適用於所有用途、特定裝置能負擔訓練，或微調必然改善效果。未獲個別授權不得使用付費算力。
