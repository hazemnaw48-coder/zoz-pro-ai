package com.zozpro.flowbridge

import android.accessibilityservice.AccessibilityService
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.core.content.ContextCompat
import androidx.work.WorkManager
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import org.json.JSONArray
import org.json.JSONObject
import kotlinx.coroutines.runBlocking
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.Executors

private const val TIKTOK_STUDIO_PACKAGE = "com.ss.android.tt.creator"
private const val YOUTUBE_STUDIO_PACKAGE = "com.google.android.apps.youtube.creator"
private const val TIKTOK_PACKAGE = "com.zhiliaoapp.musically"
private const val YOUTUBE_PACKAGE = "com.google.android.youtube"
private const val FLOW_APP_PACKAGE = "com.google.android.apps.labs.whisk"
private const val VOICEOVER_CHANNEL_ID = "UCIael48cvwPG3gKj--c7HKw"
private const val VOICEOVER_SOURCE_PREFIX = "/storage/v1/object/sign/zoz-pro-intake/voiceover-source/"
private const val VOICEOVER_MAX_SOURCE_BYTES = 100L * 1024L * 1024L

private val ZOZ_CONTROL_PACKAGES = setOf(TIKTOK_STUDIO_PACKAGE, YOUTUBE_STUDIO_PACKAGE, TIKTOK_PACKAGE, YOUTUBE_PACKAGE)
private val ZOZ_STUDIO_PACKAGES = setOf(TIKTOK_STUDIO_PACKAGE, YOUTUBE_STUDIO_PACKAGE)
private val ZOZ_REGULAR_SOCIAL_PACKAGES = setOf(TIKTOK_PACKAGE, YOUTUBE_PACKAGE)

private val STUDIO_NAV_LABELS = listOf(
    "analytics", "overview", "insights", "dashboard", "content", "posts", "videos", "audience", "engagement",
    "comments", "subscribers", "earn", "monetization", "community", "revenue",
    "الإحصاءات", "احصاءات", "إحصاءات", "التحليلات", "تحليلات", "نظرة عامة", "الرؤى", "لوحة البيانات",
    "المحتوى", "المنشورات", "الفيديوهات", "المنتدى", "تحقيق الربح", "الربح", "الجمهور",
    "التفاعل", "التعليقات", "المشتركون", "الأرباح", "إيرادات", "المشاهدات"
)
private fun isStudioNavigationLabel(value: String): Boolean {
    val label = value.lowercase().trim()
    return label.isNotBlank() && STUDIO_NAV_LABELS.any(label::contains)
}
private fun isSensitiveAppText(value: String): Boolean {
    val lower = value.lowercase()
    return Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}").containsMatchIn(value) ||
        Regex("\\b\\+?\\d[\\d ()-]{7,}\\d\\b").containsMatchIn(value) ||
        listOf("password", "passcode", "verification code", "security code", "one-time", "otp", "pin code",
            "كلمة المرور", "كلمة السر", "رمز التحقق", "كود التحقق", "رقم الهاتف", "رقم الموبايل").any(lower::contains)
}

private val ZOZ_CONTROL_WEB_HOSTS = setOf(
    "labs.google", "hazemnaw48-coder.github.io", "github.com", "supabase.com",
    "oxyzxbkwhafzaztraowc.supabase.co", "youtube.com", "studio.youtube.com",
    "kdp.amazon.com", "amazon.com", "draft2digital.com", "notion.so", "canva.com", "tiktok.com"
)

private val ZOZ_TEXT_PURPOSES = setOf("title", "description", "prompt", "tags", "comment", "business_copy", "search_query")

private fun isAllowedZozWebUrl(raw: String): Boolean {
    val uri = runCatching { Uri.parse(raw) }.getOrNull() ?: return false
    if (uri.scheme != "https" || uri.userInfo != null || uri.port !in setOf(-1, 443)) return false
    val host = uri.host?.lowercase()?.trimEnd('.') ?: return false
    return ZOZ_CONTROL_WEB_HOSTS.any { host == it || host.endsWith(".$it") }
}

private fun containsSensitiveWorkValue(raw: String): Boolean {
    val lower = raw.lowercase()
    val patterns = listOf(
        Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"),
        Regex("\\b(?:\\+?\\d[\\d ()-]{7,}\\d)\\b"),
        Regex("\\b(?:AIza[0-9A-Za-z_-]{20,}|sb_secret_[0-9A-Za-z_-]+|gh[pousr]_[0-9A-Za-z_]{20,}|github_pat_[0-9A-Za-z_]{20,})\\b"),
        Regex("\\b(?:Bearer\\s+|service[_ -]?role|api[_ -]?key|access[_ -]?token|password|secret)\\b", RegexOption.IGNORE_CASE),
        Regex("\\b\\d{13,19}\\b")
    )
    return patterns.any { it.containsMatchIn(raw) } ||
        listOf("مفتاح سري", "كلمة المرور", "رمز التحقق", "الرقم القومي", "رقم البطاقة").any(lower::contains)
}

/**
 * User-enabled, visible UI automation for Google Flow.
 * It never handles passwords, CAPTCHA, MFA, or account selection.
 * Unknown layouts stop safely and report the task for owner intervention.
 */
class FlowAutomationService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private var lastActionAt = 0L
    private var receiverRegistered = false
    private var controlInspectionScheduled = false
    private var agentPollScheduled = false
    private var lastAccessibilityEventPackage = ""
    private var lastAccessibilityEventType = -1
    private var lastAccessibilityEventAtMs = 0L
    // Some WebView-backed Flow surfaces emit useful accessibility events even when
    // Android does not expose the app window through getWindows()/rootInActiveWindow.
    private var lastFlowEventSource: AccessibilityNodeInfo? = null
    private var lastFlowEventSourceAtMs = 0L
    private var lastFlowEventSourceClass = ""
    private var lastFlowEventSourceViewId = ""
    @Volatile private var activeLocalUploadJobId: String? = null
    @Volatile private var sceneReconciliationRunning = false
    private val networkExecutor = Executors.newSingleThreadExecutor()

    /**
     * Accept only the official native Google Flow Android package.
     * Browser/Chrome pages are deliberately excluded from this control path.
     */
    private fun isVerifiedFlowPage(root: AccessibilityNodeInfo): Boolean =
        root.packageName?.toString() == FLOW_APP_PACKAGE

    private fun flowEventRootFallback(): AccessibilityNodeInfo? {
        val source = lastFlowEventSource ?: return null
        if (System.currentTimeMillis() - lastFlowEventSourceAtMs > 6000L) return null
        if (!isVerifiedFlowPage(source)) return null

        // Walk only through parents that still belong to the official Flow package.
        // This never crosses into Chrome, System UI, or another app.
        var current: AccessibilityNodeInfo = source
        var depth = 0
        while (depth < 24) {
            val parent = runCatching { current.parent }.getOrNull() ?: break
            if (!isVerifiedFlowPage(parent)) break
            current = parent
            depth++
        }
        return current
    }

    private fun flowWindowRoot(): AccessibilityNodeInfo? {
        val appWindowRoot = runCatching {
            windows.firstNotNullOfOrNull { window ->
                val candidate = window.root
                if (candidate != null && isVerifiedFlowPage(candidate)) candidate else null
            }
        }.getOrNull()
        return appWindowRoot
            ?: rootInActiveWindow?.takeIf(::isVerifiedFlowPage)
            ?: flowEventRootFallback()
    }

    private fun isFlowInForeground(): Boolean = flowWindowRoot() != null

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (id <= 0L) return
            handleDownload(id)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        activeService = this
        if (!receiverRegistered) {
            val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            ContextCompat.registerReceiver(this, downloadReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
            receiverRegistered = true
        }
        // Reconcile persisted Flow work against the server before resuming it.
        // Server-cancelled jobs must never leave a stale local lock blocking the next scene.
        if (activeTask() != null) reconcileActiveSceneWithServer()
        if (activeControlTask() != null) scheduleControlInspection(900)
        scheduleAgentPoll(1800)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString().orEmpty()
        if (pkg.isNotBlank()) {
            lastAccessibilityEventPackage = pkg
            lastAccessibilityEventType = event?.eventType ?: -1
            lastAccessibilityEventAtMs = System.currentTimeMillis()
        }
        if (pkg == FLOW_APP_PACKAGE) {
            val source = runCatching { event?.source }.getOrNull()
            lastFlowEventSource = source?.let {
                runCatching { AccessibilityNodeInfo.obtain(it) }.getOrNull()
            }
            lastFlowEventSourceAtMs = if (source != null) System.currentTimeMillis() else 0L
            lastFlowEventSourceClass = source?.className?.toString().orEmpty()
            lastFlowEventSourceViewId = runCatching { source?.viewIdResourceName.orEmpty() }.getOrDefault("")
        }
        if (event?.eventType !in listOf(
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
                AccessibilityEvent.TYPE_VIEW_SCROLLED,
                AccessibilityEvent.TYPE_VIEW_FOCUSED
            )) return
        if (activeTask() != null) {
            // Only the official native Google Flow app may advance a Flow generation task.
            // Browser and unrelated app events are ignored.
            if (pkg != FLOW_APP_PACKAGE) return
            handler.postDelayed({ inspectCurrentPage() }, 300)
            return
        }
        val control = activeControlTask()
        if (control != null) {
            if (pkg.isNotBlank() && pkg != control.optString("target_package")) return
            scheduleControlInspection(350)
            return
        }
        scheduleAgentPoll(1200L)
    }

    override fun onInterrupt() {
        // Keep the task lease; the next service connection may resume safely.
    }

    override fun onDestroy() {
        agentPollScheduled = false
        handler.removeCallbacksAndMessages(null)
        networkExecutor.shutdownNow()
        if (receiverRegistered) runCatching { unregisterReceiver(downloadReceiver) }
        if (activeService === this) activeService = null
        super.onDestroy()
    }

    private fun prefs() = getSharedPreferences(FlowAutomationService.PREFS, Context.MODE_PRIVATE)
    private fun activeTask(): JSONObject? = runCatching {
        prefs().getString(KEY_ACTIVE_TASK, null)?.let(::JSONObject)
    }.getOrNull()

    private fun activeControlTask(): JSONObject? = runCatching {
        prefs().getString(KEY_ACTIVE_CONTROL_TASK, null)?.let(::JSONObject)
    }.getOrNull()

    /**
     * Ask production whether the locally persisted scene is still running.
     * This clears only terminal/missing server jobs; a live generation is resumed.
     */
    private fun reconcileActiveSceneWithServer() {
        val task = activeTask() ?: return
        val jobId = task.optString("job_id", "")
        if (jobId.isBlank() || sceneReconciliationRunning) return
        val deviceToken = DeviceTokenVault.read(this) ?: return
        sceneReconciliationRunning = true
        networkExecutor.execute {
            val response = runCatching {
                apiPostWithToken("job_status", JSONObject().put("job_id", jobId), deviceToken)
            }.getOrNull()
            sceneReconciliationRunning = false
            handler.post {
                val current = activeTask()
                if (current?.optString("job_id") != jobId) return@post
                val found = response?.optBoolean("found", false) == true
                val status = response?.optString("status", "").orEmpty()
                if (found && status == "running") {
                    handler.postDelayed({ inspectCurrentPage() }, 700)
                } else if (response != null && (!found || status in setOf(
                        "queued", "cancelled", "failed", "succeeded", "awaiting_owner_approval"
                    ))) {
                    prefs().edit().remove(KEY_ACTIVE_TASK).apply()
                    DeviceNotifications.show(
                        this,
                        "تم تحرير قفل مشهد قديم",
                        "أكد خادم ZOZ أن المهمة السابقة لم تعد قيد التنفيذ؛ أصبح الهاتف جاهزًا للمشهد التالي."
                    )
                    scheduleAgentPoll(1200)
                } else {
                    scheduleAgentPoll(10000)
                }
            }
        }
    }

    private fun scheduleControlInspection(delayMs: Long = 350L) {
        if (controlInspectionScheduled) return
        controlInspectionScheduled = true
        handler.postDelayed({
            controlInspectionScheduled = false
            inspectControlTask()
        }, delayMs)
    }

    /**
     * The Accessibility service is the phone-side executor for queued Studio jobs.
     * It only asks for the device.ui_control capability and the server still checks
     * device ownership, allow-listed packages, per-step limits and approval state.
     */
    private fun scheduleAgentPoll(delayMs: Long = 15000L) {
        if (agentPollScheduled || !isEnabled(this)) return
        agentPollScheduled = true
        handler.postDelayed({
            agentPollScheduled = false
            pollAgentQueue()
        }, delayMs.coerceAtLeast(1000L))
    }

    /**
     * Flow retry paths must not silently disable the device queue.
     * The old broad Handler clear also removed the scheduled queue-poll callback
     * but left agentPollScheduled=true, permanently suppressing future polls.
     */
    private fun clearScheduledAutomationCallbacks() {
        handler.removeCallbacksAndMessages(null)
        agentPollScheduled = false
        controlInspectionScheduled = false
    }


    private fun startVoiceoverMerge(jobId: String, payload: JSONObject) {
        val current = prefs().getString(KEY_ACTIVE_VOICEOVER_JOB, null)
        if (!current.isNullOrBlank()) return
        val startedAt = System.currentTimeMillis()
        prefs().edit().putString(
            KEY_ACTIVE_VOICEOVER_JOB,
            JSONObject().put("job_id", jobId).put("started_at_ms", startedAt).toString()
        ).apply()
        DeviceNotifications.show(this, "بدأ دمج التعليق الصوتي", "الهاتف يستخدم محرك النطق العربي المحلي ثم يرسل النسخة للمراجعة في ZOZ.")

        networkExecutor.execute {
            var sourceFile: File? = null
            var outputFile: File? = null
            try {
                val channelId = payload.optString("channel_id", "")
                if (channelId != VOICEOVER_CHANNEL_ID) {
                    throw IllegalArgumentException("voiceover_channel_not_allowed")
                }
                val narration = payload.optString("narration", "").trim()
                if (narration.isBlank() || narration.length > 3000) {
                    throw IllegalArgumentException("voiceover_narration_invalid")
                }
                val sourceUrl = payload.optString("video_url", "")
                sourceFile = downloadVoiceoverSource(sourceUrl)
                val rendered = runBlocking {
                    createArabicVoiceoverVideo(
                        applicationContext,
                        Uri.fromFile(sourceFile),
                        narration
                    )
                }
                outputFile = rendered.file

                val deviceToken = DeviceTokenVault.read(this)
                    ?: throw IllegalStateException("device_token_missing")
                val intakePrefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val savedChannel = intakePrefs.getString("zoz_intake_channel_id", "") ?: ""
                val savedIntakeToken = DeviceTokenVault.readIntake(this)
                if (savedChannel != channelId || savedIntakeToken.isNullOrBlank() || savedIntakeToken.length < 32) {
                    val issued = apiPostWithToken(
                        "device_intake_token",
                        JSONObject().put("channel_id", channelId),
                        deviceToken
                    ).optString("intake_token")
                    if (issued.length < 32) throw IllegalStateException("intake_token_invalid")
                    DeviceTokenVault.writeIntake(this, issued)
                    intakePrefs.edit().putString("zoz_intake_channel_id", channelId).apply()
                }

                val uploadMessage = uploadFinalVideoToIntake(
                    this,
                    Uri.fromFile(rendered.file),
                    true,
                    false,
                    channelId
                )
                val assetId = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString("zoz_last_uploaded_asset_id", "") ?: ""
                if (assetId.isBlank()) throw IllegalStateException("voiceover_intake_asset_missing")

                val result = JSONObject()
                    .put("channel_id", channelId)
                    .put("asset_id", assetId)
                    .put("intake_status", "ready_for_review")
                    .put("voice_engine", "Android TextToSpeech")
                    .put("voice_label", rendered.voiceLabel)
                    .put("output_filename", rendered.file.name)
                    .put("output_bytes", rendered.file.length())
                    .put("upload_message", uploadMessage)
                    .put("publication_performed", false)

                apiPostWithToken(
                    "complete_job",
                    JSONObject().put("job_id", jobId)
                        .put("outcome", "succeeded")
                        .put("result", result),
                    DeviceTokenVault.read(this) ?: deviceToken
                )
                handler.post {
                    DeviceNotifications.show(
                        this,
                        "اكتمل التعليق والدمج",
                        "تم رفع نسخة «سر اختراع الأزرق المصري» إلى استقبال Hazem Ahmed للمراجعة فقط."
                    )
                }
            } catch (error: Exception) {
                val message = error.message ?: "voiceover_merge_failed"
                runCatching {
                    apiPostWithToken(
                        "complete_job",
                        JSONObject().put("job_id", jobId)
                            .put("outcome", "failed")
                            .put("error_code", "voiceover_merge_failed")
                            .put("error_message", message),
                        DeviceTokenVault.read(this) ?: ""
                    )
                }
                handler.post {
                    DeviceNotifications.show(
                        this,
                        "تعذر إكمال التعليق والدمج",
                        message.take(180)
                    )
                }
            } finally {
                sourceFile?.delete()
                prefs().edit().remove(KEY_ACTIVE_VOICEOVER_JOB).apply()
                handler.post { scheduleAgentPoll(5000L) }
            }
        }
    }

    private fun downloadVoiceoverSource(rawUrl: String): File {
        val uri = runCatching { Uri.parse(rawUrl) }.getOrNull()
            ?: throw IllegalArgumentException("voiceover_source_url_invalid")
        if (uri.scheme != "https" ||
            uri.host != "oxyzxbkwhafzaztraowc.supabase.co" ||
            uri.userInfo != null ||
            uri.port !in setOf(-1, 443) ||
            !uri.path.orEmpty().startsWith(VOICEOVER_SOURCE_PREFIX) ||
            uri.fragment != null
        ) {
            throw IllegalArgumentException("voiceover_source_url_not_allowlisted")
        }

        val connection = (java.net.URL(rawUrl).openConnection() as java.net.HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 30000
            readTimeout = 60000
            instanceFollowRedirects = false
            setRequestProperty("Accept", "video/mp4")
        }
        val file = File(cacheDir, "zoz-voiceover-source-${System.currentTimeMillis()}.mp4")
        try {
            val code = connection.responseCode
            if (code != 200) throw IllegalStateException("voiceover_source_download_http_$code")
            val declaredSize = connection.getHeaderFieldLong("Content-Length", -1L)
            if (declaredSize > VOICEOVER_MAX_SOURCE_BYTES) throw IllegalStateException("voiceover_source_too_large")
            connection.inputStream.use { input ->
                FileOutputStream(file).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var total = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        if (total > VOICEOVER_MAX_SOURCE_BYTES) {
                            throw IllegalStateException("voiceover_source_too_large")
                        }
                        output.write(buffer, 0, count)
                    }
                }
            }
            if (!file.exists() || file.length() < 1024L) throw IllegalStateException("voiceover_source_empty")
            java.io.RandomAccessFile(file, "r").use { input ->
                input.seek(4L)
                val brand = ByteArray(4)
                input.readFully(brand)
                if (String(brand, Charsets.US_ASCII) != "ftyp") {
                    throw IllegalStateException("voiceover_source_not_mp4")
                }
            }
            return file
        } catch (error: Exception) {
            file.delete()
            throw error
        } finally {
            connection.disconnect()
        }
    }

    private fun hasActiveVoiceoverJob(): Boolean {
        val raw = prefs().getString(KEY_ACTIVE_VOICEOVER_JOB, null) ?: return false
        val startedAt = runCatching { JSONObject(raw).optLong("started_at_ms", 0L) }.getOrDefault(0L)
        if (startedAt > 0L && System.currentTimeMillis() - startedAt <= 35L * 60L * 1000L) return true
        prefs().edit().remove(KEY_ACTIVE_VOICEOVER_JOB).apply()
        return false
    }

    private fun pollAgentQueue() {
        if (!isEnabled(this) || activeControlTask() != null || hasActiveVoiceoverJob()) {
            scheduleAgentPoll(5000L)
            return
        }
        if (activeTask() != null) {
            reconcileActiveSceneWithServer()
            scheduleAgentPoll(12000L)
            return
        }
        val deviceToken = DeviceTokenVault.read(this)
        if (deviceToken.isNullOrBlank()) {
            scheduleAgentPoll(15000L)
            return
        }
        networkExecutor.execute {
            val job = runCatching {
                apiPostWithToken("poll_jobs", JSONObject(), deviceToken).optJSONObject("job")
            }.getOrNull()
            handler.post {
                if (job != null && activeControlTask() == null && activeTask() == null) {
                    val id = job.optString("id")
                    val payload = job.optJSONObject("payload") ?: JSONObject()
                    val capability = job.optString("capability_id")
                    runCatching {
                        when (capability) {
                            "flow.generate_scene" -> {
                                if (payload.optString("task_type") == "voiceover_merge") {
                                    startVoiceoverMerge(id, payload)
                                } else {
                                    startScene(this@FlowAutomationService, id, payload)
                                }
                            }                            "device.ui_control" -> startUiControl(this@FlowAutomationService, id, payload)
                            "device.voiceover_merge" -> startVoiceoverMerge(id, payload)
                            "media.downloads.upload" -> startLocalFileUpload(id, payload)
                            else -> throw IllegalArgumentException("capability_not_supported_by_flow_bridge")
                        }
                    }.onFailure { error ->
                        networkExecutor.execute {
                            runCatching {
                                apiPostWithToken("complete_job", JSONObject().put("job_id", id)
                                    .put("outcome", "failed").put("error_code", "device_executor_error")
                                    .put("error_message", error.message ?: "تعذر تشغيل مهمة الهاتف."),
                                    DeviceTokenVault.read(this@FlowAutomationService) ?: "")
                            }
                        }
                        DeviceNotifications.show(this@FlowAutomationService, "تعذر بدء أمر الوكيل",
                            error.message ?: "تعذر تشغيل المهمة على الهاتف.")
                    }
                    scheduleAgentPoll(3000L)
                } else {
                    scheduleAgentPoll(15000L)
                }
            }
        }
    }


    private fun startLocalFileUpload(jobId: String, payload: JSONObject) {
        if (activeLocalUploadJobId != null) return
        activeLocalUploadJobId = jobId
        DeviceNotifications.show(this, "بدأت مهمة ملفات ZOZ", "يفحص الهاتف مجلد Downloads بحثًا عن الملف المطابق للأمر.")
        networkExecutor.execute {
            var succeeded = false
            var errorCode = "downloads_upload_failed"
            var errorMessage = "تعذر رفع الملف."
            val result = JSONObject()
            try {
                if (!isDownloadsAutoAccessGranted()) throw IllegalStateException("downloads_permission_required")
                val file = findLocalDownloadForAgent(payload)
                val initialSize = file.length()
                val initialModified = file.lastModified()
                Thread.sleep(2500L)
                if (!file.exists() || file.length() != initialSize || file.lastModified() != initialModified) {
                    throw IllegalStateException("download_not_stable: الملف ما زال قيد التنزيل أو التعديل.")
                }
                val checksum = sha256LocalFile(file)
                val prefs = getSharedPreferences("zoz_auto_file_intake", Context.MODE_PRIVATE)
                val prior = prefs.getString("uploaded_$checksum", null)
                if (!prior.isNullOrBlank()) {
                    result.put("duplicate", true).put("asset_id", prior)
                        .put("filename", file.name).put("sha256", checksum)
                        .put("message", "تم رفع هذه النسخة سابقًا؛ لم يُنشأ رفع مكرر.")
                    succeeded = true
                } else {
                    val kind = payload.optString("file_kind").lowercase()
                    if (kind == "video") {
                        val channelId = payload.optString("channel_id")
                        val kids = payload.opt("made_for_kids")
                        val synthetic = payload.opt("contains_synthetic_media")
                        if (kids !is Boolean || synthetic !is Boolean) {
                            throw IllegalArgumentException("video_metadata_required: يجب تحديد made_for_kids و contains_synthetic_media في أمر الرفع.")
                        }
                        val deviceToken = DeviceTokenVault.read(this)
                            ?: throw IllegalStateException("device_token_missing")
                        val tokenResponse = apiPostWithToken(
                            "device_intake_token",
                            JSONObject().put("channel_id", channelId),
                            deviceToken
                        )
                        val intakeToken = tokenResponse.optString("intake_token")
                        if (intakeToken.length < 32) throw IllegalStateException("intake_token_invalid")
                        DeviceTokenVault.writeIntake(this, intakeToken)
                        prefs.edit().putString("zoz_intake_channel_id", channelId).apply()
                        val message = uploadFinalVideoToIntake(
                            this, Uri.fromFile(file), synthetic, kids, channelId, checksum
                        )
                        val assetId = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                            .getString("zoz_last_uploaded_asset_id", "") ?: ""
                        if (assetId.isBlank()) throw IllegalStateException("video_intake_asset_id_missing")
                        result.put("asset_id", assetId).put("channel_id", channelId)
                            .put("intake_status", "ready_for_review")
                            .put("filename", file.name).put("bytes", file.length())
                            .put("sha256", checksum).put("upload_message", message)
                            .put("publication_performed", false)
                        prefs.edit().putString("uploaded_$checksum", assetId).apply()
                    } else if (kind == "document") {
                        val message = uploadDocumentToIntake(this, Uri.fromFile(file), BuildConfig.VERSION_NAME)
                        result.put("filename", file.name).put("bytes", file.length())
                            .put("sha256", checksum).put("intake_status", "ready")
                            .put("upload_message", message)
                        prefs.edit().putString("uploaded_$checksum", "document:${file.name}").apply()
                    } else {
                        throw IllegalArgumentException("unsupported_file_kind")
                    }
                    succeeded = true
                }
            } catch (error: Exception) {
                errorCode = error.message?.substringBefore(':')?.take(80) ?: errorCode
                errorMessage = error.message ?: errorCode
            }
            val token = DeviceTokenVault.read(this) ?: ""
            runCatching {
                apiPostWithToken(
                    "complete_job",
                    JSONObject().put("job_id", jobId)
                        .put("outcome", if (succeeded) "succeeded" else "failed")
                        .put("result", result)
                        .put("error_code", if (succeeded) "" else errorCode)
                        .put("error_message", if (succeeded) "" else errorMessage.take(500)),
                    token
                )
            }
            handler.post {
                activeLocalUploadJobId = null
                if (succeeded) {
                    DeviceNotifications.show(this, "اكتمل رفع ملف ZOZ", result.optString("filename", "تمت معالجة الملف") +
                        if (result.optBoolean("duplicate")) " — لم يُكرر الرفع." else " — محفوظ في الاستقبال الخاص.")
                } else {
                    DeviceNotifications.show(this, "تعذر رفع ملف ZOZ", errorMessage.take(180))
                }
                scheduleAgentPoll(5000L)
            }
        }
    }

    private fun inspectControlTask() {
        val task = activeControlTask() ?: return
        val now = System.currentTimeMillis()
        val createdAt = task.optLong("created_at_ms", 0L)
        if (createdAt <= 0L || now - createdAt > 90000L) {
            finishControlTask(task, false, "control_task_expired", "انتهت صلاحية أمر التحكم قبل اكتماله.")
            return
        }
        val root = rootInActiveWindow
        if (root == null) {
            if (now - createdAt > 25000L) {
                finishControlTask(task, false, "screen_unavailable", "لم تتوفر شجرة عناصر الشاشة للتطبيق المستهدف.")
            } else scheduleControlInspection(500)
            return
        }
        val targetPackage = task.optString("target_package")
        val currentPackage = root.packageName?.toString().orEmpty()
        if (currentPackage != targetPackage) {
            if (now - createdAt > 25000L) {
                finishControlTask(task, false, "target_app_not_foreground", "التطبيق المطلوب ليس في مقدمة الشاشة؛ لم ينفذ الهاتف نقرات في تطبيق آخر.")
            } else scheduleControlInspection(700)
            return
        }
        val steps = task.optJSONArray("steps") ?: run {
            finishControlTask(task, false, "control_steps_missing", "قائمة أوامر التحكم غير موجودة.")
            return
        }
        val index = task.optInt("step_index", 0)
        if (index >= steps.length()) {
            val completed = task.optJSONArray("step_results") ?: JSONArray()
            finishControlTask(task, true, "", "", JSONObject()
                .put("target_package", targetPackage)
                .put("steps_completed", index)
                .put("step_results", completed))
            return
        }
        val step = steps.optJSONObject(index) ?: run {
            finishControlTask(task, false, "control_step_invalid", "أحد أوامر التحكم غير صالح.")
            return
        }
        val action = step.optString("action", "").lowercase()
        val results = task.optJSONArray("step_results") ?: JSONArray()
        try {
            when (action) {
                "inspect" -> {
                    val nodes = JSONArray()
                    var captured = 0
                    walk(root) { node ->
                        if (captured >= 100 || !node.isVisibleToUser) return@walk
                        val label = controlNodeLabel(node)
                        val interactive = node.isClickable || node.parent?.isClickable == true || node.isScrollable
                        if (!interactive || label.isBlank() || node.isEditable || node.isPassword || isSensitiveLabel(label) || label.matches(Regex("^\\d{4,8}$"))) return@walk
                        val item = JSONObject().put("label", safeUiText(label))
                            .put("clickable", node.isClickable || node.parent?.isClickable == true)
                            .put("editable", node.isEditable)
                            .put("scrollable", node.isScrollable)
                        node.viewIdResourceName?.takeIf { it.isNotBlank() }?.let { item.put("view_id", it) }
                        node.className?.toString()?.takeIf { it.isNotBlank() }?.let { item.put("class_name", it.take(100)) }
                        nodes.put(item)
                        captured++
                    }
                    results.put(JSONObject().put("action", action).put("nodes", nodes))
                }
                "read_screen" -> {
                    if (targetPackage !in ZOZ_CONTROL_PACKAGES) throw IllegalStateException("read_screen_target_not_allowed")
                    results.put(JSONObject().put("action", action).put("data", readAllowedAppScreen(root, step.optString("section", ""))))
                }
                "tap" -> {
                    val selected = (if (targetPackage in ZOZ_STUDIO_PACKAGES) findStudioNavigationNode(root, step) else findControlNode(root, step, requireEditable = false))
                        ?: throw IllegalStateException("ui_selector_not_unique_or_missing")
                    val label = controlNodeLabel(selected)
                    val idLabel = selected.viewIdResourceName.orEmpty()
                    if (isSensitiveLabel(label)) throw IllegalStateException("sensitive_authentication_control_blocked")
                    if ((isIrreversibleLabel(label) || isIrreversibleLabel(idLabel)) && !task.optBoolean("owner_approved", false)) {
                        throw IllegalStateException("owner_approval_required")
                    }
                    val clickTarget = if (selected.isClickable) selected else selected.parent
                        ?: throw IllegalStateException("ui_target_not_clickable")
                    if (!clickTarget.isVisibleToUser || !clickTarget.isEnabled ||
                        !clickTarget.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        throw IllegalStateException("ui_click_failed")
                    }
                    results.put(JSONObject().put("action", action).put("target", safeUiText(label)).put("clicked", true))
                }
                "type_text" -> {
                    if (targetPackage !in ZOZ_REGULAR_SOCIAL_PACKAGES && targetPackage !in ZOZ_STUDIO_PACKAGES) {
                        throw IllegalStateException("target_app_not_allowlisted")
                    }
                    val selected = findControlNode(root, step, requireEditable = true)
                        ?: throw IllegalStateException("ui_editor_not_unique_or_missing")
                    val label = controlNodeLabel(selected)
                    if (selected.isPassword || label.isBlank() || isSensitiveLabel(label)) {
                        throw IllegalStateException("sensitive_input_field_blocked")
                    }
                    val purpose = step.optString("input_purpose", "").lowercase()
                    if (purpose !in ZOZ_TEXT_PURPOSES) throw IllegalStateException("business_content_purpose_required")
                    val value = step.optString("text", "")
                    if (value.isBlank() || value.length > 3000 || containsSensitiveWorkValue(value)) {
                        throw IllegalArgumentException("sensitive_or_invalid_text_blocked")
                    }
                    selected.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                    val args = android.os.Bundle().apply {
                        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
                    }
                    if (!selected.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
                        throw IllegalStateException("ui_text_entry_failed")
                    }
                    results.put(JSONObject().put("action", action).put("characters", value.length).put("entered", true))
                }
                "open_url" -> {
                    val rawUrl = step.optString("url", "")
                    if (targetPackage != "com.android.chrome" || !isAllowedZozWebUrl(rawUrl)) {
                        throw IllegalStateException("business_url_not_allowlisted")
                    }
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(rawUrl))
                        .setPackage("com.android.chrome")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                    results.put(JSONObject().put("action", action).put("host", Uri.parse(rawUrl).host).put("opened", true))
                }
                "scroll" -> {
                    val direction = step.optString("direction", "down").lowercase()
                    val scrollNode = findScrollableNode(root) ?: throw IllegalStateException("ui_scroll_container_not_found")
                    val scrollAction = if (direction == "up") AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                        else AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                    if (!scrollNode.performAction(scrollAction)) throw IllegalStateException("ui_scroll_failed")
                    results.put(JSONObject().put("action", action).put("direction", direction).put("scrolled", true))
                }
                "back" -> {
                    if (!performGlobalAction(GLOBAL_ACTION_BACK)) throw IllegalStateException("ui_back_failed")
                    results.put(JSONObject().put("action", action).put("performed", true))
                }
                "wait" -> {
                    val delay = step.optLong("milliseconds", 800L).coerceIn(100L, 5000L)
                    task.put("step_index", index + 1)
                    task.put("step_results", results.put(JSONObject().put("action", action).put("waited_ms", delay)))
                    prefs().edit().putString(KEY_ACTIVE_CONTROL_TASK, task.toString()).apply()
                    scheduleControlInspection(delay)
                    return
                }
                else -> throw IllegalArgumentException("unsupported_ui_action")
            }
            task.put("step_index", index + 1)
            task.put("step_results", results)
            prefs().edit().putString(KEY_ACTIVE_CONTROL_TASK, task.toString()).apply()
            scheduleControlInspection(650)
        } catch (e: Exception) {
            val code = e.message ?: "ui_control_failed"
            finishControlTask(task, false, code, code)
        }
    }

    private fun controlNodeLabel(node: AccessibilityNodeInfo): String =
        listOf(node.text?.toString(), node.contentDescription?.toString(), node.hintText?.toString())
            .filterNot { it.isNullOrBlank() }.joinToString(" ").replace(Regex("\\s+"), " ").trim()

    private fun readAllowedAppScreen(root: AccessibilityNodeInfo, requestedSection: String = ""): JSONObject {
        val currentPackage = root.packageName?.toString().orEmpty()
        if (currentPackage !in ZOZ_CONTROL_PACKAGES) {
            throw IllegalStateException("target_app_not_allowlisted")
        }
        val texts = linkedSetOf<String>()
        walk(root) { node ->
            if (texts.size >= 80 || !node.isVisibleToUser || node.isEditable || node.isPassword) return@walk
            val raw = listOf(node.text?.toString(), node.contentDescription?.toString())
                .filterNot { it.isNullOrBlank() }.joinToString(" ").replace(Regex("\\s+"), " ").trim()
            if (raw.isBlank() || raw.length > 180 || raw.contains("@") || isSensitiveAppText(raw)) return@walk
            val safe = safeUiText(raw)
            if (safe.isNotBlank()) texts.add(safe)
        }
        val combined = texts.joinToString(" ").lowercase()
        val analyticsTerms = listOf(
            "analytics", "overview", "views", "video views", "followers", "subscribers", "likes", "comments",
            "engagement", "audience", "content performance", "profile views", "watch time", "reach",
            "التحليلات", "نظرة عامة", "المشاهدات", "المتابعون", "المشتركون", "الإعجابات", "التعليقات",
            "التفاعل", "الجمهور", "أداء المحتوى", "وقت المشاهدة", "الوصول"
        )
        val available = analyticsTerms.any(combined::contains)
        val normalizedSection = requestedSection.lowercase().trim()
        val sectionKey = when {
            normalizedSection.contains("إحصاء") || normalizedSection.contains("التحليل") || normalizedSection.contains("analytics") -> "analytics"
            normalizedSection.contains("محتوى") || normalizedSection.contains("فيديو") || normalizedSection.contains("content") -> "content"
            normalizedSection.contains("منتدى") || normalizedSection.contains("تعليق") || normalizedSection.contains("community") -> "community"
            normalizedSection.contains("ربح") || normalizedSection.contains("أرباح") || normalizedSection.contains("earn") -> "earn"
            normalizedSection.contains("جمهور") || normalizedSection.contains("audience") -> "audience"
            normalizedSection.contains("لوحة") || normalizedSection.contains("نظرة") || normalizedSection.contains("overview") -> "dashboard"
            else -> "screen"
        }
        val result = JSONObject()
            .put("available", available)
            .put("section", requestedSection.take(60))
            .put("screen", when (currentPackage) {
                TIKTOK_STUDIO_PACKAGE -> "tiktok_studio_$sectionKey"
                YOUTUBE_STUDIO_PACKAGE -> "youtube_studio_$sectionKey"
                TIKTOK_PACKAGE -> "tiktok_app"
                YOUTUBE_PACKAGE -> "youtube_app"
                else -> "unknown"
            })
            .put("captured_at_ms", System.currentTimeMillis())
            .put("visible_text_count", texts.size)
        result.put("texts", JSONArray(texts.toList()))
        if (texts.isEmpty()) result.put("reason", "no_accessible_visible_text")
        return result
    }

    private fun safeUiText(value: String): String {
        val emailRedacted = value.replace(Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"), "[email]")
        return emailRedacted.replace(Regex("\\b\\+?\\d[\\d ()-]{7,}\\d\\b"), "[number]").take(100)
    }

    private fun isSensitiveLabel(value: String): Boolean {
        val v = value.lowercase()
        return listOf(
            "password", "passcode", "one-time", "verification code", "security code", "otp", "pin code",
            "cvv", "cvc", "email", "e-mail", "username", "user name", "account", "profile", "phone number",
            "mobile number", "كلمة المرور", "كلمة السر", "الرقم السري", "رمز التحقق", "كود التحقق", "رمز الأمان",
            "الرقم القومي", "بيانات البطاقة", "رقم البطاقة", "البريد الإلكتروني", "البريد الالكتروني",
            "اسم المستخدم", "الحساب", "الملف الشخصي", "رقم الهاتف", "رقم الموبايل"
        ).any(v::contains)
    }

    private fun isIrreversibleLabel(value: String): Boolean {
        val v = value.lowercase()
        return listOf("publish", "post", "send", "share", "delete", "remove", "buy", "purchase", "pay", "transfer",
            "confirm", "submit", "نشر", "إرسال", "ارسال", "مشاركة", "حذف", "شراء", "دفع", "تحويل", "تأكيد", "تاكيد").any(v::contains)
    }

    private fun findControlNode(root: AccessibilityNodeInfo, selector: JSONObject, requireEditable: Boolean): AccessibilityNodeInfo? {
        val viewId = selector.optString("view_id", "").trim()
        val wantedText = selector.optString("text", "").trim()
        val wantedDescription = selector.optString("content_description", "").trim()
        val wantedHint = selector.optString("hint", "").trim()
        if (viewId.isBlank() && wantedText.isBlank() && wantedDescription.isBlank() && wantedHint.isBlank()) return null
        val matches = mutableListOf<AccessibilityNodeInfo>()
        walk(root) { node ->
            if (!node.isVisibleToUser || !node.isEnabled) return@walk
            if (requireEditable && !node.isEditable) return@walk
            val idMatch = viewId.isNotBlank() && node.viewIdResourceName.orEmpty().equals(viewId, ignoreCase = true)
            val textMatch = wantedText.isNotBlank() && node.text?.toString()?.trim().equals(wantedText, ignoreCase = true)
            val descMatch = wantedDescription.isNotBlank() && node.contentDescription?.toString()?.trim().equals(wantedDescription, ignoreCase = true)
            val hintMatch = wantedHint.isNotBlank() && node.hintText?.toString()?.trim().equals(wantedHint, ignoreCase = true)
            if (idMatch || textMatch || descMatch || hintMatch) matches.add(node)
        }
        val unique = matches.distinctBy { node ->
            val bounds = android.graphics.Rect().also(node::getBoundsInScreen)
            (node.viewIdResourceName ?: "") + "|" + bounds.flattenToString()
        }
        return unique.singleOrNull()
    }

    private fun findStudioNavigationNode(root: AccessibilityNodeInfo, selector: JSONObject): AccessibilityNodeInfo? {
        val candidates = linkedSetOf<String>()
        listOf(
            selector.optString("text", ""),
            selector.optString("content_description", ""),
            selector.optString("hint", "")
        ).map { it.trim() }.filter { it.isNotBlank() }.forEach(candidates::add)
        val alternates = selector.optJSONArray("alternates") ?: JSONArray()
        for (index in 0 until minOf(alternates.length(), 8)) {
            alternates.optString(index).trim().takeIf { it.isNotBlank() }?.let(candidates::add)
        }
        for (wanted in candidates.filter(::isStudioNavigationLabel)) {
            val matches = linkedMapOf<String, AccessibilityNodeInfo>()
            walk(root) { node ->
                if (!node.isVisibleToUser || !node.isEnabled || node.isEditable || node.isPassword) return@walk
                val labels = listOf(node.text?.toString(), node.contentDescription?.toString(), node.hintText?.toString())
                    .filterNot { it.isNullOrBlank() }.map { it!!.replace(Regex("\\s+"), " ").trim() }
                if (labels.none { it.equals(wanted, ignoreCase = true) }) return@walk
                var clickTarget: AccessibilityNodeInfo? = node
                var depth = 0
                while (clickTarget != null && !clickTarget.isClickable && depth < 4) {
                    clickTarget = clickTarget.parent
                    depth++
                }
                val target = clickTarget ?: return@walk
                if (!target.isVisibleToUser || !target.isEnabled || !target.isClickable) return@walk
                val bounds = android.graphics.Rect().also(target::getBoundsInScreen)
                val key = (target.viewIdResourceName ?: "") + "|" + bounds.flattenToString()
                matches.putIfAbsent(key, target)
            }
            if (matches.size == 1) return matches.values.first()
        }
        return null
    }

    private fun findScrollableNode(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var best: AccessibilityNodeInfo? = null
        var bestArea = -1L
        walk(root) { node ->
            if (!node.isVisibleToUser || !node.isEnabled || !node.isScrollable) return@walk
            val bounds = android.graphics.Rect().also(node::getBoundsInScreen)
            val area = bounds.width().toLong().coerceAtLeast(0) * bounds.height().toLong().coerceAtLeast(0)
            if (area > bestArea) {
                best = node
                bestArea = area
            }
        }
        return best
    }

    private fun compactControlResult(source: JSONObject): JSONObject {
        val compact = JSONObject(source.toString())
        val steps = compact.optJSONArray("step_results") ?: return compact
        val boundedSteps = JSONArray()
        for (index in 0 until steps.length()) {
            val item = steps.optJSONObject(index) ?: continue
            val action = item.optString("action")
            if (action == "read_screen") {
                val data = item.optJSONObject("data") ?: JSONObject()
                val rawTexts = data.optJSONArray("texts") ?: JSONArray()
                val candidates = mutableListOf<String>()
                for (i in 0 until rawTexts.length()) {
                    val value = rawTexts.optString(i).trim()
                    if (value.isNotBlank()) candidates.add(value.take(100))
                }
                val important = candidates.filter {
                    Regex("[0-9٠-٩]|مشاهد|مشاهدات|مشاهدة|ساعة|ساعات|مشترك|إعجاب|تعليق|نسبة|وقت المشاهدة|views|watch time|subscribers|likes|comments", RegexOption.IGNORE_CASE).containsMatchIn(it)
                }
                val selectedTexts = (important.take(10) + candidates.take(18) + candidates.drop(18))
                    .distinct().take(18)
                val outTexts = JSONArray()
                selectedTexts.forEach { outTexts.put(it) }
                val outData = JSONObject()
                    .put("available", data.optBoolean("available"))
                    .put("screen", data.optString("screen"))
                    .put("section", data.optString("section"))
                    .put("captured_at_ms", data.optLong("captured_at_ms"))
                    .put("visible_text_count", data.optInt("visible_text_count"))
                    .put("texts", outTexts)
                boundedSteps.put(JSONObject().put("action", action).put("data", outData))
            } else if (action == "inspect") {
                val rawNodes = item.optJSONArray("nodes") ?: JSONArray()
                val nodes = JSONArray()
                for (i in 0 until minOf(rawNodes.length(), 20)) {
                    val node = rawNodes.optJSONObject(i) ?: continue
                    nodes.put(JSONObject()
                        .put("label", node.optString("label").take(80))
                        .put("clickable", node.optBoolean("clickable"))
                        .put("scrollable", node.optBoolean("scrollable")))
                }
                boundedSteps.put(JSONObject().put("action", action).put("nodes", nodes))
            } else {
                boundedSteps.put(JSONObject(item.toString()))
            }
        }
        compact.put("step_results", boundedSteps)
        return compact
    }

    private fun finishControlTask(task: JSONObject, success: Boolean, code: String, message: String, extra: JSONObject = JSONObject()) {
        val id = task.optString("job_id")
        val result = compactControlResult(extra)
            .put("target_package", task.optString("target_package"))
            .put("steps_completed", task.optInt("step_index", 0))
            .put("phase", if (success) "completed" else "stopped")
        prefs().edit().remove(KEY_ACTIVE_CONTROL_TASK).apply()
        controlInspectionScheduled = false
        networkExecutor.execute {
            runCatching {
                val terminal = code in setOf(
                    "sensitive_authentication_control_blocked", "sensitive_input_field_blocked",
                    "business_content_purpose_required", "sensitive_or_invalid_text_blocked",
                    "target_app_not_foreground", "screen_unavailable", "control_task_expired"
                )
                apiPostWithToken("complete_job", JSONObject().put("job_id", id)
                    .put("outcome", if (success) "succeeded" else if (terminal) "cancelled" else "failed")
                    .put("error_code", code).put("error_message", message).put("result", result),
                    DeviceTokenVault.read(this) ?: "")
            }
            handler.post {
                DeviceNotifications.show(this, if (success) "اكتملت مهمة التطبيق" else "توقفت مهمة التطبيق",
                    if (success) "تم تنفيذ " + task.optInt("step_index", 0) + " خطوة داخل التطبيق المسموح." else message)
                // Keep the owner-enabled service active as the ZOZ executor. Event handling
                // remains limited to the four work apps; personal and banking apps are ignored.
                scheduleAgentPoll(2000L)
            }
        }
    }

    private fun writePromptText(editor: AccessibilityNodeInfo, value: String, clipboardLabel: String): Boolean {
        editor.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val args = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
        }
        if (editor.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) return true

        val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText(clipboardLabel, value))
        return editor.performAction(AccessibilityNodeInfo.ACTION_PASTE)
    }

    /**
     * Google Flow can open directly in Video mode. In that state the Image switcher
     * is not exposed as a clickable accessibility node, so do not fail or try to
     * switch modes again. Accept only a visible, exact, non-clickable Video mode label.
     */
    private fun isVideoModeAlreadySelected(root: AccessibilityNodeInfo): Boolean {
        val accepted = setOf("video", "video mode", "video generation", "فيديو", "وضع الفيديو", "توليد فيديو")
        var confirmed = false
        walk(root) { node ->
            if (confirmed || !node.isVisibleToUser) return@walk
            val label = accessibleLabel(node).lowercase()
                .replace('_', ' ')
                .replace(Regex("\\s+"), " ")
                .trim()
            val clickable = node.isClickable || node.parent?.isClickable == true
            if (!clickable && label in accepted) confirmed = true
        }
        return confirmed
    }

    private fun inspectCurrentPage() {
        val task = activeTask() ?: return
        val phase = task.optString("phase", "waiting_editor")

        // Download verification runs independently of the foreground app because Flow
        // may send the download to Android MediaStore and finish after its UI is backgrounded.
        if (phase == "download_started") {
            if (!task.optBoolean("downloads_folder_watch_started", false)) {
                task.put("downloads_folder_watch_started", true)
                prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
                handler.postDelayed({ pollFlowDownloadsFolder(task) }, 1200)
            }
            return
        }

        val root = flowWindowRoot()
        if (root == null) {
            retryFlowOriginScan(task)
            return
        }

        val allText = collectText(root).joinToString(" ").lowercase()
        if (containsGate(allText)) {
            finishTask(task, false, "manual_intervention_required",
                "Google Flow requested sign-in, verification, CAPTCHA, or account confirmation. The automation stopped without interacting with the security challenge.")
            return
        }
        val desiredFlowAccount = task.optString("flow_account_email", "").trim()
        if (desiredFlowAccount.isNotBlank() && !task.optBoolean("flow_account_verified", false)) {
            inspectFlowAccountSelection(task, root, allText)
            return
        }
        if (task.optString("task_type") == "flow_control_diagnostic") {
            inspectFlowControlDiagnostic(task, root)
            return
        }

        when (phase) {
            "waiting_editor" -> {
                val editor = findEditor(root)
                if (editor != null && System.currentTimeMillis() - lastActionAt > 1800) {
                    // Google Flow Android starts in Image mode. Switch to Video explicitly
                    // before entering the scene prompt so the agent never creates a still image.
                    if (!task.optBoolean("video_mode_selected", false)) {
                        val imageMode = findUniqueExactClickable(root, setOf(
                            "image", "image mode", "image generation", "صورة", "وضع الصورة"
                        ))
                        if (imageMode != null && imageMode.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                            task.put("video_mode_menu_opened", true)
                            updatePhase(task, "selecting_video_mode")
                            lastActionAt = System.currentTimeMillis()
                            handler.postDelayed({ inspectCurrentPage() }, 900)
                        } else if (isVideoModeAlreadySelected(root)) {
                            // The editor is already on Video mode; the Image switcher is absent.
                            task.put("video_mode_selected", true)
                            task.put("video_mode_verified_from_visible_label", true)
                            prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
                            lastActionAt = System.currentTimeMillis()
                            handler.postDelayed({ inspectCurrentPage() }, 650)
                        } else {
                            retryVideoModeScan(task)
                        }
                        return
                    }
                    val prompt = task.optString("prompt", "").take(12000)
                    if (prompt.isBlank()) {
                        finishTask(task, false, "prompt_empty", "The scene prompt is empty.")
                        return
                    }
                    val set = writePromptText(editor, prompt, "وصف مشهد Google Flow")
                    if (set) {
                        task.put("prompt_write_attempts", 1)
                        task.put("prompt_language", "ar")
                        task.put("prompt_chars", prompt.length)
                        updatePhase(task, "verifying_prompt_entry")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 900)
                    } else {
                        retryEditorScan(task)
                    }
                } else {
                    if (!task.optBoolean("flow_setup_clicked", false)) {
                        val setup = findNewProjectButton(root)
                        if (setup != null && setup.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                            task.put("flow_setup_clicked", true)
                            task.put("setup_clicked_at_ms", System.currentTimeMillis())
                            prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
                            lastActionAt = System.currentTimeMillis()
                            handler.postDelayed({ inspectCurrentPage() }, 1800)
                        } else {
                            retryEditorScan(task)
                        }
                    } else if (!task.optBoolean("video_mode_selected", false)) {
                        val imageMode = findUniqueExactClickable(root, setOf(
                            "image", "image mode", "image generation", "صورة", "وضع الصورة"
                        ))
                        if (imageMode != null && imageMode.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                            task.put("video_mode_menu_opened", true)
                            updatePhase(task, "selecting_video_mode")
                            lastActionAt = System.currentTimeMillis()
                            handler.postDelayed({ inspectCurrentPage() }, 900)
                        } else if (isVideoModeAlreadySelected(root)) {
                            task.put("video_mode_selected", true)
                            task.put("video_mode_verified_from_visible_label", true)
                            prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
                            lastActionAt = System.currentTimeMillis()
                            handler.postDelayed({ inspectCurrentPage() }, 650)
                        } else {
                            retryVideoModeScan(task)
                        }
                    } else {
                        retryEditorScan(task)
                    }
                }
            }
            "selecting_video_mode" -> {
                val videoMode = findUniqueExactClickable(root, setOf(
                    "video", "video mode", "video generation", "فيديو", "وضع الفيديو", "توليد فيديو"
                ))
                if (videoMode != null && videoMode.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    task.put("video_mode_selected", true)
                    task.put("video_option_index", 0)
                    updatePhase(task, "configuring_video_options")
                    lastActionAt = System.currentTimeMillis()
                    handler.postDelayed({ inspectCurrentPage() }, 900)
                } else {
                    retryVideoModeScan(task)
                }
            }
            "configuring_video_options" -> {
                val step = task.optInt("video_option_index", 0)
                if (step >= 4) {
                    task.put("video_preferences_verified", true)
                    updatePhase(task, "waiting_editor")
                    handler.postDelayed({ inspectCurrentPage() }, 800)
                } else {
                    val control = findUniqueClickableContaining(root, flowVideoOptionControls(step))
                    if (control != null && control.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        task.put("video_option_opened", step)
                        updatePhase(task, "selecting_video_option_value")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 650)
                    } else {
                        retryVideoOptionScan(task, step)
                    }
                }
            }
            "selecting_video_option_value" -> {
                val step = task.optInt("video_option_opened", -1)
                if (step !in 0..3) {
                    finishTask(task, false, "flow_video_option_state_invalid",
                        "حالة إعدادات الفيديو غير صالحة؛ أوقف الهاتف التوليد بأمان.")
                    return
                }
                val option = findUniqueClickableContaining(root, flowVideoOptionValues(step))
                if (option != null && option.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    task.put("video_option_verified_$step", true)
                    task.put("video_option_index", step + 1)
                    updatePhase(task, "configuring_video_options")
                    lastActionAt = System.currentTimeMillis()
                    handler.postDelayed({ inspectCurrentPage() }, 700)
                } else {
                    retryVideoOptionScan(task, step)
                }
            }
            "verifying_prompt_entry" -> {
                val prompt = task.optString("prompt", "").take(12000)
                val editor = findEditor(root)
                val editorText = editor?.text?.toString().orEmpty()
                val screenText = collectText(root).joinToString("\n")
                val verified = prompt.isNotBlank() &&
                    (editorText.contains(prompt) || screenText.contains(prompt))
                if (verified) {
                    task.put("prompt_entered", true)
                    task.put("prompt_entry_verified", true)
                    updatePhase(task, "waiting_send")
                    lastActionAt = System.currentTimeMillis()
                    handler.postDelayed({ inspectCurrentPage() }, 900)
                } else if (task.optInt("prompt_write_attempts", 0) < 2 && editor != null) {
                    val set = writePromptText(editor, prompt, "وصف مشهد Google Flow")
                    task.put("prompt_write_attempts", task.optInt("prompt_write_attempts", 0) + 1)
                    prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
                    if (set) handler.postDelayed({ inspectCurrentPage() }, 900)
                    else finishTask(task, false, "flow_prompt_entry_failed",
                        "لم يقبل محرر Google Flow كتابة النص. تم إيقاف الإرسال قبل التوليد.")
                } else {
                    finishTask(task, false, "flow_prompt_entry_not_verified",
                        "أرسل Android أمر الكتابة، لكن نص المطالبة لم يظهر داخل محرر Flow؛ لم يتم الضغط على زر التوليد.")
                }
            }
            "waiting_send" -> {
                if (!task.optBoolean("prompt_entered", false) || !task.optBoolean("prompt_entry_verified", false)) {
                    finishTask(task, false, "prompt_not_entered", "لم يؤكد التطبيق إدخال وصف المشهد داخل محرر Google Flow.")
                    return
                }
                // Identify and visibly focus the unique generation action first.
                // The click is deliberately deferred to a separate inspection cycle.
                val generate = findGenerateButton(root)
                if (generate != null && System.currentTimeMillis() - lastActionAt > 1800) {
                    val label = accessibleLabel(generate)
                    val accessibilityFocused = generate.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
                    val keyboardFocused = generate.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                    if (accessibilityFocused || keyboardFocused) {
                        task.put("generate_button_identified", true)
                        task.put("generate_button_label", label)
                        task.put("generate_button_focused", true)
                        updatePhase(task, "confirming_generate")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 1200)
                    } else {
                        retrySendScan(task)
                    }
                } else {
                    retrySendScan(task)
                }
            }
            "confirming_generate" -> {
                val confirmed = findGenerateButton(root)
                val expected = task.optString("generate_button_label", "")
                val actual = confirmed?.let(::accessibleLabel) ?: ""
                if (confirmed == null || expected.isBlank() || !actual.equals(expected, ignoreCase = true)) {
                    finishTask(task, false, "flow_generate_button_changed",
                        "تم تحديد زر التوليد أولًا، لكن تعذر التحقق من بقاء الزر نفسه قبل الضغط؛ لم يُنفذ الإرسال.")
                    return
                }
                if (System.currentTimeMillis() - lastActionAt > 900) {
                    val stillFocused = confirmed.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS) ||
                        confirmed.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                    if (!stillFocused) {
                        finishTask(task, false, "flow_generate_button_focus_lost",
                            "فُقد التركيز على زر التوليد قبل الضغط؛ أوقف التطبيق الإرسال بأمان.")
                        return
                    }
                    if (confirmed.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        task.put("generate_button_clicked", true)
                        task.put("send_clicked", true)
                        task.put("generate_clicked_at_ms", System.currentTimeMillis())
                        task.put("generation_started_at_ms", System.currentTimeMillis())
                        DeviceNotifications.show(
                            this,
                            "بدأ توليد فيديو Google Flow",
                            "أكد ZOZ الضغط على Generate بعد التحقق من النص؛ يراقب الآن ظهور نتيجة هذا المشهد."
                        )
                        updatePhase(task, "waiting_download")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 5000)
                    } else {
                        retrySendScan(task)
                    }
                }
            }
            "waiting_download" -> {
                // Never click a generic Download button from the project gallery: it may
                // belong to an older scene. First bind the newly-created asset to this
                // scene's distinctive visual-action text, then open only that asset.
                val asset = findGeneratedPromptAsset(root, task.optString("prompt", ""))
                if (asset != null && System.currentTimeMillis() - lastActionAt > 1800 &&
                    asset.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    task.put("asset_selected_at_ms", System.currentTimeMillis())
                    DeviceNotifications.show(
                        this,
                        "اكتمل توليد مشهد Google Flow",
                        "ظهرت نتيجة المشهد المطابقة؛ يفتح ZOZ الفيديو الآن لبدء تنزيل النسخة النهائية."
                    )
                    updatePhase(task, "flow_asset_selected")
                    lastActionAt = System.currentTimeMillis()
                    handler.postDelayed({ inspectCurrentPage() }, 1000)
                } else {
                    retryAssetScan(task)
                }
            }
            "flow_asset_selected" -> {
                val download = findButton(root, setOf("download", "download video", "download asset", "تنزيل", "تحميل الفيديو"))
                if (download != null && download.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    markFlowDownloadStarted(task)
                } else {
                    val more = findUniqueExactClickable(root, setOf(
                        "more", "more options", "more actions", "options", "المزيد", "خيارات إضافية", "خيارات"
                    ))
                    if (more != null && more.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        updatePhase(task, "flow_asset_menu_open")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 700)
                    } else {
                        retryAssetMenuScan(task)
                    }
                }
            }
            "flow_asset_menu_open" -> {
                val download = findButton(root, setOf("download", "download video", "download asset", "تنزيل", "تحميل الفيديو"))
                if (download != null && download.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    markFlowDownloadStarted(task)
                } else {
                    retryAssetMenuScan(task)
                }
            }
            "download_started" -> {
                // The native Flow app may save through MediaStore rather than Android DownloadManager.
                // Watch the public Downloads folder as well as the DownloadManager completion receiver.
                if (!task.optBoolean("downloads_folder_watch_started", false)) {
                    task.put("downloads_folder_watch_started", true)
                    prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
                    handler.postDelayed({ pollFlowDownloadsFolder(task) }, 1200)
                }
            }
        }
    }

    /**
     * Non-generating verification path. It opens the native Flow editor, switches
     * Image -> Video using visible accessibility nodes, and stops before any prompt
     * is entered or any Generate/Download action is touched.
     */
    private fun inspectFlowControlDiagnostic(task: JSONObject, root: AccessibilityNodeInfo) {
        val phase = task.optString("phase", "diagnostic_waiting_editor")
        val visibleText = collectText(root).joinToString(" ").lowercase()
        when (phase) {
            "diagnostic_waiting_editor" -> {
                val editor = findEditor(root)
                if (editor == null && !task.optBoolean("flow_setup_clicked", false)) {
                    val setup = findNewProjectButton(root)
                    if (setup != null && setup.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        task.put("flow_setup_clicked", true)
                        task.put("diagnostic_editor_navigation_clicked", true)
                        updatePhase(task, "diagnostic_waiting_editor")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 1400)
                    } else {
                        retryControlDiagnostic(task, "flow_editor_navigation_not_found",
                            "وصل الهاتف إلى تطبيق Google Flow الأصلي، لكن لم يظهر زر واضح لفتح محرر مشروع جديد.")
                    }
                    return
                }

                val imageMode = findUniqueExactClickable(root, setOf(
                    "image", "image mode", "image generation", "صورة", "وضع الصورة"
                ))
                if (imageMode != null && imageMode.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    task.put("diagnostic_image_mode_opened", true)
                    updatePhase(task, "diagnostic_select_video")
                    lastActionAt = System.currentTimeMillis()
                    handler.postDelayed({ inspectCurrentPage() }, 900)
                } else if (editor != null && (visibleText.contains("video") || visibleText.contains("فيديو"))) {
                    beginDiagnosticPromptEntry(task, root, false)
                } else {
                    retryControlDiagnostic(task, "flow_image_mode_control_not_found",
                        "ظهر تطبيق Flow الأصلي، لكن تعذر تحديد عنصر وضع الصور بشكل فريد وآمن.")
                }
            }
            "diagnostic_select_video" -> {
                val videoMode = findUniqueExactClickable(root, setOf(
                    "video", "video mode", "video generation", "فيديو", "وضع الفيديو", "توليد فيديو"
                ))
                if (videoMode != null && videoMode.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    task.put("diagnostic_video_mode_clicked", true)
                    updatePhase(task, "diagnostic_verify_video")
                    lastActionAt = System.currentTimeMillis()
                    handler.postDelayed({ inspectCurrentPage() }, 1200)
                } else {
                    retryControlDiagnostic(task, "flow_video_mode_control_not_found",
                        "تم فتح قائمة الأوضاع داخل Flow، لكن تعذر تحديد خيار الفيديو بشكل فريد وآمن.")
                }
            }
            "diagnostic_verify_video" -> {
                if (findEditor(root) != null &&
                    (visibleText.contains("video") || visibleText.contains("فيديو"))) {
                    beginDiagnosticPromptEntry(task, root, true)
                } else {
                    retryControlDiagnostic(task, "flow_video_mode_not_verified",
                        "نفذ الهاتف التفاعل داخل Flow، لكن لم يمكن تأكيد ظهور محرر الفيديو بعد الاختيار.")
                }
            }
            "diagnostic_verify_prompt" -> {
                val expected = task.optString("diagnostic_prompt", "")
                val editor = findEditor(root)
                val editorText = editor?.text?.toString().orEmpty()
                val screenText = collectText(root).joinToString("\n")
                if (expected.isNotBlank() &&
                    (editorText.contains(expected) || screenText.contains(expected))) {
                    completeFlowControlDiagnostic(
                        task,
                        root,
                        visibleText,
                        task.optBoolean("diagnostic_video_mode_clicked", false)
                    )
                } else if (!task.optBoolean("diagnostic_prompt_retry", false) && editor != null) {
                    task.put("diagnostic_prompt_retry", true)
                    val set = writePromptText(editor, expected, "اختبار إدخال ZOZ")
                    if (set) {
                        updatePhase(task, "diagnostic_verify_prompt")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 1000)
                    } else {
                        retryControlDiagnostic(task, "flow_prompt_write_rejected",
                            "حقل المطالبة ظهر، لكن لم يقبل إعادة كتابة نص الاختبار.")
                    }
                } else {
                    retryControlDiagnostic(task, "flow_prompt_entry_not_verified",
                        "حاول ZOZ الكتابة في حقل المطالبة، لكن النص لم يظهر داخل Flow. لم يتم الضغط على زر التوليد.")
                }
            }
            else -> finishTask(task, false, "flow_diagnostic_state_invalid",
                "حالة اختبار التحكم في Google Flow غير صالحة؛ تم إيقاف الاختبار دون توليد.")
        }
    }

    private fun inspectFlowAccountSelection(
        task: JSONObject,
        root: AccessibilityNodeInfo,
        visibleText: String
    ) {
        val desired = task.optString("flow_account_email", "").trim().lowercase()
        if (desired.isBlank()) {
            task.put("flow_account_verified", true)
            updatePhase(task, if (task.optString("task_type") == "flow_control_diagnostic") "diagnostic_waiting_editor" else "waiting_editor")
            handler.postDelayed({ inspectCurrentPage() }, 500)
            return
        }

        val now = System.currentTimeMillis()
        if (!task.has("flow_account_started_at_ms")) {
            task.put("flow_account_started_at_ms", now)
            prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
        }

        val pickerOpened = task.optBoolean("flow_account_picker_opened", false)
        val selectionClicked = task.optBoolean("flow_account_selection_clicked", false)

        if (selectionClicked) {
            if (visibleText.contains(desired, ignoreCase = true)) {
                task.put("flow_account_verified", true)
                task.put("flow_account_verified_at_ms", now)
                updatePhase(task, if (task.optString("task_type") == "flow_control_diagnostic") "diagnostic_waiting_editor" else "waiting_editor")
                handler.postDelayed({ inspectCurrentPage() }, 900)
                return
            }
        } else if (!pickerOpened && visibleText.contains(desired, ignoreCase = true)) {
            // The requested account is already visible on the native Flow screen.
            task.put("flow_account_verified", true)
            task.put("flow_account_verified_at_ms", now)
            updatePhase(task, if (task.optString("task_type") == "flow_control_diagnostic") "diagnostic_waiting_editor" else "waiting_editor")
            handler.postDelayed({ inspectCurrentPage() }, 700)
            return
        } else if (pickerOpened) {
            // Select only a unique visible account row that exactly contains the saved email.
            val accountRow = findUniqueClickableContaining(root, setOf(desired))
            if (accountRow != null && accountRow.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                task.put("flow_account_selection_clicked", true)
                prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
                lastActionAt = now
                handler.postDelayed({ inspectCurrentPage() }, 1400)
                return
            }
        } else {
            // Open only a semantically identified account/profile control. Never touch sign-out,
            // password, Google account security, or verification controls.
            val profile = findUniqueClickableContaining(root, setOf(
                "profile", "account menu", "google account", "account", "profile picture"
            ))
            if (profile != null && profile.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                task.put("flow_account_picker_opened", true)
                prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
                lastActionAt = now
                handler.postDelayed({ inspectCurrentPage() }, 1000)
                return
            }
        }

        val started = task.optLong("flow_account_started_at_ms", now)
        val attempts = task.optInt("flow_account_scan_attempts", 0) + 1
        task.put("flow_account_scan_attempts", attempts)
        prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
        if (now - started > 45000L || attempts > 35) {
            finishTask(task, false, "flow_account_switch_required",
                "لم يتمكن ZOZ من التحقق من الحساب المطلوب داخل تطبيق Google Flow أو اختياره من قائمة الحسابات الظاهرة. افتح حساب Flow المطلوب وسجّل الدخول أو بدّل الحساب يدويًا، ثم أعد المهمة. لم تُستخدم أي بيانات دخول أو رموز تحقق.")
        } else {
            handler.postDelayed({ inspectCurrentPage() }, 1200)
        }
    }

    private fun beginDiagnosticPromptEntry(
        task: JSONObject,
        root: AccessibilityNodeInfo,
        videoModeClicked: Boolean
    ) {
        val editor = findEditor(root)
        if (editor == null) {
            retryControlDiagnostic(task, "flow_prompt_editor_not_found",
                "وصل ZOZ إلى محرر Flow، لكن حقل المطالبة غير قابل للوصول للكتابة.")
            return
        }
        val probe = "اختبار تحكم ZOZ: تم إدخال النص في حقل مطالبة الفيديو."
        if (!writePromptText(editor, probe, "اختبار إدخال ZOZ")) {
            retryControlDiagnostic(task, "flow_prompt_write_rejected",
                "فتح ZOZ حقل المطالبة، لكن محرر Flow رفض أمر إدخال النص.")
            return
        }
        task.put("diagnostic_prompt", probe)
        task.put("diagnostic_prompt_write_attempted", true)
        task.put("diagnostic_video_mode_clicked", videoModeClicked)
        updatePhase(task, "diagnostic_verify_prompt")
        lastActionAt = System.currentTimeMillis()
        handler.postDelayed({ inspectCurrentPage() }, 1000)
    }

    private fun completeFlowControlDiagnostic(
        task: JSONObject,
        root: AccessibilityNodeInfo,
        visibleText: String,
        videoModeClicked: Boolean
    ) {
        val result = JSONObject()
            .put("test_type", "native_flow_control_diagnostic")
            .put("native_package", root.packageName?.toString().orEmpty())
            .put("native_app_verified", isVerifiedFlowPage(root))
            .put("accessibility_screen_readable", true)
            .put("accessible_text_node_count", collectText(root).size)
            .put("prompt_editor_detected", findEditor(root) != null)
            .put("prompt_entry_verified", true)
            .put("diagnostic_prompt_chars", task.optString("diagnostic_prompt", "").length)
            .put("send_button_detected", findGenerateButton(root) != null)
            .put("send_button_clicked", false)
            .put("video_mode_clicked_by_zoz", videoModeClicked)
            .put("video_mode_label_visible", visibleText.contains("video") || visibleText.contains("فيديو"))
            .put("generate_button_clicked", false)
            .put("generation_started", false)
            .put("video_created", false)
            .put("download_started", false)
        finishTask(task, true, "", "", result)
    }

    private fun retryControlDiagnostic(task: JSONObject, code: String, message: String) {
        val now = System.currentTimeMillis()
        val phaseStarted = task.optLong("phase_started_at_ms", task.optLong("started_at_ms", now))
        val attempts = task.optInt("diagnostic_scan_attempts", 0) + 1
        task.put("diagnostic_scan_attempts", attempts)
        prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
        if (now - phaseStarted > 45000L) {
            finishTask(task, false, code, message)
        } else {
            handler.postDelayed({ inspectCurrentPage() }, 1200)
        }
    }

    private fun collectText(node: AccessibilityNodeInfo): List<String> {
        val out = mutableListOf<String>()
        node.text?.toString()?.takeIf { it.isNotBlank() }?.let(out::add)
        node.contentDescription?.toString()?.takeIf { it.isNotBlank() }?.let(out::add)
        for (i in 0 until node.childCount) node.getChild(i)?.let { out.addAll(collectText(it)) }
        return out
    }

    private fun containsGate(text: String): Boolean {
        val markers = listOf("sign in", "log in", "verify it's you", "verify you are", "captcha",
            "two-step verification", "2-step verification", "quota exceeded", "limit reached",
            "not enough credits", "daily limit", "تسجيل الدخول", "تحقق من هويتك", "رمز التحقق",
            "تم استنفاد الرصيد", "تجاوز الحد", "لا توجد أرصدة كافية")
        return markers.any(text::contains)
    }

    private fun findEditor(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val candidates = mutableListOf<Pair<Int, AccessibilityNodeInfo>>()
        val promptMarkers = listOf(
            "prompt", "describe your video", "describe your scene", "your idea", "video description", "scene description",
            "what do you want to create", "what would you like to create", "write your prompt",
            "enter prompt", "type a prompt", "create a video", "اكتب وصف الفيديو", "اكتب وصف المشهد",
            "وصف المشهد", "صف الفيديو", "صف فكرتك", "وصف الفيديو", "اكتب مطالبة", "اكتب وصفك هنا"
        )
        walk(root) { node ->
            val viewId = node.viewIdResourceName.orEmpty().lowercase()
            if (viewId.contains("url_bar") || viewId.contains("omnibox") ||
                viewId.contains("search_box") || viewId.contains("address")) return@walk
            if (!node.isEditable || !node.isEnabled || !node.isVisibleToUser) return@walk
            val label = ((node.text?.toString() ?: "") + " " +
                (node.contentDescription?.toString() ?: "") + " " +
                (node.hintText?.toString() ?: "")).trim().lowercase()
            if (label.contains("search") || label.contains("google")) return@walk
            val marker = promptMarkers.any(label::contains)
            val editText = node.className?.toString()?.contains("EditText", ignoreCase = true) == true
            val score = (if (marker) 100 else 0) + (if (editText) 30 else 0) +
                (if (!node.hintText.isNullOrBlank()) 10 else 0)
            candidates.add(score to node)
        }
        val marked = candidates.filter { it.first >= 100 }.maxByOrNull { it.first }?.second
        if (marked != null) return marked
        val editTexts = candidates.filter { it.first >= 30 }
        if (editTexts.size == 1) return editTexts.single().second
        // Fail closed: never guess a generic chat/editor field. Only a field with an
        // explicit video-prompt label is eligible after the labs.google origin check.
        return null
    }

    private fun findUniqueExactClickable(
        root: AccessibilityNodeInfo,
        acceptedLabels: Set<String>
    ): AccessibilityNodeInfo? {
        val candidates = mutableListOf<AccessibilityNodeInfo>()
        walk(root) { node ->
            if (!node.isVisibleToUser || !node.isEnabled) return@walk
            val label = accessibleLabel(node).lowercase()
                .replace('_', ' ')
                .replace(Regex("\\s+"), " ")
                .trim()
            if (label !in acceptedLabels) return@walk
            val target = when {
                node.isClickable -> node
                node.parent?.isClickable == true -> node.parent
                else -> null
            } ?: return@walk
            val bounds = android.graphics.Rect().also(target::getBoundsInScreen)
            if (candidates.none { android.graphics.Rect().also(it::getBoundsInScreen) == bounds }) {
                candidates.add(target)
            }
        }
        return candidates.singleOrNull()
    }

    /**
     * Official Flow Android creation order: Orientation, output count, model, duration.
     * This bridge uses one portrait clip per request and Gemini Omni Flash 720p.
     */
    private fun flowVideoOptionControls(step: Int): Set<String> = when (step) {
        0 -> setOf("orientation", "portrait", "landscape", "9:16", "16:9")
        1 -> setOf("number of outputs", "outputs", "output count", "1 output", "2 outputs")
        2 -> setOf("model", "gemini omni flash (720p)", "gemini omni flash 720p", "veo 3.1 fast")
        3 -> setOf("generation length", "video length", "duration", "8 seconds", "8s")
        else -> emptySet()
    }

    private fun flowVideoOptionValues(step: Int): Set<String> = when (step) {
        0 -> setOf("portrait", "portrait 9:16", "9:16")
        1 -> setOf("1 output", "1 video", "one output", "1")
        2 -> setOf("gemini omni flash (720p)", "gemini omni flash 720p")
        3 -> setOf("8s", "8 s", "8 seconds", "8 sec")
        else -> emptySet()
    }

    private fun findUniqueClickableContaining(
        root: AccessibilityNodeInfo,
        acceptedFragments: Set<String>
    ): AccessibilityNodeInfo? {
        val candidates = mutableListOf<AccessibilityNodeInfo>()
        walk(root) { node ->
            if (!node.isVisibleToUser || !node.isEnabled) return@walk
            val label = accessibleLabel(node).lowercase()
                .replace('_', ' ')
                .replace(Regex("\\s+"), " ")
                .trim()
            if (acceptedFragments.none { label == it || label.contains(it) }) return@walk
            val target = when {
                node.isClickable -> node
                node.parent?.isClickable == true -> node.parent
                else -> null
            } ?: return@walk
            val bounds = android.graphics.Rect().also(target::getBoundsInScreen)
            if (candidates.none { android.graphics.Rect().also(it::getBoundsInScreen) == bounds }) {
                candidates.add(target)
            }
        }
        return candidates.singleOrNull()
    }

    private fun retryVideoOptionScan(task: JSONObject, step: Int) {
        val started = task.optLong("phase_started_at_ms", System.currentTimeMillis())
        val attempts = task.optInt("video_option_attempts_$step", 0) + 1
        task.put("video_option_attempts_$step", attempts)
        prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
        if (System.currentTimeMillis() - started > 30000L || attempts > 24) {
            val names = listOf("الاتجاه الرأسي 9:16", "مخرج واحد", "Gemini Omni Flash بدقة 720p", "مدة 8 ثوانٍ")
            finishTask(task, false, "flow_video_option_not_verified",
                "تعذر التحقق من إعداد الفيديو (" + names.getOrElse(step) { "إعداد غير معروف" } + ") في تطبيق Flow. لم يضغط الهاتف زر التوليد.")
            return
        }
        handler.postDelayed({ inspectCurrentPage() }, 900)
    }

    private fun findGeneratedPromptAsset(root: AccessibilityNodeInfo, prompt: String): AccessibilityNodeInfo? {
        val normalizedPrompt = prompt.trim().lowercase().replace(Regex("\\s+"), " ")
        // All ZOZ prompts share a generic preamble. Bind to the scene-specific visual
        // action instead, otherwise an older gallery card could match the wrong scene.
        val visualMarker = normalizedPrompt.substringAfter("visual action:", "")
            .substringBefore("exact egyptian arabic voiceover")
            .trim()
        val needle = visualMarker.take(52)
        if (needle.length < 18) return null
        val candidates = mutableListOf<AccessibilityNodeInfo>()
        walk(root) { node ->
            if (!node.isVisibleToUser || node.isEditable) return@walk
            val label = accessibleLabel(node).lowercase().replace(Regex("\\s+"), " ").trim()
            if (!label.contains(needle)) return@walk
            val target = when {
                node.isClickable -> node
                node.parent?.isClickable == true -> node.parent
                else -> null
            } ?: return@walk
            if (target.isEditable) return@walk
            val bounds = android.graphics.Rect().also(target::getBoundsInScreen)
            if (candidates.none { android.graphics.Rect().also(it::getBoundsInScreen) == bounds }) {
                candidates.add(target)
            }
        }
        return candidates.singleOrNull()
    }

    private fun retryVideoModeScan(task: JSONObject) {
        val now = System.currentTimeMillis()
        val started = task.optLong("phase_started_at_ms", task.optLong("started_at_ms", now))
        val attempts = task.optInt("video_mode_scan_attempts", 0) + 1
        task.put("video_mode_scan_attempts", attempts)
        prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
        if (now - started > 45000L) {
            finishTask(task, false, "flow_video_mode_not_found",
                "تم فتح تطبيق Google Flow الأصلي، لكن لم يتمكن الهاتف من اختيار وضع Video بشكل مؤكد. لم يتم الضغط على التوليد.")
            return
        }
        handler.postDelayed({ inspectCurrentPage() }, 1200)
    }

    private fun retryAssetScan(task: JSONObject) {
        val now = System.currentTimeMillis()
        val started = task.optLong("generation_started_at_ms", task.optLong("started_at_ms", now))
        if (now - started > 10 * 60 * 1000L) {
            finishTask(task, false, "flow_generated_asset_not_found",
                "لم يظهر في مشروع Google Flow الأصلي مقطع يمكن ربطه بوصف المشهد. لم يتم تنزيل ملف آخر أو رفعه.")
            return
        }
        handler.postDelayed({ inspectCurrentPage() }, 3000)
    }

    private fun retryAssetMenuScan(task: JSONObject) {
        val now = System.currentTimeMillis()
        val started = task.optLong("asset_selected_at_ms", task.optLong("generation_started_at_ms", now))
        if (now - started > 90000L) {
            finishTask(task, false, "flow_asset_menu_not_found",
                "تم فتح نتيجة Google Flow، لكن لم يتم العثور على قائمة خيارات تنزيل المقطع بشكل فريد.")
            return
        }
        handler.postDelayed({ inspectCurrentPage() }, 1200)
    }

    private fun beginFlowDownload(task: JSONObject, button: AccessibilityNodeInfo) {
        if (!button.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            retryAssetMenuScan(task)
            return
        }
        markFlowDownloadStarted(task)
    }

    private fun markFlowDownloadStarted(task: JSONObject) {
        val requestedAt = System.currentTimeMillis()
        task.put("download_requested_at_ms", requestedAt - 2000L)
        updatePhase(task, "download_started")
        DeviceNotifications.show(
            this,
            "بدأ تنزيل فيديو Google Flow",
            "يراقب ZOZ اكتمال ملف MP4 والتحقق من صلاحيته قبل حفظه في مركز الإنتاج."
        )
        lastActionAt = requestedAt
        handler.postDelayed({ pollFlowDownloadsFolder(task) }, 1800)
    }

    private fun pollFlowDownloadsFolder(task: JSONObject) {
        val jobId = task.optString("job_id")
        if (activeTask()?.optString("job_id") != jobId) return
        val startedAt = task.optLong("download_requested_at_ms", System.currentTimeMillis())
        networkExecutor.execute {
            val found = runCatching {
                if (!isDownloadsAutoAccessGranted()) throw IllegalStateException("downloads_permission_required")
                val filter = JSONObject()
                    .put("file_kind", "video")
                    .put("extensions", JSONArray().put("mp4"))
                    .put("after_timestamp_ms", startedAt)
                    .put("min_size_bytes", 10240L)
                    .put("max_size_bytes", 850L * 1024L * 1024L)
                val file = findLocalDownloadForAgent(filter)
                val firstSize = file.length()
                val firstModified = file.lastModified()
                Thread.sleep(2500L)
                if (!file.exists() || file.length() != firstSize || file.lastModified() != firstModified) return@runCatching null
                val isMp4 = FileInputStream(file).use { input ->
                    val header = ByteArray(12)
                    val count = input.read(header)
                    count >= 8 && String(header, 4, 4, Charsets.US_ASCII) == "ftyp"
                }
                if (!isMp4) throw IllegalStateException("flow_download_not_mp4")
                file
            }.getOrNull()
            handler.post {
                if (activeTask()?.optString("job_id") != jobId) return@post
                if (found != null) {
                    val checksum = runCatching { sha256LocalFile(found) }.getOrDefault("")
                    val uri = Uri.fromFile(found)
                    appendClip(uri, found.name, found.length(), task.optInt("scene_index", 1), task.optString("campaign_id"))
                    val result = JSONObject()
                        .put("downloaded", true)
                        .put("source_app_package", FLOW_APP_PACKAGE)
                        .put("uri", uri.toString())
                        .put("name", found.name)
                        .put("size_bytes", found.length())
                        .put("sha256", checksum)
                        .put("scene_index", task.optInt("scene_index", 1))
                    finishTask(task, true, "", "", result)
                } else if (System.currentTimeMillis() - startedAt > 8 * 60 * 1000L) {
                    finishTask(task, false, "flow_download_not_detected",
                        "لم يظهر ملف MP4 جديد ومكتمل في Downloads بعد التنزيل من تطبيق Google Flow الأصلي.")
                } else {
                    handler.postDelayed({ pollFlowDownloadsFolder(task) }, 3500)
                }
            }
        }
    }

    private fun retryFlowOriginScan(task: JSONObject) {
        val now = System.currentTimeMillis()
        val phaseStarted = task.optLong("phase_started_at_ms", task.optLong("started_at_ms", now))
        val attempts = task.optInt("origin_scan_attempts", 0) + 1
        task.put("origin_scan_attempts", attempts)
        prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
        if (now - phaseStarted > 60000L) {
            val windowRootPackages = JSONArray()
            runCatching {
                windows.forEach { window ->
                    val name = window.root?.packageName?.toString().orEmpty()
                    if (name.isNotBlank()) windowRootPackages.put(name)
                }
            }
            val activeRootPackage = runCatching {
                rootInActiveWindow?.packageName?.toString().orEmpty()
            }.getOrDefault("")
            val evidence = JSONObject()
                .put("expected_native_package", FLOW_APP_PACKAGE)
                .put("native_app_installed", packageManager.getLaunchIntentForPackage(FLOW_APP_PACKAGE) != null)
                .put("active_root_package", activeRootPackage)
                .put("last_accessibility_event_package", lastAccessibilityEventPackage)
                .put("last_accessibility_event_type", lastAccessibilityEventType)
                .put("last_accessibility_event_age_ms", if (lastAccessibilityEventAtMs > 0L) now - lastAccessibilityEventAtMs else -1L)
                .put("last_flow_event_source_available", lastFlowEventSource != null &&
                    lastFlowEventSourceAtMs > 0L && now - lastFlowEventSourceAtMs <= 6000L)
                .put("last_flow_event_source_class", lastFlowEventSourceClass)
                .put("last_flow_event_source_view_id", lastFlowEventSourceViewId)
                .put("last_flow_event_source_age_ms", if (lastFlowEventSourceAtMs > 0L) now - lastFlowEventSourceAtMs else -1L)
                .put("screen_locked", runCatching {
                    (getSystemService(android.content.Context.KEYGUARD_SERVICE) as? android.app.KeyguardManager)?.isKeyguardLocked == true
                }.getOrDefault(false))
                .put("window_root_packages", windowRootPackages)
            finishTask(task, false, "manual_intervention_required",
                "تطبيق Google Flow الرسمي موجود، لكن خدمة إمكانية الوصول لم تتمكن من قراءة شجرة نافذته خلال 60 ثانية. لم يتم إدخال النص أو الضغط على Generate. سُجلت بيانات النوافذ لتحديد سبب تعذر الوصول.",
                evidence)
            return
        }
        clearScheduledAutomationCallbacks()
        handler.postDelayed({ inspectCurrentPage() }, 1600)
    }

    private fun retryEditorScan(task: JSONObject) {
        val now = System.currentTimeMillis()
        val phaseStarted = task.optLong("phase_started_at_ms", task.optLong("started_at_ms", now))
        val attempts = task.optInt("editor_scan_attempts", 0) + 1
        task.put("editor_scan_attempts", attempts)
        prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
        if (now - phaseStarted > 60000L) {
            finishTask(task, false, "flow_editor_not_found",
                "وصل الهاتف إلى Google Flow، لكن لم يظهر حقل إدخال قابل للوصول خلال 60 ثانية. تم إيقاف المهمة دون الضغط على توليد.")
            return
        }
        clearScheduledAutomationCallbacks()
        handler.postDelayed({ inspectCurrentPage() }, 1200)
    }

    private fun findNewProjectButton(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var found: AccessibilityNodeInfo? = null
        walk(root) { node ->
            if (found != null) return@walk
            val label = ((node.text?.toString() ?: "") + " " +
                (node.contentDescription?.toString() ?: "")).trim().lowercase()
            val clickable = node.isClickable || node.parent?.isClickable == true
            val explicitPlus = label == "+" || label == "plus" || label == "add"
            val newProject = listOf("new project", "create project", "create new project",
                "start a project", "new video", "مشروع جديد", "إنشاء مشروع", "فيديو جديد").any(label::contains)
            if (clickable && (explicitPlus || newProject)) {
                found = if (node.isClickable) node else node.parent
            }
        }
        return found
    }

    private fun retrySendScan(task: JSONObject) {
        val now = System.currentTimeMillis()
        val phaseStarted = task.optLong("phase_started_at_ms", now)
        val attempts = task.optInt("send_scan_attempts", 0) + 1
        task.put("send_scan_attempts", attempts)
        prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
        if (now - phaseStarted > 45000L) {
            finishTask(task, false, "flow_generate_button_not_found",
                "تم لصق وصف المشهد في Google Flow، لكن لم يظهر زر إرسال/توليد واضح وفريد خلال 45 ثانية؛ لم يضغط التطبيق أي زر غير مؤكد.")
            return
        }
        clearScheduledAutomationCallbacks()
        handler.postDelayed({ inspectCurrentPage() }, 1200)
    }

    private fun accessibleLabel(node: AccessibilityNodeInfo): String {
        val text = node.text?.toString()?.trim().orEmpty()
        val description = node.contentDescription?.toString()?.trim().orEmpty()
        val parts = listOf(text, description).filter { it.isNotBlank() }.distinct()
        return parts.joinToString(" ").replace(Regex("\\s+"), " ").trim()
    }

    private fun findGenerateButton(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val acceptedLabels = setOf(
            "generate", "generate video", "generate image", "create video", "create clip",
            "generate image video", "send", "send prompt", "send arrow", "arrow up", "arrow upward",
            "submit", "submit prompt", "توليد", "إنشاء", "إنشاء فيديو", "إرسال", "إرسال للتوليد"
        )
        val candidates = mutableListOf<AccessibilityNodeInfo>()
        walk(root) { node ->
            if (!node.isVisibleToUser || !node.isEnabled) return@walk
            val label = accessibleLabel(node).lowercase()
                .replace('_', ' ')
                .replace(Regex("\\s+"), " ")
                .trim()
            if (label !in acceptedLabels) return@walk
            val target = when {
                node.isClickable -> node
                node.parent?.isClickable == true -> node.parent
                else -> null
            } ?: return@walk
            val bounds = android.graphics.Rect().also(target::getBoundsInScreen)
            val duplicate = candidates.any { existing ->
                android.graphics.Rect().also(existing::getBoundsInScreen) == bounds
            }
            if (!duplicate) candidates.add(target)
        }
        // Require one and only one recognized action. Ambiguity stops safely.
        return candidates.singleOrNull()
    }

    private fun findButton(root: AccessibilityNodeInfo, labels: Set<String>): AccessibilityNodeInfo? {
        val matches = mutableListOf<AccessibilityNodeInfo>()
        walk(root) { node ->
            if (!node.isVisibleToUser || !node.isEnabled) return@walk
            val label = accessibleLabel(node).lowercase()
            val target = when {
                node.isClickable -> node
                node.parent?.isClickable == true -> node.parent
                else -> null
            } ?: return@walk
            if (labels.any { label == it || (it.length >= 5 && label.contains(it)) }) {
                val bounds = android.graphics.Rect().also(target::getBoundsInScreen)
                if (matches.none { android.graphics.Rect().also(it::getBoundsInScreen) == bounds }) matches.add(target)
            }
        }
        // Never guess between several Download actions, e.g. a list of previous assets.
        return matches.singleOrNull()
    }

    private fun walk(node: AccessibilityNodeInfo, visit: (AccessibilityNodeInfo) -> Unit) {
        visit(node)
        for (i in 0 until node.childCount) node.getChild(i)?.let { walk(it, visit) }
    }

    private fun updatePhase(task: JSONObject, phase: String) {
        task.put("phase", phase)
        task.put("phase_started_at_ms", System.currentTimeMillis())
        prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
    }

    private fun handleDownload(downloadId: Long) {
        val task = activeTask() ?: return
        if (task.optString("phase") != "download_started") return
        val manager = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
        val query = DownloadManager.Query().setFilterById(downloadId)
        manager.query(query).use { cursor ->
            if (!cursor.moveToFirst()) return
            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                if (status == DownloadManager.STATUS_FAILED) {
                    finishTask(task, false, "flow_download_failed", "Google Flow download failed. Check Flow and retry this scene.")
                }
                return
            }
            val uri = manager.getUriForDownloadedFile(downloadId) ?: run {
                finishTask(task, false, "download_uri_missing", "Download completed but Android did not expose a readable file URI.")
                return
            }
            val validMp4 = runCatching {
                contentResolver.openInputStream(uri)?.use { input ->
                    val header = ByteArray(12)
                    val count = input.read(header)
                    count >= 8 && String(header, 4, 4, Charsets.US_ASCII) == "ftyp"
                } ?: false
            }.getOrDefault(false)
            if (!validMp4) {
                finishTask(task, false, "flow_download_not_mp4", "الملف الذي أعاده تنزيل Flow ليس ملف MP4 صالحًا؛ لم يتم تسجيل نجاح المهمة.")
                return
            }
            val name = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TITLE)) ?: "flow-scene-${task.optInt("scene_index", 1)}.mp4"
            val size = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)).coerceAtLeast(0L)
            appendClip(uri, name, size, task.optInt("scene_index", 1), task.optString("campaign_id"))
            val result = JSONObject().put("downloaded", true).put("uri", uri.toString()).put("name", name)
                .put("size_bytes", size).put("scene_index", task.optInt("scene_index", 1))
            finishTask(task, true, "", "", result)
        }
    }

    private fun appendClip(uri: Uri, name: String, size: Long, sceneIndex: Int, campaignId: String) {
        val raw = prefs().getString(FlowAutomationService.PREF_CLIPS, "[]") ?: "[]"
        val arr = JSONArray(raw)
        val item = JSONObject().put("uri", uri.toString()).put("name", name)
            .put("size", size).put("scene_index", sceneIndex).put("campaign_id", campaignId)
        var exists = false
        for (i in 0 until arr.length()) if (arr.optJSONObject(i)?.optString("uri") == uri.toString()) exists = true
        if (!exists) arr.put(item)
        prefs().edit().putString(FlowAutomationService.PREF_CLIPS, arr.toString()).apply()
    }

    private fun finishTask(task: JSONObject, success: Boolean, code: String, message: String, extra: JSONObject = JSONObject()) {
        val id = task.optString("job_id")
        if (id.isBlank() || activeTask()?.optString("job_id") != id) return
        val result = JSONObject(extra.toString()).put("phase", task.optString("phase"))
        prefs().edit().remove(KEY_ACTIVE_TASK).apply()
        networkExecutor.execute {
            runCatching {
                apiPostWithToken("complete_job", JSONObject().put("job_id", id)
                    .put("outcome", if (success) "succeeded" else if (code in setOf("manual_intervention_required", "stale_legacy_task")) "cancelled" else "failed")
                    .put("error_code", code).put("error_message", message).put("result", result),
                    DeviceTokenVault.read(this) ?: "")
            }
            handler.post {
                val diagnostic = task.optString("task_type") == "flow_control_diagnostic"
                if (diagnostic) {
                    DeviceNotifications.show(
                        this,
                        if (success) "نجح اختبار التحكم في Google Flow" else "تعذر اختبار التحكم في Google Flow",
                        if (success && result.optBoolean("prompt_entry_verified", false))
                            "كتب ZOZ نص الاختبار داخل حقل Flow وتحقق من ظهوره. تم فحص زر الإرسال دون الضغط عليه أو استهلاك رصيد."
                        else if (success) "وصل ZOZ إلى تطبيق Flow الأصلي واختبر وضع الفيديو دون بدء توليد."
                        else message
                    )
                } else {
                    DeviceNotifications.show(this, if (success) "اكتمل مشهد Flow" else "توقف تنفيذ مشهد Flow",
                        if (success) "تم تنزيل المقطع وتسجيل نتيجة المهمة." else message)
                }
                val total = task.optInt("total_scenes", 0)
                val index = task.optInt("scene_index", 0)
                if (success && !diagnostic && total > 0 && index >= total &&
                    !task.optBoolean("save_only", true)) {
                    handler.postDelayed({ assembleAndUpload(task.optString("campaign_id"), total, task.optString("channel_id")) }, 800)
                } else {
                    scheduleAgentPoll(1200L)
                }
            }
        }
    }

    private fun assembleAndUpload(campaignId: String, expectedScenes: Int, channelId: String) {
        networkExecutor.execute {
            try {
                val arr = JSONArray(prefs().getString(PREF_CLIPS, "[]") ?: "[]")
                val entries = mutableListOf<Pair<Int, ImportedClip>>()
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    val uri = Uri.parse(o.optString("uri"))
                    val index = o.optInt("scene_index", i + 1)
                    if (o.optString("campaign_id") == campaignId) {
                        entries.add(index to ImportedClip(uri, o.optString("name", "scene-$index.mp4"), o.optLong("size")))
                    }
                }
                val uniqueIndexes = entries.map { it.first }.distinct()
                if (uniqueIndexes.size != expectedScenes || uniqueIndexes.sorted() != (1..expectedScenes).toList()) {
                    throw IllegalStateException("لم تصل كل مشاهد الحملة بترتيبها؛ وصل ${uniqueIndexes.size} من $expectedScenes.")
                }
                val ordered = entries.sortedBy { it.first }.map { it.second }
                if (ordered.size < 2) throw IllegalStateException("At least two downloaded scenes are required.")
                val output = File(getExternalFilesDir(null), "ZOZ-final-${System.currentTimeMillis()}.mp4")
                assembleCompatibleClips(this, ordered, Uri.fromFile(output))
                val deviceToken = DeviceTokenVault.read(this) ?: throw IllegalStateException("الجهاز غير مرتبط بالوكيل.")
                // Intake tokens are channel-bound; refresh only when this campaign changes destination.
                val intakePrefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val savedIntakeChannel = intakePrefs.getString("zoz_intake_channel_id", "") ?: ""
                val savedIntakeToken = DeviceTokenVault.readIntake(this)
                if (savedIntakeChannel != channelId || savedIntakeToken.isNullOrBlank() || savedIntakeToken.length < 32) {
                    val tokenResponse = apiPostWithToken("device_intake_token",
                        JSONObject().put("channel_id", channelId), deviceToken)
                    val freshIntakeToken = tokenResponse.optString("intake_token")
                    if (freshIntakeToken.length < 32) throw IllegalStateException("الخادم لم يصدر رمز استقبال صالحًا للقناة المطلوبة.")
                    DeviceTokenVault.writeIntake(this, freshIntakeToken)
                    intakePrefs.edit().putString("zoz_intake_channel_id", channelId).apply()
                }
                val uploadMessage = uploadFinalVideoToIntake(this, Uri.fromFile(output), true, false, channelId)
                val assetId = prefs().getString("zoz_last_uploaded_asset_id", "") ?: ""
                if (assetId.isBlank()) throw IllegalStateException("اكتمل الرفع لكن لم يُسجل معرّف ملف الاستقبال.")
                apiPostWithToken("production_intake_complete",
                    JSONObject().put("proposal_id", campaignId).put("asset_id", assetId).put("channel_id", channelId),
                    DeviceTokenVault.read(this) ?: "")
                handler.post { DeviceNotifications.show(this, "وصل الفيديو إلى ZOZ", uploadMessage) }
            } catch (e: Exception) {
                handler.post { DeviceNotifications.show(this, "تجميع الفيديو يحتاج مراجعة", e.message ?: "تعذر التجميع أو الرفع التلقائي.") }
            }
        }
    }

    companion object {
        @Volatile private var activeService: FlowAutomationService? = null
        const val PREFS = "zoz_flow_bridge"
        const val PREF_CLIPS = "saved_clips"
        const val KEY_ACTIVE_TASK = "flow_active_scene_task"
        const val KEY_ACTIVE_CONTROL_TASK = "phone_control_task"
        const val KEY_ACTIVE_VOICEOVER_JOB = "voiceover_merge_task"

        fun isEnabled(context: Context): Boolean {
            val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return enabled.split(':').any { raw ->
                val component = android.content.ComponentName.unflattenFromString(raw)
                component?.packageName == context.packageName && component.className == FlowAutomationService::class.java.name
            }
        }

        fun startUiControl(context: Context, jobId: String, payload: JSONObject) {
            if (!isEnabled(context)) throw IllegalStateException("خدمة الوصول غير مفعلة على الهاتف.")
            val target = payload.optString("target_package", "").trim()
            if (target !in ZOZ_CONTROL_PACKAGES) throw IllegalArgumentException("target_package_not_allowed")
            val steps = payload.optJSONArray("steps") ?: throw IllegalArgumentException("control_steps_missing")
            if (steps.length() !in 1..30) throw IllegalArgumentException("control_steps_limit")
            val allowed = setOf("inspect", "read_screen", "tap", "type_text", "scroll", "wait", "back")
            for (i in 0 until steps.length()) {
                val step = steps.optJSONObject(i) ?: throw IllegalArgumentException("control_step_invalid")
                val action = step.optString("action")
                if (action !in allowed) throw IllegalArgumentException("unsupported_ui_action")
                if (step.optString("text").length > 3000) throw IllegalArgumentException("ui_text_invalid")
                if (action == "type_text" &&
                    (target !in ZOZ_REGULAR_SOCIAL_PACKAGES && target !in ZOZ_STUDIO_PACKAGES ||
                     step.optString("input_purpose").lowercase() !in ZOZ_TEXT_PURPOSES ||
                     step.optString("text").isBlank() ||
                     containsSensitiveWorkValue(step.optString("text")))) {
                    throw IllegalArgumentException("sensitive_or_nonbusiness_text_blocked")
                }
                if (action == "read_screen" && target !in ZOZ_CONTROL_PACKAGES) {
                    throw IllegalArgumentException("read_screen_target_not_allowlisted")
                }
                if (target in ZOZ_STUDIO_PACKAGES &&
                    action !in setOf("inspect", "read_screen", "tap", "scroll", "wait", "back", "type_text")) {
                    throw IllegalArgumentException("unsupported_studio_action")
                }
                if (target in ZOZ_REGULAR_SOCIAL_PACKAGES && action == "type_text" &&
                    (step.optString("input_purpose").lowercase() !in ZOZ_TEXT_PURPOSES ||
                     containsSensitiveWorkValue(step.optString("text")))) {
                    throw IllegalArgumentException("sensitive_or_nonbusiness_text_blocked")
                }
            }
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (prefs.getString(KEY_ACTIVE_TASK, null) != null || prefs.getString(KEY_ACTIVE_CONTROL_TASK, null) != null) {
                throw IllegalStateException("هناك أمر آخر قيد التنفيذ على الهاتف.")
            }
            val now = System.currentTimeMillis()
            val task = JSONObject(payload.toString())
                .put("job_id", jobId)
                .put("created_at_ms", now)
                .put("step_index", 0)
                .put("step_results", JSONArray())
            prefs.edit().putString(KEY_ACTIVE_CONTROL_TASK, task.toString()).apply()
            val service = activeService
            if (service != null) service.handler.post { service.scheduleControlInspection(300) }
            val currentPackage = service?.rootInActiveWindow?.packageName?.toString().orEmpty()
            if (currentPackage != target) {
                val launch = context.packageManager.getLaunchIntentForPackage(target)
                if (launch != null) {
                    runCatching { context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                        .onFailure { DeviceNotifications.show(context, "أمر تحكم بانتظار التطبيق", "تعذر فتح التطبيق من الخلفية؛ افتحه ليكمل الوكيل المهمة.") }
                } else {
                    DeviceNotifications.show(context, "التطبيق غير مثبت", "لم يعثر الهاتف على التطبيق المطلوب.")
                }
            }
        }

        fun startScene(context: Context, jobId: String, payload: JSONObject) {
            if (!isEnabled(context)) throw IllegalStateException("فعّل خدمة ZOZ Flow Automation مرة واحدة من إعدادات إمكانية الوصول.")
            val diagnostic = payload.optString("task_type") == "flow_control_diagnostic"
            val duration = payload.optDouble("duration_seconds", 8.0)
            if (!diagnostic && (duration <= 0.0 || duration > 8.0)) {
                throw IllegalArgumentException("كل مشهد Google Flow يجب ألا يتجاوز 8 ثوانٍ.")
            }
            val index = payload.optInt("scene_index", 0)
            val total = payload.optInt("total_scenes", payload.optInt("scene_count", 0))
            val campaign = payload.optString("campaign_id", payload.optString("proposal_id", ""))
            val prompt = payload.optString("prompt", "")
            if (!diagnostic && (index < 1 || total < 1 || index > total || campaign.isBlank() || prompt.isBlank())) {
                throw IllegalArgumentException("بيانات المشهد أو الحملة غير مكتملة.")
            }
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (prefs.getString(KEY_ACTIVE_TASK, null) != null) throw IllegalStateException("هناك مشهد آخر قيد التنفيذ على الهاتف.")
            if (!diagnostic && index == 1) prefs.edit().putString(PREF_CLIPS, "[]").apply()
            val startedAt = System.currentTimeMillis()
            val launchIntent = context.packageManager.getLaunchIntentForPackage(FLOW_APP_PACKAGE)
                ?: throw IllegalStateException(
                    "google_flow_app_not_installed: ثبّت تطبيق Google Flow الرسمي من Google Play على الهاتف ثم أعد المحاولة. لن يتم استخدام Chrome كبديل."
                )
            val task = JSONObject(payload.toString())
                .put("campaign_id", campaign)
                .put("total_scenes", total)
                .put("job_id", jobId)
                .put("phase", if (diagnostic) "diagnostic_waiting_editor" else "waiting_editor")
                .put("task_type", if (diagnostic) "flow_control_diagnostic" else payload.optString("task_type", "scene_generation"))
                .put("started_at_ms", startedAt)
                .put("phase_started_at_ms", startedAt)
                .put("flow_origin_guard_version", 3)
                .put("flow_target_package", FLOW_APP_PACKAGE)
                .put("editor_scan_attempts", 0)
                .put("video_mode_selected", false)
                .put("flow_account_email", payload.optString("flow_account_email",
                    prefs.getString("flow_selected_account", "") ?: "").trim())
                .put("save_only", payload.optBoolean("save_only", true))
            prefs.edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
            DeviceNotifications.show(
                context,
                if (diagnostic) "بدأ فحص التحكم في Google Flow" else "بدأ تنفيذ مشهد Google Flow",
                if (diagnostic) "يفتح ZOZ التطبيق الأصلي ويفحص إمكانية الوصول إلى المحرر دون بدء توليد أو استهلاك رصيد."
                else "يفتح ZOZ تطبيق Flow الأصلي ويجهز وضع الفيديو والوصف. لن يبدأ التوليد قبل التحقق من إدخال النص وزر Generate."
            )
            val runningService = activeService
            if (runningService != null && runningService.isFlowInForeground()) {
                runningService.handler.postDelayed({ runningService.inspectCurrentPage() }, 250)
            } else {
                try {
                    context.startActivity(launchIntent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    ))
                } catch (error: Exception) {
                    prefs.edit().remove(KEY_ACTIVE_TASK).apply()
                    throw IllegalStateException("flow_native_launch_failed: تعذر فتح تطبيق Google Flow الأصلي: ${error.message}")
                }
            }
            runningService?.scheduleAgentPoll(1200L)
        }
    }
}
