# Local setup — NixWallet extension

This guide walks you from a clean clone to a **working NixWallet build loaded in Chrome** on your machine.

---

## 1. What you need

| Requirement | Notes |
|-------------|--------|
| **Node.js** | v18 or newer (LTS recommended) |
| **npm** | Comes with Node; the repo uses `npm`, not `pnpm`, in `extension/` |
| **Google Chrome** | **114+** (side panel API). Chromium-based browsers that support side panels may work but are not officially tested here. |
| **Git** | To clone [github.com/AshThunder/nixwallet](https://github.com/AshThunder/nixwallet) |

Optional:

- **Sepolia ETH** — from a faucet, if you want to send transactions or wrap tokens on testnet.
- **Etherscan API key** — optional; improves ERC-20 discovery on Sepolia (see §5).

---

## 2. Get the code

```bash
git clone https://github.com/AshThunder/nixwallet.git
cd nixwallet/extension
```

All commands below are run from the **`extension/`** directory unless noted.

---

## 3. Install dependencies

```bash
npm install
```

If install fails, use Node 18+ and try deleting `node_modules` and `package-lock.json` (if present), then `npm install` again.

---

## 4. Build the extension

The unpacked extension Chrome loads is the **`dist/`** output:

```bash
npm run build
```

This runs TypeScript (`tsc -b`) then Vite (CRXJS). Fix any red errors before continuing.

---

## 5. Optional: environment variables

For **better token suggestions** on Sepolia (Etherscan `tokentx`), you can set:

```bash
# extension/.env.local   (do not commit secrets; file is gitignored if listed in .gitignore)
VITE_ETHERSCAN_API_KEY=your_etherscan_api_key
```

Rebuild after changing env: `npm run build`.  
If you skip this, discovery still works via Blockscout, `getLogs`, and built-in probes.

---

## 6. Load the extension in Chrome

1. Open **`chrome://extensions/`**
2. Turn **Developer mode** **ON** (top right).
3. Click **Load unpacked**.
4. Choose the **`dist`** folder inside **`nixwallet/extension/`**  
   Path should look like: `.../nixwallet/extension/dist`  
   **Not** the repo root and **not** `extension/` itself — only **`extension/dist`** after a successful build.

---

## 7. Open NixWallet

1. Pin the extension if you like: puzzle icon → **NixWallet** → pin.
2. Click the **NixWallet** toolbar icon. The wallet should open in the **side panel**.

If the panel does not open, confirm the extension is **enabled** on `chrome://extensions/` and that you rebuilt after pulling new code.

---

## 8. Day-to-day development

| Goal | Command |
|------|--------|
| Typecheck + production bundle for Chrome | `npm run build` |
| Vite dev server with HMR (browser-only iteration) | `npm run dev` |
| Lint | `npm run lint` |
| Store-style zip (after version bump in `package.json` / manifest if needed) | `npm run package` |

After code changes, run **`npm run build`** again and use **Reload** on `chrome://extensions/` for the NixWallet card so the service worker and UI pick up the new bundle.

---

## 9. Common issues

| Problem | What to try |
|---------|-------------|
| **Load unpacked** fails or extension is blank | Confirm you selected **`extension/dist`**, and that `npm run build` completed without errors. |
| Old UI after `git pull` | `npm install` (if lockfile changed), then `npm run build`, then **Reload** the extension. |
| `tsc` / build errors | Use Node 18+. Read the error path and fix types or imports. |
| RPC or network errors in the wallet | Sepolia must be reachable; check VPN/firewall. The app uses a public RPC by default (see `src/lib/wallet.ts`). |
| Permission / host warnings in Chrome | Expected for a wallet that injects a provider; see `STORE_LISTING.md` / privacy policy for justification. |

---

## 10. Related docs

- **[README.md](./README.md)** — architecture and screen overview  
- **[STORE_LISTING.md](./STORE_LISTING.md)** — Chrome Web Store packaging and listing copy  
- **Repo root [README.md](../README.md)** — full project (Hardhat, presentation site)

Smart contracts for the on-chain registry live in **`../hardhat/`**; the extension points at a deployed registry address in code — see root README for the current Sepolia address.
