# Quills Studios — Treasure Island

Static WebGL landing page (`index.html` + `island-scene.js`).

## Live URL

After the first successful **Deploy GitHub Pages** Action:

`https://saibhaskar277.github.io/casinoWebsiteOrg/`

## Local preview

Serve the repo root (not a subfolder) so asset paths resolve:

```bash
npx --yes serve .
```

Then open the URL it prints (usually `http://localhost:3000`).

## Custom domain (later)

1. Edit `site.config.json` → set `"customDomain": "www.yourdomain.com"`.
2. Copy `CNAME.example` → `CNAME` and put only that domain on the first line.
3. Commit & push `CNAME` (the Action publishes it with the site).
4. In GitHub → **Settings → Pages → Custom domain**, enter the same domain and wait for DNS check.
5. Point DNS at GitHub Pages:
   - **Apex** (`yourdomain.com`): A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - **www**: CNAME → `saibhaskar277.github.io`
6. Turn on **Enforce HTTPS** once the certificate is ready.

Relative asset paths mean you do **not** need to rebuild for a domain change.

## Deploy

Pushes to `main` run [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). You can also run it manually under the **Actions** tab.
