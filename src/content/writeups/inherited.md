---
title: Inherited
date: 2026-11-06
summary: Halvard Trust Bank discovers unauthorized payments after an attacker secretly maintained access to its systems for weeks. The investigation traces how the attacker gained access through the authentication server, which customers were affected, and who created the fraudulent payments.
platform: BTLO
difficulty: Hard
category: Incident Response / Log Analysis
image: https://blueteamlabs.online/storage/labs/77f1b8381799feb3be2c551063fbfb5ab79ebdaa.png
featured: false
tools:
  - Timeline Explorer
  - awk / sort / uniq
mitre:
  - T1190
  - T1078
  - T1098
  - T1556.006
  - T1087
  - T1657
  - T1071.001
tags:
  - DFIR
  - SOC monitoring
  - Log analysis
draft: false
---

|||
|---|---|
| **Platform** | Blue Team Labs Online (BTLO) |
| **Lab** | Inherited |
| **Category** | Incident Response / Log Analysis |
| **Author** | Đặng Đắc Tài |
| **Date** | 6/11/2026 |
| **Victim** | Halvard Trust Bank, customer `r.tannous` (Rana Tannous) |

***

## 1. TL;DR

On 2 February 2026 an attacker at `198.51.100.77` hammered the bank's HID ActivID authentication endpoint (`/idp/HVTPROD/authn`) **47,213 times** overnight, then reached the ActivID **SOAP back-end** (`/ac-iasp-backend-jaxws/UserManager` and `CredentialManager`), which should never be exposed to the internet. After three HTTP 500 failures the call succeeded. This is a publicly documented ActivID authentication bypass, fixed by HID hotfix **FIXS2510005**.

With that access the attacker could **set customer passwords directly**. On 21 and 26 February a customer account logged in one second after the attacker touched the back-end, using a password credential that had not existed a moment earlier. On the night of 27–28 February the attacker dumped the customer directory, looked up Rana Tannous's record (`208450`), rebuilt her second factor (5 device unbinds, 2 new authenticator types), logged in as her and set up payments. Eight payment rows went to **Norrhavn Textile Trading** (`7018245663991`), most for **1,499,999 HVD**, just under a round limit. Completed payments total **10,544,993 HVD**. Hours later the attacker's address was still sending requests every **2,440 s**.

***

## 2. Scenario and scope

Early on 28 February 2026 a series of payments left a business account at Halvard Trust Bank. Neither of the account's two signatories made them. The bank only noticed when the settlement report came through. By then the attacker had been inside for weeks; every step was logged, but nobody was reading the logs.

**Stack:** HID ActivID Authentication Server v8.7 behind a FortiWeb WAF, online banking on a Kony Fabric tier, payments in MySQL. Currency: Halvard krona (HVD).

**Evidence provided** (`Desktop\Artefacts\Inherited\artefacts\`): WAF alert extract (`waf_alerts_20260202-20260228.csv`), raw WAF traffic for three days (`waf_traffic_20260202/0221/0228.csv`), the ActivID audit table (`activid_audit_20260127-20260302.csv`), the digital banking event table (`infinity_events_20260201-20260301.csv`), the administrative console log (`admin_console_20250418-20260301.csv`) and the MySQL binary log.

**The board's three questions:** how the attacker obtained the ability to act, which customers are affected, and whether anyone can say who created the payments.

> **Time zone.** The human-readable date/time columns in these exports are **UTC+2**. This was checked against the epoch columns (`itime` in the WAF traffic, `TIMESTAMP` in ActivID). All times in this writeup are **UTC** unless marked otherwise.

## 3. Tools

| Purpose | Tool |
| --- | --- |
| Counting / grouping CSV fields | `cat`, `awk`, `sort`, `uniq` |
| Filtering and timeline review | Timeline Explorer |
| Payment records | MySQL binary log (text export) |
| Vendor advisory | Synacktiv / HID |

***

## 4. Consolidated timeline (UTC)

| Time | Event | Source |
| --- | --- | --- |
| 2026-02-02, overnight | `198.51.100.77` requests `/idp/HVTPROD/authn` 47,213 times | WAF traffic |
| 2026-02-02 | ActivID records 51,309 events in one day, almost all from user id `77` (`AT_SYSAUD`) | ActivID audit |
| 2026-02-02 03:48–03:50 | WAF alerts: `/scim`, `/scim/HVTPROD/v2/Users` | WAF alerts |
| 2026-02-02 04:12:18 | First HTTP 200 on `/ac-iasp-backend-jaxws/UserManager?wsdl` (after 3 × HTTP 500) | WAF traffic |
| 2026-02-02 04:13:02 | `/ac-iasp-backend-jaxws/CredentialManager?wsdl` | WAF traffic |
| 2026-02-12 11:04 | Probes of `/admin` on ActivID and online banking | WAF alerts |
| 2026-02-21 16:33:39–16:33:51 | Four back-end requests (2 × UserManager, 2 × CredentialManager) | WAF traffic |
| 2026-02-21 16:33:52 | Account `8163402257` logs in with a brand-new password credential | ActivID audit |
| 2026-02-26 14:57:11 | Account `2740885193` session includes `changeUserPassword` | ActivID audit |
| 2026-02-27 14:57:12 | Customer `6607314982` first opened | Banking events |
| 2026-02-27 20:25 – 22:42 | Rana's 2FA rebuilt: devices unbound, `AT_TDSOOB` and `AT_CUSTSMS` added | ActivID audit |
| 2026-02-27 23:38:22 | First WAF alert of the night: `/scim/HVTPROD/v2/Users` | WAF alerts |
| 2026-02-28 00:52:17 | `/scim/HVTPROD/v2/Credential/` | WAF alerts |
| 2026-02-28 01:12:48 | `/admin` on `fabric-preprod.apps.halvardtrust.example` | WAF alerts |
| 2026-02-28 01:42 | Rana's login used to search other customers | Banking events |
| 2026-02-28 02:03:27 | `changeUserPassword` (user `77`), then login as Rana | ActivID audit |
| 2026-02-28 02:03:32 | Rana's session opens customer `6607314982` | Banking events |
| 2026-02-28 ≈06:00–13:00 | Payment rows written to MySQL | MySQL binlog |
| 2026-02-28 12:19:07 → 12:59:47 | Requests from the attacker's address every 2,440 s | WAF traffic |

***

## 5. Analysis by phase

### Phase 1 — The noisy day: 2 February

**Where to look:** `activid_audit_20260127-20260302.csv`. Count events per day:

```plain
cat activid_audit_20260127-20260302.csv | awk -F',' '{print $1}' | sort | uniq -c
```

![](/uploads/inherited-01.png)

**2026-02-02** stands out with **51,309** events. Grouping that day by event type and user:

```plain
cat activid_audit_20260127-20260302.csv | awk -F',' '{print $3}' | sort | uniq -c
```

![](/uploads/inherited-02.png)

![](/uploads/inherited-03.png)

- Almost every event belongs to the platform service identity with **user id `77`**, authenticator type **`AT_SYSAUD`**.
- Every event has a **new session id**: something was authenticating over and over, not a person working in one session.

The raw WAF traffic for the same day explains it. Group by source IP and URL:

```plain
cat waf_traffic_20260202.csv | awk -F',' '{print $18, $25}' | sort | uniq -c | sort
```

![](/uploads/inherited-04.png)

- **`198.51.100.77`** requested **`/idp/HVTPROD/authn` 47,213 times** through the night.

### Phase 2 — Initial access: the ActivID back-end

Shortly after the flood stopped, the same source reached the ActivID **SOAP back-end**, an administrative interface that has no business being reachable from the internet.

![](/uploads/inherited-05.png)

| UTC | Request |
| --- | --- |
| 04:12:18 | `/ac-iasp-backend-jaxws/UserManager?wsdl` (first HTTP 200) |
| 04:13:02 | `/ac-iasp-backend-jaxws/CredentialManager?wsdl` |

![](/uploads/inherited-06.png)

- The first **3** attempts failed with **HTTP 500** before one returned 200.
- `UserManager` and `CredentialManager` together let a caller manage users and their credentials, which is exactly what is needed to set a customer's password.

This matches a publicly documented authentication bypass in HID ActivID Authentication Server, fixed by vendor hotfix **FIXS2510005** ([Synacktiv advisory](https://www.synacktiv.com/advisories/activid-authentication-bypass)).

### Phase 3 — Testing the access: account `8163402257` (21 February)

Nineteen days later the attacker called the pair of interfaces again: **two requests to each, twelve seconds end to end**, the last at **2026-02-21 16:33:51 UTC**.

![](/uploads/inherited-07.png)

**Where to look:** ActivID audit, filtered to one second later (16:33:52 UTC, shown as 18:33:52 in the log).

![](/uploads/inherited-08.png)

![](/uploads/inherited-09.png)

- Account **`8163402257`** logs in on `CH_WEB` with `AT_CUSTPW` (`indirectPrimaryAuthenticateUP`). The password credential used **did not exist a moment earlier**: it was planted through the back-end.

![](/uploads/inherited-10.png)

![](/uploads/inherited-11.png)

The service identity `77` (`spl-api`, `CH_DIRECT`) carries the administrative operations: `changeUserPassword`, `createAuthenticator`, `assignDeviceToUser`, `createDeviceIssuanceRequestExt`, `createUPAuthenticator`.

![](/uploads/inherited-12.png)

### Phase 4 — Second account: `2740885193` (26 February)

Five days later the same pattern repeats on a second customer account, **`2740885193`** (target user id `205110`), with one extra directory operation part-way through the session: **`ChangeUserPassword`**.

![](/uploads/inherited-13.png)

The session sequence:

1. `indirectPrimaryAuthenticateUP`, SUCCESS
2. `indirectPrimaryAuthenticateUP`, FAILED
3. **`changeUserPassword`** (`CH_DIRECT`), at 14:57:11 UTC
4. `indirectPrimaryAuthenticateUP`, SUCCESS
5. `logout`
6. `indirectPrimaryAuthenticateUP`, SUCCESS, then a FAILED attempt
7. `updateUPAuthenticatorStatus`, `createUPAuthenticator`

![](/uploads/inherited-29.png)

In the banking events this username is attached to the attacker's IP.

### Phase 5 — The night of 27–28 February: directory reconnaissance

**Where to look:** `waf_alerts_20260202-20260228.csv`. Every alert comes from `198.51.100.77`.

![](/uploads/inherited-20.png)

![](/uploads/inherited-14.png)

| UTC | Host | URL |
| --- | --- | --- |
| 02-27 23:38:22 | `acid.halvardtrust.example` | `/scim/HVTPROD/v2/Users` (information disclosure) |
| 02-28 00:14:09 | `acid.halvardtrust.example` | `/favicon.ico` |
| 02-28 00:31:44 | `acid.halvardtrust.example` | `/configurationa` |
| 02-28 00:52:17 | `acid.halvardtrust.example` | `/scim/HVTPROD/v2/Credential/` |
| 02-28 01:06 | `fabric-preprod.apps.halvardtrust.example` | `.well-known/oauth-authorization-server`, `openid-configuration` |
| 02-28 01:12:48 | `fabric-preprod.apps.halvardtrust.example` | `/admin` |

- The SCIM searches dump the customer directory. One request was answered with a much larger response than any other: **1,904,672 bytes**.
- Apart from the bulk searches, the attacker requested one record by numeric id: **`208450`**, which is **Rana Tannous**.

![](/uploads/inherited-15.png)

- In ActivID, user `208450` has `INDIRECTEXTREF` **`r.tannous`** for logins, and `2415229935` on her `createUserEx` record.

![](/uploads/inherited-16.png)

### Phase 6 — Taking over Rana Tannous's second factor

In the hours before the payments the second-factor setup on Rana's account was changed repeatedly, all by service identity `77`:

![](/uploads/inherited-23.png)

![](/uploads/inherited-24.png)

- `createAuthenticator` **`AT_TDSOOB`** at 02-27 20:25:03 UTC.
- `assignDeviceToUser` / `createDeviceIssuanceRequestExt` between 21:41 and 21:50 UTC.
- `createAuthenticator` **`AT_CUSTSMS`** at 02-27 22:42:11 UTC.
- In total, a device was **unbound 5 times** and **2 new authenticator types** were added.

With both her password and her second factor under the attacker's control, the real customer would see nothing unusual. That matches her statement.

### Phase 7 — Acting as Rana

![](/uploads/inherited-17.png)

- Rana's account is used from **Firefox**, from 17:44:03 (log time). `[VERIFY: date and UTC time of this first Firefox session]`

![](/uploads/inherited-21.png)

- Around **01:42 UTC** on 28 February her login is used to search for other customers.
- At **02:03:27 UTC** user `77` runs `changeUserPassword` and the attacker logs in as Rana; at **02:03:32 UTC** the session opens customer **`6607314982`**.

![](/uploads/inherited-25.png)

![](/uploads/inherited-26.png)

That customer record had already been opened on 26 and 27 February. The first open was **2026-02-27 14:57:12 UTC**.

![](/uploads/inherited-27.png)

![](/uploads/inherited-28.png)

- The last event of that session before it stopped has the Producer **`PayeeObjects/Recipients/getExternalPayees`**. The attacker was checking the payee list right before the money moved.

### Phase 8 — The payments

![](/uploads/inherited-18.png)

![](/uploads/inherited-19.png)

![](/uploads/inherited-22.png)

**Where to look:** MySQL binary log, search for the customer/account numbers.

![](/uploads/inherited-30.png)

![](/uploads/inherited-31.png)

- **Eight** payment rows went to the same destination: account **`7018245663991`**, payee **Norrhavn Textile Trading**.
- **Eight** rows share the amount **1,499,999 HVD**, set just under a round limit (1,500,000), most likely to stay under a review or approval threshold.
- Not every row completed. The single failed row has response code **`9998`**.

![](/uploads/inherited-32.png)

- Sum of completed rows only: **10,544,993 HVD**. (This is consistent with 7 × 1,499,999 = 10,499,993 plus one other completed row of 45,000.)

### Phase 9 — Still connected

Hours after the payments, requests from the attacker's address were still being accepted at a fixed interval no human would keep:

![](/uploads/inherited-33.png)

| `itime` | UTC |
| --- | --- |
| 1772281147 | 2026-02-28 12:19:07 |
| 1772283587 | 2026-02-28 12:59:47 |
| 1772295547 | 2026-02-28 16:19:07 |
| 1772297987 | 2026-02-28 16:59:47 |

The interval is **2,440 s** (40 min 40 s), the signature of an automated session keep-alive or beacon.

### Phase 10 — Impact and scope

- **How the attacker got the ability to act:** an exposed ActivID SOAP back-end vulnerable to a known authentication bypass (fixed by FIXS2510005). From it, the attacker could set customer passwords and manage authenticators as the platform service identity `77`.
- **Customers affected:** `8163402257` (21 Feb), `2740885193` / user `205110` (26 Feb), **Rana Tannous** (user `208450`, `r.tannous`) whose account sent the payments, and customer `6607314982` whose record was opened from her session. The directory dump (1.9 MB response) exposes **every customer in it**.
- **Who created the payments:** the logs attribute them to Rana's account, but her password and second factor had been replaced by the attacker minutes or hours earlier, and the sessions came from the attacker's address. **The payments cannot be attributed to the account holder.**
- **Not proven in the evidence:** where the money went after `7018245663991`, and whether the attacker used other accounts that never logged in.

***

## 6. Lab Q&A

| \# | Question | Answer |
| --- | --- | --- |
| 1 | One day in the ActivID audit export contains far more events than any other day. Give that date, and the total number of events recorded on it. (6 points) | `2026-02-02`, `51309` |
| 2 | Almost all of that day's events are a single event type, recorded under one platform service identity, with a new session id for every event. Give that identity's numeric user id, and the authenticator type shown on those events. (5 points) | `77`, `AT_SYSAUD` |
| 3 | The raw WAF traffic for that day shows one source address sending the same request over and over through the night. Give the path it requested, and how many times that source requested it. (6 points) | `/idp/HVTPROD/authn`, `47213` |
| 4 | Shortly after that stopped, the same source reached an interface on the authentication server that has no business being reachable from the internet. Give the full path, including any query string, of the first request to that interface that was answered with HTTP 200. (6 points) | `/ac-iasp-backend-jaxws/UserManager?wsdl` |
| 5 | The attacker's first attempts to call that interface did not work. How many failed before one succeeded, and what HTTP status did the failures return? (5 points) | `3`, `500` |
| 6 | What you have reconstructed is a publicly documented flaw in this product. Give the identifier of the vendor hotfix that fixes it. (5 points) | `FIXS2510005` |
| 7 | Nineteen days later the attacker called that pair of interfaces again — two requests to each, twelve seconds end to end. Give the UTC time of the last of those four requests. (5 points) | `2026-02-21 16:33:51` |
| 8 | One second after it, a customer account logged in using a password credential that had not existed a moment earlier. Give that account number. (6 points) | `8163402257` |
| 9 | Five days later the same thing happens to a second customer account, with one extra directory operation part-way through the session. Give that account number and the name of that operation. (6 points) | `2740885193`, `ChangeUserPassword` |
| 10 | On the night of the payments the attacker searched the customer directory. One request was answered with a much larger response than any other. Give the size of that response in bytes. (5 points) | `1904672` |
| 11 | Apart from the bulk searches, the attacker requested one single directory record by its numeric id. Give that id. (6 points) | `208450` |
| 12 | In the hours before the payments, the second-factor setup on Rana Tannous's account was changed repeatedly. Give two numbers: how many times a device was unbound from her account, and how many new authenticator types were added to it. (6 points) | `5`, `2` |
| 13 | During that session, her login was used to open a different customer's records. Give that customer id, and the UTC time it was first opened. (6 points) | `6607314982`, `2026-02-27 14:57:12` |
| 14 | Give the Producer value on the last event of that session before it stopped. (5 points) | `PayeeObjects/Recipients/getExternalPayees` |
| 15 | Eight of the payment rows written that night were sent to the same destination account. Give that account number, and the payee name stored alongside it. (6 points) | `7018245663991`, `Norrhavn Textile Trading` |
| 16 | Not every payment row written against the victim's account completed. Add up only the ones that did, and give the total. (6 points) | `10544993` |
| 17 | Eight of those rows share one amount, set just under a round limit. Give that amount, and the response code recorded on the single row that failed. (5 points) | `1499999`, `9998` |
| 18 | Hours after the payments, requests from the attacker's address were still being accepted, arriving at a fixed interval no human would keep. Give that interval in seconds. (5 points) | `2440` |

***

## 7. IOCs

| Type | Value | Note |
| --- | --- | --- |
| IP | `198.51.100[.]77` | Attacker source for all WAF alerts and back-end calls |
| URL path | `/idp/HVTPROD/authn` | Requested 47,213 times on 2026-02-02 |
| URL path | `/ac-iasp-backend-jaxws/UserManager?wsdl` | Exposed ActivID SOAP back-end |
| URL path | `/ac-iasp-backend-jaxws/CredentialManager?wsdl` | Exposed ActivID SOAP back-end |
| URL path | `/scim/HVTPROD/v2/Users`, `/scim/HVTPROD/v2/Credential/` | Directory and credential enumeration |
| Host | `fabric-preprod.apps.halvardtrust[.]example` `/admin` | Pre-prod admin access |
| Identity | ActivID user id `77` (`spl-api`, `AT_SYSAUD`) | Service identity used for all admin operations |
| Account | `8163402257` | Password planted 2026-02-21 |
| Account | `2740885193` (user `205110`) | Password changed 2026-02-26 |
| Account | `r.tannous` (user `208450`) | Victim account used for payments |
| Customer | `6607314982` | Record opened from Rana's session |
| Bank account | `7018245663991` — Norrhavn Textile Trading | Payment destination |
| Amount | `1499999` HVD | Repeated just-under-limit amount |
| Behaviour | Requests every 2,440 s | Automated keep-alive after the payments |
| Vendor fix | HID hotfix `FIXS2510005` | Patch for the exploited flaw |

***

## 8. MITRE ATT&CK

| Tactic | Technique | ID | Evidence |
| --- | --- | --- | --- |
| Initial Access | Exploit Public-Facing Application | T1190 | ActivID authentication bypass via `/ac-iasp-backend-jaxws/*` |
| Persistence | Account Manipulation | T1098 | `changeUserPassword`, planted password credentials |
| Credential Access / Persistence | Modify Authentication Process: Multi-Factor Authentication | T1556.006 | `AT_TDSOOB` / `AT_CUSTSMS` added, devices unbound |
| Defense Evasion / Initial Access | Valid Accounts | T1078 | Logins as `8163402257`, `2740885193`, `r.tannous` |
| Discovery | Account Discovery | T1087 | SCIM `/Users` searches, 1.9 MB response, lookup of `208450` |
| Impact | Financial Theft | T1657 | Payments to `7018245663991` |
| Command and Control | Application Layer Protocol: Web Protocols | T1071.001 | HTTPS requests every 2,440 s `[VERIFY]` |

***

## 9. Lessons learned

- An authentication server's **back-end interfaces** must never be reachable from the internet. One exposed SOAP endpoint turned an auth product into a password-reset service for the attacker.
- A spike of tens of thousands of events from a **service identity** with a new session each time is not noise. It was the first visible sign of the intrusion, three weeks before the money moved.
- "The customer saw nothing unusual" is expected when both factors are replaced. Alert on **2FA changes followed by payee lookups and payments** in the same night.
- Amounts just under a limit (1,499,999) repeated to one new payee are a classic fraud pattern worth a rule of their own.
- Check the time zone of every export against its epoch column before building a timeline.

## 10. References

- HID ActivID Authentication Server: https://www.hidglobal.com/products/activid-authentication-server
- Synacktiv advisory, ActivID authentication bypass (hotfix FIXS2510005): https://www.synacktiv.com/advisories/activid-authentication-bypass
- MITRE ATT&CK: https://attack.mitre.org/
- Eric Zimmerman tools (Timeline Explorer)
