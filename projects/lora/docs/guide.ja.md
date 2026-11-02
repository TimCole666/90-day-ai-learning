# 実オープンモデルの LoRA プロジェクト

Ticket 21 の証拠パッケージ（承認ゲート、権利、上限、null の未測定値、4 言語レポート）は [`../evidence/`](../evidence/) にあります。現在はクラウド実行なし・承認待ちです。

このプロジェクトには明確に異なる 2 つの実行モードがあります。`--smoke` はランダム重みの小さな Transformer をローカルに構築し、決定的な CPU LoRA 学習、adapter の保存と再読込を行います。ダウンロードはありません。検証するのは仕組みだけです。実モデルモードでは Hugging Face の因果言語モデルと PEFT を使用します。例として `openai-community/gpt2` を示します（モデルカード：https://huggingface.co/openai-community/gpt2、公開者が MIT ライセンスを表示）。実行前に最新のモデルカードとアクセス条件を確認してください。付属の指示例は独自に作成した合成練習データです。ベンチマークではなく、品質向上の主張にも使用できません。

## 環境

Python 3.10+、PyTorch 2.2+、Transformers 4.46.3、PEFT 0.13.2 が必要です。smoke モードはリポジトリ既存の PyTorch 環境を使用します。実モデルの実行時のみ `projects/lora/requirements.txt` をインストールしてください。GPU は任意です。例のモデルは数百 MB のダウンロードとネットワーク接続を必要とし、CPU 学習は遅い場合があります。コマンドはクラウド事業者、課金 GPU、外部への変更を必要とせず、それらの利用も許可していません。モデルのダウンロードにはローカルストレージを使用します。キャッシュ済みモデルだけを使うには `--local-files-only` を指定します。

## ローカル smoke の再現

```bash
.venv/bin/python projects/lora/train.py --smoke \
  --data-path data/instruction_sample.jsonl --work-dir runs/lora-smoke \
  --seed 42 --max-iters 4 --max-length 96
.venv/bin/python projects/lora/evaluate.py \
  --adapter-dir runs/lora-smoke --data-path data/instruction_sample.jsonl \
  --output-json runs/lora-smoke/eval_results.json
```

`adapter_model.pt`、`adapter_config.json`、`base_model.pt`、`tokenizer.json`、`run_artifact.json`、`telemetry.jsonl`（最適化ステップごとに1行のJSON：`step`、`train_loss`、`lr`、`elapsed_seconds`、`mode`。実行中のジョブは `tail -f` で追跡でき、`--resume` は追記します）が生成されます。artifact は `smoke: true`、ダウンロードなし、ランダムなローカル基底重みを記録し、`adapter_round_trip_verified: true` を必須とします。評価は保留データの損失/perplexity と生成例を出力します。小規模な結果をモデル品質と解釈しないでください。

## 実オープンモデルの adapter 学習

最初にモデルカードと利用可能なディスク/RAM/VRAM を確認し、実行ごとに新しい出力ディレクトリを使います。

```bash
.venv/bin/python -m pip install -r projects/lora/requirements.txt
.venv/bin/python projects/lora/train.py \
  --model openai-community/gpt2 --revision <確認済みのコミットハッシュ> \
  --data-path data/instruction_sample.jsonl --work-dir runs/gpt2-lora \
  --device cpu --max-iters 10 --batch-size 1 --max-length 128 --seed 42
.venv/bin/python projects/lora/evaluate.py \
  --adapter-dir runs/gpt2-lora --data-path data/instruction_sample.jsonl \
  --model openai-community/gpt2 --revision <同じ確認済みのコミットハッシュ> \
  --device cpu --output-json runs/gpt2-lora/eval_results.json
```

プレースホルダーは確認した revision に置き換えてください。省略も可能ですが、モデルの参照先が変化します。`--local-files-only` は提供元からのダウンロードを禁止します。学習では基底モデルを凍結し、PEFT adapter のみを更新します。artifact にはモデル/revision、データハッシュ、分割件数、seed、rank/scale、パラメータ台帳、損失、ダウンロード方針が記録されます。評価時には adapter を読み直し、決定的に分割した独立テストデータで基底/適応後の損失を比較します。10 件未満ではテスト分割が空になる場合があり、その際は検証/学習データを流用せず評価を失敗させます。結果が悪化することもあります。正直に報告してください。実モデル学習の再開には未対応です。このモードの `--resume` は拒否されます。失敗後は新しい作業ディレクトリを使います。

## 数学とパラメータ計算

凍結基底行列 $W_0 \in \mathbb{R}^{d_{out}\times d_{in}}$ に対し、LoRA は $A \in \mathbb{R}^{r\times d_{in}}$ と $B \in \mathbb{R}^{d_{out}\times r}$ を学習します。

$$W = W_0 + (\alpha/r)BA.$$

対象の線形層ごとに追加される adapter パラメータは $r(d_{in}+d_{out})$ 個であり、$d_{out}d_{in}$ 個すべてを学習する場合より少なくなります。GPT-2 の注意投影名は `q_proj`/`v_proj` を使うアーキテクチャと異なることがあります。モデルのモジュールを確認し、必要なら `--target-modules` を指定してください。台帳には実数が記録されますが、optimizer 状態や activation もメモリを消費するため、adapter のパラメータ数は実行時メモリ全体を表しません。

バッチの `input_ids`、`attention_mask`、`labels` の形状は `[batch, sequence]` です。prompt に対応する label は `-100` とし、因果言語モデルの損失対象を回答 token のみにします。決定的な分割はテキスト/データプロジェクトと共通の処理を用い、レコードハッシュと seed で識別します。

## 課題とフィードバック

1. 同じ seed で smoke を 2 回実行し、データハッシュ、指標、adapter の往復検証を比較します。タイムスタンプやシリアライズメタデータは異なる場合があります。同じ PyTorch 環境なら予測と指標は一致するはずです。smoke は Transformers、PEFT、ネットワークにアクセスしません。
2. 入力幅 768、出力幅 2304、rank 8 の線形層について adapter 数を計算します。$8(768+2304)=24,576$ 個です。基底行列の $768\cdot2304=1,769,472$ 個と比べると約 1.39% です。bias や他層は含みません。
3. トークン化した例の label を確認します。prompt 部分はすべて `-100`、回答には少なくとも 1 個の token が必要です。切り詰めで回答がなくなる場合、`--max-length` を増やします。
4. 評価の `held_out_samples`、`data_hash`、分割件数を比較します。テスト分割がない場合はエラーであり、学習例を流用してよいという意味ではありません。
5. 失敗や損失悪化を、都合のよい生成例を選ばずに説明します。基準値、データ量、対象モジュール、最適化ステップ、独立評価を確認します。改善率の必須値はありません。

解答：課題 1-2 は上記の再現性条件と行列サイズの式で確認できます。課題 3 では prompt label が mask され、回答 label は token ID です。回答 label が 0 件なら明確な検証エラーになります。課題 4 では異なるレコードを最低 10 件用い、既定の 80/10/10 分割を使います。課題 5 は観測値と制限を報告し、生成例だけで成功を主張しません。

受け入れ範囲：テストは決定的なローカルデータで公開コマンドを実行します。リモートモデルがダウンロードされたこと、すべての用途でライセンスが適用可能なこと、特定環境で費用が許容範囲であること、微調整で品質が向上することは証明しません。別途承認なく有料計算資源を使用しないでください。
