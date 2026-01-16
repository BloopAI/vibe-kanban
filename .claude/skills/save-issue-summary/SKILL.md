---
name: save-issue-summary
description: 課題整理の結果を docs/records/issue-records/YYYY-MM-DD/ に保存する。task-organizerエージェントで使用。
---

# 課題整理ドキュメント保存

<context>
課題整理セッションの結果をドキュメントとして保存する。
日付ごとにフォルダを作成し、整理結果を記録する。
</context>

## いつ使うか

- 課題整理セッションの最後
- 「保存して」「記録して」「ドキュメント化して」と言われた時
- 複数の課題を整理した後

## いつ使わないか

- 単発のIssue作成のみの場合
- まだ整理が完了していない

---

## 保存先

```
docs/records/issue-records/YYYY-MM-DD/
  +-- 課題整理.md          <- サマリー・整理結果
  +-- 全項目ステータス.md    <- 全フィードバック項目のステータス表
```

---

## フロー

<steps>
1. 日付フォルダを作成（なければ）
2. 課題整理.md を作成/更新
3. 全項目ステータス.md を作成/更新
4. 完了報告
</steps>

---

## フォルダ作成

```bash
mkdir -p docs/records/issue-records/$(date +%Y-%m-%d)
```

---

## 課題整理.md テンプレート

```markdown
# Crew 課題整理表

**更新日**: YYYY-MM-DD

---

## 全体サマリー

| 状態 | 件数 |
|------|------|
| 解決済（CLOSED） | XX件 |
| 未対応（Issue登録済・OPEN） | XX件 |
| 未対応（Issue未登録） | XX件 |

---

## 未対応（Issue登録済）

| # | Issue | 内容 | Type | Priority |
|---|-------|------|------|----------|
| 1 | #XX | ... | Enhancement | Medium |

---

## 次のアクション

### 優先度高

| # | Issue | 対応 | 内容 |
|---|-------|------|------|
| 1 | #XX | 調査・修正 | ... |
```

---

## 全項目ステータス.md テンプレート

```markdown
# Crew フィードバック全項目ステータス表

**更新日**: YYYY-MM-DD

## 凡例

| ステータス | 意味 |
|-----------|------|
| 解決済み | 修正完了・CLOSED |
| Issue登録済 | GitHub Issue登録済み（OPEN） |
| 質問/回答済 | 質問として回答済み |
| 対応不要 | 仕様として対応不要 |

---

## MM/DD フィードバック

| # | 内容 | ステータス | Issue/備考 |
|---|------|-----------|-----------|
| 1 | ... | 解決済み | #XX |
| 2 | ... | Issue登録済 | #XX |
```

---

## 出力形式

<output_format>
```markdown
## ドキュメント保存完了

| ファイル | パス |
|---------|------|
| 課題整理 | `docs/records/issue-records/YYYY-MM-DD/課題整理.md` |
| 全項目ステータス | `docs/records/issue-records/YYYY-MM-DD/全項目ステータス.md` |

次回の課題整理時は、このフォルダに追記または新しい日付フォルダを作成してください。
```
</output_format>

---

## 重要

<important>
- **日付フォルダを使う**: `docs/records/issue-records/YYYY-MM-DD/`
- **既存ファイルは上書き**: 同日の更新は上書きでOK
- **日付が変わったら新フォルダ**: 別日は新しいフォルダを作成
</important>
