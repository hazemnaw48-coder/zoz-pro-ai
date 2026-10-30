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
import androidx.work.WorkManager
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

private val ZOZ_CONTROL_PACKAGES = setOf(
    "com.android.chrome",
    "com.google.android.googlequicksearchbox",
    "com.google.android.youtube",
    "com.google.android.apps.youtube.creator"
)

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
    private val networkExecutor = Executors.newSingleThreadExecutor()

    private fun browserAddressBarText(root: AccessibilityNodeInfo): String? {
        var address: String? = null
        walk(root) { node ->
            val id = node.viewIdResourceName.orEmpty().lowercase()
            if (id.contains("url_bar") || id.contains("omnibox")) {
                val candidate = listOf(
                    node.text?.toString(),
                    node.contentDescription?.toString(),
                    node.hintText?.toString()
                ).firstOrNull { !it.isNullOrBlank() }?.trim()
                if (!candidate.isNullOrBlank()) address = candidate
            }
        }
        return address
    }

    private fun isVerifiedFlowPage(root: AccessibilityNodeInfo): Boolean {
        val pkg = root.packageName?.toString().orEmpty()
        if (pkg !in setOf("com.android.chrome", "com.google.android.googlequicksearchbox")) return false
        val address = browserAddressBarText(root)?.lowercase()
        if (address != null) {
            val normalized = address.removePrefix("https://").removePrefix("http://")
                .removePrefix("www.").substringBefore(' ')
            val host = normalized.substringBefore('/').substringBefore(':').trim()
            if (host == "labs.google") return true
            if (host.contains('.')) return false
        }
        val task = activeTask() ?: return false
        val launchedAt = task.optLong("flow_launch_requested_at_ms", 0L)
        val age = System.currentTimeMillis() - launchedAt
        if (launchedAt <= 0L || age < 0L || age > 300000L) return false
        if (!task.optString("url", "").startsWith("https://labs.google/fx/tools/flow")) return false
        val pageText = collectText(root).joinToString(" ").lowercase()
        val hasFlowBrand = pageText.contains("flow") || pageText.contains("labs.google")
        val hasEditorControl = listOf("new project", "create project", "describe your idea", "generate video", "scene", "prompt").any(pageText::contains)
        return hasFlowBrand && hasEditorControl
    }

    private fun isFlowInForeground(): Boolean {
        val root = rootInActiveWindow ?: return false
        return isVerifiedFlowPage(root)
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
        val control = activeControlTask()
        if (control != null) {
            scheduleControlInspection(900)
            return
        }
        val legacyTask = activeTask()
        if (legacyTask != null) {
            val isGuardedTask = legacyTask.optInt("flow_origin_guard_version", 0) >= 2
            val ageMs = System.currentTimeMillis() - legacyTask.optLong("started_at_ms", 0L)
            if (!isGuardedTask || ageMs <= 0L || ageMs > 30L * 60L * 1000L) {
                finishTask(legacyTask, false, "manual_intervention_required",
                    "أُوقفت المهمة القديمة قبل إعادة المحاولة؛ يجب أن تبدأ المهمة من جديد بنص عربي وحماية التحقق من صفحة Google Flow.")
            } else {
                handler.postDelayed({ inspectCurrentPage() }, 1200)
            }
        } else {
            handler.postDelayed({ inspectCurrentPage() }, 1200)
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val control = activeControlTask()
        if (control != null) {
            val pkg = event?.packageName?.toString().orEmpty()
            if (pkg.isNotBlank() && pkg != control.optString("target_package")) return
            if (event?.eventType in listOf(
                    AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
                    AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
                    AccessibilityEvent.TYPE_VIEW_SCROLLED,
                    AccessibilityEvent.TYPE_VIEW_FOCUSED
                )) scheduleControlInspection(350)
            return
        }
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

    private fun activeControlTask(): JSONObject? = runCatching {
        prefs().getString(KEY_ACTIVE_CONTROL_TASK, null)?.let(::JSONObject)
    }.getOrNull()

    private fun scheduleControlInspection(delayMs: Long = 350L) {
        if (controlInspectionScheduled) return
        controlInspectionScheduled = true
        handler.postDelayed({
            controlInspectionScheduled = false
            inspectControlTask()
        }, delayMs)
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
                "tap" -> {
                    val selected = findControlNode(root, step, requireEditable = false)
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

    private fun findScrollableNode(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var found: AccessibilityNodeInfo? = null
        walk(root) { node -> if (found == null && node.isVisibleToUser && node.isScrollable) found = node }
        return found
    }

    private fun finishControlTask(task: JSONObject, success: Boolean, code: String, message: String, extra: JSONObject = JSONObject()) {
        val id = task.optString("job_id")
        val result = JSONObject(extra.toString())
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
                DeviceNotifications.show(this, if (success) "اكتمل أمر التحكم في الهاتف" else "توقف أمر التحكم في الهاتف",
                    if (success) "تم تنفيذ " + task.optInt("step_index", 0) + " خطوة في التطبيق المستهدف." else message)
            }
        }
    }

    private fun inspectCurrentPage() {
        val task = activeTask() ?: return
        val phase = task.optString("phase", "waiting_editor")
        val root = rootInActiveWindow
        if (root == null) {
            if (phase == "waiting_editor") retryEditorScan(task)
            return
        }
        if (phase == "waiting_editor" || phase == "waiting_send") {
            if (!isVerifiedFlowPage(root)) {
                retryFlowOriginScan(task)
                return
            }
        } else if (phase == "waiting_download" && !isVerifiedFlowPage(root)) {
            handler.postDelayed({ inspectCurrentPage() }, 4000)
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
                    val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText("وصف مشهد Google Flow", prompt))
                    editor.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                    val pasted = editor.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                    val args = android.os.Bundle().apply {
                        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, prompt)
                    }
                    val set = pasted || editor.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                    if (set) {
                        task.put("prompt_entered", true)
                        task.put("prompt_language", "ar")
                        task.put("prompt_chars", prompt.length)
                        updatePhase(task, "waiting_send")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 1300)
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
                    } else {
                        retryEditorScan(task)
                    }
                }
            }
            "waiting_send" -> {
                if (!task.optBoolean("prompt_entered", false)) {
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
                        updatePhase(task, "waiting_download")
                        lastActionAt = System.currentTimeMillis()
                        handler.postDelayed({ inspectCurrentPage() }, 5000)
                    } else {
                        retrySendScan(task)
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

    private fun retryFlowOriginScan(task: JSONObject) {
        val now = System.currentTimeMillis()
        val phaseStarted = task.optLong("phase_started_at_ms", task.optLong("started_at_ms", now))
        val attempts = task.optInt("origin_scan_attempts", 0) + 1
        task.put("origin_scan_attempts", attempts)
        prefs().edit().putString(KEY_ACTIVE_TASK, task.toString()).apply()
        if (now - phaseStarted > 60000L) {
            finishTask(task, false, "manual_intervention_required",
                "توقف التنفيذ الآلي بأمان: لم يتمكن التطبيق من التحقق أن الصفحة المفتوحة هي labs.google. لم يُلصق النص في أي دردشة أخرى ولم يتم الضغط على توليد.")
            return
        }
        handler.removeCallbacksAndMessages(null)
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
        handler.removeCallbacksAndMessages(null)
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
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ inspectCurrentPage() }, 1200)
    }

    private fun accessibleLabel(node: AccessibilityNodeInfo): String =
        ((node.text?.toString() ?: "") + " " +
            (node.contentDescription?.toString() ?: "")).trim().replace(Regex("\\s+"), " ")

    private fun findGenerateButton(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val acceptedLabels = setOf(
            "generate", "generate video", "create video", "send", "send prompt",
            "send arrow", "arrow up", "arrow upward", "submit", "submit prompt",
            "توليد", "إنشاء", "إنشاء فيديو", "إرسال", "إرسال للتوليد"
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
        var found: AccessibilityNodeInfo? = null
        walk(root) { node ->
            if (found != null) return@walk
            val label = accessibleLabel(node).lowercase()
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
        const val KEY_ACTIVE_CONTROL_TASK = "phone_control_task"

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
            if (steps.length() !in 1..12) throw IllegalArgumentException("control_steps_limit")
            val allowed = setOf("inspect", "tap", "type_text", "scroll", "back", "wait", "open_url")
            for (i in 0 until steps.length()) {
                val step = steps.optJSONObject(i) ?: throw IllegalArgumentException("control_step_invalid")
                val action = step.optString("action")
                if (action !in allowed) throw IllegalArgumentException("unsupported_ui_action")
                if (step.optString("text").length > 3000) throw IllegalArgumentException("ui_text_invalid")
                if (action == "type_text" &&
                    (step.optString("input_purpose").lowercase() !in ZOZ_TEXT_PURPOSES ||
                     containsSensitiveWorkValue(step.optString("text")))) {
                    throw IllegalArgumentException("sensitive_or_nonbusiness_text_blocked")
                }
                if (action == "open_url" &&
                    (target != "com.android.chrome" || !isAllowedZozWebUrl(step.optString("url")))) {
                    throw IllegalArgumentException("business_url_not_allowlisted")
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
                .put("flow_origin_guard_version", 2)
                .put("flow_launch_requested_at_ms", startedAt)
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
