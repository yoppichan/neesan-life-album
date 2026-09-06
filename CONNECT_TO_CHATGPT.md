# ChatGPT接続用メモ

このファイルは「最後の接続工程」を迷わないためのメモです。

## いま手元にあるもの
- `/mcp` を持つMCPサーバー
- `record_life_event`
- `search_life_album`
- `recent_life_events`
- `life_events_in_range`

## 必要なもの
- HTTPSで到達できる公開URL
- MCP_TOKEN
- ChatGPT側で利用できるApps/MCPの接続機能

OpenAIの現行Responses APIはMCPツールをサポートしており、モデルがMCPツールを選択・呼び出せる仕組みがあります。

## 接続後の確認
ChatGPTから次のようなテストを行います。

「今日はふくちゃんと散歩した。生活アルバムに残して」

→ `record_life_event`

「先月のふくちゃんとの思い出を見せて」

→ `life_events_in_range` または `search_life_album`

## 注意
現在のChatGPT会話を外部サーバーが無断で監視する仕組みではありません。接続されたApp/MCP経路を通して、ChatGPTが必要なときにツールを呼ぶ構成です。
