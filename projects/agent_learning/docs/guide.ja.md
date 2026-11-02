# 制限付き Agent プロジェクト — 日本語版

Ticket 23 の実モデル評価証拠パッケージ（承認ゲート、固定タスク、null の未測定値、4 言語レポート）は [`../evidence/`](../evidence/) にあります。現在は実モデル呼び出しなし・承認待ちです。

**目標：** 実際の LLM に接続せず、有用な小さなツール利用 Agent を構築・評価する。

**実行：** `python -m projects.agent_learning.cli evaluate --fixture summarize-notes --output /tmp/agent-run.json`

**練習：** `list_notes → read_note(alpha.txt) → read_note(beta.txt) → write_report` の計画を先に予測する。実行後、各 action と observation を確認し、使い捨て一時ディレクトリで `DeterministicModelAdapter(fault="invalid_arguments")`、`fault="missing_note"`、`fault="loop"` を試す。

**フィードバック：** `invalid_arguments` は観測でき、再試行予算内に修正される。`not_found` は安全に失敗し、レポートを作らない。`budget_exhausted` は宣言したステップ上限で停止する。終了コード 0 やモデルの文章だけを評価証拠にしない。

**評価：** レポート内容、登録済みツールと引数、ステップ/再試行上限、構造化された失敗観測、隠れた推論欄がないことを独立に確認する。リソース制限は OS サンドボックスの保証ではない。実モデル/プロバイダの成功は範囲外である。
