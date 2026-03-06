---
title: "Mcp授权分析"
date: 2026-03-06
draft: false
tags: ["mcp", "oauth", "AI security"]
description: "Mcp oauth security analysis"
---

## 什么是oauth

Oauth是一种授权协议，它允许第三方应用在用户授权的情况下访问用户的资源。使用这个方式避免了传统的用户名密码授权方式，对于一键登录的场景十分实用。在移动端的授权健全场景十分受欢迎，这个方式不仅十分便捷二十安全性很高，避免了用户输入用户名密码。传统的授权方式需要用户将自己的用户名密码授权给第三方应用，这样第三方应用就可以访问用户的资源。但是使用oauth，第三方应用不需要知道用户的用户名密码，只需要知道用户的授权码即可。

### 什么是Mcp

mcp是在llm基础上发展出来的一种协议，它允许llm调用外部工具来完成任务。通过mcp，llm可以访问外部工具的api，从而完成任务。在mcp中，llm和外部工具之间通过json格式的请求和响应进行通信。llm可以调用外部工具的api，从而完成任务。例如，llm可以调用外部工具来获取用户的个人信息，或者调用外部工具来完成支付。现在mcp的生态也做的越来越多了，其安全性也收到了学术界和工业界极大的关注。也有越来越多复杂的应用来使用mcp，这些应用为了提供多样化的功能是一定需要引入用户的身份鉴别的。所以mcp和oauth的结合也成为了必然，对于简单的mcp应用可以使用api_key等方式来进行鉴权，但是对于复杂的mcp应用，使用oauth来进行鉴权就显得十分有意义。

## mcp oauth和传统oauth的区别

但是mcp oauth和传统的移动端应用oauth场景还是有区别的，因为传统的oauth场景只有四个对象：用户(user)，移动端应用(client)，授权服务器(Authorization server)，资源服务器(Resource server)。既然提到这个就需要支持oauth登录，app一键登录（已经安装的app）,app一键登录（未安装的app）的区别，运营商的手机号一键登录的区别。

### app一键登录（已经安装的app）

以流利说中的微博一键登录为例：

首先当用户在流利说界面点击微博登录按钮，流利说app会通过Intent启动微博app，其中会携带参数：

```
Appid:流利说的app id,在微博开放平台注册得到的。
RedirectUri:流利说的回调地址，微博app启动后会将用户重定向到这个地址。
Scope:流利说申请的权限，
State:流利说的state，用于防止CSRF攻击。
signature:流利说的app的包签名
```

当流利说app在微博开放平台注册的时候，需要填写下面的内容：

```
Appid:流利说的app id
package:流利说的app包名
signature:流利说的app签名
RedirectUri:流利说的回调地址
Scope:流利说申请的权限
```

微博app在收到来自流利说app的Intent后，会弹出授权页面，用户同意授权后，微博app会将用户重定向到流利说app的回调地址。在这个过程是需要对app的身份进行校验：

```
取出appid，package，signature，RedirectUri，Scope，State
查询该appid在微博开放平台注册的app信息（包签名信息）查看是否一致，如果一致表示的是合法的app，否则就是非法的app就会显示包签名和平台注册的不一致，从而拒绝授权。
```

其中难伪造的就是packagename和signature，因为这些信息不是直接应变写入的，而是通过android的底层api来得到的。不过这个也因不同的厂商sdk而异，有的sdk会直接将包名和签名写入到intent中，有的sdk会直接传入包名。但是有的app的包名和签名是可以被伪造的，那么这个过程就引入了安全风险。比如受害者安装了恶意app，恶意app会伪造包名和签名，然后通过Intent启动微博app，这样微博app就会将用户重定向到恶意app的回调地址，从而实现得到了受害者的授权码，接着攻击者可以吧这个授权码发送给流利说app的后台服务器，那么恶意app就会得到受害者的accesstoken，从而可以访问受害者的资源。

### app一键登录（未安装的app）

在这个场景下，和上面的一个例子，也是以微博为例，但是和上面的一个例子不同的是，这个例子中，受害者没有安装微博app，所以当用户调起微博登录的时候，微博的登录sdk发现用户没有安装微博app就会在流利说这个app上拉起一个webview，然后在webview中打开微博的登录页面，用户同意授权后，微博app会将用户重定向到流利说app的回调地址。在这个场景下就没有了包名和签名的伪造风险，因为都是通过webview登录拉起的，但是拉起这个授权页面，是知道是哪个app来发起的授权。所以就存子啊安全风险，比如恶意应用实现了类似的功能，仅仅是替换了一个appid就可以拿到用户的accesstoken.

### 手机号一键登录（运营商）

对于国内还有一个很流行的登录方式就是手机号一键登录，需要打开手机的流量，app会植入运营商的sdk，然后通过这个sdk来获取用户的手机号。当用户通过流量上网的过程中，手机会通过sim卡和运营商通信，那么运营商就有权限知道你的手机号是什么。

```
当用户点击手机号一键登录的时候，app植入的运营商sdk会会发送这个app的appid,packagename,以及包签名信息（这些信息会在运营商的开发者平台中进行注册），运营商收到这个信息后首先会校验这个app的合法性，如果合法的话，运营商就会返回一个token.App收到这个token之后会发送给业务服务器，然后业务服务器拿到了这个token就会和运营商进行通信，如果这个token是正确的就会给业务商返回给这个用户的手机号，然后业务商生成相应的accesstoken给前端app，后续就使用这个token来进行后续的通信。所以也存在一个安全问题，如果用户安装了一个恶意的app，这个恶意的app同样可以伪造appid,packagename,以及包签名信息，调用运营商的sdk来进行校验，从而获得相应的token,攻击者可以拿这个token来获取后台服务器的accesstoken，即拿到了受害者的身份信息。

```

![get_phonemask](/images/mcp_auth/get_phonemask.jpg)
这是取手机号掩码的截图。
![login flow](/images/mcp_auth/auth_phone.png)

上面的文字和这个流程是有区别的，因为有的取手机号掩码的时候就进行合法app的校验，但是有的是在业务服务器进行token校验时候同步发送给运营商的。

### mcp oauth

接下来回归到了我们的重点那就是mcp oauth的流程。

## reference

- https://github.com/modelcontextprotocol/protocol
- https://www.obsidiansecurity.com/blog/when-mcp-meets-oauth-common-pitfalls-leading-to-one-click-account-takeover
- https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
