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

private data class ImportedClip(val uri: Uri, val name: String, val size: Long)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { FlowBridgeScreen() }
    }
}

@Composable
private fun FlowBridgeScreen() {
    val context = LocalContext.current
    var prompt by remember { mutableStateOf("") }
    var clips by remember { mutableStateOf(listOf<ImportedClip>()) }
    var lastAction by remember { mutableStateOf("جاهز — لم يتم الاتصال بالخادم بعد") }

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
        lastAction = "تم اختيار ${added.size} ملف؛ لم يتم رفعها إلى ZOZ بعد"
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
                        Text("حالة الاتصال", fontWeight = FontWeight.Bold)
                        Text("المرحلة الأولية: تشغيل Flow ونقل المطالبات واستيراد المقاطع محليًا.")
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
                    label = { Text("مطالبة المشهد من وكيل ZOZ") },
                    placeholder = { Text("ضع وصف المشهد هنا") },
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

                Text("المقاطع المختارة: ${clips.size}", fontWeight = FontWeight.Bold)
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
                                OutlinedButton(onClick = { clips = clips.filterNot { it.uri == clip.uri } }) {
                                    Text("إزالة")
                                }
                            }
                        }
                    }
                }
                Text(lastAction, style = MaterialTheme.typography.bodySmall)
                Text(
                    "وضع مساعد شفاف: لا نقرأ كلمات مرور Google ولا ننفذ نقرات مخفية ولا نتجاوز قيود Flow.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

private fun queryName(context: Context, uri: Uri): String? =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }

private fun querySize(context: Context, uri: Uri): Long =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)
        ?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getLong(0) else 0L
        } ?: 0L
