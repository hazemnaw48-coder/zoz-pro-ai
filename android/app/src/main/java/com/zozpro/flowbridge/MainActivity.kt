package com.zozpro.flowbridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

private data class ImportedClip(val uri: Uri, val name: String, val size: Long)
private const val PREFS = "zoz_flow_bridge"
private const val PREF_CLIPS = "saved_clips"
private const val PREF_PROMPT = "scene_prompt"
private const val PREF_PENDING_PROMPT = "pending_agent_prompt"
private const val API = "https://oxyzxbkwhafzaztraowc.supabase.co/functions/v1/zoz-pro-device-agent"
private const val PUBLIC_KEY = "sb_publishable_16GficzXgQUah0R8FnqUJQ_D-uBVtZm"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        scheduleDeviceWorker(this)
        setContent { FlowBridgeScreen() }
    }
}

@Composable
private fun FlowBridgeScreen() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    val scope = rememberCoroutineScope()
    var prompt by remember { mutableStateOf(prefs.getString(PREF_PROMPT, "") ?: "") }
    var pairingCode by remember { mutableStateOf("") }
    var clips by remember { mutableStateOf(loadSavedClips(context)) }
    var paired by remember { mutableStateOf(DeviceTokenVault.read(context) != null) }
    var busy by remember { mutableStateOf(false) }
    var lastAction by remember { mutableStateOf(if (paired) "الجهاز مقرون؛ جارٍ تجهيز الاتصال بالوكيل" else "أدخل رمز الاقتران من مركز ZOZ Pro") }
    var pendingPrompt by remember { mutableStateOf(prefs.getString(PREF_PENDING_PROMPT, "") ?: "") }

    LaunchedEffect(prompt) { prefs.edit().putString(PREF_PROMPT, prompt).apply() }
    LaunchedEffect(clips) { saveClips(context, clips) }

    fun runAsync(block: suspend () -> String) {
        if (busy) return
        busy = true
        scope.launch {
            try { lastAction = withContext(Dispatchers.IO) { block() } }
            catch (e: Exception) { lastAction = e.message ?: "حدث خطأ في الاتصال" }
            finally { busy = false }
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        val added = uris.mapNotNull { uri ->
            try { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) {}
            ImportedClip(uri, queryName(context, uri) ?: "video-${clips.size + 1}", querySize(context, uri))
        }
        clips = (clips + added).distinctBy { it.uri }
        lastAction = "تم استيراد ${added.size} مقطعًا إلى قائمة الهاتف. الملفات الأصلية لم تتغير."
    }

    MaterialTheme {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("ZOZ Flow Bridge", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("جهاز تنفيذ Android المتصل بوكيل ZOZ Pro", style = MaterialTheme.typography.titleMedium)
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(if (paired) "الجهاز مقرون بالوكيل" else "الجهاز غير مقرون", fontWeight = FontWeight.Bold)
                        Text("المهام المسموحة الآن: فحص الجهاز، فتح Google Flow بطلب ظاهر، وتجهيز/نسخ مطالبة المشهد.")
                        Text("لا توجد نقرات مخفية أو تجاوز لقيود Flow أو صلاحيات نشر تلقائي.")
                    }
                }

                if (!paired) {
                    OutlinedTextField(
                        value = pairingCode,
                        onValueChange = { pairingCode = it.filter { ch -> ch.isLetterOrDigit() }.take(32) },
                        label = { Text("رمز الاقتران من مركز ZOZ Pro") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        enabled = !busy && pairingCode.length == 32,
                        onClick = { runAsync {
                            val response = apiPost("pair_exchange", JSONObject()
                                .put("pairing_code", pairingCode)
                                .put("device_name", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL)
                                .put("app_version", "0.2.0"))
                            val token = response.getString("device_token")
                            DeviceTokenVault.write(context, token)
                            paired = true
                            pairingCode = ""
                            scheduleDeviceWorker(context)
                            "تم اقتران الهاتف بنجاح. تم حفظ رمز الجهاز مشفرًا على الهاتف."
                        } },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(if (busy) "جارٍ الاقتران…" else "اقتران الجهاز بالوكيل") }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = !busy, onClick = { runAsync {
                            val health = apiPost("device_health", JSONObject().put("app_version", "0.2.0"))
                            val job = apiPost("poll_jobs", JSONObject()).optJSONObject("job")
                            if (job == null) "الاتصال سليم. لا توجد مهام جديدة."
                            else executeJob(context, job)
                        } }) { Text("اتصال وفحص المهام") }
                        OutlinedButton(enabled = !busy, onClick = {
                            DeviceTokenVault.clear(context)
                            paired = false
                            lastAction = "أُزيل رمز الجهاز من الهاتف. لإلغاء الجهاز نهائيًا استخدم زر الإلغاء في مركز المالك."
                        }) { Text("فصل محلي") }
                    }
                }

                if (pendingPrompt.isNotBlank()) {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("مطالبة استلمها الوكيل", fontWeight = FontWeight.Bold)
                            Text(pendingPrompt)
                            Button(onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("ZOZ Flow prompt", pendingPrompt))
                                prompt = pendingPrompt
                                prefs.edit().remove(PREF_PENDING_PROMPT).apply()
                                pendingPrompt = ""
                                lastAction = "تم نسخ المطالبة إلى الحافظة. افتح Flow والصقها."
                            }) { Text("نسخ المطالبة إلى Flow") }
                        }
                    }
                }

                Button(
                    onClick = {
                        try {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://labs.google/fx/tools/flow")))
                            lastAction = "تم فتح Google Flow. سجّل الدخول بحساب Flow المصرح به على الهاتف."
                        } catch (_: Exception) { lastAction = "تعذر فتح Google Flow." }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("فتح Google Flow") }

                OutlinedTextField(
                    value = prompt,
                    onValueChange = { prompt = it },
                    label = { Text("مطالبة المشهد") },
                    placeholder = { Text("مطالبة المشهد التي أعدها وكيل ZOZ") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedButton(
                    onClick = {
                        if (prompt.isBlank()) Toast.makeText(context, "أدخل وصف المشهد أولًا", Toast.LENGTH_SHORT).show()
                        else {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("ZOZ Flow prompt", prompt))
                            lastAction = "نُسخ وصف المشهد؛ الصقه داخل Google Flow."
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("نسخ وصف المشهد") }

                OutlinedButton(
                    onClick = { picker.launch(arrayOf("video/mp4", "video/quicktime", "video/webm", "video/*")) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("استيراد المقاطع الناتجة من Flow") }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("المقاطع المحفوظة: ${clips.size}", fontWeight = FontWeight.Bold)
                    if (clips.isNotEmpty()) OutlinedButton(onClick = {
                        clips = emptyList()
                        lastAction = "أُزيلت القائمة فقط؛ الملفات الأصلية لم تُحذف."
                    }) { Text("مسح القائمة") }
                }
                LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(clips) { clip ->
                        Card(Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column(Modifier.weight(1f)) {
                                    Text(clip.name, fontWeight = FontWeight.Medium)
                                    Text(if (clip.size > 0) "${clip.size / 1024} KB" else "الحجم غير متاح")
                                }
                                OutlinedButton(onClick = { clips = clips.filterNot { it.uri == clip.uri } }) { Text("إزالة") }
                            }
                        }
                    }
                }
                Text(lastAction, style = MaterialTheme.typography.bodySmall)
                Text("الرمز محفوظ عبر Android Keystore. مهام المواقع الخارجية تتطلب موافقة المالك عند الإرسال أو النشر.", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private fun apiPost(action: String, body: JSONObject): JSONObject {
    val token = DeviceTokenVault.read(appContextHolder) ?: ""
    return apiPostWithToken(action, body, token)
}

private lateinit var appContextHolder: Context

private fun apiPostWithToken(action: String, body: JSONObject, token: String): JSONObject {
    val conn = java.net.URL(API).openConnection() as java.net.HttpURLConnection
    conn.requestMethod = "POST"
    conn.connectTimeout = 15000
    conn.readTimeout = 20000
    conn.doOutput = true
    conn.setRequestProperty("apikey", PUBLIC_KEY)
    conn.setRequestProperty("content-type", "application/json")
    if (token.isNotBlank()) conn.setRequestProperty("x-zoz-device-token", token)
    conn.outputStream.use { it.write(JSONObject(body.toString()).put("action", action).toString().toByteArray(Charsets.UTF_8)) }
    val code = conn.responseCode
    val stream = if (code in 200..299) conn.inputStream else conn.errorStream
    val text = stream.bufferedReader().use { it.readText() }
    conn.disconnect()
    val result = JSONObject(text)
    if (code !in 200..299 || !result.optBoolean("ok", false)) throw IllegalStateException(result.optString("error", "HTTP $code"))
    return result
}

private fun executeJob(context: Context, job: JSONObject): String {
    val id = job.getString("id")
    val cap = job.getString("capability_id")
    val payload = job.optJSONObject("payload") ?: JSONObject()
    return try {
        val result = JSONObject()
        when (cap) {
            "device.health_check" -> result.put("device_model", android.os.Build.MODEL).put("android_release", android.os.Build.VERSION.RELEASE)
            "flow.copy_prompt" -> {
                val text = payload.optString("prompt", "").take(12000)
                if (text.isBlank()) throw IllegalArgumentException("prompt_empty")
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREF_PENDING_PROMPT, text).apply()
                result.put("prompt_saved_locally", true).put("requires_user_tap_to_copy", true)
                DeviceNotifications.show(context, "مهمة جديدة من وكيل ZOZ", "وصل وصف مشهد. افتح التطبيق لنسخه إلى Flow.")
            }
            "flow.open" -> {
                val url = payload.optString("url", "https://labs.google/fx/tools/flow")
                if (!url.startsWith("https://labs.google/")) throw IllegalArgumentException("url_not_allowed")
                result.put("url", url).put("requires_user_tap", true)
                DeviceNotifications.showFlow(context, url)
            }
            else -> throw IllegalArgumentException("capability_not_implemented_yet")
        }
        apiPostWithToken("complete_job", JSONObject().put("job_id", id).put("outcome", "succeeded").put("result", result), DeviceTokenVault.read(context) ?: "")
        "نفذ الهاتف المهمة: $cap"
    } catch (e: Exception) {
        try {
            apiPostWithToken("complete_job", JSONObject().put("job_id", id).put("outcome", "failed").put("error_code", e.message ?: "device_error").put("error_message", e.message ?: ""), DeviceTokenVault.read(context) ?: "")
        } catch (_: Exception) {}
        "تعذر تنفيذ المهمة $cap: ${e.message}"
    }
}

class DeviceTokenVault {
    companion object {
        private const val KEY_ALIAS = "zoz_device_token_key"
        private const val PREF = "zoz_secure_device"
        private const val TOKEN = "encrypted_device_token"
        private const val IV = "device_token_iv"

        fun write(context: Context, token: String) {
            val ks = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            if (!ks.containsAlias(KEY_ALIAS)) {
                val generator = javax.crypto.KeyGenerator.getInstance(android.security.keystore.KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                val spec = android.security.keystore.KeyGenParameterSpec.Builder(KEY_ALIAS, android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true).build()
                generator.init(spec); generator.generateKey()
            }
            val key = (ks.getEntry(KEY_ALIAS, null) as java.security.KeyStore.SecretKeyEntry).secretKey
            val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, key)
            val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
            context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
                .putString(TOKEN, android.util.Base64.encodeToString(encrypted, android.util.Base64.NO_WRAP))
                .putString(IV, android.util.Base64.encodeToString(cipher.iv, android.util.Base64.NO_WRAP)).apply()
        }

        fun read(context: Context): String? {
            return try {
                val p = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
                val encrypted = android.util.Base64.decode(p.getString(TOKEN, null), android.util.Base64.NO_WRAP)
                val iv = android.util.Base64.decode(p.getString(IV, null), android.util.Base64.NO_WRAP)
                val ks = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                val key = (ks.getEntry(KEY_ALIAS, null) as java.security.KeyStore.SecretKeyEntry).secretKey
                val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(javax.crypto.Cipher.DECRYPT_MODE, key, javax.crypto.spec.GCMParameterSpec(128, iv))
                String(cipher.doFinal(encrypted), Charsets.UTF_8)
            } catch (_: Exception) { null }
        }

        fun clear(context: Context) {
            context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().clear().apply()
            try {
                java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(KEY_ALIAS) }
            } catch (_: Exception) {}
        }
    }
}

class DeviceNotifications {
    companion object {
        private const val CHANNEL = "zoz_device_tasks"
        fun show(context: Context, title: String, message: String) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            if (android.os.Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(android.app.NotificationChannel(CHANNEL, "ZOZ Device Tasks", android.app.NotificationManager.IMPORTANCE_DEFAULT))
            val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val pending = android.app.PendingIntent.getActivity(context, 2, intent, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
            val notification = androidx.core.app.NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentTitle(title).setContentText(message).setContentIntent(pending).setAutoCancel(true).build()
            manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
        }
        fun showFlow(context: Context, url: String) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            if (android.os.Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(android.app.NotificationChannel(CHANNEL, "ZOZ Device Tasks", android.app.NotificationManager.IMPORTANCE_DEFAULT))
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            val pending = android.app.PendingIntent.getActivity(context, 3, intent, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
            val notification = androidx.core.app.NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentTitle("وكيل ZOZ جهّز مهمة Flow")
                .setContentText("اضغط لفتح Google Flow. لن يتم تنفيذ أي توليد دون تفاعلك مع Flow.")
                .setContentIntent(pending).setAutoCancel(true).build()
            manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
        }
    }
}

class DevicePollWorker(context: Context, params: androidx.work.WorkerParameters) : androidx.work.Worker(context, params) {
    override fun doWork(): Result {
        val token = DeviceTokenVault.read(applicationContext) ?: return Result.success()
        return try {
            apiPostWithToken("heartbeat", JSONObject().put("app_version", "0.2.0"), token)
            val job = apiPostWithToken("poll_jobs", JSONObject(), token).optJSONObject("job")
            if (job != null) executeJob(applicationContext, job)
            Result.success()
        } catch (_: Exception) { Result.retry() }
    }
}

private fun scheduleDeviceWorker(context: Context) {
    val request = PeriodicWorkRequestBuilder<DevicePollWorker>(15, TimeUnit.MINUTES).build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork("zoz-device-agent-poll", ExistingPeriodicWorkPolicy.UPDATE, request)
}

private fun loadSavedClips(context: Context): List<ImportedClip> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_CLIPS, "[]") ?: "[]"
    return try {
        val array = JSONArray(raw)
        buildList {
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                val uri = Uri.parse(item.getString("uri"))
                val ok = context.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }
                if (ok) add(ImportedClip(uri, item.optString("name", "video"), item.optLong("size", 0L)))
            }
        }
    } catch (_: Exception) { emptyList() }
}
private fun saveClips(context: Context, clips: List<ImportedClip>) {
    val array = JSONArray()
    clips.forEach { array.put(JSONObject().put("uri", it.uri.toString()).put("name", it.name).put("size", it.size)) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREF_CLIPS, array.toString()).apply()
}
private fun queryName(context: Context, uri: Uri): String? =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null }
private fun querySize(context: Context, uri: Uri): Long =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { if (it.moveToFirst()) it.getLong(0) else 0L } ?: 0L
