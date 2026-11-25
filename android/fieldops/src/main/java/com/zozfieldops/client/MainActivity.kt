package com.zozfieldops.client

import android.app.Activity
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import android.webkit.WebSettings
import android.webkit.URLUtil
import android.util.Base64
import java.io.IOException

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var offline: TextView
    private var fileCallback: android.webkit.ValueCallback<Array<Uri>>? = null
    private val startUrl = "https://hazemnaw48-coder.github.io/zoz-pro-ai/fieldops/?app_version=1.0.1"
    private val allowedHost = "hazemnaw48-coder.github.io"
    private val allowedPrefix = "/zoz-pro-ai/fieldops/"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(11, 33, 56)
        window.navigationBarColor = Color.rgb(11, 33, 56)
        window.decorView.systemUiVisibility = 0

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(243, 247, 251))
        }
        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(243, 247, 251))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.safeBrowsingEnabled = true
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    if (uri.scheme == "https" && uri.host == allowedHost && uri.path.orEmpty().startsWith(allowedPrefix)) {
                        return false
                    }
                    if (uri.scheme == "https" || uri.scheme == "mailto:" || uri.scheme == "tel:") {
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                    }
                    return true
                }

                override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                    this@MainActivity.progress.visibility = View.VISIBLE
                    offline.visibility = View.GONE
                    if (!isTrusted(url)) runCatching { view.removeJavascriptInterface("FieldOpsDownloads") }
                }

                override fun onPageFinished(view: WebView, url: String) {
                    this@MainActivity.progress.visibility = View.GONE
                    if (isTrusted(url)) {
                        view.addJavascriptInterface(DownloadBridge(), "FieldOpsDownloads")
                        installBlobDownloadHandler(view)
                    }
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: android.webkit.WebResourceError
                ) {
                    if (request.isForMainFrame) {
                        this@MainActivity.progress.visibility = View.GONE
                        offline.visibility = View.VISIBLE
                    }
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, newProgress: Int) {
                    this@MainActivity.progress.progress = newProgress
                    this@MainActivity.progress.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
                }

                override fun onShowFileChooser(
                    view: WebView,
                    callback: android.webkit.ValueCallback<Array<Uri>>,
                    params: FileChooserParams
                ): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                            "application/pdf", "image/*", "video/*", "text/csv",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "application/json"
                        ))
                    }
                    return try {
                        @Suppress("DEPRECATION")
                        startActivityForResult(intent, FILE_PICKER_REQUEST)
                        true
                    } catch (_: Exception) {
                        fileCallback = null
                        callback.onReceiveValue(null)
                        false
                    }
                }
            }
            setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                if (url.startsWith("https://") && Uri.parse(url).host == allowedHost) {
                    val request = DownloadManager.Request(Uri.parse(url))
                        .setMimeType(mimeType)
                        .addRequestHeader("User-Agent", userAgent)
                        .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url).orEmpty())
                        .setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType))
                        .setDescription("ZOZ FieldOps")
                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, contentDisposition, mimeType))
                    runCatching {
                        getSystemService(DownloadManager::class.java).enqueue(request)
                        Toast.makeText(this@MainActivity, "بدأ تنزيل الملف", Toast.LENGTH_SHORT).show()
                    }.onFailure {
                        Toast.makeText(this@MainActivity, "تعذر تنزيل الملف", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = android.content.res.ColorStateList.valueOf(Color.rgb(54, 183, 200))
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.TRANSPARENT)
        }
        root.addView(progress, FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP))
        offline = TextView(this).apply {
            text = "تعذر الاتصال بالإنترنت\nتحقق من الاتصال ثم اضغط هنا لإعادة المحاولة"
            textSize = 16f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(20, 59, 89))
            setPadding(dp(28), dp(20), dp(28), dp(20))
            visibility = View.GONE
            setOnClickListener { webView.reload(); visibility = View.GONE; this@MainActivity.progress.visibility = View.VISIBLE }
        }
        root.addView(offline, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        webView.loadUrl(startUrl)
    }

    private fun isTrusted(url: String): Boolean {
        val uri = Uri.parse(url)
        return uri.scheme == "https" && uri.host == allowedHost && uri.path.orEmpty().startsWith(allowedPrefix)
    }

    private fun installBlobDownloadHandler(view: WebView) {
        val script = """
            (function(){
              if(window.__zozBlobDownloadInstalled)return;
              window.__zozBlobDownloadInstalled=true;
              document.addEventListener('click',function(e){
                var a=e.target&&e.target.closest?e.target.closest('a[download]'):null;
                if(!a||!a.href||!a.href.startsWith('blob:'))return;
                e.preventDefault();
                var name=a.download||'fieldops-export';
                fetch(a.href).then(function(r){return r.blob()}).then(function(blob){
                  var reader=new FileReader();
                  reader.onloadend=function(){
                    var data=String(reader.result||'').split(',')[1]||'';
                    window.FieldOpsDownloads.saveBlob(data,name,blob.type||'application/octet-stream');
                  };
                  reader.readAsDataURL(blob);
                }).catch(function(){});
              },true);
            })();
        """.trimIndent()
        view.evaluateJavascript(script, null)
    }

    private inner class DownloadBridge {
        @JavascriptInterface
        fun saveBlob(base64: String, fileName: String, mimeType: String) {
            if (base64.length > 18_000_000) {
                runOnUiThread { Toast.makeText(this@MainActivity, "الملف أكبر من الحد المسموح", Toast.LENGTH_LONG).show() }
                return
            }
            Thread {
                try {
                    val bytes = Base64.decode(base64, Base64.DEFAULT)
                    val safeName = fileName.substringAfterLast('/').substringAfterLast('\\').take(120).ifBlank { "fieldops-export" }
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(MediaStore.Downloads.MIME_TYPE, mimeType)
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ZOZ FieldOps")
                        put(MediaStore.Downloads.IS_PENDING, 1)
                    }
                    val resolver = contentResolver
                    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw IOException("Unable to create download")
                    resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw IOException("Unable to write download")
                    values.clear()
                    values.put(MediaStore.Downloads.IS_PENDING, 0)
                    resolver.update(uri, values, null, null)
                    runOnUiThread { Toast.makeText(this@MainActivity, "تم حفظ الملف في مجلد التنزيلات / ZOZ FieldOps", Toast.LENGTH_LONG).show() }
                } catch (_: Exception) {
                    runOnUiThread { Toast.makeText(this@MainActivity, "تعذر حفظ الملف", Toast.LENGTH_LONG).show() }
                }
            }.start()
        }
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_PICKER_REQUEST) {
            val result = if (resultCode == Activity.RESULT_OK && data?.data != null) arrayOf(data.data!!) else null
            fileCallback?.onReceiveValue(result)
            fileCallback = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
    companion object { private const val FILE_PICKER_REQUEST = 701 }
}
