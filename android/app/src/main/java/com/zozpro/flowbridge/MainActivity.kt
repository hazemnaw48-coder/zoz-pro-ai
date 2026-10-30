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
import org.json.JSONArray
import org.json.JSONObject

private data class ImportedClip(val uri: Uri, val name: String, val size: Long)

private const val PREFS = "zoz_flow_bridge"
private const val PREF_CLIPS = "saved_clips"
private const val PREF_PROMPT = "scene_prompt"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { FlowBridgeScreen() }
    }
}

@Composable
private fun FlowBridgeScreen() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    var prompt by remember { mutableStateOf(prefs.getString(PREF_PROMPT, "") ?: "") }
    var clips by remember { mutableStateOf(loadSavedClips(context)) }
    var lastAction by remember { mutableStateOf("جاهز — المقاطع والوصف يُحفظان محليًا على الهاتف") }

    LaunchedEffect(prompt) {
        prefs.edit().putString(PREF_PROMPT, prompt).apply()
    }
    LaunchedEffect(clips) {
        saveClips(context, clips)
    }

    val picker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments()
    ) { uris ->
        val added = uris.mapNotNull { uri ->
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (_: Exception) { }
            val name = queryName(context, uri) ?: "video-${clips.size + 1}"
            val size = querySize(context, uri)
            ImportedClip(uri, name, size)
        }
        clips = (clips + added).distinctBy { it.uri }
        lastAction = "تم اختيار ${added.size} ملف؛ حُفظت قائمة المقاطع محليًا ولم يتم رفعها بعد"
    }

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(
                modifier = Modifier.fillMaxSize().padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("ZOZ Flow Bridge", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("مساعد إنتاج الفيديو على الهاتف", style = MaterialTheme.typography.titleMedium)
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("حالة التشغيل", fontWeight = FontWeight.Bold)
                        Text("وصف المشهد وقائمة الملفات يُحفظان محليًا ويستمران بعد إغلاق التطبيق.")
                        Text("اتصال وكيل ZOZ وتجميع الفيديو والرفع الآلي لم تُفعّل في هذا الإصدار.")
                    }
                }

                Button(
                    onClick = {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://labs.google/fx/tools/flow"))
                        try {
                            context.startActivity(intent)
                            lastAction = "تم فتح تجربة Google Flow عبر التطبيق أو المتصفح المتاح"
                        } catch (_: Exception) {
                            lastAction = "تعذر فتح Google Flow على هذا الجهاز"
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("فتح Google Flow") }

                OutlinedTextField(
                    value = prompt,
                    onValueChange = { prompt = it },
                    label = { Text("مطالبة المشهد") },
                    placeholder = { Text("اكتب أو الصق وصف المشهد الذي أعده وكيل ZOZ") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedButton(
                    onClick = {
                        if (prompt.isBlank()) {
                            Toast.makeText(context, "أدخل وصف المشهد أولًا", Toast.LENGTH_SHORT).show()
                        } else {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("ZOZ Flow prompt", prompt))
                            lastAction = "نُسخ وصف المشهد؛ الصقه داخل Google Flow"
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("نسخ وصف المشهد إلى Flow") }

                OutlinedButton(
                    onClick = { picker.launch(arrayOf("video/mp4", "video/quicktime", "video/webm", "video/*")) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("استيراد المقاطع الناتجة من Flow") }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("المقاطع المحفوظة: ${clips.size}", fontWeight = FontWeight.Bold)
                    if (clips.isNotEmpty()) {
                        OutlinedButton(onClick = {
                            clips = emptyList()
                            lastAction = "أُزيلت قائمة المقاطع من التطبيق؛ الملفات الأصلية لم تُحذف"
                        }) { Text("مسح القائمة") }
                    }
                }
                LazyColumn(
                    modifier = Modifier.weight(1f, fill = true),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(clips) { clip ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(clip.name, fontWeight = FontWeight.Medium)
                                    Text(if (clip.size > 0) "${clip.size / 1024} KB" else "الحجم غير متاح")
                                }
                                OutlinedButton(onClick = {
                                    clips = clips.filterNot { it.uri == clip.uri }
                                }) { Text("إزالة") }
                            }
                        }
                    }
                }
                Text(lastAction, style = MaterialTheme.typography.bodySmall)
                Text(
                    "وضع مساعد شفاف: لا نخزن كلمات مرور Google ولا ننفذ نقرات مخفية ولا نتجاوز قيود Flow.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

private fun loadSavedClips(context: Context): List<ImportedClip> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(PREF_CLIPS, "[]") ?: "[]"
    return try {
        val array = JSONArray(raw)
        buildList {
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                val uri = Uri.parse(item.getString("uri"))
                val permissionStillAvailable = context.contentResolver.persistedUriPermissions
                    .any { it.uri == uri && it.isReadPermission }
                if (permissionStillAvailable) {
                    add(ImportedClip(uri, item.optString("name", "video"), item.optLong("size", 0L)))
                }
            }
        }
    } catch (_: Exception) {
        emptyList()
    }
}

private fun saveClips(context: Context, clips: List<ImportedClip>) {
    val array = JSONArray()
    clips.forEach { clip ->
        array.put(
            JSONObject()
                .put("uri", clip.uri.toString())
                .put("name", clip.name)
                .put("size", clip.size)
        )
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(PREF_CLIPS, array.toString())
        .apply()
}

private fun queryName(context: Context, uri: Uri): String? =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }

private fun querySize(context: Context, uri: Uri): Long =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)
        ?.use { cursor -> if (cursor.moveToFirst()) cursor.getLong(0) else 0L } ?: 0L
