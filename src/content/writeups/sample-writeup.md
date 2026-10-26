---
title: "Sample writeup: delete me"
date: 2026-10-26
summary: Placeholder post to check the layout. Replace it from /admin.
platform: TryHackMe
difficulty: Easy
category: SIEM
tools: [Splunk]
mitre: [T1059.001]
tags: [siem, sample]
draft: false
---
## Overview
Short description of the scenario.

```spl
index=main EventCode=4688 | stats count by NewProcessName
```
