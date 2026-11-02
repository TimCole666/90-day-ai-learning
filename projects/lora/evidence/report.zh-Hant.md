# Ticket 21：已授權雲端 GPU LoRA 比較

## 判定與閘門

**結果：等待授權，暫時阻塞。** 本工作區沒有使用雲端服務商、付費 GPU、帳戶、購買或外部變更。此契約是計畫與證據格式，不是雲端執行聲明。`comparison_contract.json` 中的 `null` 表示沒有可用測量，不表示零。

付費執行前，批准人必須記錄服務商、固定模型 revision、模型與資料權利審查、GPU/執行時間/儲存估算、美元上限、檢查點策略與停止條件。驗證器如下：

```bash
python projects/lora/evidence/validate_contract.py
python projects/lora/evidence/validate_contract.py --require-authorized  # 目前按預期失敗
```

在取得具體批准前，第二條命令必須失敗，未來執行器也必須在閘門前拒絕啟動。

## 比較計畫與證據

測試對象是現有 `projects/lora/train.py` 和 `evaluate.py` 的真實模型路徑。候選基礎模型是經過檢查的 immutable revision `openai-community/gpt2`（revision 尚未選擇），資料是儲存庫中的合成 instruction JSONL。固定 seed 42、確定性 80/10/10 切分、rank 8、alpha 16、dropout .05、`q_proj,v_proj`、10 步、batch 1、長度 128 和 CUDA。上限為一張 GPU、30 分鐘、8 GiB 持久儲存與總計 5 美元，價格須在執行時重新確認。

在同一個固定基礎模型、tokenizer、prompt 格式與獨立 test 切分上，比較 adapter 前後的 loss、perplexity、樣本數與生成範例。記錄基礎參數凍結、adapter 梯度與更新、reload，以及失敗時的檢查點和脫敏失敗欄位。沒有測量前不得聲稱改進。

## 目前觀測與限制

現有工件是 CPU 隨機權重 smoke 執行，以提示文字標為 `-100` 的標籤訓練，執行只檢查基座凍結、adapter 梯度、重新載入與 merge（任一失敗即中止）；mask 本身由 `tests/unit/test_lora.py` 與 `tests/unit/test_lora_bos_prompt_mask.py` 測試，不記錄於工件中。它不是真正預訓練模型品質、GPU 或雲端成本證據。沒有嘗試雲端執行，所以 GPU 名稱、顯存、時間、儲存與費用均為 null；不聲稱改進或回歸。授權後應使用英文指南中的公開命令，並在兩條命令中固定相同 revision。
