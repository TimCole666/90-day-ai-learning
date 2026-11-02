# ローカル再開可能小型言語モデル事前学習とチェックポイント復元 (Small-Model Pretraining & Resumption)

[English](./README.en.md) | [简体中文](./README.zh-Hans.md) | [繁體中文](./README.zh-Hant.md)

本プロジェクトは、手頃なローカル環境（一般的な CPU）上で動作する極小生成 Transformer（nanoGPT アーキテクチャ）の事前学習および評価ループを提供します。学習者はローカル環境で小型モデルの事前学習を実行し、途中で中断し、アトミックなチェックポイントから安全に復元する一連のエンジニアリング手法を習得できます。

---

## 1. 学習目標と前提条件

### 学習目標
1. **エンドツーエンドの事前学習ループ**：文字単位トークナイゼーション、決定論的なデータセット分割（90% 訓練 / 10% 検証）、自己回帰的な因果予測、交差エントロピー損失計算の習得。
2. **因果的注意機構の制約（Causal Attention Masking）**：上三角未来マスクにより、現在のトークンが未来位置の情報を参照できないことを検証（接頭辞位置のフォワード出力は未来の改変に影響されず、バックワード勾配は厳密にゼロ）。
3. **アトミックチェックポイントと安全な再開**：一時ファイル置換（`os.replace`）によるクラッシュセーフな保存。プロセスが中断されても既存チェックポイントを破損せず、モデル重み、AdamW オプティマイザの 1 次・2 次モーメント、ステップ数、乱数生成器（RNG）状態を正確に復元。
4. **互換性安全ガード**：ハイパーパラメータ（`n_embd`, `vocab_size` など）がチェックポイントと不一致の場合、即座に再開を拒否し、重みの破損を未然に防止。
5. **計算資源・パラメータ台帳**：理論式に基づき、パラメータ総数、メモリ消費量、訓練 FLOPs を精緻に算出。

### 動作環境
- Python 3.10+
- PyTorch 2.0+ (`.venv/bin/python`)
- GPU 不要（CPU のみで数秒以内にスモークテストが完了）

---

## 2. 公開コマンドラインインターフェース (CLI)

本プロジェクトは、任意の作業ディレクトリから実行可能な独立した CLI を提供します：

### 2.1 小型 CPU スモーク事前学習の実行
```bash
.venv/bin/python projects/pretrain/train.py \
  --smoke \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/smoke_pretrain \
  --max-iters 10
```
- `--smoke`: 超軽量 CPU 設定を自動適用（`n_layer=2`, `n_head=2`, `n_embd=16`, `block_size=16`, `batch_size=4`）。
- 実行完了後、`--work-dir` に `latest.pt`、`step_*.pt`、およびメタデータ `run_artifact.json` が生成されます。

### 2.2 標準的な事前学習の実行
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

### 2.3 チェックポイントからの学習再開 (Resume)
```bash
.venv/bin/python projects/pretrain/train.py \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/pretrain \
  --max-iters 2000 \
  --resume auto
```
- `--resume auto`: `--work-dir` 内の `latest.pt` を自動検出して学習をシームレスに継続（例：ステップ 1000 から 2000 まで中断なく再開）。
- `--resume <path>`: 特定のチェックポイントファイルを指定可能。

### 2.4 モデル評価とテキスト自動生成
```bash
.venv/bin/python projects/pretrain/evaluate.py \
  --checkpoint runs/smoke_pretrain/latest.pt \
  --data-path data/tinyshakespeare.txt \
  --prompt "ROMEO:" \
  --max-new-tokens 50 \
  --output-json runs/smoke_pretrain/eval_results.json
```
- 検証データ（Val split）における交差エントロピー損失およびパープレキシティ（Perplexity）を算出。
- プロンプトに続く自己回帰テキスト生成サンプルを出力。

---

## 3. パラメータ台帳とリソース試算 (Parameter Ledger)

### 3.1 理論パラメータ数計算式

語彙サイズ $V$、文脈長 $T$、埋め込み次元 $C$、アテンションヘッド数 $nh$、層数 $L$：

| モジュール構成 | 計算式 (bias=False) | 計算式 (bias=True) | スモーク設定 ($V=65, T=16, C=16, L=2$) | 標準設定 ($V=65, T=64, C=64, L=4$) |
|---|---|---|---|---|
| **単語埋め込み (wte)** | $V \times C$ | $V \times C$ | $65 \times 16 = 1,040$ | $65 \times 64 = 4,160$ |
| **位置埋め込み (wpe)** | $T \times C$ | $T \times C$ | $16 \times 16 = 256$ | $64 \times 64 = 4,096$ |
| **自己注意機構（1層）** | $C \times (3C) + C \times C$ | $C \times (3C) + 3C + C \times C + C + 2C$ | $16 \times 48 + 16 \times 16 = 1,024$ | $64 \times 192 + 64 \times 64 = 16,384$ |
| **前饋ネットワーク（1層）** | $C \times (4C) + (4C) \times C$ | $C \times (4C) + 4C + 4C \times C + C + 2C$ | $16 \times 64 + 64 \times 16 = 2,048$ | $64 \times 256 + 256 \times 64 = 32,768$ |
| **全 $L$ 層合計** | $L \times (\text{Attn} + \text{MLP})$ | 同左 | $2 \times (1,024 + 2,048) = 6,144$ | $4 \times (16,384 + 32,768) = 196,608$ |
| **最終層正規化 (ln_f)** | $0$ (affine=False) | $2 \times C$ | $0$ | $0$ |
| **出力分類ヘッド (lm_head)** | **wte と重み共有 (追加 0)** | **wte と重み共有** | $0$ (Weight Tied) | $0$ (Weight Tied) |
| **総パラメータ数 $N$** | **$\text{wte} + \text{wpe} + \text{Layers} + \text{ln\_f}$** | **同左** | **7,440** | **204,864** |

> **重み共有（Weight Tying）**：`wte.weight == lm_head.weight` により、余分な $V \times C$ 個のパラメータを削減し、入力と出力の潜在空間の整合性を担保します。

### 3.2 メモリおよび演算量 (FLOPs) の理論導出

1. **静的重みメモリ**：
   $$\text{Memory}_{\text{weights}} = N \times 4 \text{ bytes (FP32)} \quad (\text{標準設定で約 } 0.8 \text{ MB})$$
2. **AdamW 最適化メモリ**：
   1次モーメント $m$ および 2次モーメント $v$：
   $$\text{Memory}_{\text{optim}} = 2 \times N \times 4 \text{ bytes} = 8N \text{ bytes} \quad (\text{標準設定で約 } 1.6 \text{ MB})$$
3. **勾配メモリ**：
   $$\text{Memory}_{\text{grad}} = N \times 4 \text{ bytes} \quad (\approx 0.8 \text{ MB})$$
4. **ステップ当たりの計算量 (FLOPs)**：
   トークン当たり順伝播 $\approx 2N$ FLOPs、逆伝播 $\approx 4N$ FLOPs、合計 $\approx 6N$ FLOPs/token。
   バッチサイズ $B$、シーケンス長 $T$ の場合：
   $$\text{FLOPs/step} \approx 6 \times N \times B \times T$$

---

## 4. アトミックチェックポイントと再開の保証

長時間の学習におけるクラッシュや中断に耐えうる機構：
1. **アトミック保存プロトコル**：
   - チェックポイントを一時ファイル `latest.pt.tmp.<pid>` に書き込み、ディスク同期を確認後に `os.replace` で置換。
   - プロセス強制終了時でも、ディスク上の `latest.pt` が破壊されることはありません。
2. **完全な状態復元**：
   重みだけでなく、AdamW モーメント、ステップ数、検証損失、データセット検証ハッシュ、PyTorch/Python の乱数状態（RNG）を完全保存。
3. **互換性検査ガード**：
   `load_checkpoint` は現在の設定とメタデータを比較し、次元不一致時は例外を発生させ、壊れた状態のまま学習が進むのを防ぎます。

---

## 5. 実践演習と模範解答

### 演習 1: CPU スモーク学習と成果物確認
- **課題**：10 ステップのスモーク学習を実行し、`run_artifact.json` を確認する。
- **解答・基準**：`completed_steps == 10`、`total_parameters == 7440`、および `train_loss` が減少していることを確認。

### 演習 2: 中断と復元の実証
- **課題**：5 ステップ学習後に停止し、`--resume auto --max-iters 10` で再実行する。
- **解答・基準**：`Resumed successfully from step 5` と表示され、ステップ 6 から 10 まで正常に継続することを確認。

### 演習 3: ハイパーパラメータ改変防御テスト
- **課題**：`n_embd=16` で保存後、`n_embd=32` で再開を試みる。
- **解答・基準**：`Resumption rejected due to incompatible configuration` エラーで即座に終了し、ディスク上のチェックポイントが無傷であることを確認。

---

## 6. 誠実な適用範囲の開示 (Truthful Scope Disclaimer)

> **工学的・学術的注意事項**：  
> 本プロジェクトの CPU スモーク構成および短ステップ実行は、**トークナイゼーション、テンソル計算、因果注意マスク、損失降下、アトミック復元**のアルゴリズム的健全性を確認するためのものです。この短時間テストの結果は、**十分に収束した大規模言語モデルを意味するものではなく、実用的な GPU クラスタ事前学習の代替とはなりません**。
