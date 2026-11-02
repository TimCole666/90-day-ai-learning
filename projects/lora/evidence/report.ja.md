# Ticket 21：承認済みクラウド GPU LoRA 比較

## 判定とゲート

**結果：承認待ちでブロック。** この作業ではクラウド事業者、課金 GPU、アカウント、購入、外部変更を使用していない。この契約は計画と証拠のスキーマであり、クラウド実行の主張ではない。`comparison_contract.json` の `null` は測定不能を表し、ゼロではない。

課金実行の前に、承認者は事業者、モデルの固定 revision、モデルとデータの権利確認、GPU・実行時間・保存容量の見積り、USD 上限、チェックポイント方針、停止条件を記録しなければならない。

```bash
python projects/lora/evidence/validate_contract.py
python projects/lora/evidence/validate_contract.py --require-authorized  # 現在は意図的に失敗
```

特定の承認が得られるまで二つ目は失敗し続ける。将来の実行器もこのゲートの前に起動してはならない。

## 比較計画と証拠

対象は既存の `projects/lora/train.py` と `evaluate.py` の実モデル経路である。候補モデルは確認済み immutable revision の `openai-community/gpt2`（revision は未選定）、データはリポジトリの合成 instruction JSONL である。seed 42、決定的 80/10/10 分割、rank 8、alpha 16、dropout .05、`q_proj,v_proj`、10 step、batch 1、長さ 128、CUDA を固定する。1 GPU・30 分・永続 8 GiB・総額 USD 5 を上限とし、価格は実行時に確認する。

評価は同じ固定 base と tokenizer、prompt 形式、独立 test 分割で、adapter 前後の loss、perplexity、件数、生成例を比較する。base の凍結、adapter gradient/update、reload、失敗時の checkpoint と sanitized failure fields を記録する。改善は測定前に主張しない。

## 現在の観測と限界

既存成果物は CPU 上のランダム重み smoke 実行であり、prompt を `-100` で mask したラベルで学習し、base 凍結、adapter 勾配、再読込、merge だけを確認する（失敗すれば実行は停止する）。mask 自体は `tests/unit/test_lora.py` と `tests/unit/test_lora_bos_prompt_mask.py` で検証し、成果物には記録されない。事前学習モデルの品質、GPU、クラウド費用の証拠ではない。クラウド実行を試みていないため、GPU 名、メモリ、時間、保存容量、費用は null であり、改善・悪化も主張しない。承認後は英語ガイドの公開コマンドを使い、revision を両コマンドで固定する。
