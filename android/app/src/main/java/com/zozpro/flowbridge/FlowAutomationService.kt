package com.zozpro.flowbridge

import android.accessibilityservice.AccessibilityService
import android.app.DownloadManager
import android.content.BroadcastReceiver
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
import androidx.work.WorkManager
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/**
 * User-enabled, visible UI automation for Google Flow.
 * It never handles passwords, CAPTCHA, MFA, or account selection.
 * Unknown layouts stop safely and report the task for owner intervention.
 */
class FlowAutomationService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private var lastActionAt = 0L
    private var receiverRegistered = false
    private val networkExecutor = Executors.newSingleThreadExecutor()

    private fun isFlowInForeground(): Boolean {
        val pkg = rootInActiveWindow?.packageName?.toString().orEmpty()
        return pkg == "com.android.chrome" || pkg == "com.google.android.googlequicksearchbox"
    }

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
            androidx.core.content.ContextCompat.registerReceiver(
                this, downloadReceiver, filter, androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED
            )
            receiverRegistered = true
        }
        val legacyTask = activeTask()
        if (legacyTask != null && legacyTask.optLong("started_at_ms", 0L) <= 0L) {
            finishTask(legacyTask, false, "stale_legacy_task",
                "تم إيقاف مهمة قديمة لم تُدخل وصف المشهد؛ أُعيد تجهيز الهاتف للمهمة الجديدة.")
        } else {
            handler.postDelayed({ inspectCurrentPage() }, 1200)
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val active = activeTask() ?: return
        val pkg = event?.packageName?.toString().orEmpty()
        if (pkg.isNotBlank() && pkg !in setOf("com.android.chrome", "com.google.android.googlequicksearchbox")) return
        if (event?.eventType in listOf(
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
                AccessibilityEvent.TYPE_VIEW_SCROLLED
            )) {
            handler.removeCallbacksAndMessages(null)
            handler.postDelayed({ inspectCurrentPage() }, 700)
        }
    }

    override fun onInterrupt() {
        // Keep the task lease; the next service connection may resume safely.
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        if (receiverRegistered) runCatching { unregisterReceiver(downloadReceiver) }
        if (activeService === this) activeService = null
        super.onDestroy()
    }

    private fun prefs() = getSharedPreferences(FlowAutomationService.PREFS, Context.MODE_PRIVATE)
    private fun activeTask(): JSONObject? = runCatching {
        prefs().getString(KEY_ACTIVE_TASK, null)?.let(::JSONObject)
    }.getOrNull()

    private fun inspectCurrentPage() {
        val task = activeTask() ?: return
        val phase = task.optString("phase", "waiting_editor")
        val root = rootInActiveWindow
        if (root == null) {
            if (phase == "waiting_editor") retryEditorScan(task)
            return
        }
        val allText = collectText(root).joinToString(" ").lowercase()
        if (containsGate(allText)) {
            finishTask(task, false, "manual_intervention_required",
                "Google Flow requested sign-in, verification, CAPTCHA, or account confirmation. The automation stopped without interacting with the security challenge.")
            return
        }
        when (phase) {
            "waiting_editor" -> {
                val editor = findEditor(root)
                if (editor != null && System.currentTimeMillis() - lastActionAt > 1800) {
                    val prompt = task.optString("prompt", "").take(12000)
                    if (prompt.isBlank()) {
                        finishTask(task, false, "prompt_empty", "The scene prompt is empty.")
                        return
                    }
                    val args = android.os.Bundle().apply {
                        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, prompt)
                    }
                    editor.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                    val set = editor.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                    if (set) {
                        updatePhase(task, "waiting_generate")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 1300)
                    } else {
                        retryEditorScan(task)
                    }
                } else {
                    if (!task.optBoolean("flow_setup_clicked", false)) {
                        val setup = findButton(root, setOf(
                            "new project", "create new project", "start new project", "new video",
                            "create a video", "text to video", "describe your idea", "describe your video",
                            "what would you like to create", "مشروع جديد", "إنشاء مشروع", "فيديو جديد",
                            "وصف الفيديو", "صف فكرتك"
                        ))
                        if (setup != null && setup.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                            task.put("flow_setup_clicked", true)
                            prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
                            lastActionAt = System.currentTimeMillis()
                        }
                    }
                    retryEditorScan(task)
                }
            }
            "waiting_generate" -> {
                val button = findButton(root, setOf("generate", "generate video", "create video", "توليد", "إنشاء فيديو"))
                if (button != null && System.currentTimeMillis() - lastActionAt > 1800) {
                    if (button.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        updatePhase(task, "waiting_download")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 5000)
                    }
                }
            }
            "waiting_download" -> {
                val download = findButton(root, setOf("download", "download video", "تنزيل", "تحميل الفيديو"))
                if (download != null && System.currentTimeMillis() - lastActionAt > 5000) {
                    if (download.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        updatePhase(task, "download_started")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 2500)
                    }
                } else {
                    handler.postDelayed({ inspectCurrentPage() }, 4000)
                }
            }
            "download_started" -> handler.postDelayed({ inspectCurrentPage() }, 4000)
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
            "prompt", "describe", "your idea", "video description", "scene description",
            "what do you want to create", "what would you like to create", "write your prompt",
            "enter prompt", "type a prompt", "create a video", "اكتب وصف", "وصف المشهد",
            "صف الفيديو", "صف فكرتك", "وصف الفيديو", "اكتب مطالبة"
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
        if (candidates.size == 1) {
            val pageText = collectText(root).joinToString(" ").lowercase()
            val flowContext = listOf("flow", "video", "generate", "create", "scene", "فيديو", "إنشاء")
                .any(pageText::contains)
            if (flowContext) return candidates.single().second
        }
        return null
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
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ inspectCurrentPage() }, 1200)
    }

    private fun findButton(root: AccessibilityNodeInfo, labels: Set<String>): AccessibilityNodeInfo? {
        var found: AccessibilityNodeInfo? = null
        walk(root) { node ->
            if (found != null) return@walk
            val label = ((node.text?.toString() ?: "") + " " + (node.contentDescription?.toString() ?: "")).trim().lowercase()
            val clickable = node.isClickable || node.parent?.isClickable == true
            if (clickable && labels.any { label == it || (it.length >= 8 && label.contains(it)) }) {
                found = if (node.isClickable) node else node.parent
            }
        }
        return found
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
                DeviceNotifications.show(this, if (success) "اكتمل مشهد Flow" else "توقف تنفيذ مشهد Flow",
                    if (success) "تم تنزيل المقطع وتسجيل نتيجة المهمة." else message)
                val total = task.optInt("total_scenes", 0)
                val index = task.optInt("scene_index", 0)
                if (success && total > 0 && index >= total) {
                    handler.postDelayed({ assembleAndUpload(task.optString("campaign_id"), total, task.optString("channel_id")) }, 800)
                } else if (success) {
                    handler.postDelayed({
                        WorkManager.getInstance(this).enqueueUniqueWork("zoz-device-next-scene",
                            ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<DevicePollWorker>().build())
                    }, 1200)
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

        fun isEnabled(context: Context): Boolean {
            val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return enabled.split(':').any { raw ->
                val component = android.content.ComponentName.unflattenFromString(raw)
                component?.packageName == context.packageName && component.className == FlowAutomationService::class.java.name
            }
        }

        fun startScene(context: Context, jobId: String, payload: JSONObject) {
            if (!isEnabled(context)) throw IllegalStateException("فعّل خدمة ZOZ Flow Automation مرة واحدة من إعدادات إمكانية الوصول.")
            val duration = payload.optDouble("duration_seconds", 8.0)
            if (duration <= 0.0 || duration > 8.0) throw IllegalArgumentException("كل مشهد Google Flow يجب ألا يتجاوز 8 ثوانٍ.")
            val index = payload.optInt("scene_index", 0)
            val total = payload.optInt("total_scenes", payload.optInt("scene_count", 0))
            val campaign = payload.optString("campaign_id", payload.optString("proposal_id", ""))
            val prompt = payload.optString("prompt", "")
            if (index < 1 || total < 1 || index > total || campaign.isBlank() || prompt.isBlank()) {
                throw IllegalArgumentException("بيانات المشهد أو الحملة غير مكتملة.")
            }
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (prefs.getString(KEY_ACTIVE_TASK, null) != null) throw IllegalStateException("هناك مشهد آخر قيد التنفيذ على الهاتف.")
            if (index == 1) prefs.edit().putString(PREF_CLIPS, "[]").apply()
            val startedAt = System.currentTimeMillis()
            val task = JSONObject(payload.toString())
                .put("campaign_id", campaign)
                .put("total_scenes", total)
                .put("job_id", jobId)
                .put("phase", "waiting_editor")
                .put("started_at_ms", startedAt)
                .put("phase_started_at_ms", startedAt)
                .put("editor_scan_attempts", 0)
            prefs.edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
            val url = payload.optString("url", "https://labs.google/fx/tools/flow")
            if (!url.startsWith("https://labs.google/")) {
                prefs.edit().remove(KEY_ACTIVE_TASK).apply()
                throw IllegalArgumentException("Flow URL is not allow-listed.")
            }
            val runningService = activeService
            if (runningService != null && runningService.isFlowInForeground()) {
                runningService.handler.postDelayed({ runningService.inspectCurrentPage() }, 250)
            } else {
                try {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (_: Exception) {
                    // Android may block background activity launches. Keep the leased job and let the owner
                    // open Flow from this notification; the accessibility service resumes the saved task.
                    DeviceNotifications.showFlow(context, url)
                }
            }
        }
    }
}
