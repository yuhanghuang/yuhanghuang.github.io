---
title: "Mobile-MCP 安全研究：未鉴权 MCP 端点与 Android Shell 注入"
date: 2026-07-25
draft: false
tags: ["安全研究", "MCP", "Android", "ADB", "协调披露"]
description: "关于 mobile-next/mobile-mcp 未鉴权 SSE 端点及 Android 设备命令注入问题的协调披露记录。"
---

## 披露状态

我向 `mobile-next/mobile-mcp` 报告了两项安全问题。由于该开源项目采用 GitHub Security Advisories（GHSA）流程，CVE 编号需要由项目维护者通过 GHSA 申请；截至本公告发布时，这两项问题尚未获得 CVE 编号。

## 问题一：未鉴权的 MCP SSE 端点

`GET /mcp` 和 `POST /mcp` 路由未实施认证、授权或访问来源限制。处于可达网络位置的攻击者可能建立 MCP 会话，并调用已注册的设备控制工具，包括设备枚举、截图、应用操作与输入模拟。

受影响组件：`src/index.ts`。已测试版本：0.0.43。

## 问题二：Android 设备端 Shell 注入

`mobile_open_url` 将不可信 URL 传递给 `adb shell`。虽然 Node.js 一侧使用参数数组调用 `execFileSync`，但 `adb shell` 会将后续参数交由 Android 设备端 shell 解析；因此，未验证的 shell 元字符可能导致命令在连接的 Android 设备上以 `uid=2000(shell)` 权限执行。

该问题还影响使用未转义 `packageName` 的应用启动与终止路径。问题一会降低攻击者获得设备标识并调用这些工具的难度。

受影响组件：`src/android.ts` 的 `openUrl()`、`launchApp()` 和 `terminateApp()`。已测试版本：0.0.43。

## 修复建议

服务应默认只监听回环地址，并要求 MCP 端点使用认证令牌；同时对每一项设备操作执行授权检查。所有进入 `adb shell` 的不可信值都应避免经 shell 解释，或在语义允许时采用一致、经过测试的参数转义与输入白名单。

本页面省略可直接复现命令执行的载荷，以支持协调修复。

## 参考

- 项目仓库：[`mobile-next/mobile-mcp`](https://github.com/mobile-next/mobile-mcp)
- [GitHub Security 页面](https://github.com/mobile-next/mobile-mcp/security)
- 发现者：[yuhanghuang](https://github.com/yuhanghuang)
