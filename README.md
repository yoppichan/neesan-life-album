# ねーさん生活アルバム 2.0

よっぴが普段どおり話した「今日ふくちゃんと散歩した」「サウナ行った」「帰ってきた」などを、生活イベントとして保存して後から検索できるアルバムです。

## 今回ここまで完成
- 会話文 → 生活イベント自動抽出
- OpenAI Responses APIによる構造化抽出（APIキーをサーバー側だけで保持）
- APIキーなしでも簡易抽出で動作
- 日付・タイトル・詳細・タグ・人物・ペット
- キーワード検索
- 日付範囲検索
- 重複保存防止
- バックアップ/復元対応UI
- PWA
- MCP互換 `/mcp`
  - `record_life_event`
  - `search_life_album`
  - `recent_life_events`
  - `life_events_in_range`
- MCPトークン認証
- Docker / Render 用設定

## 起動
Node.js 20+ で `npm start`。依存パッケージは不要です。

## 大事な一点
このZIPだけで「現在のChatGPTの既存会話を、外部アプリが勝手に全件読み続ける」ことはできません。OpenAIの現行APIでは、外部MCPツールをモデルから呼び出す仕組みは提供されていますが、外部サーバーをChatGPTに接続して初めてその経路が成立します。citeturn0search4turn0search6

したがって、アプリ本体はここで完成。残るのは **このサーバーをHTTPSで公開して、ChatGPT側のApp/MCP接続先として登録すること** だけです。OpenAIの現行ショーケースにもWebMCP/App型の実例があります。citeturn1search1turn1search2

### 接続後に目指す動き
1. よっぴが普段どおり会話
2. ChatGPTが「これは生活イベントとして残す価値がある」と判断
3. `record_life_event` を呼ぶ
4. アルバムに保存
5. 「先月のふくちゃんとの思い出」と聞いたら `search_life_album` / `life_events_in_range` で検索

※「全部の発言を無条件で保存」ではなく、実際に起きた出来事だけを保存する設計です。

## セキュリティ
- `OPENAI_API_KEY` はブラウザへ出さない
- 本番では `/mcp` に強い `MCP_TOKEN` を設定
- HTTPS必須
- 個人の生活ログなので公開URLを無認証で運用しない
