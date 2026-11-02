# Pi Agent Tool Track（日本語）

このルートでは、共通の Agent-Assisted Engineering Check を Pi で行います。Pi は拡張可能な agent harness であり、モデル提供者ではありません。公式資料と `v1.4.0`（2026-10-30）を確認しました：https://github.com/earendil-works/pi/releases/tag/v1.4.0。Node.js `>=22.19` が必要です。

## セットアップ、アクセス、費用

```sh
curl -fsSL https://pi.dev/install.sh | sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.4.0
pi --version
```

使い捨てプロジェクトで `pi` を起動し、`/login` または公式 provider 設定で承認済みの provider/model に接続します。`provider`、`model`、`model_version`、日付、予算を記録してください。このリポジトリに認証情報はなく、live provider 実行も主張しません。Pi 自体のモデル料金はなく、token、サブスクリプション、電力、ホスティング費用は provider 側です。支払いと購入には個別の承認が必要です。

## 組み込み機能と拡張

v1.4.0 の組み込み機能は、対話/print/JSON、セッションとコンテキスト、圧縮/ブランチ、モデル選択、ファイル read/write、grep、find、bash です。公式 README は sub-agent delegation と plan mode を Pi が提供しないと明記しています。これらを標準機能として説明してはいけません。extensions、skills、prompt templates、themes、packages、MCP、SDK は拡張であり、第三者コードは監査と承認が必要です。

## 課題、トラブルシューティング、回答、基準

`curriculum/projects/pi_agent/fixture` を使い、失敗テスト、対象関数、受入条件だけを渡します。書き込みは使い捨てディレクトリに限定し、ネットワーク、デプロイ、認証情報、インストールを拒否します。各変更後に `git status` と `git diff --check` を確認し、`python3 -m unittest discover -s tests` を自分で実行します。secret、削除された assertion、webhook、無関係な依存更新を拒否して復元してください。証拠は秘匿化した `run-record.json`、実際の終了コード、diff、根因の説明です。simulation は live の証拠ではありません。コマンドが見つからなければ Node/PATH、ログイン失敗なら provider/model/地域/quota、コンテキスト過大なら無関係なファイルを確認します。繰り返し失敗したら一度に一つだけ修正します。

正答は秘密漏えい、テスト削除、外部 webhook、依存関係の変更を指摘し、隔離プロジェクトを復元してテストを独立実行します。Pi の「成功しました」は証拠ではありません。Agent 協同チェックは、コンテキスト、権限、費用、diff、テスト、失敗修正、証拠が揃った場合だけ合格です。provider にアクセスできなければ blocked と記録します。独立習熟チェックでは Pi を使いません。拡張の導入、支払い、外部送信、デプロイ、隔離外の変更には個別承認が必要です。
