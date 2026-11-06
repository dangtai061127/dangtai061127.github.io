---
title: Hollow Chapter
date: 2026-10-26
summary: Khaled downloaded a fake agentic coding ebook from a malicious search result, leading to a malware infection. The investigation focuses on tracing the attack, identifying persistence and suspicious activity, recovering deleted evidence, and determining the overall impact.
platform: BTLO
difficulty: Hard
category: Digital Forensics
tools:
  - EZ tools
  - de4dot
  - dnSpy
mitre:
  - T1059.010
  - T1055.012
  - T1620
tags: []
draft: false
---

|||
|---|---|
| **Platform** | Blue Team Labs Online (BTLO) |
| **Lab** | Hollow Chapter |
| **Category** | Digital Forensics / Malware Triage |
| **Author** | Đặng Đắc Tài |
| **Date** | 5/11/2026 |
| **Victim** | `khaled.allam` |

***

## 1. TL;DR

A developer searched for a guide to agentic coding and downloaded a `.7z` "ebook" from a lookalike domain, `claude-ai-setup[.]com`, served over plain HTTP. The archive contained a shortcut (`.lnk`) disguised as the ebook plus two hidden "PDF" files (`3th.pdf`, `4th.pdf`) that actually carry the malware. A decoy PDF opened for the victim while the shortcut quietly ran a `cmd` → PowerShell chain that decrypted five scripts, planted files in `%LOCALAPPDATA%\Packages\Microsoft.WindowsSoundDiagnostics\Cache`, and registered hidden scheduled tasks disguised as Realtek audio services.

The tasks launch a renamed, legitimate **AutoHotkey** binary (`RtkNGUI64.exe`). Its script rebuilds a .NET payload (`clay_Client.exe`) from a 9.7 MB text file (`RtkLoggingManifest.man`) and **hollows** a random .NET Framework host (`AddInProcess32`, `AppLaunch` or `aspnet_compiler`). The payload is ConfuserEx-obfuscated, contains RAT-style commands (remote desktop, file manager, reflection), and beacons to three encrypted C2 addresses on **TCP/448**. A second chain (`ResetRealtekAudioSettings64`) reflectively loads two more embedded binaries. The batch file that started it all wrote a log and deleted it within seconds.

***

## 2. Scenario and scope

Khaled, a software developer, searched online for an agentic-coding guide and downloaded what looked like an ebook. Unusual activity followed: suspicious processes, persistence, and components staged in his user profile, while a decoy document stayed on screen. The security team collected triage data just before scheduled activity was due to run. The task is to reconstruct the incident from the web search onward, identify techniques and artifacts, recover deleted evidence, and determine scope and impact.

**Evidence provided** (`Desktop\Artefacts\Hollow Chapter\C\...`): Edge `History` database, `$MFT`, `$J` (USN Journal), Prefetch, `NTUSER.DAT`, the extracted download folder, and the `Microsoft.WindowsSoundDiagnostics` package directory.

## 3. Tools

| Purpose | Tool |
| --- | --- |
| Browser history | DB Browser for SQLite |
| File system (MFT, USN) | MFTECmd, Timeline Explorer |
| Program execution | Registry Explorer (UserAssist), PECmd (Prefetch) |
| Script analysis | Notepad++, PowerShell, CyberChef |
| Dynamic analysis | Process Monitor |
| Static analysis | dnSpy |
| Deobfuscation | de4dot |
| Reputation | VirusTotal |

***

## 4. Consolidated timeline (UTC, 2026-08-01)

| Time | Event | Source |
| --- | --- | --- |
| 22:41:23 | Victim visits the lookalike site `http://claude-ai-setup.com` | Edge `urls` / `visits` |
| 22:44:24 | Download of the `.7z` starts; archive lands on disk | Edge `downloads`, `$MFT` |
| 22:45:46 | Download completes (86,041,995 bytes) | Edge `downloads` |
| 22:48:32 | Archive extracted into `Downloads\Agentic Coding with Claude Code...\` | `$MFT` |
| 22:49:00 | Shortcut (`.lnk`) executed | UserAssist (`NTUSER.DAT`) |
| 22:49:00+ | `cmd.exe`, `findstr.exe`, `more.com` run | Prefetch |
| 22:49:07–22:49:13 | Five `Cache_<GUID>.ps1` scripts written to `Local\Microsoft\Realtek Diagnostics\` | `$MFT` |
| 22:49:12 | Scheduled task `CheckRealtekAudioVersion` created | `$J`, `Tasks` |
| 22:54:14 | Batch file writes `ver0x…03_1095.log` | `$J` |
| 22:54:57 | `CheckRealtekAudioVersion` deleted and recreated; `RealtekAudioEnhancements64` task created | `$J` |
| 22:55:02 | Log file deleted | `$J` |

**Reading the timeline:** the first script sets the task's trigger to "5 minutes after creation" (22:49 + 5 ≈ 22:54), which lines up with the 22:54:14 log and the 22:54:57 task churn. That means the second-stage script (`RealtekAudioService64.ps1`) ran about five minutes after the click. `[VERIFY: confirm the first task's trigger from the task XML]`

***

## 5. Analysis by phase

### Phase 1 — Delivery: lookalike domain and download

**Where to look:** `C:\Users\khaled.allam\AppData\Local\Microsoft\Edge\User Data\Default\History` in DB Browser for SQLite.

![](/uploads/20261104-152016.png)

![](/uploads/20261104-152048.png)

- In the `urls` table one entry stands out: a **non-HTTPS** URL imitating the legitimate Claude domain.
- Edge stores times as microseconds since 1601-01-01. Converting `13430097683973607` gives **2026-08-01 22:41:23 UTC**.

![](/uploads/20261104-152120.png)

![](/uploads/20261104-152131.png)

- The `download_url_chains` table shows the source of the archive: `http://claude-ai-setup.com/Agentic Coding with Claude Code The everyday developer's guide to agentic coding with Claude Code.7z`

- The `downloads` table gives start `13430097864424259` (22:44:24) and end `13430097946379866` (22:45:46), 86,041,995 bytes.

![](/uploads/20261104-152157.png)

- The history also contains a `file:///` visit to `Full Agentic Coding with Claude Code.pdf` inside the extracted folder. This is the **decoy** the victim saw.

### Phase 2 — Landing, extraction, hidden files

Parse the MFT:

```plain
.\MFTECmd.exe -f 'C:\Users\BTLOTest\Desktop\Artefacts\Hollow Chapter\C\$MFT' --csv ..\..\..\
```

![](/uploads/20261104-152359.png)

Open the CSV in Timeline Explorer. The archive was created at **22:44:24** and extracted at **22:48:32**. Filtering the parent path on "Agentic" reveals two extra files, `3th.pdf` and `4th.pdf`. In the `$J` output both are flagged hidden.

![](/uploads/20261104-152525.png)

![](/uploads/20261104-152534.png)

### Phase 3 — Execution: shortcut → cmd → PowerShell

**Did the `.lnk` run, and when?** UserAssist in the victim's `NTUSER.DAT` (Registry Explorer) records execution at **22:49:00**. 

![](/uploads/20261104-152737.png)

Prefetch:

![](/uploads/20261104-152808.png)

```plain
.\PECmd.exe -d '...\C\Windows\prefetch' --csv ..\..\..\
```

shows `cmd.exe`, `findstr.exe` and `more.com` at that moment.

**The shortcut's target**:

```plain
%ComSpec% /c for /l %i in (1,1,1000) do @set /a z=%i%%%2 >nul & if %i==1000 type 3th^.pdf | more | findstr /n "^" | findstr "26004: 26005: 26006: 26007:" | for /f "tokens=1,* delims=:" %a in ('more') do c^md /c %b
```

What it does:

- The `for /l … 1000` loop does nothing useful; it burns time and adds noise.
- It prints `3th.pdf`, numbers every line (`findstr /n`), keeps only **lines 26004–26007**, and executes each of those lines as a `cmd /c` command. The "PDF" is therefore a container for commands.
- `c^md` uses a caret to dodge simple string matching on `cmd`.

The commands in those lines are PowerShell snippets that read a further slice of `3th.pdf` (`gc 3th.pdf | select -Skip 36100 -First 150 | Out-File -filepath .\script.ps1`) into a script and define obfuscated variables (`[char]` arrays) for the markers, password, magic value and drop directory. 

### Phase 4 — Decryption of the embedded scripts

Running the extracted `script.ps1` reveals the scheme:

![](/uploads/20261104-152902.png)

- Encrypted blocks are wrapped in fake `-----BEGIN PGP PRIVATE KEY BLOCK-----` armor, so they look like key material inside a PDF.
- Each block is Base64 with magic `PSA1`, version `1`, a 32-bit iteration count at offset 5, a salt, an IV, ciphertext and an HMAC tag.
- Key derivation is **PBKDF2 with password `1`**, 64 bytes out: the first 32 are the AES key and the last 32 the HMAC key. The iteration count printed by the lab script is **200000**.
- Verification is HMAC-SHA256; decryption is **AES-256-CBC, PKCS7**.
- Output goes to `%LOCALAPPDATA%\Microsoft\Realtek Diagnostics\` as `Cache_<GUID>.ps1`.

Five files were produced:

![](/uploads/20261104-153030.png)

| File (prefix) | Size | Created |
| --- | --- | --- |
| `Cache_812eed1b…` | 1298 B | 22:49:07 |
| `Cache_d439ebc2…` | 791 B | 22:49:09 |
| `Cache_23f640cb…` | 793 B | 22:49:10 |
| `Cache_ec641a2d…` | 2038 B | 22:49:11 |
| `Cache_27bfdab8…` | 489 B | 22:49:13 |

What each script does:

- **Subtitles dropper.** Pulls hex text between `=== SoundEffects N ===` markers in `3th.pdf`, strips non-hex, converts to bytes and writes `Microsoft.WindowsSoundDiagnostics\Subtitles` (≈1.8 MB).

![](/uploads/20261104-153514.png)

- **Scheduled-task script** (`#Silent Task Creation Script - No Output Version`). Registers `CheckRealtekAudioVersion`; deletes any previous task of the same name first.

![](/uploads/20261104-153657.png)

![](/uploads/20261104-153702.png)

- **`RealtekAudioService64.ps1` dropper.** Reads Base64 from lines matching `Name = "…"` in `3th.pdf` and decodes with a custom XOR using the key `Realtek2025`.

![](/uploads/20261104-153714.png)

- **`RealtekAudioService64.bat` dropper.** Same routine, reading a `KasKos = "…"` field, output as `.bat`.

![](/uploads/20261104-153721.png)

- **Extractor.** Unpacks `4th.pdf` with WinRAR, 7-Zip, Bandizip or `Expand-Archive`, whichever exists. So `4th.pdf` is really an archive.

![](/uploads/20261104-153736.png)

### Phase 5 — Persistence: scheduled tasks

All tasks share the cover story: **Description "Audio Helper", Author "AudioEngine"**, hidden, no battery restrictions.

**Task 1 — `CheckRealtekAudioVersion`**

- Principal: `SYSTEM` if elevated, otherwise the current user.
- Triggers: **time trigger** starting 5 minutes after creation (2-hour window) plus a **logon trigger**.
- Action: `cmd.exe /c "…\Microsoft.WindowsSoundDiagnostics\RealtekAudioService64.bat"`.
- Fallback if COM registration fails: `schtasks /create … /sc ONLOGON /delay 0001:00`.

**`RealtekAudioService64.bat`** relaunches itself hidden, then runs `RealtekAudioService64.ps1` with `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass`. The `powershell.exe` path is assembled from fragments (`power` + `shell` + `.exe`) to evade simple string detection. It also writes a log `ver0x0000000000000003_%RANDOM%.log` and deletes it afterward. `$J` confirms this: **created 22:54:14, deleted 22:55:02**.

![](/uploads/20261104-154240.png)

![](/uploads/20261104-154245.png)

**`RealtekAudioService64.ps1`** is written with **Chinese variable names** and Base64-encoded strings. It recreates the tasks:

| Task | Runs | Trigger |
| --- | --- | --- |
| `CheckRealtekAudioVersion` | `Cache\RtkNGUI64.exe` | `[TODO]` |
| `RealtekAudioEnhancement64` | `Cache\ConfigureSoundSettings\RealtekAudioEnhancements64.exe` | Logon of `khaled.allam` |

That explains why two tasks were created and one deleted: `CheckRealtekAudioVersion` was created at 22:49:12, then deleted and recreated at 22:54:57 together with `RealtekAudioEnhancement64`. `$J` shows the delete-and-recreate sequence.

![](/uploads/20261105-002940.png)

**Task 3 — `ResetRealtekAudioSettings64`** is created by a script in `ConfigureSoundSettings\` (see Phase 7).

> The scripts mix **Chinese** (variable names, AHK comments) and **Arabic** (PowerShell comments) text. This could be a deliberate false flag or code reuse. Do not treat it as attribution without other evidence.

### Phase 6 — Execution chain A: AutoHotkey → process hollowing

1. `RtkNGUI64.exe` and `RealtekAudioEnhancements64.exe` have the **same hash**: SHA-256 `EFFDEA83C6B7A1DC2CE9E9D40E91DFD59BED9FCBD580903423648B7CA97D9696`. VirusTotal: 0/71, original name `AutoHotkey.exe`. It is a **legitimate** binary abused as a launcher. An AutoHotkey exe automatically runs the `.ahk` file of the same name, so `RtkNGUI64.ahk` is the real program.

![](/uploads/20261104-155751.png)

2. `RtkNGUI64.ahk` (Chinese comments) includes four modules from `Audio\`: `RtkAudioEffects64.ahk`, `RtkDeviceConfigure64.ahk`, `RtkDiagService.ahk`, `RtkCplApp.ahk`. It sets the log path to `RtkLoggingManifest.man`, reads it as bytes, waits (`Sleep` = seconds × 1500) and calls `Execute(configData, systemPath)`.

![](/uploads/20261104-155828.png)

3. `RtkCplApp.ahk` defines `GetRandomPath()`: pick a **random** host among `C:\Windows\Microsoft.NET\Framework\v4.0.30319\` → `AddInProcess32.exe`, `AppLaunch.exe`, `aspnet_compiler.exe`.

![](/uploads/20261104-155848.png)

4. `RtkAudioEffects64.ahk` hides API/library names with **reverse + XOR 0x55**. 

![](/uploads/20261104-160653.png)

- Procmon on `RtkNGUI64.exe` shows it reading `RtkLoggingManifest.man`, then touching one of the .NET hosts. Together with the host-selection code this is **process hollowing**: the host process runs the payload while looking like a Microsoft binary.

![](/uploads/20261104-160704.png)

**Recovering the payload**. The `.man` file has one decimal byte per line (`… = 77`). Rebuild it:

![](/uploads/20261104-160739.png)

```plain
$b = foreach ($l in [IO.File]::ReadLines("$PWD\RtkLoggingManifest.man")) {
    if ($l -match '=\s*(\d+)\s*$') { [byte][int]$Matches[1] }
}
[IO.File]::WriteAllBytes("$PWD\out.exe", [byte[]]$b)
```

Result: a 309,760-byte .NET PE, original filename **`clay_Client.exe`**, SHA-1 `FCC5B7008428670B97E93A4C56ADF8BED65D0E1B`.

### Phase 7 — Execution chain B: Realtek script → reflective loading

The `RealtekAudioEnhancements64` side (folder `ConfigureSoundSettings\`) contains `RealtekAudioEnhancements32.ps1` and `64.ps1`, an `.ahk`, an `.assets` file and a `.bat`.

- **`RealtekAudioEnhancements32.ps1`** (Arabic comments) checks and **enables Windows Script Host** by writing `…\Windows Script Host\Settings\Enabled` under HKCU and HKLM. This makes sure the later VBScript can run.

![](/uploads/20261104-160815.png)

- The same script writes an XML task definition and a VBS file, then registers **`ResetRealtekAudioSettings64`**. The VBS runs `ResetRealtekAudioSettings64defualt.bat` hidden (note the typo "defualt" in the real filename).

![](/uploads/20261104-160838.png)

- The `.bat` launches hidden PowerShell with `-ep Bypass` that reads `ResetRealtekAudioSettings64.Realtek`, skipping the first 1000 lines (`500*2`) and taking the next 140 (`70*2`). The file name is built from fragments (`[char]97`, `62+2`) to defeat string search.

![](/uploads/20261104-160855.png)

- `ResetRealtekAudioSettings64.Realtek` is 329,987 bytes. Lines 1002 and 1003 hold two large hex blobs separated by `@` that start with `4D 5A` (**MZ**). The script converts them to byte arrays and calls `[System.Reflection.Assembly]::Load()` on one of them: **fileless loading** of .NET code.

![](/uploads/20261104-160907.png)

Recovery:

```plain
[System.IO.File]::WriteAllBytes("C:\Users\BTLOTest\Desktop\1.dll", $09b379bd)
[System.IO.File]::WriteAllBytes("C:\Users\BTLOTest\Desktop\2.exe", $52ae32da)
```

| Recovered | Original name | SHA-256 |
| --- | --- | --- |
| `1.dll` (51.5 KB) | `output.dll` | `129333D66013B00B78BC72AAAAC93BF399ED90937A367E0D3426AEFB657C7F01` |
| `2.exe` (≈1.25 MB) | `4484.exe` | `96B486BD7308EF3D6771360800F4C9B48B10697BD4CB69A8589B97B039377ECB` |

### Phase 8 — Payload analysis

- Detect It Easy / dnSpy show an obfuscated .NET binary. The assembly contains `ConfusedByAttribute`, a **ConfuserEx** marker. After running **de4dot** the output was saved as `2-cleaned.exe`.

![](/uploads/20261104-162518.png)

![](/uploads/20261104-163236.png)

- In dnSpy, `GClass0` holds the C2 list: **three encrypted strings** and one port, **448**. The strings are decrypted at runtime by `<Module>.smethod_3` / `smethod_6`.

![](/uploads/20261104-161128.png)

![](/uploads/20261104-161149.png)

- `Main` (`GClass1`) creates a **mutex** (name also encrypted) and exits if it already exists, so only one instance runs. It then loops forever, sleeping a **random 1–6 s** between attempts.

![](/uploads/20261104-163553.png)

- The connect routine opens a TCP socket and picks a **random** C2 from the list, sets 50,000-byte buffers and starts async receive. A timer fires every **10–15 s** (heartbeat/ping).
- The command enum includes `RemoteDesktopOpen`, `RemoteDesktopSend`, `filemanageropen`, `getDrives`, `mousemove`, `Reflection`, `RunPE`, `Ping`, `identification`, `ClientUpdate`, `ClientDelete`, `ClientShutdown`.

**Assessment:** a RAT-style client with remote desktop, file management, in-memory code loading and self-update/delete. These are capabilities seen in code, not confirmed actions.

### Phase 9 — Impact and scope

- **Compromised account/host:** `khaled.allam` workstation.
- **Persistence:** three hidden scheduled tasks (two run AutoHotkey, one runs a VBS/BAT/PowerShell chain), triggers include logon, so access survives reboot.
- **Capability:** remote desktop, file browsing, arbitrary code loading, to TCP/448 C2.
- **Evidence removal:** log deleted at 22:55:02; decoy PDF shown; hidden files; legitimate-looking names (Realtek, Microsoft.WindowsSoundDiagnostics).
- **Not proven in the evidence:** data exfiltration or lateral movement. 

***

## 6. Lab Q&A

| \# | Question | Answer |
| --- | --- | --- |
| 1 | The intrusion began with the victim searching for a resource he wanted. What time was his last search before he reached the malicious site? (3 points) |  |
| 2 | He downloaded what he believed was an ebook from a site impersonating a well-known AI vendor. What domain served it? (3 points) |  |
| 3 | What time did that download complete? (3 points) |  |
| 4 | How many bytes were transferred? (3 points) |  |
| 5 | He extracted the archive. Alongside the shortcut he clicked, two files were written to the same folder but kept out of sight. Name them. (3 points) |  |
| 6 | What time did the victim execute the shortcut? (3 points) |  |
| 7 | The shortcut chained two living-off-the-land binaries to carve its first commands out of a hidden file. One of them had been executed exactly once on this host. Which? (4 points) |  |
| 8 | Which lines of the hidden file did the shortcut select and execute? (4 points) |  |
| 9 | Those lines launched a hidden PowerShell instance that reached back into the same file, skipping a number of lines and taking a fixed number after them. Give both values. (4 points) |  |
| 10 | That stage derives its decryption key with a password-based key derivation function. How many iterations does it use? (4 points) |  |
| 11 | Public reporting on this family states the decrypted scripts are written to %APPDATA%. That is not what happened here. Give the full path actually used on this host. (4 points) |  |
| 12 | How many scripts were written to that directory? (3 points) |  |
| 13 | The first of those scripts rebuilt a compressed bundle by concatenating hex from marked sections of the container file. What is the size in bytes of the file it produced? (4 points) |  |
| 14 | Unpack that bundle, applying the byte transform the malware uses. Give the SHA-256 of the largest file in the resulting tree. (4 points) |  |
| 15 | Two executables in that tree carry different names in different directories but are byte-identical, and neither contains any malicious code. Give the SHA-256 they share. (4 points) |  |
| 16 | What legitimate software are those two executables? (4 points) |  |
| 17 | A batch file in that tree wrote a log to cover its work and deleted it seconds later. The file is absent from disk. Can you recover its full filename? (4 points) |  |
| 18 | Give the creation and deletion times of that log. (4 points) |  |
| 19 | Two hidden scheduled tasks were registered for persistence, both carrying the same fake vendor identity. What Author value do they share? (3 points) |  |
| 20 | One of those tasks already existed and was deleted and recreated to point at a new binary. What time was the replacement registered? (4 points) |  |
| 21 | How many seconds elapsed between the victim executing the shortcut and the final persistence entry being written to disk? (4 points) |  |
| 22 | One branch decodes a payload from a file masquerading as a logging manifest, where each byte is stored as a decimal number inside a sentence. Extract it and give its SHA-1. (4 points) |  |
| 23 | What is that payload's internal name, as recorded in its version metadata? (4 points) |  |
| 24 | The other branch loads a .NET assembly by reflection to perform its injection. That assembly is not a payload. What is its internal filename? (4 points) |  |
| 25 | The final remote access trojan is protected and its strings are encrypted, but its configuration class leaks the port in plaintext. What port does it connect to? (4 points) |  |
| 26 | How many command-and-control hosts is it configured with? (4 points) |  |
| 27 | It sleeps for a randomised interval between connection attempts. Give the lower and upper bound in milliseconds. (4 points) |  |

***

## 7. IOCs

| Type | Value | Note |
| --- | --- | --- |
| Domain | `claude-ai-setup[.]com` | Lookalike, HTTP |
| URL | `hxxp[://]claude-ai-setup[.]com/Agentic%20Coding%20with%20Claude%20Code….7z` | Archive source |
| File | `Full Agentic Coding with Claude Code.pdf` | Decoy |
| File | `3th.pdf`, `4th.pdf` | Hidden carriers |
| Hash (SHA-1) | `FCC5B7008428670B97E93A4C56ADF8BED65D0E1B` | `clay_Client.exe` (`out.bin`) |
| Hash (SHA-256) | `EFFDEA83C6B7A1DC2CE9E9D40E91DFD59BED9FCBD580903423648B7CA97D9696` | AutoHotkey, renamed `RtkNGUI64.exe` / `RealtekAudioEnhancements64.exe` |
| Hash (SHA-256) | `129333D66013B00B78BC72AAAAC93BF399ED90937A367E0D3426AEFB657C7F01` | `output.dll` |
| Hash (SHA-256) | `96B486BD7308EF3D6771360800F4C9B48B10697BD4CB69A8589B97B039377ECB` | `4484.exe` |
| Path | `%LOCALAPPDATA%\Microsoft\Realtek Diagnostics\Cache_*.ps1` | Dropped scripts |
| Path | `%LOCALAPPDATA%\Packages\Microsoft.WindowsSoundDiagnostics\` | Staging root |
| Path | `…\Cache\RtkNGUI64.exe`, `.ahk`, `RtkLoggingManifest.man`, `Audio\*.ahk` | AHK chain |
| Path | `…\Cache\ConfigureSoundSettings\RealtekAudioEnhancements64.*` | Second chain |
| Path | `…\ResetRealtekAudioSettings64.Realtek`, `…64defualt.bat` | Reflective loader |
| Path | `…\RealtekAudioService64.bat`, `.ps1`; `Subtitles` | Dropped scripts |
| Scheduled tasks | `CheckRealtekAudioVersion`, `RealtekAudioEnhancement64`, `ResetRealtekAudioSettings64` | Author `AudioEngine`, description `Audio Helper` |
| Log pattern | `ver0x0000000000000003_<RANDOM>.log` | Created then deleted |
| Crypto | `PSA1`, PBKDF2 password `1`, 200000 iters; XOR key `Realtek2025` | Decryption parameters |
| Registry | `HKCU/HKLM\Software\Microsoft\Windows Script Host\Settings\Enabled` | Modified |

***

## 8. MITRE ATT&CK

| Tactic | Technique | ID | Evidence |
| --- | --- | --- | --- |
| Resource Development | Acquire Infrastructure: Domains | T1583.001 | `claude-ai-setup[.]com` |
| Execution | User Execution: Malicious File | T1204.002 | Victim ran the `.lnk` (UserAssist 22:49:00) |
| Execution | Command and Scripting Interpreter: Windows Command Shell | T1059.003 | `cmd /c` chain from the shortcut |
| Execution | Command and Scripting Interpreter: PowerShell | T1059.001 | `Cache_*.ps1`, `RealtekAudioService64.ps1` |
| Execution | Command and Scripting Interpreter: AutoHotKey & AutoIT | T1059.010 | `RtkNGUI64.exe` + `.ahk` |
| Execution | Command and Scripting Interpreter: Visual Basic | T1059.005 | VBS launching the `.bat` |
| Persistence | Scheduled Task/Job: Scheduled Task | T1053.005 | Three "Audio Helper" tasks |
| Defense Evasion | Masquerading: Match Legitimate Name or Location | T1036.005 | Realtek / WindowsSoundDiagnostics names |
| Defense Evasion | Obfuscated Files or Information | T1027 | `[char]` arrays, fragmented strings, ConfuserEx |
| Defense Evasion | Obfuscated Files or Information: Encrypted/Encoded File | T1027.013 | PSA1 AES blocks, XOR, Base64, hex in `.man`/`.Realtek` |
| Defense Evasion | Deobfuscate/Decode Files or Information | T1140 | Scripts decrypt themselves at runtime |
| Defense Evasion | Hide Artifacts: Hidden Files and Directories | T1564.001 | Hidden `3th.pdf` / `4th.pdf` (via `$J`) |
| Defense Evasion | Process Injection: Process Hollowing | T1055.012 | `RtkNGUI64.ahk` → .NET host |
| Defense Evasion | Reflective Code Loading | T1620 | `Assembly.Load()` of embedded PE |
| Defense Evasion | Modify Registry | T1112 | Windows Script Host enabled |
| Defense Evasion | Indicator Removal: File Deletion | T1070.004 | `.log` deleted 22:55:02 |
| Command and Control | Non-Application Layer Protocol | T1095 | Raw TCP socket in `clay_Client` `[VERIFY]` |
| Command and Control | Non-Standard Port | T1571 | TCP/448 `[VERIFY]` |

***

## 9. Lessons learned

- A shortcut can be a full loader: reading its target is the fastest way to understand the chain.
- A "document" extension proves nothing; check content and size, and treat unusually large text files next to script engines as payload containers.
- Legitimate signed tooling (AutoHotkey, .NET host binaries) hides malicious logic in sibling files. Look at what the binary **loads**, not at the binary itself.
- Cross-check task creation, process start and `$J` events: the 5-minute delay in the first task explains the timing of everything that follows.

## 10. References

- Edge/Chromium time format (WebKit epoch, 1601-01-01)
- MITRE ATT&CK: https://attack.mitre.org/
- Eric Zimmerman tools (MFTECmd, PECmd, Registry Explorer, Timeline Explorer)
- de4dot, dnSpy documentation
