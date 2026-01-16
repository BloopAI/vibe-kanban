---
name: create-test-report
description: テストレポートを作成する。reviewerがOK判定後に呼び出す。TDD結果・AC達成・レビュー結果を記録。
---

# テストレポート作成

<context>
このスキルはreviewerがOK判定を出した後に呼ばれる。
TDD結果、AC達成状況、レビュー結果をレポートとして記録する。
</context>

## いつ使うか

- reviewerがOK判定を出した後
- 実装作業の記録を残したい時

## いつ使わないか

- まだ実装が完了していない
- レビューがまだ
- NG判定でやり直し中

---

## フロー

<steps>
1. レポートディレクトリ作成 (`docs/test-reports/YYYY-MM-DD/`)
2. レポートファイル作成 (`issue-XX-slug.md`)
3. 完了報告
</steps>

---

## レポート形式

`docs/test-reports/YYYY-MM-DD/issue-XX-slug.md`:

```markdown
# Issue #XX <タイトル> テスト結果レポート

## 概要
| 項目 | 内容 |
|------|------|
| Issue | #XX <タイトル> |
| ブランチ | `feature/XX-slug` |
| 日時 | YYYY-MM-DD |
| レビュー結果 | OK |

## TDD結果
| フェーズ | 結果 | 備考 |
|---------|------|------|
| RED | テスト失敗確認 | AC対応テスト作成、失敗を確認 |
| GREEN | テスト成功 | 最小実装で全テスト通過 |
| Refactor | 成功維持 | リファクタ後もテスト通過 |

## 受け入れ条件
| AC | 内容 | 結果 |
|----|------|------|
| AC1 | Given... When... Then... | PASS |
| AC2 | Given... When... Then... | PASS |

## E2Eテスト結果（該当する場合）
| シナリオ | 操作 | 結果 |
|----------|------|------|
| ... | ... | PASS |

## レビュー結果
- コードスタイル: 問題なし
- ロジック: 適切
- 改善提案: ...

## 変更ファイル
| ファイル | 変更内容 |
|---------|---------|
| `crates/server/src/api/xxx.rs` | 新規作成 |
| `frontend/src/components/xxx.tsx` | 修正 |

## 実装ポイント
- ...
- ...
```

---

## コマンド

```bash
# ディレクトリ作成
mkdir -p docs/test-reports/YYYY-MM-DD

# レポート作成（Write toolで実行）
```

---

## 完了報告

```markdown
作業完了しました。

- レポート: `docs/test-reports/YYYY-MM-DD/issue-XX-slug.md`

コミット・プッシュ・PR作成をご希望の場合はお知らせください。
```

---

## 例

<example type="good">
<description>TDD結果・E2E結果・レビュー結果全て含む</description>
```markdown
# Issue #93 タスクフィルター機能 テスト結果レポート

## 概要
| 項目 | 内容 |
|------|------|
| Issue | #93 タスクフィルター機能 |
| ブランチ | `feature/93-task-filter` |
| 日時 | 2026-01-16 |
| レビュー結果 | OK |

## TDD結果
| フェーズ | 結果 | 備考 |
|---------|------|------|
| RED | テスト失敗確認 | E2Eテストシナリオ作成 |
| GREEN | テスト成功 | Context + API実装 |
| Refactor | 成功維持 | コード整理完了 |

## 受け入れ条件
| AC | 内容 | 結果 |
|----|------|------|
| AC1 | ステータスでフィルター可能 | PASS |
| AC2 | 複数条件でフィルター可能 | PASS |
| AC3 | フィルター条件がURLに保持 | PASS |

## E2Eテスト結果
| シナリオ | 操作 | 結果 |
|----------|------|------|
| ステータスフィルター | 「進行中」選択→フィルター | 成功 |
| 複合フィルター | ステータス+担当者選択 | 成功 |

## レビュー結果
- コードスタイル: 問題なし
- ロジック: 適切
- 型安全性: OK（shared/types.ts使用）

## 変更ファイル
| ファイル | 変更内容 |
|---------|---------|
| `crates/server/src/api/tasks.rs` | フィルターパラメータ追加 |
| `frontend/src/contexts/TaskFiltersContext.tsx` | 新規作成 |
| `frontend/src/pages/ProjectTasks.tsx` | フィルターUI追加 |
```
</example>

---

## 重要

<important>
- レポートには**TDD結果（RED/GREEN/Refactor）を必ず含める**
- E2Eテストを実施した場合はその結果も含める
- レビュー結果の要約を含める
- **コミットは行わない**（ユーザーが手動）
</important>
