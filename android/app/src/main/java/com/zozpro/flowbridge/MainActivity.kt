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
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.io.RandomAccessFile
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import android.os.Bundle
import android.os.Build
import android.os.Environment
import android.provider.OpenableColumns
import android.provider.Settings
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import kotlin.math.roundToInt
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
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
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

data class ImportedClip(val uri: Uri, val name: String, val size: Long)
private const val PREFS = "zoz_flow_bridge"
private const val PREF_CLIPS = "saved_clips"
private const val PREF_PROMPT = "scene_prompt"
private const val PREF_PENDING_PROMPT = "pending_agent_prompt"
private const val PREF_PENDING_PROMPTS = "pending_agent_prompts"
private const val PREF_FLOW_ACCOUNTS = "flow_account_profiles"
private const val PREF_FLOW_SELECTED_ACCOUNT = "flow_selected_account"
private const val FLOW_APP_PACKAGE = "com.google.android.apps.labs.whisk"
private fun loadFlowAccounts(prefs: android.content.SharedPreferences): List<String> = runCatching {
    val values = JSONArray(prefs.getString(PREF_FLOW_ACCOUNTS, "[]") ?: "[]")
    (0 until values.length())
        .mapNotNull { index -> values.optString(index).trim().lowercase().takeIf { it.isNotBlank() } }
        .distinct()
}.getOrDefault(emptyList())
private const val API = "https://oxyzxbkwhafzaztraowc.supabase.co/functions/v1/zoz-pro-device-agent"
private const val INTAKE_API = "https://oxyzxbkwhafzaztraowc.supabase.co/functions/v1/zoz-pro-youtube-analytics"
private const val VOICEOVER_API = "https://oxyzxbkwhafzaztraowc.supabase.co/functions/v1/zoz-pro-voiceover"
private const val PUBLIC_KEY = "sb_publishable_16GficzXgQUah0R8FnqUJQ_D-uBVtZm"

class MainActivity : ComponentActivity() {
    private val voiceoverDeepLinkRequest = mutableIntStateOf(0)
    private val resumeRevision = mutableIntStateOf(0)

    override fun onResume() {
        super.onResume()
        resumeRevision.intValue++
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (isVoiceoverLink(intent)) voiceoverDeepLinkRequest.intValue++
        scheduleDeviceWorker(this)
        setContent { AppScopeControlScreen(voiceoverDeepLinkRequest.intValue, resumeRevision.intValue) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (isVoiceoverLink(intent)) voiceoverDeepLinkRequest.intValue++
    }

    private fun isVoiceoverLink(intent: Intent?): Boolean =
        intent?.data?.let { it.scheme == "zozpro" && it.host == "voiceover" } == true
}

@Composable
private fun AppScopeControlScreen(voiceoverDeepLinkRequest: Int = 0, resumeRevision: Int = 0) {
    val context = LocalContext.current
    val flowPrefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    var flowAccountDraft by remember { mutableStateOf("") }
    var flowAccounts by remember { mutableStateOf(loadFlowAccounts(flowPrefs)) }
    var selectedFlowAccount by remember { mutableStateOf(flowPrefs.getString(PREF_FLOW_SELECTED_ACCOUNT, "") ?: "") }
    val scrollState = rememberScrollState()
    var voiceoverCardTop by remember { mutableIntStateOf(-1) }
    val scope = rememberCoroutineScope()
    var paired by remember { mutableStateOf(DeviceTokenVault.read(context) != null) }
    var pairingCode by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf(if (paired) "الجهاز مرتبط بوكيل ZOZ Pro." else "اربط التطبيق بمركز ZOZ Pro.") }
    var downloadsAccessGranted by remember { mutableStateOf(Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()) }
    LaunchedEffect(flowAccounts) {
        flowPrefs.edit().putString(PREF_FLOW_ACCOUNTS, JSONArray(flowAccounts).toString()).apply()
    }
    LaunchedEffect(selectedFlowAccount) {
        flowPrefs.edit().putString(PREF_FLOW_SELECTED_ACCOUNT, selectedFlowAccount).apply()
    }
    LaunchedEffect(voiceoverDeepLinkRequest, paired, voiceoverCardTop) {
        if (voiceoverDeepLinkRequest > 0 && paired && voiceoverCardTop >= 0) {
            withFrameNanos { }
            scrollState.animateScrollTo(voiceoverCardTop)
        }
    }
    var serviceEnabled by remember { mutableStateOf(FlowAutomationService.isEnabled(context)) }
    var uploadChannelId by remember { mutableStateOf("UC9fr5B0SZZkmVAApfCqEO3w") }
    var uploadVideoUri by remember { mutableStateOf<Uri?>(null) }
    var documentUri by remember { mutableStateOf<Uri?>(null) }
    var narrationText by remember { mutableStateOf("") }
    val uploadPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            try { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) {}
            uploadVideoUri = uri
            status = "تم اختيار الملف: ${queryName(context, uri) ?: "فيديو"} — جاهز للإرسال إلى استقبال القناة المختارة."
        }
    }
    val documentPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            try { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) {}
            documentUri = uri
            status = "تم اختيار الملف: ${queryName(context, uri) ?: "مستند"} — جاهز للاستيراد إلى ذاكرة ZOZ الخاصة."
        }
    }

    fun runAsync(block: suspend () -> String) {
        if (busy) return
        busy = true
        scope.launch {
            try { status = withContext(Dispatchers.IO) { block() } }
            catch (e: Exception) { status = e.message ?: "حدث خطأ في الاتصال." }
            finally {
                busy = false
                serviceEnabled = FlowAutomationService.isEnabled(context)
            }
        }
    }

    LaunchedEffect(paired, resumeRevision) {
        downloadsAccessGranted = Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()
        if (paired) {
            val deviceToken = DeviceTokenVault.read(context)
            if (deviceToken != null) {
                try {
                    withContext(Dispatchers.IO) {
                        ensureIntakeToken(context, deviceToken, "UC9fr5B0SZZkmVAApfCqEO3w", forceRefresh = true)
                        if (FlowAutomationService.isEnabled(context)) {
                            apiPostWithToken("enable_phone_control", JSONObject().put("app_version", BuildConfig.VERSION_NAME), deviceToken)
                            apiPostWithToken("enable_flow_automation", JSONObject().put("app_version", BuildConfig.VERSION_NAME), deviceToken)
                        }
                        apiPostWithToken("register_local_file_intake", JSONObject()
                            .put("permission_granted", Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager())
                            .put("app_version", BuildConfig.VERSION_NAME), deviceToken)
                    }
                    serviceEnabled = FlowAutomationService.isEnabled(context)
                    status = if (serviceEnabled) {
                        "اتصال الهاتف نشط. تم تجهيز استقبال فيديو فِكرة، وتفعيل نطاق التحكم المسموح بتطبيقات الاستوديو."
                    } else {
                        "اتصال الهاتف نشط. تم تجهيز استقبال فيديو فِكرة. فعّل خدمة ZOZ App Access لإتاحة التحكم داخل تطبيقات الاستوديو."
                    }
                } catch (e: Exception) {
                    status = "اتصال الجهاز قائم، لكن تعذر تجهيز استقبال الملفات: " + (e.message ?: "خطأ غير معروف")
                }
            }
        }
    }

    fun requestApp(packageName: String, displayName: String, analytics: Boolean = false) {
        if (!paired) {
            status = "اربط التطبيق بمركز ZOZ Pro أولًا."
            return
        }
        if (!FlowAutomationService.isEnabled(context)) {
            serviceEnabled = false
            status = "فعّل خدمة ZOZ App Access من إعدادات Android، ثم ارجع إلى التطبيق."
            return
        }
        val launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent == null) {
            status = "تطبيق $displayName غير مثبت على الهاتف."
            return
        }

        runAsync {
            val token = DeviceTokenVault.read(context)
                ?: throw IllegalStateException("رمز الجهاز غير موجود؛ أعد اقترانه من مركز ZOZ.")
            apiPostWithToken("enable_phone_control", JSONObject().put("app_version", BuildConfig.VERSION_NAME), token)
            val response = apiPostWithToken(
                "request_app_control",
                JSONObject().put("target_package", packageName).put("section", if (analytics) "analytics" else "screen"),
                token
            )
            // Launch the allow-listed Studio while this owner-initiated request is active.
            // The accessibility executor can then inspect only the selected foreground app.
            withContext(Dispatchers.Main) {
                context.startActivity(launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            scheduleDeviceWorker(context)
            "تم فتح $displayName وإنشاء مهمة " + (if (analytics) "قراءة الإحصاءات" else "قراءة الشاشة") + ". رقم المهمة: " +
                response.optString("job_id", "قيد التنفيذ")
        }
    }

    MaterialTheme {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().verticalScroll(scrollState).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("ZOZ App Control", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("جهاز تنفيذ وكيل ZOZ داخل تطبيقات القنوات", style = MaterialTheme.typography.titleMedium)
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text(if (paired) "الجهاز مرتبط بوكيل ZOZ Pro" else "الجهاز غير مرتبط", fontWeight = FontWeight.Bold)
                        Text("النطاق: YouTube Studio وTikTok Studio وقناتا YouTube وTikTok المسجلتان على هذا الهاتف.")
                        Text("يستطيع الوكيل فحص الشاشة وقراءة البيانات والتنقل والتمرير وتعديل حقول المحتوى الوظيفية.")
                        Text("النشر العام والحذف والإرسال النهائي تحتاج موافقتك الصريحة. كلمات المرور ورموز التحقق وبيانات الدفع والتطبيقات الشخصية خارج النطاق.")
                        Text("اترك خدمة ZOZ App Access مفعّلة حتى يستقبل الهاتف أوامر الوكيل وينفذها تلقائيًا داخل تطبيقات القنوات فقط.")
                        Text(if (serviceEnabled) "خدمة الوصول مفعّلة الآن." else "خدمة الوصول متوقفة الآن.")
                        OutlinedButton(onClick = {
                            context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                        }, modifier = Modifier.fillMaxWidth()) {
                            Text(if (serviceEnabled) "إعدادات خدمة التطبيقات" else "تفعيل خدمة التطبيقات عند الحاجة")
                        }
                    }
                }
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text("حسابات Google Flow", fontWeight = FontWeight.Bold)
                        Text("احفظ عناوين الحسابات المستخدمة على الهاتف واختر الحساب المطلوب لكل جلسة. يجري النظام التحقق من الحساب الظاهر داخل Flow ومحاولة اختياره من قائمة الحسابات المتاحة. لا يحفظ التطبيق كلمات مرور أو رموز تحقق. إذا طلب Flow تسجيل دخول أو تحقق إضافي، أكمل ذلك داخل Flow يدويًا.")
                        OutlinedTextField(
                            value = flowAccountDraft,
                            onValueChange = { flowAccountDraft = it.take(254) },
                            label = { Text("البريد الإلكتروني لحساب Google") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        Button(enabled = !busy && flowAccountDraft.trim().matches(Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")),
                            onClick = {
                                val email = flowAccountDraft.trim().lowercase()
                                flowAccounts = (flowAccounts + email).distinct()
                                selectedFlowAccount = email
                                flowAccountDraft = ""
                                status = "أُضيف الحساب إلى قائمة Flow واختير للحساب المستهدف."
                            }, modifier = Modifier.fillMaxWidth()) { Text("إضافة الحساب واختياره") }
                        if (flowAccounts.isEmpty()) {
                            Text("لم تُضف حسابات بعد.")
                        } else {
                            flowAccounts.forEach { email ->
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(enabled = !busy, onClick = {
                                        selectedFlowAccount = email
                                        status = "الحساب المستهدف الآن: $email"
                                    }, modifier = Modifier.weight(1f)) {
                                        Text(if (selectedFlowAccount.equals(email, true)) "✓ $email" else email)
                                    }
                                    OutlinedButton(enabled = !busy, onClick = {
                                        flowAccounts = flowAccounts.filterNot { it.equals(email, true) }
                                        if (selectedFlowAccount.equals(email, true)) selectedFlowAccount = flowAccounts.firstOrNull().orEmpty()
                                    }) { Text("إزالة") }
                                }
                            }
                        }
                        Text("الحساب المختار: ${selectedFlowAccount.ifBlank { "لم يتم الاختيار" }}")
                        OutlinedButton(enabled = !busy, onClick = {
                            val launch = context.packageManager.getLaunchIntentForPackage(FLOW_APP_PACKAGE)
                            if (launch == null) {
                                status = "تطبيق Google Flow الأصلي غير متاح في قائمة التطبيقات؛ لم يتم فتح Chrome بديلًا عنه."
                            } else {
                                context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                                status = "تم فتح تطبيق Google Flow الأصلي على الهاتف."
                            }
                        }, modifier = Modifier.fillMaxWidth()) { Text("فتح تطبيق Google Flow الأصلي") }
                        Button(enabled = !busy && paired && FlowAutomationService.isEnabled(context), onClick = {
                            val launch = context.packageManager.getLaunchIntentForPackage(FLOW_APP_PACKAGE)
                            if (launch == null) {
                                status = "تعذر العثور على تطبيق Google Flow الأصلي في قائمة تطبيقات Android؛ لم يتم فتح Chrome بديلًا عنه."
                            } else {
                                try {
                                    context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                                    status = "تم طلب فتح تطبيق Google Flow الأصلي؛ يجري الآن تجهيز اختبار الكتابة الآمن."
                                    runAsync {
                                        val token = DeviceTokenVault.read(context)
                                            ?: throw IllegalStateException("الجهاز غير مقرون.")
                                        val queued = apiPostWithToken("request_flow_control_diagnostic",
                                            JSONObject().put("flow_account_email", selectedFlowAccount), token)
                                        val queuedId = queued.optString("job_id")
                                        if (queuedId.isBlank()) throw IllegalStateException("لم يُرجع الخادم معرّف اختبار.")
                                        val claimed = apiPostWithToken("poll_jobs", JSONObject(), token).optJSONObject("job")
                                            ?: throw IllegalStateException("تم فتح Flow، لكن الهاتف لم يستلم مهمة اختبار الكتابة بعد.")
                                        if (claimed.optString("id") != queuedId) {
                                            throw IllegalStateException("تم فتح Flow، لكن استلم الهاتف مهمة أخرى؛ أوقفت الاختبار لتجنب تنفيذ مهمة غير مقصودة.")
                                        }
                                        withContext(Dispatchers.Main) { executeJob(context, claimed) }
                                    }
                                } catch (e: Exception) {
                                    status = "تعذر فتح تطبيق Google Flow: ${e.message ?: "خطأ Android غير معروف"}"
                                }
                            }
                        }, modifier = Modifier.fillMaxWidth()) { Text("فتح Flow واختبار التحكم الفعلي") }
                    }
                }

                if (!paired) {
                    OutlinedTextField(
                        value = pairingCode,
                        onValueChange = { pairingCode = it.filter(Char::isLetterOrDigit).take(32) },
                        label = { Text("رمز الاقتران من مركز ZOZ Pro") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(enabled = !busy && pairingCode.length == 32, onClick = {
                        runAsync {
                            val response = apiPost(context, "pair_exchange", JSONObject()
                                .put("pairing_code", pairingCode)
                                .put("device_name", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL)
                                .put("app_version", BuildConfig.VERSION_NAME)
                                .put("app_package", BuildConfig.APPLICATION_ID))
                            DeviceTokenVault.write(context, response.getString("device_token"), response.optString("intake_token", ""))
                            paired = true
                            pairingCode = ""
                            scheduleDeviceWorker(context)
                            "تم ربط ZOZ App Control بالوكيل."
                        }
                    }, modifier = Modifier.fillMaxWidth()) { Text("ربط بالوكيل") }
                } else {
                    Button(enabled = !busy, onClick = {
                        runAsync {
                            val token = DeviceTokenVault.read(context) ?: throw IllegalStateException("الجهاز غير مرتبط.")
                            val response = apiPostWithToken("heartbeat", JSONObject().put("app_version", BuildConfig.VERSION_NAME), token)
                            "اتصال الوكيل ناجح. وقت الخادم: " + response.optString("server_time", "متصل")
                        }
                    }, modifier = Modifier.fillMaxWidth()) { Text("فحص اتصال الوكيل") }
                    Text("التطبيقات المسموح بها", fontWeight = FontWeight.Bold)
                    Button(enabled = !busy, onClick = { requestApp("com.ss.android.tt.creator", "TikTok Studio · فِكرة") },
                        modifier = Modifier.fillMaxWidth()) { Text("TikTok Studio · فِكرة") }
                    OutlinedButton(enabled = !busy, onClick = { requestApp("com.ss.android.tt.creator", "TikTok Studio · فِكرة", analytics = true) }, modifier = Modifier.fillMaxWidth()) { Text("قراءة إحصاءات TikTok Studio") }
                    Button(enabled = !busy, onClick = { requestApp("com.google.android.apps.youtube.creator", "YouTube Studio") },
                        modifier = Modifier.fillMaxWidth()) { Text("YouTube Studio") }
                    OutlinedButton(enabled = !busy, onClick = { requestApp("com.google.android.apps.youtube.creator", "YouTube Studio", analytics = true) }, modifier = Modifier.fillMaxWidth()) { Text("قراءة إحصاءات YouTube Studio") }
                    Button(enabled = !busy, onClick = { requestApp("com.zhiliaoapp.musically", "TikTok") },
                        modifier = Modifier.fillMaxWidth()) { Text("TikTok العادي") }
                    Button(enabled = !busy, onClick = { requestApp("com.google.android.youtube", "YouTube") },
                        modifier = Modifier.fillMaxWidth()) { Text("YouTube العادي") }
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("الوصول التلقائي لملفات التنزيلات", fontWeight = FontWeight.Bold)
                            Text(if (downloadsAccessGranted) "صلاحية الملفات مفعلة. عند إرسال أمر من مركز ZOZ سيبحث التطبيق داخل مجلد Downloads عن أحدث ملف مطابق ويرفعه تلقائيًا." else "يلزم تفعيل الصلاحية مرة واحدة من إعدادات Android. سيقتصر فحص ZOZ برمجيًا على مجلد Downloads والامتدادات التي يحددها أمر الوكيل.")
                            if (!downloadsAccessGranted) {
                                Button(enabled = !busy, onClick = {
                                    try {
                                        context.startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + context.packageName)))
                                    } catch (_: Exception) {
                                        runCatching { context.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) }
                                    }
                                }, modifier = Modifier.fillMaxWidth()) { Text("فتح إعداد صلاحية الوصول إلى الملفات") }
                            } else {
                                Text("✓ صلاحية الوصول متاحة — لا يقرأ التطبيق الصور أو المستندات أو الفيديوهات إلا عند وجود أمر محدد.", color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("رفع الفيديو مباشرة من الهاتف إلى مركز ZOZ", fontWeight = FontWeight.Bold)
                            Text("اختر القناة ثم حدد ملف الفيديو مرة واحدة. يرفع التطبيق الملف إلى استقبال القناة فقط؛ لا ينشره تلقائيًا.")
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(enabled = !busy, onClick = { uploadChannelId = "UC9fr5B0SZZkmVAApfCqEO3w" }) { Text(if (uploadChannelId == "UC9fr5B0SZZkmVAApfCqEO3w") "✓ فِكرة" else "فِكرة") }
                                OutlinedButton(enabled = !busy, onClick = { uploadChannelId = "UCIael48cvwPG3gKj--c7HKw" }) { Text(if (uploadChannelId == "UCIael48cvwPG3gKj--c7HKw") "✓ Hazem Ahmed" else "Hazem Ahmed") }
                            }
                            OutlinedButton(enabled = !busy, onClick = { uploadPicker.launch(arrayOf("video/mp4","video/quicktime","video/webm","video/*")) }, modifier = Modifier.fillMaxWidth()) { Text(if (uploadVideoUri == null) "اختيار ملف فيديو من الهاتف" else "تغيير ملف الفيديو") }
                            if (uploadVideoUri != null) Text(queryName(context, uploadVideoUri!!) ?: "فيديو محدد", style = MaterialTheme.typography.bodySmall)
                            Button(enabled = !busy && paired && uploadVideoUri != null, onClick = { runAsync {
                                val deviceToken = DeviceTokenVault.read(context) ?: throw IllegalStateException("الجهاز غير مرتبط بالوكيل.")
                                val tokenResponse = apiPostWithToken("device_intake_token", JSONObject().put("channel_id", uploadChannelId), deviceToken)
                                val intakeToken = tokenResponse.optString("intake_token")
                                if (intakeToken.length < 32) throw IllegalStateException("لم يصدر الخادم رمز استقبال صالحًا؛ لم يبدأ رفع الملف.")
                                DeviceTokenVault.writeIntake(context, intakeToken)
                                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                                    .putString("zoz_intake_channel_id", uploadChannelId).apply()
                                uploadFinalVideoToIntake(context, uploadVideoUri!!, true, false, uploadChannelId)
                            } }, modifier = Modifier.fillMaxWidth()) { Text("رفع الملف إلى استقبال القناة المختارة") }
                        }
                    }
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("استيراد الملفات إلى ذاكرة ZOZ Pro", fontWeight = FontWeight.Bold)
                            Text("اختر تقريرًا من مجلد التنزيلات أو أي مجلد تختاره بنفسك. يدعم CSV وExcel وPDF وTXT وDOCX والصور. لا يقرأ التطبيق أي ملفات أخرى.")
                            OutlinedButton(enabled = !busy, onClick = { documentPicker.launch(arrayOf("text/*","application/pdf","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.wordprocessingml.document","image/png","image/jpeg","image/webp")) }, modifier = Modifier.fillMaxWidth()) {
                                Text(if (documentUri == null) "اختيار ملف من التنزيلات" else "تغيير الملف المحدد")
                            }
                            if (documentUri != null) Text(queryName(context, documentUri!!) ?: "ملف محدد", style = MaterialTheme.typography.bodySmall)
                            Button(enabled = !busy && paired && documentUri != null, onClick = { runAsync {
                                uploadDocumentToIntake(context, documentUri!!, BuildConfig.VERSION_NAME)
                            } }, modifier = Modifier.fillMaxWidth()) { Text("استيراد الملف إلى ذاكرة ZOZ Pro") }
                            Text("الملف يبقى خاصًا بحساب المالك، ولا يُشارك أو يُنشر تلقائيًا.", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Card(
                        Modifier.fillMaxWidth().onGloballyPositioned { coordinates ->
                            if (voiceoverCardTop < 0) voiceoverCardTop = coordinates.positionInParent().y.roundToInt()
                        }
                    ) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("إنتاج التعليق الصوتي ودمجه مع الفيديو", fontWeight = FontWeight.Bold)
                            Text("اختر ملف الفيديو من بطاقة الرفع أعلاه، واكتب التعليق بالعربية. سيستخدم الهاتف محرك النطق العربي المثبت دون رصيد API، ثم يضيف مسار AAC إلى ملف MP4 مع إبقاء الصورة الأصلية دون إعادة ترميز. صوت الفيديو الأصلي يُستبدل بالتعليق.")
                            OutlinedTextField(
                                value = narrationText,
                                onValueChange = { narrationText = it.take(3000) },
                                label = { Text("نص التعليق الصوتي المصري") },
                                placeholder = { Text("اكتب النص كما تريد أن يُنطق، من دون تشكيل.") },
                                minLines = 4,
                                maxLines = 8,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Text("إذا طال التعليق عن مدة الفيديو، سيوقف النظام الدمج بدل قطع الكلام.", style = MaterialTheme.typography.bodySmall)
                            Button(enabled = !busy && uploadVideoUri != null && narrationText.trim().isNotEmpty(), onClick = {
                                val sourceUri = uploadVideoUri
                                val narration = narrationText.trim()
                                if (sourceUri == null) {
                                    status = "اختر فيديو أولًا من بطاقة رفع الفيديو."
                                } else {
                                    runAsync {
                                        val output = createArabicVoiceoverVideo(context, sourceUri, narration)
                                        withContext(Dispatchers.Main) { uploadVideoUri = Uri.fromFile(output.file) }
                                        "اكتمل توليد التعليق ودمجه. الصوت: ${output.voiceLabel}. الملف النهائي: ${output.file.name}. الصورة لم تُعد ترميزها؛ أصبح الملف جاهزًا للرفع إلى القناة المختارة."
                                    }
                                }
                            }, modifier = Modifier.fillMaxWidth()) {
                                Text(if (busy) "جارٍ توليد الصوت والدمج…" else "توليد التعليق الصوتي ودمجه")
                            }
                        }
                    }
                    Button(enabled = !busy, onClick = { runAsync {
                        val token = DeviceTokenVault.read(context)
                            ?: throw IllegalStateException("الجهاز غير مقرون.")
                        apiPostWithToken("device_health", JSONObject().put("app_version", BuildConfig.VERSION_NAME), token)
                        var processed = 0
                        var flowResult = false
                        for (index in 0 until 6) {
                            val job = apiPostWithToken("poll_jobs", JSONObject(), token).optJSONObject("job") ?: break
                            val capability = job.optString("capability_id")
                            executeJob(context, job)
                            processed++
                            if (capability == "flow.generate_scene" || capability == "device.ui_control") {
                                flowResult = true
                                break
                            }
                        }
                        when {
                            flowResult -> "تم استلام مهمة تحكم Flow وتنفيذها. افحص نتيجة المهمة في مركز ZOZ."
                            processed > 0 -> "تم استلام وتنفيذ $processed مهمة من الوكيل. لا توجد مهمة Flow ضمن المهام المستلمة."
                            else -> "اتصال الوكيل ناجح، لكن لا توجد مهام جاهزة في الطابور."
                        }
                    } }, modifier = Modifier.fillMaxWidth()) { Text("اتصال وفحص المهام") }
                    OutlinedButton(onClick = {
                        DeviceTokenVault.clear(context)
                        paired = false
                        status = "تم فصل الجهاز محليًا."
                    }, modifier = Modifier.fillMaxWidth()) { Text("فصل الجهاز") }
                }
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text("آخر حالة", fontWeight = FontWeight.Bold)
                        Text(status)
                    }
                }
            }
        }
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
    var flowAccountDraft by remember { mutableStateOf("") }
    var flowAccounts by remember { mutableStateOf(loadFlowAccounts(prefs)) }
    var selectedFlowAccount by remember { mutableStateOf(prefs.getString(PREF_FLOW_SELECTED_ACCOUNT, "") ?: "") }
    var showCleanupConfirm by remember { mutableStateOf(false) }

    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    LaunchedEffect(prompt) { prefs.edit().putString(PREF_PROMPT, prompt).apply() }
    LaunchedEffect(paired) {
        if (paired && FlowAutomationService.isEnabled(context)) {
            withContext(Dispatchers.IO) {
                runCatching { apiPost(context, "enable_phone_control", JSONObject()) }
                runCatching { apiPost(context, "enable_flow_automation", JSONObject()) }
            }
        }
    }
    LaunchedEffect(clips) { saveClips(context, clips) }
    LaunchedEffect(flowAccounts) { prefs.edit().putString(PREF_FLOW_ACCOUNTS, JSONArray(flowAccounts).toString()).apply() }
    LaunchedEffect(selectedFlowAccount) { prefs.edit().putString(PREF_FLOW_SELECTED_ACCOUNT, selectedFlowAccount).apply() }

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
                Text("ZOZ Pro Service", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("جهاز تنفيذ Android المتصل بوكيل ZOZ Pro", style = MaterialTheme.typography.titleMedium)
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(if (paired) "الجهاز مقرون بالوكيل" else "الجهاز غير مقرون", fontWeight = FontWeight.Bold)
                        Text("قدرات الجهاز: فحص وقراءة الشاشات، فتح تبويبات الاستوديو، التمرير، تعديل بيانات المحتوى الوظيفية، وإرجاع نتائج المهام إلى وكيل ZOZ.")
                        Text("القنوات وتطبيقات العمل الأربعة المصرح بها فقط. لا تُقرأ كلمات المرور أو رموز التحقق أو بيانات الدفع. النشر العام والحذف والإرسال النهائي تحتاج موافقتك.")
                    }
                }

                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("تنفيذ Google Flow تلقائيًا", fontWeight = FontWeight.Bold)
                        Text(if (FlowAutomationService.isEnabled(context)) "خدمة الوصول مفعّلة على هذا الهاتف." else "يلزم تفعيل خدمة ZOZ Flow Automation مرة واحدة من إعدادات Android للسماح بالتعامل المرئي مع Flow.")
                        OutlinedButton(onClick = {
                            try { context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
                            catch (_: Exception) { lastAction = "تعذر فتح إعدادات إمكانية الوصول." }
                        }, modifier = Modifier.fillMaxWidth()) { Text("فتح إعدادات إمكانية الوصول") }
                        Button(enabled = !busy && paired && FlowAutomationService.isEnabled(context), onClick = { runAsync {
                            val token = DeviceTokenVault.read(context) ?: throw IllegalStateException("الجهاز غير مقرون.")
                            apiPostWithToken("enable_flow_automation", JSONObject(), token)
                            "تم تفعيل قدرة تنفيذ مشاهد Flow للجهاز بعد تحقق التطبيق من تفعيل خدمة الوصول."
                        } }, modifier = Modifier.fillMaxWidth()) { Text("تأكيد التفعيل وربط الوكيل") }
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
                                .put("app_version", BuildConfig.VERSION_NAME)
                                .put("app_package", BuildConfig.APPLICATION_ID))
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
                            apiPost(context, "device_health", JSONObject().put("app_version", BuildConfig.VERSION_NAME)
                                .put("app_package", BuildConfig.APPLICATION_ID))
                            var processed = 0
                            for (index in 0 until 6) {
                                val job = apiPost(context, "poll_jobs", JSONObject()).optJSONObject("job") ?: break
                                val capability = job.optString("capability_id")
                                executeJob(context, job)
                                processed++
                                if (capability == "flow.generate_scene" || capability == "device.ui_control") break
                            }
                            if (processed == 0) "الاتصال سليم. لا توجد مهام جديدة."
                            else "اكتمل الاتصال واستلام $processed مهمة من وكيل ZOZ."
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
                            val launch = context.packageManager.getLaunchIntentForPackage(FLOW_APP_PACKAGE)
                            if (launch == null) {
                                lastAction = "تطبيق Google Flow الأصلي غير ظاهر على الهاتف؛ لم نفتح Chrome كبديل."
                            } else {
                                context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                                lastAction = "تم فتح تطبيق Google Flow الأصلي على الهاتف."
                            }
                        } catch (_: Exception) { lastAction = "تعذر فتح تطبيق Google Flow الأصلي." }
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

fun uploadFinalVideoToIntake(context: Context, uri: Uri, synthetic: Boolean, kids: Boolean, channelId: String = "", checksumSha256: String = ""): String {
    val intakeToken = DeviceTokenVault.readIntake(context)?.takeIf { it.length >= 32 } ?: throw IllegalStateException("رمز استقبال الفيديو غير موجود أو غير صالح. اختر القناة لإصدار رمز جديد.")
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val name = queryName(context, uri) ?: "ZOZ-final-video.mp4"
    val size = querySize(context, uri)
    if (size <= 0L) throw IllegalStateException("تعذر قراءة حجم الملف النهائي.")
    var asset: JSONObject
    val savedId = prefs.getString("intake_upload_asset_id", null)
    val savedUri = prefs.getString("intake_upload_uri", null)
    val savedSize = prefs.getLong("intake_upload_size", -1L)
    val savedChannel = prefs.getString("intake_upload_channel_id", "") ?: ""
    if (!savedId.isNullOrBlank()) {
        if (savedUri != uri.toString() || savedSize != size || (channelId.isNotBlank() && savedChannel.isNotBlank() && savedChannel != channelId)) {
            throw IllegalStateException("يوجد رفع سابق غير مكتمل. أعد اختيار الملف نفسه لاستكماله أولًا.")
        }
        val status = intakePost("intake_status", JSONObject().put("asset_id", savedId), intakeToken)
        asset = status.getJSONObject("asset")
        if (asset.optString("status") == "ready_for_review") {
            prefs.edit().remove("intake_upload_asset_id").remove("intake_upload_uri").remove("intake_upload_size").remove("intake_upload_channel_id").apply()
            return "الفيديو موجود بالفعل في استقبال ZOZ وينتظر المراجعة. رقم الملف: $savedId"
        }
        if (asset.optString("status") != "uploading") {
            throw IllegalStateException("حالة الرفع السابق هي ${asset.optString("status")}؛ راجع مركز الاستقبال قبل بدء رفع جديد.")
        }
    } else {
        val created = intakePost("intake_create", JSONObject()
            .put("channel_id", channelId)
            .put("filename", name)
            .put("total_bytes", size)
            .put("content_type", when (name.substringAfterLast('.', "").lowercase(Locale.ROOT)) {
                "mov" -> "video/quicktime"
                "webm" -> "video/webm"
                "mkv" -> "video/x-matroska"
                else -> "video/mp4"
            })
            .put("file_sha256", checksumSha256)
            .put("title", name.substringBeforeLast("."))
            .put("description", "تم تجميع الفيديو محليًا على جهاز ZOZ Android؛ ينتظر مراجعة المالك.")
            .put("tags", JSONArray())
            .put("made_for_kids", kids)
            .put("contains_synthetic_media", synthetic)
            .put("target_privacy_status", "public"), intakeToken)
        asset = created.getJSONObject("asset")
        if (created.optBoolean("duplicate")) {
            val duplicateId = asset.optString("id")
            prefs.edit().putString("zoz_last_uploaded_asset_id", duplicateId).apply()
            return "هذا الفيديو مرفوع بالفعل إلى استقبال القناة بالحالة ${asset.optString("status")}؛ لم يتم إنشاء نسخة مكررة. رقم الملف: $duplicateId"
        }
        prefs.edit().putString("intake_upload_asset_id", asset.getString("id"))
             .putString("intake_upload_uri", uri.toString()).putLong("intake_upload_size", size).putString("intake_upload_channel_id", asset.optString("channel_id", channelId)).apply()
    }
    val assetId = asset.getString("id")
    prefs.edit().putString("zoz_last_uploaded_asset_id", assetId).apply()
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

fun assembleCompatibleClips(context: Context, clips: List<ImportedClip>, outputUri: Uri) {
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
                val sampleFlags = extractor.sampleFlags
                if ((sampleFlags and MediaExtractor.SAMPLE_FLAG_ENCRYPTED) != 0) {
                    throw IllegalStateException("المقطع يحتوي عينات مشفرة؛ أوقفنا التجميع بدل إفساد الفيديو.")
                }
                var codecFlags = 0
                if ((sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC) != 0) codecFlags = codecFlags or MediaCodec.BUFFER_FLAG_KEY_FRAME
                if ((sampleFlags and MediaExtractor.SAMPLE_FLAG_PARTIAL_FRAME) != 0) codecFlags = codecFlags or MediaCodec.BUFFER_FLAG_PARTIAL_FRAME
                info.set(0, size, offsetUs + extractor.sampleTime, codecFlags)
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
        val outputStream = if (outputUri.scheme == "file") {
            val path = outputUri.path ?: throw IllegalStateException("مسار ملف الإخراج غير صالح.")
            FileOutputStream(File(path))
        } else {
            context.contentResolver.openOutputStream(outputUri, "w")
                ?: throw IllegalStateException("تعذر فتح ملف الإخراج.")
        }
        outputStream.use { output ->
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


internal data class VoiceoverOutput(val file: File, val voiceLabel: String)
private data class PcmWavInfo(val dataOffset: Long, val dataSize: Long, val sampleRate: Int, val channels: Int, val bitsPerSample: Int)
private val voiceLabels = java.util.concurrent.ConcurrentHashMap<String, String>()

internal suspend fun createArabicVoiceoverVideo(context: Context, sourceUri: Uri, narration: String): VoiceoverOutput {
    if (narration.isBlank()) throw IllegalArgumentException("اكتب نص التعليق الصوتي أولًا.")
    if (narration.length > 3000) throw IllegalArgumentException("نص التعليق طويل جدًا؛ اختصره إلى 3000 حرف.")
    val wav = synthesizeArabicVoice(context, narration)
    val aac = File(context.cacheDir, "zoz-voice-\${System.currentTimeMillis()}.m4a")
    val outputDir = (context.getExternalFilesDir(android.os.Environment.DIRECTORY_MOVIES) ?: context.filesDir).apply { mkdirs() }
    val output = File(outputDir, "ZOZ-voiceover-\${System.currentTimeMillis()}.mp4")
    val label = voiceLabels.remove(wav.absolutePath) ?: "صوت العربية المتاح على الهاتف"
    try {
        encodePcmWavToAac(wav, aac)
        muxVideoWithVoiceover(context, sourceUri, aac, output)
        if (!output.exists() || output.length() < 1024L) throw IllegalStateException("ملف MP4 النهائي لم يُنشأ بحجم صالح.")
        return VoiceoverOutput(output, label)
    } catch (e: Exception) {
        output.delete()
        throw e
    } finally {
        wav.delete()
        aac.delete()
    }
}

private suspend fun synthesizeArabicVoice(context: Context, text: String): File = withContext(Dispatchers.Main) {
    suspendCancellableCoroutine { continuation ->
        val output = File(context.cacheDir, "zoz-voice-\${System.currentTimeMillis()}.wav")
        val finished = AtomicBoolean(false)
        lateinit var engine: TextToSpeech
        fun fail(error: Throwable) {
            if (finished.compareAndSet(false, true)) {
                runCatching { engine.stop() }
                runCatching { engine.shutdown() }
                output.delete()
                if (continuation.isActive) continuation.resumeWithException(error)
            }
        }
        try {
            engine = TextToSpeech(context.applicationContext) { initStatus ->
                if (!continuation.isActive || finished.get()) {
                    runCatching { engine.shutdown() }
                    return@TextToSpeech
                }
                if (initStatus != TextToSpeech.SUCCESS) {
                    fail(IllegalStateException("تعذر تشغيل محرك النطق. تأكد من تفعيل خدمة تحويل النص إلى كلام وتنزيل صوت عربي."))
                    return@TextToSpeech
                }
                try {
                    val available = engine.voices ?: emptySet()
                    val egyptian = available
                        .filter { it.locale.language.equals("ar", true) && it.locale.country.equals("EG", true) }
                        .sortedBy { it.isNetworkConnectionRequired }
                        .firstOrNull()
                    val voiceLabel: String
                    if (egyptian != null) {
                        engine.voice = egyptian
                        voiceLabel = "العربية المصرية (\${egyptian.name})"
                    } else {
                        val language = engine.setLanguage(Locale("ar", "EG"))
                        if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
                            val fallback = engine.setLanguage(Locale("ar"))
                            if (fallback == TextToSpeech.LANG_MISSING_DATA || fallback == TextToSpeech.LANG_NOT_SUPPORTED) {
                                throw IllegalStateException("لا يوجد صوت عربي مثبت. افتح إعدادات تحويل النص إلى كلام ونزّل صوت العربية ثم أعد المحاولة.")
                            }
                        }
                        voiceLabel = "العربية المتاحة على الهاتف (لا يوجد صوت مصري محدد)"
                    }
                    engine.setSpeechRate(0.96f)
                    engine.setPitch(1.0f)
                    val utteranceId = "zoz-\${UUID.randomUUID()}"
                    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(id: String?) {}
                        override fun onDone(id: String?) {
                            if (id != utteranceId || !finished.compareAndSet(false, true)) return
                            runCatching { engine.shutdown() }
                            if (output.exists() && output.length() > 44L) {
                                voiceLabels[output.absolutePath] = voiceLabel
                                if (continuation.isActive) continuation.resume(output)
                            } else {
                                output.delete()
                                if (continuation.isActive) continuation.resumeWithException(
                                    IllegalStateException("محرك النطق لم ينتج ملف صوت صالحًا.")
                                )
                            }
                        }
                        override fun onError(id: String?) {
                            fail(IllegalStateException("فشل محرك النطق في إنشاء التعليق الصوتي."))
                        }
                        override fun onError(id: String?, errorCode: Int) {
                            fail(IllegalStateException("فشل محرك النطق (رمز $errorCode). تأكد من تنزيل صوت العربية."))
                        }
                        override fun onStop(id: String?, interrupted: Boolean) {
                            if (interrupted) fail(IllegalStateException("تم إيقاف توليد التعليق قبل اكتماله."))
                        }
                    })
                    val result = engine.synthesizeToFile(text, Bundle(), output, utteranceId)
                    if (result != TextToSpeech.SUCCESS) {
                        throw IllegalStateException("محرك النطق رفض النص. اختصره أو افحص صوت العربية المثبت.")
                    }
                } catch (e: Exception) {
                    fail(e)
                }
            }
        } catch (e: Exception) {
            if (finished.compareAndSet(false, true) && continuation.isActive) continuation.resumeWithException(e)
        }
        continuation.invokeOnCancellation {
            if (finished.compareAndSet(false, true)) {
                runCatching { engine.stop() }
                runCatching { engine.shutdown() }
                output.delete()
            }
        }
    }
}

private fun readPcmWavInfo(file: File): PcmWavInfo {
    RandomAccessFile(file, "r").use { input ->
        if (input.length() < 44L) throw IllegalStateException("ملف التعليق الصوتي قصير أو غير مكتمل.")
        fun readAscii(count: Int): String {
            val bytes = ByteArray(count)
            input.readFully(bytes)
            return String(bytes, Charsets.US_ASCII)
        }
        fun readU16(): Int {
            val a = input.readUnsignedByte()
            val b = input.readUnsignedByte()
            return a or (b shl 8)
        }
        fun readU32(): Long {
            val a = input.readUnsignedByte().toLong()
            val b = input.readUnsignedByte().toLong()
            val c = input.readUnsignedByte().toLong()
            val d = input.readUnsignedByte().toLong()
            return a or (b shl 8) or (c shl 16) or (d shl 24)
        }
        if (readAscii(4) != "RIFF") throw IllegalStateException("صيغة الصوت الناتج ليست WAV PCM مدعومة.")
        readU32()
        if (readAscii(4) != "WAVE") throw IllegalStateException("ملف الصوت لا يحتوي ترويسة WAVE صحيحة.")
        var audioFormat = -1
        var channels = 0
        var sampleRate = 0
        var bits = 0
        var dataOffset = -1L
        var dataSize = 0L
        while (input.filePointer + 8L <= input.length()) {
            val id = readAscii(4)
            val chunkSize = readU32()
            val chunkStart = input.filePointer
            when (id) {
                "fmt " -> {
                    if (chunkSize < 16L) throw IllegalStateException("ترويسة WAV غير مكتملة.")
                    audioFormat = readU16()
                    channels = readU16()
                    sampleRate = readU32().toInt()
                    readU32()
                    readU16()
                    bits = readU16()
                }
                "data" -> {
                    dataOffset = input.filePointer
                    dataSize = minOf(chunkSize, input.length() - dataOffset)
                }
            }
            val next = chunkStart + chunkSize + (chunkSize and 1L)
            if (next > input.length()) break
            input.seek(next)
            if (dataOffset >= 0L && audioFormat >= 0) break
        }
        if (audioFormat != 1 || channels !in 1..2 || sampleRate !in 8000..96000 || bits != 16 || dataOffset < 0L || dataSize <= 0L) {
            throw IllegalStateException("محرك الهاتف أنتج WAV غير مدعوم. المطلوب PCM 16-bit أحادي أو ثنائي القناة.")
        }
        return PcmWavInfo(dataOffset, dataSize, sampleRate, channels, bits)
    }
}

private fun encodePcmWavToAac(wavFile: File, aacFile: File) {
    val wav = readPcmWavInfo(wavFile)
    aacFile.delete()
    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, wav.sampleRate, wav.channels).apply {
        setInteger(MediaFormat.KEY_AAC_PROFILE, android.media.MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        setInteger(MediaFormat.KEY_BIT_RATE, if (wav.channels == 1) 96000 else 128000)
        setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)
    }
    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    val muxer = MediaMuxer(aacFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var muxerStarted = false
    var encoderStarted = false
    var trackIndex = -1
    val info = MediaCodec.BufferInfo()
    val frameBytes = wav.channels * 2
    var bytesSubmitted = 0L
    var inputEnded = false
    var outputEnded = false
    try {
        encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        encoder.start()
        encoderStarted = true
        RandomAccessFile(wavFile, "r").use { input ->
            input.seek(wav.dataOffset)
            val chunk = ByteArray(16 * 1024)
            while (!outputEnded) {
                if (!inputEnded) {
                    val inputIndex = encoder.dequeueInputBuffer(10000)
                    if (inputIndex >= 0) {
                        val inputBuffer = encoder.getInputBuffer(inputIndex) ?: throw IllegalStateException("مدخل ترميز الصوت غير متاح.")
                        inputBuffer.clear()
                        val capacity = minOf(chunk.size, inputBuffer.remaining())
                        val alignedCapacity = capacity - (capacity % frameBytes)
                        val available = minOf(alignedCapacity.toLong(), wav.dataSize - bytesSubmitted).toInt()
                        val read = if (available > 0) input.read(chunk, 0, available) else -1
                        if (read > 0) {
                            val alignedRead = read - (read % frameBytes)
                            if (alignedRead <= 0) throw IllegalStateException("بيانات PCM غير مصطفة على حدود الإطار.")
                            inputBuffer.put(chunk, 0, alignedRead)
                            val pts = bytesSubmitted * 1_000_000L / (wav.sampleRate.toLong() * frameBytes)
                            encoder.queueInputBuffer(inputIndex, 0, alignedRead, pts, 0)
                            bytesSubmitted += alignedRead
                        } else {
                            val pts = bytesSubmitted * 1_000_000L / (wav.sampleRate.toLong() * frameBytes)
                            encoder.queueInputBuffer(inputIndex, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputEnded = true
                        }
                    }
                }
                val outputIndex = encoder.dequeueOutputBuffer(info, 10000)
                when {
                    outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        if (muxerStarted) throw IllegalStateException("تغير تنسيق AAC بعد بدء الدمج.")
                        trackIndex = muxer.addTrack(encoder.outputFormat)
                        muxer.start()
                        muxerStarted = true
                    }
                    outputIndex >= 0 -> {
                        val outputBuffer = encoder.getOutputBuffer(outputIndex)
                        if (outputBuffer != null && info.size > 0 && muxerStarted &&
                            (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                            outputBuffer.position(info.offset)
                            outputBuffer.limit(info.offset + info.size)
                            muxer.writeSampleData(trackIndex, outputBuffer, info)
                        }
                        if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outputEnded = true
                        encoder.releaseOutputBuffer(outputIndex, false)
                    }
                }
            }
        }
        if (!muxerStarted || trackIndex < 0) throw IllegalStateException("لم يبدأ ترميز AAC؛ راجع محرك الصوت في الهاتف.")
    } finally {
        if (encoderStarted) runCatching { encoder.stop() }
        runCatching { encoder.release() }
        if (muxerStarted) runCatching { muxer.stop() }
        runCatching { muxer.release() }
    }
}


fun createScriptVoiceoverVideo(
    context: Context, sourceUri: Uri, channelId: String, scriptId: String,
    deviceToken: String, outputFile: File
): String {
    if (channelId != "UCIael48cvwPG3gKj--c7HKw") throw IllegalArgumentException("قناة التعليق الصوتي الآلي غير مسموح بها.")
    if (!scriptId.matches(Regex("^[0-9a-fA-F-]{36}$"))) throw IllegalArgumentException("السكريبت المحفوظ غير مرتبط بمهمة الإنتاج.")
    if (deviceToken.length < 40) throw IllegalStateException("رمز جهاز الوكيل غير صالح.")
    val retriever = android.media.MediaMetadataRetriever()
    val targetSeconds = try {
        retriever.setDataSource(context, sourceUri)
        val ms = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        (ms / 1000L).toInt().coerceIn(8, 180)
    } finally { runCatching { retriever.release() } }
    if (targetSeconds < 8) throw IllegalStateException("مدة الفيديو الأصلي غير صالحة للتعليق الصوتي.")
    val request = JSONObject().put("action", "generate_from_script").put("channel_id", channelId)
        .put("script_id", scriptId).put("target_duration_seconds", targetSeconds)
    val conn = java.net.URL(VOICEOVER_API).openConnection() as java.net.HttpURLConnection
    conn.requestMethod = "POST"; conn.connectTimeout = 15000; conn.readTimeout = 65000; conn.doOutput = true
    conn.setRequestProperty("apikey", PUBLIC_KEY)
    conn.setRequestProperty("content-type", "application/json")
    conn.setRequestProperty("x-zoz-device-token", deviceToken)
    val code: Int
    val response: JSONObject
    try {
        conn.outputStream.use { it.write(request.toString().toByteArray(Charsets.UTF_8)) }
        code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        response = JSONObject(stream?.bufferedReader()?.use { it.readText() } ?: "{}")
    } finally { conn.disconnect() }
    if (code !in 200..299 || !response.optBoolean("ok", false))
        throw IllegalStateException("تعذر على وكيل الإنتاج توليد التعليق: " + response.optString("error", "HTTP $code"))
    val audioUrl = response.optString("audio_url")
    if (!audioUrl.startsWith("https://oxyzxbkwhafzaztraowc.supabase.co/storage/"))
        throw IllegalStateException("رابط ملف التعليق الصوتي غير موثوق.")
    val wav = File(context.cacheDir, "zoz-agent-voice-\${UUID.randomUUID()}.wav")
    val aac = File(context.cacheDir, "zoz-agent-voice-\${UUID.randomUUID()}.m4a")
    try {
        val download = java.net.URL(audioUrl).openConnection() as java.net.HttpURLConnection
        download.connectTimeout = 15000; download.readTimeout = 60000
        try {
            if (download.responseCode !in 200..299) throw IllegalStateException("تعذر تنزيل ملف التعليق الصوتي.")
            if (download.contentLengthLong > 24L * 1024L * 1024L) throw IllegalStateException("ملف التعليق الصوتي أكبر من الحد الآمن.")
            download.inputStream.use { input ->
                FileOutputStream(wav).use { output ->
                    val buffer = ByteArray(64 * 1024); var total = 0L
                    while (true) {
                        val read = input.read(buffer); if (read < 0) break
                        total += read
                        if (total > 24L * 1024L * 1024L) throw IllegalStateException("ملف التعليق الصوتي تجاوز الحد الآمن.")
                        output.write(buffer, 0, read)
                    }
                }
            }
        } finally { download.disconnect() }
        val info = readPcmWavInfo(wav)
        val duration = info.dataSize.toDouble() / (info.sampleRate.toDouble() * info.channels * 2.0)
        if (duration > targetSeconds + 0.4) throw IllegalStateException("مدة التعليق أطول من الفيديو؛ لم نقص الكلام أو نرفع نسخة صامتة.")
        encodePcmWavToAac(wav, aac)
        outputFile.parentFile?.mkdirs()
        muxVideoWithVoiceover(context, sourceUri, aac, outputFile)
        if (!outputFile.exists() || outputFile.length() < 1024L) throw IllegalStateException("لم ينتج ملف فيديو نهائي صالح.")
        return response.optString("speech_provider", "Gemini Egyptian Arabic TTS") +
            " | " + response.optString("narration_provider", "Gemini script writer")
    } catch (e: Exception) {
        outputFile.delete(); throw e
    } finally { wav.delete(); aac.delete() }
}

private fun muxVideoWithVoiceover(context: Context, sourceUri: Uri, aacFile: File, outputFile: File) {
    val videoExtractor = MediaExtractor()
    val audioExtractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    var muxerStarted = false
    try {
        videoExtractor.setDataSource(context, sourceUri, null)
        audioExtractor.setDataSource(aacFile.absolutePath)
        var videoTrack = -1
        var videoFormat: MediaFormat? = null
        for (i in 0 until videoExtractor.trackCount) {
            val candidate = videoExtractor.getTrackFormat(i)
            val mime = candidate.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("video/")) {
                if (videoTrack >= 0) throw IllegalStateException("الفيديو يحتوي أكثر من مسار صورة؛ أوقفنا الدمج لتفادي فقد مسار.")
                videoTrack = i
                videoFormat = candidate
            }
        }
        if (videoTrack < 0 || videoFormat == null) throw IllegalStateException("الملف المختار لا يحتوي فيديو.")
        var audioTrack = -1
        var audioFormat: MediaFormat? = null
        for (i in 0 until audioExtractor.trackCount) {
            val candidate = audioExtractor.getTrackFormat(i)
            if (candidate.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
                audioTrack = i
                audioFormat = candidate
                break
            }
        }
        if (audioTrack < 0 || audioFormat == null) throw IllegalStateException("ملف التعليق لم ينتج مسار AAC.")
        val videoDuration = if (videoFormat.containsKey(MediaFormat.KEY_DURATION)) videoFormat.getLong(MediaFormat.KEY_DURATION) else 0L
        val audioDuration = if (audioFormat.containsKey(MediaFormat.KEY_DURATION)) audioFormat.getLong(MediaFormat.KEY_DURATION) else 0L
        if (videoDuration > 0L && audioDuration > videoDuration + 250_000L) {
            throw IllegalStateException("مدة التعليق الصوتي أطول من الفيديو. اختصر النص أو اختر فيديو أطول؛ لم نقص أي كلمة.")
        }
        outputFile.parentFile?.mkdirs()
        outputFile.delete()
        val outputMuxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        muxer = outputMuxer
        val outVideoTrack = outputMuxer.addTrack(videoFormat)
        val outAudioTrack = outputMuxer.addTrack(audioFormat)
        val rotation = runCatching {
            val retriever = android.media.MediaMetadataRetriever()
            retriever.setDataSource(context, sourceUri)
            val value = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            retriever.release()
            value
        }.getOrDefault(0)
        if (rotation in listOf(0, 90, 180, 270)) outputMuxer.setOrientationHint(rotation)
        outputMuxer.start()
        muxerStarted = true
        videoExtractor.selectTrack(videoTrack)
        audioExtractor.selectTrack(audioTrack)
        val maxBuffer = maxOf(16 * 1024 * 1024, runCatching { videoFormat.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE) }.getOrDefault(0)).coerceAtMost(64 * 1024 * 1024)
        val buffer = java.nio.ByteBuffer.allocate(maxBuffer)
        val info = MediaCodec.BufferInfo()
        var videoDone = false
        var audioDone = false
        while (!videoDone || !audioDone) {
            val videoTime = if (videoDone) -1L else videoExtractor.sampleTime
            val audioTime = if (audioDone) -1L else audioExtractor.sampleTime
            if (videoTime < 0L && audioTime < 0L) break
            val takeVideo = audioTime < 0L || (videoTime >= 0L && videoTime <= audioTime)
            val extractor = if (takeVideo) videoExtractor else audioExtractor
            val outputTrack = if (takeVideo) outVideoTrack else outAudioTrack
            buffer.clear()
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
                if (takeVideo) videoDone = true else audioDone = true
                continue
            }
            val sampleFlags = extractor.sampleFlags
            if ((sampleFlags and MediaExtractor.SAMPLE_FLAG_ENCRYPTED) != 0) {
                throw IllegalStateException("الفيديو الأصلي يحتوي عينات مشفرة؛ لم نغيّر الملف.")
            }
            var flags = 0
            if ((sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC) != 0) flags = flags or MediaCodec.BUFFER_FLAG_KEY_FRAME
            if ((sampleFlags and MediaExtractor.SAMPLE_FLAG_PARTIAL_FRAME) != 0) flags = flags or MediaCodec.BUFFER_FLAG_PARTIAL_FRAME
            info.set(0, size, extractor.sampleTime, flags)
            outputMuxer.writeSampleData(outputTrack, buffer, info)
            if (!extractor.advance()) {
                if (takeVideo) videoDone = true else audioDone = true
            }
        }
        outputMuxer.stop()
        muxerStarted = false
        outputMuxer.release()
        muxer = null
    } finally {
        if (muxerStarted) runCatching { muxer?.stop() }
        runCatching { muxer?.release() }
        videoExtractor.release()
        audioExtractor.release()
    }
}

private fun documentMimeType(context: Context, uri: Uri, filename: String): String {
    val ext = filename.substringAfterLast('.', "").lowercase(Locale.ROOT)
    val byExtension = when (ext) {
        "csv" -> "text/csv"
        "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        "xls" -> "application/vnd.ms-excel"
        "pdf" -> "application/pdf"
        "txt" -> "text/plain"
        "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        else -> ""
    }
    val detected = runCatching { context.contentResolver.getType(uri) }.getOrNull()?.lowercase(Locale.ROOT).orEmpty()
    return if (byExtension.isNotBlank()) byExtension else detected
}


fun isDownloadsAutoAccessGranted(): Boolean =
    Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()

/**
 * Searches only the public Downloads directory. It never walks outside that
 * directory and ignores in-progress browser/download-manager temporary files.
 */
fun findLocalDownloadForAgent(payload: JSONObject): File {
    if (!isDownloadsAutoAccessGranted()) {
        throw IllegalStateException("يجب تفعيل صلاحية الوصول إلى الملفات من إعدادات Android أولًا.")
    }
    val kind = payload.optString("file_kind", "").lowercase(Locale.ROOT)
    val allowed = if (kind == "video") {
        setOf("mp4", "mov", "webm", "mkv")
    } else if (kind == "document") {
        setOf("csv", "xlsx", "xls", "pdf", "txt", "docx", "png", "jpg", "jpeg", "webp")
    } else {
        throw IllegalArgumentException("نوع الملف المطلوب غير مدعوم.")
    }
    val requested = payload.optJSONArray("extensions")
    val extensions = if (requested == null || requested.length() == 0) allowed else {
        buildSet {
            for (i in 0 until minOf(requested.length(), 10)) {
                val ext = requested.optString(i).trim().lowercase(Locale.ROOT).removePrefix(".")
                if (ext in allowed) add(ext)
            }
        }.ifEmpty { throw IllegalArgumentException("قائمة امتدادات الملفات لا تتطابق مع نوع المهمة.") }
    }
    val root = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    if (!root.exists() || !root.isDirectory) throw IllegalStateException("مجلد Downloads غير متاح على الهاتف.")
    val rootPath = runCatching { root.canonicalPath }.getOrElse { throw IllegalStateException("تعذر الوصول إلى مجلد Downloads.") }
    val exactName = payload.optString("exact_filename", "").trim()
    val contains = payload.optString("filename_contains", "").trim().lowercase(Locale.ROOT)
    val after = payload.optLong("after_timestamp_ms", 0L)
    val minSize = payload.optLong("min_size_bytes", 1L).coerceAtLeast(1L)
    val maxSize = payload.optLong("max_size_bytes", if (kind == "video") 850L * 1024L * 1024L else 25L * 1024L * 1024L)
        .coerceAtMost(if (kind == "video") 850L * 1024L * 1024L else 25L * 1024L * 1024L)
    val now = System.currentTimeMillis()
    val incomplete = listOf(".crdownload", ".part", ".download", ".tmp", ".temp")
    val candidates = root.walkTopDown().maxDepth(3).filter { file ->
        if (!file.isFile || file.name.startsWith(".")) return@filter false
        val name = file.name
        if (incomplete.any { name.lowercase(Locale.ROOT).endsWith(it) }) return@filter false
        val ext = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
        if (ext !in extensions) return@filter false
        if (exactName.isNotBlank() && !name.equals(exactName, ignoreCase = true)) return@filter false
        if (contains.isNotBlank() && !name.lowercase(Locale.ROOT).contains(contains)) return@filter false
        if (file.lastModified() <= after || file.lastModified() > now) return@filter false
        if (file.length() < minSize || file.length() > maxSize) return@filter false
        val canonical = runCatching { file.canonicalPath }.getOrNull() ?: return@filter false
        canonical.startsWith(rootPath + File.separator)
    }.take(2500).toList()
    return candidates.maxByOrNull { it.lastModified() }
        ?: throw IllegalStateException("لم يُعثر على ملف مكتمل ومطابق داخل Downloads. لم يتم رفع أي ملف.")
}

fun sha256LocalFile(file: File): String {
    val digest = java.security.MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
        val buffer = ByteArray(128 * 1024)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            digest.update(buffer, 0, count)
        }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
}

fun uploadDocumentToIntake(context: Context, uri: Uri, appVersion: String): String {
    val deviceToken = DeviceTokenVault.read(context)?.takeIf { it.length >= 40 }
        ?: throw IllegalStateException("الجهاز غير مرتبط بالوكيل.")
    val filename = queryName(context, uri)?.take(180)?.takeIf { it.isNotBlank() }
        ?: throw IllegalStateException("تعذر قراءة اسم الملف.")
    val size = querySize(context, uri)
    if (size <= 0L || size > 25L * 1024L * 1024L) throw IllegalStateException("حجم الملف غير صالح أو يتجاوز 25 ميجابايت.")
    val mime = documentMimeType(context, uri, filename)
    val allowed = setOf("text/csv", "application/csv", "text/plain", "application/pdf",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png", "image/jpeg", "image/webp")
    if (mime !in allowed) throw IllegalStateException("صيغة الملف غير مدعومة. استخدم CSV أو Excel أو PDF أو TXT أو DOCX أو PNG/JPG/WebP.")
    val prepared = apiPostWithToken("document_intake_create", JSONObject()
        .put("filename", filename)
        .put("mime_type", mime)
        .put("file_size", size)
        .put("app_version", appVersion), deviceToken)
    val assetId = prepared.optString("asset_id")
    val uploadUrl = prepared.optString("upload_url")
    if (assetId.length < 30 || !uploadUrl.startsWith("https://oxyzxbkwhafzaztraowc.supabase.co/storage/v1/object/upload/sign/"))
        throw IllegalStateException("لم يصدر الخادم رابط رفع خاصًا صالحًا؛ لم يبدأ النقل.")
    val digest = java.security.MessageDigest.getInstance("SHA-256")
    val connection = java.net.URL(uploadUrl).openConnection() as java.net.HttpURLConnection
    connection.requestMethod = "PUT"
    connection.connectTimeout = 30000
    connection.readTimeout = 120000
    connection.doOutput = true
    connection.setRequestProperty("content-type", mime)
    connection.setRequestProperty("cache-control", "3600")
    connection.setFixedLengthStreamingMode(size)
    var sent = 0L
    try {
        context.contentResolver.openInputStream(uri).use { input ->
            if (input == null) throw IllegalStateException("تعذر فتح الملف الذي اخترته.")
            val digestInput = java.security.DigestInputStream(input, digest)
            connection.outputStream.use { output -> sent = digestInput.copyTo(output, 64 * 1024) }
        }
        if (sent != size) throw IllegalStateException("عدد البايتات المرسلة لا يطابق حجم الملف الأصلي.")
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val responseText = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (code !in 200..299) throw IllegalStateException("فشل رفع الملف إلى التخزين الخاص (HTTP $code): " + responseText.take(220))
    } finally {
        connection.disconnect()
    }
    val checksum = digest.digest().joinToString("") { "%02x".format(it) }
    val finalized = apiPostWithToken("document_intake_finalize",
        JSONObject().put("asset_id", assetId).put("checksum_sha256", checksum), deviceToken)
    if (finalized.optString("status") != "ready") throw IllegalStateException("تم نقل الملف لكن الخادم لم يؤكد اكتمال الاستقبال.")
    return "تم استيراد الملف بنجاح إلى ذاكرة ZOZ Pro.\nالملف: $filename\nالحجم: $sent بايت\nبصمة SHA-256: $checksum\nالحالة: محفوظ بأمان وينتظر تحليل الوكيل."
}

private fun apiPost(context: Context, action: String, body: JSONObject): JSONObject {
    val token = DeviceTokenVault.read(context) ?: ""
    return apiPostWithToken(action, body, token)
}

fun apiPostWithToken(action: String, body: JSONObject, token: String): JSONObject {
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
            "flow.generate_scene" -> {
                FlowAutomationService.startScene(context, id, payload)
                return "بدأ الهاتف تنفيذ مشهد Flow المرئي."
            }
            "device.ui_control" -> {
                FlowAutomationService.startUiControl(context, id, payload)
                return "بدأ وسيط ZOZ التحكم المرئي في التطبيق المطلوب."
            }
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

        fun writeIntake(context: Context, intakeToken: String) {
            val ks = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val key = (ks.getEntry(KEY_ALIAS, null) as java.security.KeyStore.SecretKeyEntry).secretKey
            val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, key)
            val encrypted = cipher.doFinal(intakeToken.toByteArray(Charsets.UTF_8))
            context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
                .putString(INTAKE_TOKEN, android.util.Base64.encodeToString(encrypted, android.util.Base64.NO_WRAP))
                .putString(INTAKE_IV, android.util.Base64.encodeToString(cipher.iv, android.util.Base64.NO_WRAP)).apply()
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

private fun ensureIntakeToken(
    context: Context,
    deviceToken: String,
    channelId: String,
    forceRefresh: Boolean = false
) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val existing = DeviceTokenVault.readIntake(context)
    val existingChannel = prefs.getString("zoz_intake_channel_id", "") ?: ""
    if (!forceRefresh && existingChannel == channelId && !existing.isNullOrBlank() && existing.length >= 32) return
    val response = apiPostWithToken(
        "device_intake_token",
        JSONObject().put("channel_id", channelId),
        deviceToken
    )
    val issued = response.optString("intake_token")
    if (issued.length < 32) throw IllegalStateException("الخادم لم يصدر رمز استقبال صالحًا.")
    DeviceTokenVault.writeIntake(context, issued)
    prefs.edit().putString("zoz_intake_channel_id", channelId).apply()
}

class DevicePollWorker(context: Context, params: androidx.work.WorkerParameters) : androidx.work.Worker(context, params) {
    override fun doWork(): Result {
        val token = DeviceTokenVault.read(applicationContext) ?: return Result.success()
        return try {
            apiPostWithToken("heartbeat", JSONObject().put("app_version", BuildConfig.VERSION_NAME), token)
            // Queue consumption is owned by FlowAutomationService to avoid two pollers
            // racing for the same device job. This worker only refreshes device presence.
            Result.success()
        } catch (_: Exception) { Result.retry() }
    }
}

private fun scheduleDeviceWorker(context: Context) {
    val workManager = WorkManager.getInstance(context)
    val request = PeriodicWorkRequestBuilder<DevicePollWorker>(15, TimeUnit.MINUTES).build()
    workManager.enqueueUniquePeriodicWork("zoz-device-agent-poll", ExistingPeriodicWorkPolicy.UPDATE, request)
    val immediate = OneTimeWorkRequestBuilder<DevicePollWorker>().build()
    workManager.enqueueUniqueWork("zoz-device-agent-initial-sync", ExistingWorkPolicy.REPLACE, immediate)
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
