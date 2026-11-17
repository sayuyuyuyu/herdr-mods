# herdr-mods

Herdr（herdr-app）の mod 2つ。herdr-app 0.1.16（macOS）で動作を確認した。

| mod | 内容 |
| --- | --- |
| `rate-status` | ステータスバーにプロバイダごとのレート上限を出す |
| `bg-settings` | 背景画像と、パネル・端末の透過率を設定するダイアログ |

## インストール

```sh
cp -R mods/rate-status mods/bg-settings ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/rate-status
herdr-app check ~/.config/herdr-app/mods/bg-settings
```

Herdr は起動のたびに組み込み mod を書き戻す。同梱の `workspace-status` を直接編集すると、次の起動で `<name>-edited` に退避されて効かなくなる。この2つは別名の mod として置き、レイアウトから参照する。

`rate-status` は `status` ブロックの `content.mod` を差し替える。このブロックは `workspace-status` と同じ内容（マシン、ブランチ、エージェント数、パレットのキー）を描いたうえでレートを足す。

```json
{ "id": "status", "type": "block", "content": { "mod": "rate-status" }, "size": { "px": 28 } }
```

`bg-settings` はレイアウトに置かず、ダイアログとして開く。

```sh
herdr-app do mod.open --name bg-settings
```

毎回使うなら、左レールの mod（たとえば `workspace-chrome`）の行に `run("mod.open", { name: "bg-settings" })` を足す。

## rate-status

### 設定

`~/.config/herdr-app/rate-limits.json` にプロバイダを並べる。

```json
{ "providers": [
    { "name": "go", "command": "~/.config/herdr-app/rate-limits/opencode-go.sh" } ] }
```

60 秒おきに `sh -c` でコマンドを実行し、標準出力を読む。コマンドは 1 行で次を出す。

```json
{ "title": "go", "limits": [ { "label": "5h", "used": 12, "resets_at": 1763000000 } ] }
```

- `used`：使用率（%）。バーの塗りと色を決める（50% 未満、80% 未満、それ以上で 3 段階）
- `resets_at`：リセット時刻（epoch 秒、任意）。24 時間以内なら `↻ 1:25` を添え、過ぎていれば `-` になる
- `status`：任意。`ok` 以外なら注意色
- `title`：任意。省くと `name`

コマンドが失敗するか、別の形を出したプロバイダは直前の値を出し続ける。回線が切れても表示は消えない。

### アダプタ

`examples/rate-limits/` の 2 つはそのまま動く。どちらも `jq` と `curl` を使う。

- `opencode-go.sh`：OpenCode Go の割当。`/inference/go/v1/usage` を叩き、鍵は Pi の `~/.pi/agent/auth.json` から読む（`OPENCODE_GO_API_KEY` があればそちらを優先）
- `claude.sh`：Claude Code の割当。`~/.cache/claude-statusline/rate.json` を読む（`CLAUDE_RATE_FILE` で変更できる）

別のプロバイダを足すときは、同じ形の JSON を出すスクリプトを置いて `providers` に 1 行足す。mod 側は触らない。

## bg-settings

`layouts/<name>.json` の 3 箇所（`sidebar` / `tabs` / `main`）の背景画像と、端末・パネルの透過率を編集する。保存すると Herdr がその場でレイアウトを読み直す。

画像は `~/.config/herdr-app/backgrounds/` に置く。「Open folder」でそのフォルダを開く（無ければ作る。macOS は Finder、Windows は Explorer、Linux は `xdg-open`）。

- Terminals に画像を置くと、ペインのカードも透過させて、端末の後ろに画像を出す
- Sidebar と Tab bar の画像は、パネル背景が不透明だと完全に隠れる。そのため画像を選んだ時点でパネル背景を 70% に落とす

## 注意

- `bg-settings` はレイアウトの `id` が `sidebar` / `tabs` / `main` であることを前提にする。別名にしたレイアウトでは、対応するノードが見つからず何もしない
- 新しい mod のフォルダを置いたとき、Herdr が起動中のレイアウトに複製ブロックを足すことがある。`herdr-app status` とレイアウトのファイルを一度確認する
- mod は信頼された JavaScript として動く（コマンド実行とネットワークに制限がない）。中身を読んでから入れる
