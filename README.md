# 航士朗 ホームページ

GitHub Pages で無料公開している静的サイト。レトロ版は HTML/CSS のみ（JavaScriptなし）、今風版は補助用の `main.js` を1つだけ使う。

| ファイル | 内容 |
|---|---|
| `index.html` / `retro.css` | トップ（阿部寛HP風レトロ版） |
| `modern.html` / `style.css` | 今風デザイン版 |
| `main.js` | 今風版の補助スクリプト（トップの絵に指・マウスで奥行きをつける、メニューの現在地表示、古いブラウザ向けの代替表示）。無くても全部読める |
| `fonts/` | 今風版の見出し用フォント（Syne / Instrument Serif、OFLライセンス。ライセンス文を同梱） |
| `images/` | 写真・背景画像 |
| `.nojekyll` | GitHub Pages の Jekyll 変換を無効化 |

## セキュリティ方針（今風版でJavaScriptを使う条件）

- CSP（`modern.html` の `<meta>` と `vercel.json`）で **自サイト内のファイルだけ** を許可：`script-src 'self'` / `style-src 'self'` / `font-src 'self'` / `img-src 'self'`
  → 外部スクリプト・インラインスクリプト・`eval` はブラウザが実行を拒否する（XSS・改ざんされた外部CDN経由の攻撃を防ぐ）
- `main.js` は通信しない・Cookie等に保存しない・入力を受け取らない・`innerHTML` を使わない
- フォーム・ログイン・データベースを持たない（攻撃される対象を作らない）
- レトロ版（`index.html`）は引き続き JavaScript 完全禁止
- スクリプトやフォントを追加するときは **必ずリポジトリ内に置く**（CDNのURLを書かない）
- GitHubアカウントは二段階認証を有効にする（サイト改ざんの最大の入口はアカウント乗っ取り）

## 公開URL

- 現在：https://anzuka10n12.github.io/koshiro/
- 将来：独自ドメインに移行予定（下記手順）

## 独自ドメインへの移行手順

### 移行しやすくするための約束事（今から守る）

- リンク・画像は **相対パス** で書く（`images/photo.jpg` ○ ／ `/images/photo.jpg` ✕ ／ `https://anzuka10n12.github.io/...` ✕）
  → `/koshiro/` 配下でもドメイン直下でもそのまま動く
- サイト内に `github.io` のURLを直書きしない（例外：`index.html`・`modern.html` の `og:url` / `og:image` はSNS共有の仕様上フルURL必須 → 移行時に書き換える）
- SNSのプロフィール欄には、移行後は独自ドメインのURLを載せ直す

### 1. ドメイン取得

- 取得先の例：Cloudflare Registrar（原価販売・更新料が上がらない）、お名前.com、ムームードメイン など
- 費用の目安：`.com` 年1,500〜2,000円程度、`.jp` 年3,000〜4,000円程度（業者・時期で変動）
- WHOIS情報公開代行（個人情報を隠す設定）を必ずONにする

### 2. GitHub側でドメインを「検証」する（乗っ取り防止）

1. GitHub 右上アイコン → Settings → Pages → 「Add a domain」
2. 表示された TXT レコード（`_github-pages-challenge-anzuka10n12`）をDNSに登録 → Verify
   - 検証しておくと、第三者に自分のドメインを悪用される「サブドメイン乗っ取り」を防げる

### 3. DNSレコードを設定（ドメイン業者の管理画面）

ドメイン直下（例：`okakoshiro.com`）で公開する場合：

| 種類 | ホスト | 値 |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | anzuka10n12.github.io |

※ 値は移行時に GitHub Docs「Managing a custom domain for your GitHub Pages site」で最新を確認すること

### 4. リポジトリ側の設定

1. `koshiro` リポジトリ → Settings → Pages → Custom domain にドメインを入力して Save
   （リポジトリ直下に `CNAME` ファイルが自動作成される）
2. DNS反映後（数分〜最大48時間）、**Enforce HTTPS** にチェック

### 5. 移行後の確認

- [ ] `https://独自ドメイン/` と `https://www.独自ドメイン/` の両方で表示される
- [ ] 鍵マーク（HTTPS）が付いている
- [ ] 旧URL `https://anzuka10n12.github.io/koshiro/` が新ドメインへ自動転送される（GitHub が自動で行う）
- [ ] SNSプロフィールのURLを書き換えた
- [ ] `og:url` / `og:image` を新ドメインに書き換えた

### 注意

- ドメインの更新を忘れて失効すると、他人に取得されて悪用される恐れがある → **自動更新をON**にする
- ドメインをやめる時は、先に GitHub の Custom domain を外してから DNS を消す
