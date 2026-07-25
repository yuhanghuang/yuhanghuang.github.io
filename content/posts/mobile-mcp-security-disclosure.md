---
title: "Mobile-MCP Security Research: Unauthenticated MCP Access and Android Shell Injection"
date: 2026-07-25
draft: false
tags: ["Security Research", "MCP", "Android", "ADB", "Coordinated Disclosure"]
description: "Two security issues in mobile-next/mobile-mcp: unauthenticated SSE access and Android device-side shell injection."
---

## Disclosure status

I reported two issues in `mobile-next/mobile-mcp`. The project uses GitHub Security Advisories (GHSA); GitHub’s CNA process requires the repository owner to request CVE IDs through a GHSA. At publication time, neither issue has a CVE ID.

## Tested environment

- Project: [`mobile-next/mobile-mcp`](https://github.com/mobile-next/mobile-mcp)
- Package: `@mobilenext/mobile-mcp`
- Tested version: 0.0.43
- Environment: Windows with an Android 11 / API 32 emulator

## Issue 1: Unauthenticated MCP SSE endpoint

`src/index.ts` exposes `GET /mcp` and `POST /mcp` without authentication, authorization, an API key, or an IP allowlist. A reachable client can connect to the SSE transport and invoke the registered device-control tools.

### Reproduction

1. Start the server in a network-reachable configuration.
2. Connect an MCP client or MCP Inspector to the server’s `/mcp` SSE endpoint without providing credentials.
3. Observe that a session is established and that the available tools can be enumerated.
4. Call a non-destructive tool such as `mobile_list_available_devices`; the connected Android device identifiers are returned without authentication.

## Issue 2: Android device-side shell injection

`openUrl()` passes an untrusted `url` into `adb shell am start ... -d <url>`. Although Node.js uses `execFileSync()` with an argument array, `adb shell` forwards command text for parsing by the Android device shell. Shell metacharacters in the URL are therefore interpreted on the device.

The same pattern was observed where unescaped `packageName` values are passed through `launchApp()` and `terminateApp()`.

### Reproduction

1. Use Issue 1 to enumerate a connected device identifier.
2. Verify that a harmless marker file does not exist on the test device.
3. Invoke `mobile_open_url` for that device with this test URL: `http://x$(id>/sdcard/mobile_mcp_poc.txt)`.
4. The resulting call is passed through `adb shell`; Android’s `/system/bin/sh` evaluates the command substitution.
5. Verify `/sdcard/mobile_mcp_poc.txt`. In the tested environment, `id` ran as `uid=2000(shell)`.

This confirms command execution on the connected Android device, not on the host operating system.

## Remediation

Require authentication for both MCP routes and bind to loopback by default. Avoid passing untrusted values through `adb shell`; use device-side APIs or strictly validated, consistently escaped arguments. Apply the existing shell-escaping strategy to every shell-facing argument and add tests for shell metacharacters.

## References

- [mobile-next/mobile-mcp repository](https://github.com/mobile-next/mobile-mcp)
- [Project security page](https://github.com/mobile-next/mobile-mcp/security)
- [yuhanghuang](https://github.com/yuhanghuang), reporter
