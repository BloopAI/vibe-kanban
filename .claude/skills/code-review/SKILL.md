---
name: code-review
description: コードレビューを実行する。implementerの実装後に自動で呼ばれる。NGならimplementerに差し戻し、OKならレポート作成して完了報告。コミットはユーザーが手動。
---

# コードレビュー

<context>
このスキルはimplementerの実装完了後に自動で呼ばれる。
仕様面（AC）とコード面の両方をチェックし、品質を確認する。
NG時はimplementerに差し戻し、OK時はレポート作成と完了報告を行う。
**コミット・プッシュ・PR作成はユーザーが手動で行う。**
</context>

## いつ使うか

- implementerの実装が完了した後
- 「コードレビューして」「チェックして」と言われた時
- 実装の品質確認が必要な時

## いつ使わないか

- まだ実装が完了していない → `/implement-tdd`
- 調査フェーズ → `/explore-issue`

---

## フロー

<steps>
1. ACを確認
2. 仕様面チェック（ACとの対応）
3. コード面チェック（品質確認）
   - Rust: `cargo clippy --workspace`
   - Frontend: `pnpm run lint`
4. 結果を判定（OK/NG）
5. NG時: implementerに差し戻し
6. OK時: `/create-test-report` を呼び出してレポート作成
</steps>

---

## チェック観点

### 仕様面（AC確認）

| チェック項目 | 内容 |
|-------------|------|
| User Story | 「〜として、〜したい」を満たしているか |
| AC | Given/When/Thenが全て満たされているか |
| 要件 | 依頼内容を解決しているか |

### コード面（Rust）

| チェック項目 | 内容 |
|-------------|------|
| エラーハンドリング | `unwrap()`乱用がないか、適切な`Result`処理 |
| パフォーマンス | N+1問題、不要なクローン |
| セキュリティ | SQLxのパラメータバインディング使用 |
| コード品質 | 命名、可読性、重複 |

### コード面（TypeScript/React）

| チェック項目 | 内容 |
|-------------|------|
| 型安全性 | `any`型の使用がないか |
| XSS対策 | ユーザー入力のエスケープ |
| パフォーマンス | 不要な再レンダリング |
| コード品質 | 命名、可読性、重複 |

---

## 判定基準

<decision_table>
| 結果 | 判定 | 対応 |
|------|------|------|
| ACが満たされていない | NG | implementerに差し戻し |
| 重大な問題あり | NG | implementerに差し戻し |
| 軽微な改善提案のみ | OK | レポート作成 |
| 問題なし | OK | レポート作成 |
</decision_table>

---

## NG時の対応

<output_format>
```markdown
## レビュー結果: NG

### 問題点
- [ ] AC2が未達成: ...
- [ ] セキュリティ問題: ...

### 対応が必要な理由
...

---

→ implementerに差し戻し。テストから作り直してください。
```
</output_format>

---

## OK時の対応

### `/create-test-report` を呼び出す

OK判定後、`/create-test-report` スキルを実行してレポートを作成する。

レポートには以下を含める:
- TDD結果（RED/GREEN/Refactor）
- AC達成状況
- E2Eテスト結果（該当する場合）
- レビュー結果
- 変更ファイル一覧

### 完了報告

```markdown
作業完了しました。

- レポート: `docs/test-reports/YYYY-MM-DD/issue-XX-slug.md`

コミット・プッシュ・PR作成をご希望の場合はお知らせください。
```

<important>
**コミットはしない。** レポート作成と完了報告まで。
ユーザーが「コミットして」「PR作って」と依頼した時のみ実行。
</important>

---

## 例

<example type="good">
<description>明確な判定、TDD結果含む適切なレポート</description>
```markdown
## レビュー結果: OK

### TDD結果
| フェーズ | 結果 |
|---------|------|
| RED | テスト失敗確認 |
| GREEN | テスト成功 |
| Refactor | 成功維持 |

### AC達成状況
| AC | 状況 |
|----|------|
| AC1 | 達成 |
| AC2 | 達成 |

### レビュー
- コードスタイル: 問題なし
- ロジック: 適切

### レポート
`docs/test-reports/2026-01-16/issue-85-pagination.md`

作業完了しました。
コミット・PR作成をご希望の場合はお知らせください。
```
</example>

<example type="bad">
<description>判定が曖昧、TDD結果なし、レポートなし</description>
```markdown
## レビュー結果

コード見ました。
たぶん大丈夫だと思います。
```
</example>

---

## 重要

<important>
- **コミット・プッシュ・PR作成は行わない**（ユーザーが手動）
- レポートは必ず作成する（TDD結果含む）
- NG時は必ずimplementerに差し戻す
- 判定に迷ったらNGにして安全側に倒す
</important>

---

## 次のステップ

<next_agent>
- NG時 → **implementer** に差し戻し、修正依頼
- OK時 → 完了報告（ユーザーがコミット・PR作成を依頼した時のみ対応）
</next_agent>
