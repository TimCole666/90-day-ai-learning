# Ticket 23：実モデル Agent 評価レポート

## 判定とゲート

**結果：blocked-awaiting-authorization（承認待ちでブロック）。** モデルプロバイダ、課金 API 呼び出し、ゲート付き重みのダウンロード、外部副作用は一切使用していない。契約は計画と証拠スキーマであり、実走行の主張ではない。`live_eval_contract.json` の `null` は測定不能を表し、ゼロではない。

実呼び出しの前に、承認者は `authorization_gate.md` の実行経路、モデル識別子と固定 revision、データ条件、上限、停止動作を記録しなければならない。決定的ゲートは次の通り：

```bash
python projects/agent_learning/evidence/validate_contract.py
python projects/agent_learning/evidence/validate_contract.py --require-authorized  # 現在は意図的に失敗
```

特定の承認が得られるまで二つ目は失敗し続ける。将来の実行器もこのゲートの前に起動してはならない。

## 選定計画と固定タスク

`model_selection_plan.md` はオープン重みローカル instruct モデル（推奨）と 3 つのプロバイダ API 候補を、バージョン・アクセス・データ利用・コスト条件で比較する。あくまで提案であり、何も選定されていない。契約は `summarize-notes` フィクスチャに 6 タスクを固定する：成功、不正リクエスト 2 件（invalid_arguments と未登録ツール）、missing resource 失敗、ステップ予算枯渇、終端の誠実性。各タスクは `deterministic-v1` の対応物と期待観測を持つ。

## 証拠契約と現在の観測

指標はモデルの自己申告に依存せず独立に検査できる：フィクスチャ期待と一致する report 内容（SHA-256 記録済み）、登録ツール名のみ、ステップ/リトライ上限、構造化エラー観測と誠実な終端、タスクごとのベースライン比較、実測コスト。ベースライン値は決定的フィクスチャ由来で、すべての `live_value` は承認された実行が入れるまで `null` のままである。

現在存在するのは deterministic-v1 のフィクスチャ実行のみで、ハーネスの機構（action/observation トレース、有界ツール、リトライ、予算、安全終端）を検証する。実モデルの証拠ではない。プロバイダ、モデル ID、revision、経過時間、トークン数、タスク結果、コストは一切主張せず、全て `null` である。`simulated` と `live` の分離は検証器と `evidence_kind` ラベルで強制される。承認後は契約構成で 6 タスクを実行し、`live_results` に記録し、資格情報はリポジトリ外に置き、4 言語すべての本レポートを更新する。
