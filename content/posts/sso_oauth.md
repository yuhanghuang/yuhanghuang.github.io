---
title: "微博sso认证分析"
date: 2026-03-06
draft: false
tags: ["oauth", "sso", "android"]
description: "SSO oauth security analysis"
---

结合App调用代码和SDK字节码来做完整的流程分析。代码来源于github, 链接：https://github.com/sinaweibosdk/weibo_android_sdk

[sdk下载](/files/oauth/core-13.10.8.aar)

[demo下载](/files/oauth/Weibo_SDK_DEMO.zip)

## SSO登录

首先看demo app的调用代码，再和SDK代码对照分析。

第一阶段：初始化（App启动时）
App侧代码（DemoApplication.java）

```
// App启动时在Application.onCreate()里执行
AuthInfo authInfo = new AuthInfo(this, APP_KEY, REDIRECT_URL, SCOPE);
//                               ↑       ↑         ↑            ↑
//                             context  AppKey  redirect_uri   权限范围

mWBAPI = WBAPIFactory.createWBAPI(this);
mWBAPI.registerApp(this, authInfo, sdkListener);
```

SDK侧对应代码（class L - registerApp）

```
// SDK把authInfo存到全局静态字段O.b
O.b = authInfo;   // AuthInfo持久化
O.a = true;       // 标记"已初始化"
sdkListener.onInitSuccess();
```

AuthInfo内部做了什么?

```
// AuthInfo构造函数
this.app_key      = appKey;
this.redirect_url = redirectUrl;
this.scope        = scope;
this.package_name = context.getPackageName();  // 自动获取包名
this.hash         = K.a(context, package_name); // 自动计算App签名哈希
```

> 关键点：package_name和hash不是App手动传入的，是SDK自动从系统读取的，这保证了它们的真实性。

---

第二阶段：触发授权（用户点击登录按钮）
App侧代码（MainActivity.java）

```
// 对应界面上三个按钮，分别触发三种授权方式
if (v == mSso)       startAuth();        // 自动选择：SSO或WebView
if (v == mClientSso) startClientAuth();  // 强制SSO
if (v == mWebSso)    startWebAuth();     // 强制WebView

// startAuth()
mWBAPI.authorize(this, new WbAuthListener() {
    @Override
    public void onComplete(Oauth2AccessToken token) { /* 授权成功 */ }
    @Override
    public void onError(UiError error)              { /* 授权失败 */ }
    @Override
    public void onCancel()                          { /* 用户取消 */ }
});
```

SDK侧对应代码（class L - authorize，字节码还原）

```
public void authorize(Activity activity, WbAuthListener listener) {
    G.a = listener;  // 把回调存起来，等结果回来再用

    if (O.a(context)             // 微博App已安装？
        && c.a(context) != null  // 能查到微博App信息？
        && versionCode >= 2055)  // 版本够？
    {
        G.a(activity);  // → 走SSO路径
    } else {
        G.b(activity);  // → 降级WebView路径
    }
}
```

> 关键点：SDK会根据“微博App是否已安装”、“能否查到App信息”、“版本号”这三个条件决定走SSO还是WebView。

---

第三阶段A：SSO路径（G.a - startClientAuth）

```
// Step 1：SDK先验证微博App签名（class c.a）
PackageInfo pkgInfo = pm.getPackageInfo("com.sina.weibo", GET_SIGNATURES);
String sigHash = v.a(pkgInfo.signatures[0].toByteArray());  // 算签名哈希
if (!sigHash.equals("18da2bf10352443a00a5e046d9fca6bd")) {
    listener.onError("your app is illegal");  // 签名不对，直接拒绝
    return;
}

// Step 2：构造Intent调起微博SSOActivity
Intent intent = new Intent();
intent.setClassName("com.sina.weibo", "com.sina.weibo.SSOActivity");
intent.putExtra("appKey",               authInfo.getAppKey());
intent.putExtra("redirectUri",          authInfo.getRedirectUrl());
intent.putExtra("scope",                authInfo.getScope());
intent.putExtra("packagename",          authInfo.getPackageName()); // 流利说包名
intent.putExtra("key_hash",             authInfo.getHash());        // 流利说签名哈希
intent.putExtra("_weibo_command_type",  3);

// requestCode固定32973，后面onActivityResult靠这个识别
activity.startActivityForResult(intent, 32973);
```

**微博App侧（SSOActivity）拿到Intent后：**

```
1. 用getCallingPackage()获取调用方包名
2. 再用PackageManager查调用方真实签名
3. 对比Intent里传来的packagename + key_hash是否一致
4. 去微博服务器验证AppKey合法性
5. 弹出授权确认框给用户
6. 用户点确认 → 微博服务器下发token → 通过Intent回传
```

---

第四阶段A：SSO结果回调
App侧代码（MainActivity.java）

```
@Override
protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    // isAuthorizeResult内部就是判断requestCode == 32973
    if (mWBAPI.isAuthorizeResult(requestCode, resultCode, data)) {
        mWBAPI.authorizeCallback(this, requestCode, resultCode, data);
    }
}
```

SDK侧对应代码（class L - authorizeCallback，字节码还原）

```
// requestCode必须是32973
if (requestCode != 32973) {
    listener.onError("requestCode is error");
    return;
}

// 从Intent的Bundle里直接解析token
// 注意：这里完全没有redirect_uri的参与
Oauth2AccessToken token = Oauth2AccessToken.parseAccessToken(intent.getExtras());

if (token != null) {
    AccessTokenHelper.writeAccessToken(context, token); // 本地持久化
    listener.onComplete(token);                          // 回调App层
} else {
    listener.onError("oauth2AccessToken is null");
}
```

回到App层

```
// WbAuthListener.onComplete被触发
public void onComplete(Oauth2AccessToken token) {
    // 流利说拿到token
    // token.getAccessToken() → 实际的access_token字符串
    // token.getUid()         → 微博用户uid
    Log.d(LOG_TAG, "授权成功：uid=" + token.getUid() + "; token=" + token.getAccessToken());
}
```

![sso_app](/images/sso/sso_app.png)

## Webview登录

第三阶段B：WebView降级路径（G.b）
SDK侧（字节码还原）

```
// Step 1：构造完整授权URL
HashMap params = new HashMap();
params.put("client_id",     appKey);
params.put("redirect_uri",  redirectUrl);   // redirect_uri在WebView模式下是关键
params.put("scope",         scope);
params.put("packagename",   packageName);
params.put("key_hash",      hash);
params.put("response_type", "code");        // 声明走授权码模式
params.put("version",       "0041005000");

String url = "https://open.weibo.cn/oauth2/authorize?" + urlEncode(params);

// Step 2：启动WebActivity加载这个URL
Intent intent = new Intent(activity, WebActivity.class);
intent.putExtras(bundle);  // bundle里包含authInfo和授权URL
activity.startActivity(intent);
```

WebActivity里的WebViewClient（class e，字节码还原）

```
// 微博AS授权完成后，会把token附在redirect_uri后面跳转
// 例如：http://www.sina.com?access_token=xxx&uid=yyy&expires_in=zzz

boolean shouldOverrideUrlLoading(WebView view, String url) {
    // 检测URL前缀是否是redirect_uri
    if (url.startsWith(authInfo.getRedirectUrl())) {
        Bundle params = K.a(new URL(url).getQuery()); // 解析query参数
        // 直接找access_token（Implicit Grant，不是code）
        return !TextUtils.isEmpty(params.getString("access_token"));
    }
    return false;
}

void onPageFinished(WebView view, String url) {
    if (url.startsWith(authInfo.getRedirectUrl())) {
        Bundle params = K.a(new URL(url).getQuery());
        // 解析token
        Oauth2AccessToken token = Oauth2AccessToken.parseAccessToken(params);
        AccessTokenHelper.writeAccessToken(context, token);
        // 触发回调，最终到App层的WbAuthListener.onComplete
        listener.onComplete(token);
        activity.finish();  // 关闭WebView页面
    }
}
```

![sso_web](/images/sso/sso_webview.png)

---
