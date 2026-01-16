---
name: analyze-task
description: 課題を分析し、要件分類とフィールド値（Type・Priority等）を提案する。task-organizerエージェントで使用。
---

# 課題分析

<context>
ユーザーから送られた課題を分析し、要件分類とGitHub Issueのフィールド値を提案する。
承認前の調査・提案フェーズで使用。
</context>

## いつ使うか

- 新しい課題・要望を受け取った時
- 「これ登録して」「Issue作って」と言われた時
- 課題の整理・分類が必要な時

## いつ使わないか

- すでにIssue登録済みの課題 → 既存Issueを更新
- 実装フェーズ → `/implement-tdd`

---

## フロー

<steps>
1. 課題内容を理解する
2. **要件分類を判定**（バグ / 改善 / 新機能）
3. 既存Issueを検索（重複確認）
4. 関連コード・仕様を調査
5. フィールド値を決定
6. 提案を出力
7. 不明点があれば質問
</steps>

---

## 調査項目

### 1. 要件分類（重要）

課題がどのタイプかを判定する。

**判定基準**:

| 課題の特徴 | 分類 | 対応 |
|-----------|------|------|
| 既存機能のバグ | Bug | バグ修正Issue |
| 既存機能の改善 | Enhancement | 改善Issue |
| 新しい機能 | Feature | 新機能Issue |
| 調査が必要 | Spike | 調査Issue |

### 2. 既存Issue確認

```bash
# キーワードで検索
gh issue list --search "キーワード" --state all

# 関連しそうなIssueを確認
gh issue view <番号>
```

### 3. 関連コード調査

```bash
# Rustコード検索
rg "キーワード" crates/

# Frontendコード検索
rg "キーワード" frontend/src/
```

---

## フィールド決定基準

### Type

| 課題の特徴 | Type |
|-----------|------|
| バグ、表示誤り、データ不整合 | Bug |
| 新機能、機能追加 | Feature |
| 既存機能の改善、UI改善 | Enhancement |
| 調査、検証、設計 | Spike |

### Priority

| 課題の特徴 | Priority |
|-----------|----------|
| 業務に支障、データ破損の恐れ | High |
| 不便だが回避策あり | Medium |
| あれば嬉しい程度 | Low |

---

## 出力形式

<output_format>
```markdown
## 課題分析: <課題名>

### 課題の理解
- **内容**: <何をしたいか/何が問題か>
- **背景**: <なぜ必要か>
- **影響**: <誰が/何が影響を受けるか>

### 要件分類

| 分類 | 判定 | 理由 |
|------|------|------|
| Type | Bug / Feature / Enhancement / Spike | <判定理由> |

### 調査結果
- **既存Issue**: なし / #XX が関連
- **関連コード**: `crates/server/src/xxx.rs`, `frontend/src/components/xxx.tsx`
- **現在の実装**: <現状の動作>

### フィールド提案

| フィールド | 値 | 理由 |
|-----------|-----|------|
| Type | <値> | <理由> |
| Priority | <値> | <理由> |
| Labels | <値> | <理由> |

### Issue概要案
- **タイトル**: <タイトル案>

### 不明点（あれば）
- [ ] <質問1>
- [ ] <質問2>

---

この内容でよろしいですか？
- [ ] Issue作成
```
</output_format>

---

## 例

<example type="good">
<description>要件分類と調査結果を含む提案</description>
```markdown
## 課題分析: タスク一覧の表示が遅い

### 課題の理解
- **内容**: タスクが100件以上あると一覧表示が遅くなる
- **背景**: プロジェクトが大きくなると体感速度が悪化
- **影響**: 全ユーザーの操作性

### 要件分類

| 分類 | 判定 | 理由 |
|------|------|------|
| Type | Enhancement | 既存機能の改善（パフォーマンス向上） |

### 調査結果
- **既存Issue**: なし
- **関連コード**: `crates/server/src/api/tasks.rs`, `frontend/src/pages/ProjectTasks.tsx`
- **現在の実装**: 全件取得してフロントエンドで表示

### フィールド提案

| フィールド | 値 | 理由 |
|-----------|-----|------|
| Type | Enhancement | パフォーマンス改善 |
| Priority | Medium | 業務に支障はないが改善が望ましい |
| Labels | performance | パフォーマンス関連 |

### Issue概要案
- **タイトル**: タスク一覧のページネーション実装によるパフォーマンス改善

---

この内容でよろしいですか？
- [ ] Issue作成
```
</example>

<example type="bad">
<description>要件分類なし、調査結果なし</description>
```markdown
## 課題分析

タスク一覧が遅い

Priority: Medium

Issue作りますか？
```
</example>

---

## 重要

<important>
- **要件分類を必ず判定**: Bug / Enhancement / Feature / Spike のどれか
- **調査してから提案する**: 推測で決めない
- **理由を明記する**: なぜそのフィールド値かを説明
- **不明点は質問する**: 勝手に決めない
- **既存Issueを確認**: 重複登録を防ぐ
</important>

---

## 次のステップ

<next_step>
ユーザーがOKしたら:
1. `/creating-issues` でIssue作成
</next_step>
