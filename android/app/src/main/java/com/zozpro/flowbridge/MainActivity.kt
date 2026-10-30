package com.zozpro.flowbridge

import android.Manifest
import android.content.pm.PackageManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
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
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

private data class ImportedClip(val uri: Uri, val name: String, val size: Long)
private const val PREFS = "zoz_flow_bridge"
private const val PREF_CLIPS = "saved_clips"
private const val PREF_PROMPT = "scene_prompt"
private const val PREF_PENDING_PROMPT = "pending_agent_prompt"
private const val PREF_PENDING_PROMPTS = "pending_agent_prompts"
private const val API = "https://oxyzxbkwhafzaztraowc.supabase.co/functions/v1/zoz-pro-device-agent"
private const val INTAKE_API = "https://oxyzxbkwhafzaztraowc.supabase.co/functions/v1/zoz-pro-youtube-analytics"
private const val PUBLIC_KEY = "sb_publishable_16GficzXgQUah0R8FnqUJQ_D-uBVtZm"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        scheduleDeviceWorker(this)
        importSharedVideos(this, intent)
        setContent { FlowBridgeScreen() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        importSharedVideos(this, intent)
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
    var pendingPrompts by remember { mutableStateOf(loadPendingPrompts(prefs)) }
    val pendingPrompt = pendingPrompts.firstOrNull() ?: ""
    var finalVideoUri by remember { mutableStateOf(prefs.getString("final_video_uri", null)?.let { Uri.parse(it) }) }
    var syntheticMedia by remember { mutableStateOf(true) }
    var madeForKids by remember { mutableStateOf(false) }
    var showCleanupConfirm by remember { mutableStateOf(false) }

    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
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

    val outputPicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("video/mp4")) { uri ->
        if (uri != null) runAsync {
            try { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) } catch (_: Exception) {}
            assembleCompatibleClips(context, clips, uri)
            prefs.edit().putString("final_video_uri", uri.toString()).apply()
            finalVideoUri = uri
            "اكتمل تجميع ${clips.size} مقاطع في ملف MP4 جديد دون إعادة ترميز. الملفات الأصلية لم تتغير."
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
                            val response = apiPost(context, "pair_exchange", JSONObject()
                                .put("pairing_code", pairingCode)
                                .put("device_name", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL)
                                .put("app_version", "0.3.1"))
                            val token = response.getString("device_token")
                            DeviceTokenVault.write(context, token, response.getString("intake_token"))
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
                            val health = apiPost(context, "device_health", JSONObject().put("app_version", "0.3.1"))
                            val job = apiPost(context, "poll_jobs", JSONObject()).optJSONObject("job")
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

                if (pendingPrompts.isNotEmpty()) {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("مطالبات المشاهد من وكيل ZOZ · المتبقي ${pendingPrompts.size}", fontWeight = FontWeight.Bold)
                            Text(pendingPrompt)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = {
                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                    clipboard.setPrimaryClip(ClipData.newPlainText("ZOZ Flow prompt", pendingPrompt))
                                    prompt = pendingPrompt
                                    pendingPrompts = pendingPrompts.drop(1)
                                    savePendingPrompts(prefs, pendingPrompts)
                                    lastAction = "تم نسخ المطالبة إلى الحافظة. افتح Flow والصقها. تبقى ${pendingPrompts.size} مطالبة."
                                }) { Text("نسخ المشهد التالي") }
                                OutlinedButton(onClick = {
                                    pendingPrompts = loadPendingPrompts(prefs)
                                    lastAction = "تم تحديث قائمة مطالبات المشاهد."
                                }) { Text("تحديث القائمة") }
                            }
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
                ) { Text("اختيار المقاطع من الهاتف") }
                OutlinedButton(onClick = {
                    clips = loadSavedClips(context)
                    lastAction = "تم تحديث قائمة المقاطع المستوردة أو المشتركة إلى ZOZ."
                }, modifier = Modifier.fillMaxWidth()) { Text("تحديث المقاطع الواردة من Flow") }
                if (clips.size >= 2) {
                    OutlinedButton(
                        enabled = !busy,
                        onClick = { outputPicker.launch("ZOZ-final-video.mp4") },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("تجميع المقاطع بالترتيب دون إعادة ضغط") }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("محتوى اصطناعي واقعي")
                    androidx.compose.material3.Switch(checked = syntheticMedia, onCheckedChange = { syntheticMedia = it })
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("محتوى موجّه للأطفال")
                    androidx.compose.material3.Switch(checked = madeForKids, onCheckedChange = { madeForKids = it })
                }
                if (finalVideoUri != null) {
                    Text("يوجد ملف نهائي جاهز للاستقبال.", style = MaterialTheme.typography.bodySmall)
                    Button(enabled = !busy && paired, onClick = { runAsync {
                        uploadFinalVideoToIntake(context, finalVideoUri!!, syntheticMedia, madeForKids)
                    } }, modifier = Modifier.fillMaxWidth()) { Text("رفع الفيديو النهائي إلى استقبال ZOZ") }
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("المقاطع المحفوظة: ${clips.size}", fontWeight = FontWeight.Bold)
                    if (clips.isNotEmpty()) OutlinedButton(onClick = {
                        clips = emptyList()
                        lastAction = "أُزيلت القائمة فقط؛ الملفات الأصلية لم تُحذف."
                    }) { Text("مسح القائمة فقط") }
                }
                if (clips.any { it.uri.scheme == "file" && (it.uri.path ?: "").startsWith(File(context.filesDir, "zoz_imports").absolutePath) }) {
                    OutlinedButton(onClick = { showCleanupConfirm = true }, modifier = Modifier.fillMaxWidth()) {
                        Text("تنظيف النسخ الداخلية المستوردة")
                    }
                }
                if (showCleanupConfirm) {
                    androidx.compose.material3.AlertDialog(
                        onDismissRequest = { showCleanupConfirm = false },
                        title = { Text("تأكيد تنظيف الهاتف") },
                        text = { Text("سيحذف التطبيق نسخه الداخلية التي نسخها من المشاركات فقط. لن يحذف الملفات الأصلية في التنزيلات أو المعرض أو أي ملفات خارج مجلد التطبيق.") },
                        confirmButton = {
                            Button(onClick = {
                                val localDir = File(context.filesDir, "zoz_imports").absolutePath + File.separator
                                val removable = clips.filter { it.uri.scheme == "file" && (it.uri.path ?: "").startsWith(localDir) }
                                removable.forEach { runCatching { File(it.uri.path ?: "").delete() } }
                                clips = clips.filterNot { removable.contains(it) }
                                showCleanupConfirm = false
                                lastAction = "تم تنظيف النسخ الداخلية للتطبيق فقط؛ الملفات الأصلية لم تتغير."
                            }) { Text("حذف النسخ الداخلية") }
                        },
                        dismissButton = { OutlinedButton(onClick = { showCleanupConfirm = false }) { Text("إلغاء") } }
                    )
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

private fun intakePost(action: String, body: JSONObject, token: String): JSONObject {
    val conn = java.net.URL(INTAKE_API + "?action=" + action).openConnection() as java.net.HttpURLConnection
    conn.requestMethod = "POST"
    conn.connectTimeout = 20000
    conn.readTimeout = 30000
    conn.doOutput = true
    conn.setRequestProperty("apikey", PUBLIC_KEY)
    conn.setRequestProperty("x-zoz-intake-token", token)
    conn.setRequestProperty("content-type", "application/json")
    conn.outputStream.use { it.write(JSONObject(body.toString()).toString().toByteArray(Charsets.UTF_8)) }
    val code = conn.responseCode
    val stream = if (code in 200..299) conn.inputStream else conn.errorStream
    val text = stream.bufferedReader().use { it.readText() }
    conn.disconnect()
    val result = JSONObject(text)
    if (code !in 200..299 || !result.optBoolean("ok", false)) throw IllegalStateException(result.optString("error", "HTTP $code"))
    return result
}

private fun uploadFinalVideoToIntake(context: Context, uri: Uri, synthetic: Boolean, kids: Boolean): String {
    val intakeToken = DeviceTokenVault.readIntake(context) ?: throw IllegalStateException("رمز استقبال الفيديو غير موجود. أعد اقتران الجهاز.")
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val name = queryName(context, uri) ?: "ZOZ-final-video.mp4"
    val size = querySize(context, uri)
    if (size <= 0L) throw IllegalStateException("تعذر قراءة حجم الملف النهائي.")
    var asset: JSONObject
    val savedId = prefs.getString("intake_upload_asset_id", null)
    val savedUri = prefs.getString("intake_upload_uri", null)
    val savedSize = prefs.getLong("intake_upload_size", -1L)
    if (!savedId.isNullOrBlank()) {
        if (savedUri != uri.toString() || savedSize != size) {
            throw IllegalStateException("يوجد رفع سابق غير مكتمل. أعد اختيار الملف نفسه لاستكماله أولًا.")
        }
        val status = intakePost("intake_status", JSONObject().put("asset_id", savedId), intakeToken)
        asset = status.getJSONObject("asset")
        if (asset.optString("status") == "ready_for_review") {
            prefs.edit().remove("intake_upload_asset_id").remove("intake_upload_uri").remove("intake_upload_size").apply()
            return "الفيديو موجود بالفعل في استقبال ZOZ وينتظر المراجعة. رقم الملف: $savedId"
        }
        if (asset.optString("status") != "uploading") {
            throw IllegalStateException("حالة الرفع السابق هي ${asset.optString("status")}؛ راجع مركز الاستقبال قبل بدء رفع جديد.")
        }
    } else {
        val created = intakePost("intake_create", JSONObject()
            .put("filename", name)
            .put("total_bytes", size)
            .put("content_type", "video/mp4")
            .put("title", name.substringBeforeLast("."))
            .put("description", "تم تجميع الفيديو محليًا على جهاز ZOZ Android؛ ينتظر مراجعة المالك.")
            .put("tags", JSONArray())
            .put("made_for_kids", kids)
            .put("contains_synthetic_media", synthetic)
            .put("target_privacy_status", "public"), intakeToken)
        asset = created.getJSONObject("asset")
        prefs.edit().putString("intake_upload_asset_id", asset.getString("id"))
            .putString("intake_upload_uri", uri.toString()).putLong("intake_upload_size", size).apply()
    }
    val assetId = asset.getString("id")
    val chunkSize = asset.optInt("chunk_size", 8388608)
    val chunkCount = asset.optInt("chunk_count", 0)
    if (chunkSize <= 0 || chunkCount <= 0) throw IllegalStateException("بيانات تقسيم الملف غير صالحة.")
    val uploaded = asset.optJSONArray("uploaded_parts") ?: JSONArray()
    val uploadedParts = (0 until uploaded.length()).map { uploaded.optInt(it, -1) }.toSet()
    context.contentResolver.openInputStream(uri).use { input ->
        if (input == null) throw IllegalStateException("تعذر فتح الملف النهائي.")
        for (part in 0 until chunkCount) {
            val expected = minOf(chunkSize.toLong(), size - part.toLong() * chunkSize).toInt()
            if (part in uploadedParts) {
                var skip = expected.toLong()
                while (skip > 0) {
                    val n = input.skip(skip)
                    if (n <= 0) {
                        if (input.read() < 0) throw IllegalStateException("تعذر استكمال قراءة الملف عند الجزء ${part + 1}.")
                        skip--
                    } else skip -= n
                }
                continue
            }
            val buffer = ByteArrayOutputStream(expected)
            val chunk = ByteArray(64 * 1024)
            var remaining = expected
            while (remaining > 0) {
                val read = input.read(chunk, 0, minOf(chunk.size, remaining))
                if (read < 0) throw IllegalStateException("الملف انتهى قبل اكتمال الجزء ${part + 1}.")
                buffer.write(chunk, 0, read)
                remaining -= read
            }
            val signed = intakePost("intake_signed_part", JSONObject().put("asset_id", assetId).put("part_index", part), intakeToken)
            val uploadUrl = signed.getString("upload_url")
            val conn = java.net.URL(uploadUrl).openConnection() as java.net.HttpURLConnection
            conn.requestMethod = "PUT"
            conn.connectTimeout = 30000
            conn.readTimeout = 60000
            conn.doOutput = true
            conn.setRequestProperty("content-type", "application/octet-stream")
            conn.setRequestProperty("x-upsert", "true")
            conn.setFixedLengthStreamingMode(expected)
            conn.outputStream.use { it.write(buffer.toByteArray()) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val response = stream.bufferedReader().use { it.readText() }
            conn.disconnect()
            if (code !in 200..299) {
                throw IllegalStateException("فشل رفع الجزء ${part + 1}: HTTP $code — " + response.take(300))
            }
            intakePost("intake_part_done", JSONObject().put("asset_id", assetId).put("part_index", part), intakeToken)
        }
    }
    intakePost("intake_finalize", JSONObject().put("asset_id", assetId), intakeToken)
    prefs.edit().remove("intake_upload_asset_id").remove("intake_upload_uri").remove("intake_upload_size").apply()
    return "اكتمل استقبال الفيديو النهائي في ZOZ. رقم الملف: $assetId. ينتظر موافقة المالك، ولم يُرفع إلى YouTube أو يُنشر بعد."
}

private fun assembleCompatibleClips(context: Context, clips: List<ImportedClip>, outputUri: Uri) {
    if (clips.size < 2) throw IllegalStateException("اختر مقطعين على الأقل للتجميع.")
    val extractors = mutableListOf<MediaExtractor>()
    val temp = File(context.cacheDir, "zoz-final-${System.currentTimeMillis()}.mp4")
    var muxer: MediaMuxer? = null
    var started = false
    try {
        clips.forEach { clip ->
            val extractor = MediaExtractor()
            extractor.setDataSource(context, clip.uri, null)
            extractors.add(extractor)
        }
        fun tracks(extractor: MediaExtractor): Map<String, Pair<Int, MediaFormat>> {
            val found = linkedMapOf<String, Pair<Int, MediaFormat>>()
            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                if (mime.startsWith("video/") || mime.startsWith("audio/")) {
                    if (found.containsKey(mime)) throw IllegalStateException("يوجد أكثر من مسار من النوع $mime؛ لم يتم التجميع لتجنب فقدان الصوت.")
                    found[mime] = i to format
                }
            }
            if (found.keys.none { it.startsWith("video/") }) throw IllegalStateException("أحد الملفات لا يحتوي مسار فيديو.")
            return found
        }
        fun signature(f: MediaFormat): String {
            val keys = listOf(MediaFormat.KEY_MIME, MediaFormat.KEY_WIDTH, MediaFormat.KEY_HEIGHT, MediaFormat.KEY_SAMPLE_RATE, MediaFormat.KEY_CHANNEL_COUNT, MediaFormat.KEY_PROFILE, MediaFormat.KEY_LEVEL)
            return keys.joinToString("|") { key -> if (!f.containsKey(key)) "" else if (key == MediaFormat.KEY_MIME) f.getString(key) ?: "" else runCatching { f.getInteger(key).toString() }.getOrDefault("") }
        }
        val firstTracks = tracks(extractors.first())
        val maps = extractors.map { tracks(it) }
        maps.forEachIndexed { index, map ->
            if (map.keys != firstTracks.keys) throw IllegalStateException("اختلاف مسارات الصوت/الفيديو في المقطع ${index + 1}. يلزم توحيد الملفات قبل التجميع.")
            firstTracks.forEach { (mime, pair) ->
                if (signature(pair.second) != signature(map[mime]!!.second)) {
                    throw IllegalStateException("ترميز أو أبعاد المسار $mime مختلفة في المقطع ${index + 1}. لم نعد ضغط الملفات تلقائيًا.")
                }
            }
        }
        val outputMuxer = MediaMuxer(temp.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        muxer = outputMuxer
        val outputTracks = firstTracks.mapValues { (_, pair) -> outputMuxer.addTrack(pair.second) }
        val rotation = firstTracks.values.firstOrNull { it.second.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true }
            ?.second?.let { if (it.containsKey("rotation-degrees")) runCatching { it.getInteger("rotation-degrees") }.getOrDefault(0) else 0 } ?: 0
        if (rotation in listOf(0, 90, 180, 270)) outputMuxer.setOrientationHint(rotation)
        outputMuxer.start()
        started = true
        val buffer = java.nio.ByteBuffer.allocate(16 * 1024 * 1024)
        val info = MediaCodec.BufferInfo()
        var offsetUs = 0L
        extractors.forEachIndexed { index, extractor ->
            val map = maps[index]
            map.values.forEach { extractor.selectTrack(it.first) }
            var maxSample = 0L
            while (true) {
                val sourceTrack = extractor.sampleTrackIndex
                if (sourceTrack < 0) break
                buffer.clear()
                val size = extractor.readSampleData(buffer, 0)
                if (size < 0) break
                val mime = extractor.getTrackFormat(sourceTrack).getString(MediaFormat.KEY_MIME) ?: break
                info.set(0, size, offsetUs + extractor.sampleTime, extractor.sampleFlags)
                outputMuxer.writeSampleData(outputTracks[mime] ?: throw IllegalStateException("مسار غير معروف: $mime"), buffer, info)
                maxSample = maxOf(maxSample, extractor.sampleTime)
                if (!extractor.advance()) break
            }
            val declaredDuration = maps[index].values.mapNotNull { pair ->
                val format = pair.second
                if (format.containsKey(MediaFormat.KEY_DURATION)) runCatching { format.getLong(MediaFormat.KEY_DURATION) }.getOrNull() else null
            }.maxOrNull() ?: 0L
            offsetUs += maxOf(declaredDuration, maxSample + 1L)
        }
        outputMuxer.stop()
        started = false
        outputMuxer.release()
        muxer = null
        context.contentResolver.openOutputStream(outputUri, "w").use { output ->
            if (output == null) throw IllegalStateException("تعذر فتح ملف الإخراج.")
            FileInputStream(temp).use { input -> input.copyTo(output) }
            output.flush()
        }
    } finally {
        if (started) runCatching { muxer?.stop() }
        runCatching { muxer?.release() }
        extractors.forEach { runCatching { it.release() } }
        runCatching { temp.delete() }
    }
}

private fun apiPost(context: Context, action: String, body: JSONObject): JSONObject {
    val token = DeviceTokenVault.read(context) ?: ""
    return apiPostWithToken(action, body, token)
}

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
                val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val queuedPrompts = loadPendingPrompts(prefs)
                if (!queuedPrompts.contains(text)) savePendingPrompts(prefs, queuedPrompts + text)
                result.put("prompt_saved_locally", true).put("pending_prompt_count", loadPendingPrompts(prefs).size).put("requires_user_tap_to_copy", true)
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
        private const val INTAKE_TOKEN = "encrypted_intake_token"
        private const val INTAKE_IV = "intake_token_iv"

        fun write(context: Context, token: String, intakeToken: String) {
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
            val intakeCipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            intakeCipher.init(javax.crypto.Cipher.ENCRYPT_MODE, key)
            val encryptedIntake = intakeCipher.doFinal(intakeToken.toByteArray(Charsets.UTF_8))
            context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
                .putString(TOKEN, android.util.Base64.encodeToString(encrypted, android.util.Base64.NO_WRAP))
                .putString(IV, android.util.Base64.encodeToString(cipher.iv, android.util.Base64.NO_WRAP))
                .putString(INTAKE_TOKEN, android.util.Base64.encodeToString(encryptedIntake, android.util.Base64.NO_WRAP))
                .putString(INTAKE_IV, android.util.Base64.encodeToString(intakeCipher.iv, android.util.Base64.NO_WRAP)).apply()
        }

        fun readIntake(context: Context): String? {
            return try {
                val p = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
                val encrypted = android.util.Base64.decode(p.getString(INTAKE_TOKEN, null), android.util.Base64.NO_WRAP)
                val iv = android.util.Base64.decode(p.getString(INTAKE_IV, null), android.util.Base64.NO_WRAP)
                val ks = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                val key = (ks.getEntry(KEY_ALIAS, null) as java.security.KeyStore.SecretKeyEntry).secretKey
                val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(javax.crypto.Cipher.DECRYPT_MODE, key, javax.crypto.spec.GCMParameterSpec(128, iv))
                String(cipher.doFinal(encrypted), Charsets.UTF_8)
            } catch (_: Exception) { null }
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
            apiPostWithToken("heartbeat", JSONObject().put("app_version", "0.3.1"), token)
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

private fun importSharedVideos(context: Context, intent: Intent?) {
    if (intent == null || (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE)) return
    val incoming = linkedSetOf<Uri>()
    if (intent.action == Intent.ACTION_SEND) {
        (intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri)?.let { incoming.add(it) }
    } else {
        intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.forEach { incoming.add(it) }
    }
    intent.clipData?.let { clipData ->
        for (i in 0 until clipData.itemCount) clipData.getItemAt(i).uri?.let { incoming.add(it) }
    }
    if (incoming.isEmpty()) return
    val directory = File(context.filesDir, "zoz_imports").apply { mkdirs() }
    val clips = loadSavedClips(context).toMutableList()
    incoming.forEachIndexed { index, source ->
        try {
            val originalName = queryName(context, source) ?: "flow-clip-${System.currentTimeMillis()}-${index + 1}.mp4"
            val extension = originalName.substringAfterLast('.', "mp4").lowercase().take(8).ifBlank { "mp4" }
            val safeName = "shared-${System.currentTimeMillis()}-${index + 1}.$extension"
            val target = File(directory, safeName)
            context.contentResolver.openInputStream(source)?.use { input ->
                FileOutputStream(target).use { output -> input.copyTo(output) }
            } ?: throw IllegalStateException("تعذر فتح الملف المشترك.")
            clips.add(ImportedClip(Uri.fromFile(target), originalName, target.length()))
        } catch (_: Exception) { }
    }
    saveClips(context, clips.distinctBy { it.uri })
}

private fun loadPendingPrompts(prefs: android.content.SharedPreferences): List<String> {
    val raw = prefs.getString(PREF_PENDING_PROMPTS, null)
    if (raw != null) return try {
        val array = JSONArray(raw)
        buildList { for (i in 0 until array.length()) array.optString(i).takeIf { it.isNotBlank() }?.let { add(it) } }
    } catch (_: Exception) { emptyList() }
    val legacy = prefs.getString(PREF_PENDING_PROMPT, "") ?: ""
    return if (legacy.isNotBlank()) listOf(legacy) else emptyList()
}
private fun savePendingPrompts(prefs: android.content.SharedPreferences, prompts: List<String>) {
    val array = JSONArray()
    prompts.forEach { array.put(it) }
    prefs.edit().putString(PREF_PENDING_PROMPTS, array.toString()).remove(PREF_PENDING_PROMPT).apply()
}

private fun loadSavedClips(context: Context): List<ImportedClip> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_CLIPS, "[]") ?: "[]"
    return try {
        val array = JSONArray(raw)
        buildList {
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                val uri = Uri.parse(item.getString("uri"))
                val localFile = uri.scheme == "file" && (uri.path ?: "").startsWith(context.filesDir.absolutePath) && File(uri.path ?: "").exists()
                val permissionStillAvailable = context.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }
                if (localFile || permissionStillAvailable) add(ImportedClip(uri, item.optString("name", "video"), item.optLong("size", 0L)))
            }
        }
    } catch (_: Exception) { emptyList() }
}
private fun saveClips(context: Context, clips: List<ImportedClip>) {
    val array = JSONArray()
    clips.forEach { array.put(JSONObject().put("uri", it.uri.toString()).put("name", it.name).put("size", it.size)) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREF_CLIPS, array.toString()).apply()
}
private fun queryName(context: Context, uri: Uri): String? {
    if (uri.scheme == "file") return File(uri.path ?: return null).name
    return context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null }
}
private fun querySize(context: Context, uri: Uri): Long {
    if (uri.scheme == "file") return File(uri.path ?: return 0L).length()
    return context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { if (it.moveToFirst()) it.getLong(0) else 0L } ?: 0L
}
