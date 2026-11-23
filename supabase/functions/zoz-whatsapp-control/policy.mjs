export function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return "+" + digits;
  if (digits.startsWith("00") && digits.length >= 10 && digits.length <= 17) return "+" + digits.slice(2);
  return "";
}
export function isOptOutMessage(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return /^(stop|unsubscribe|cancel|remove|الغاء|إلغاء|إيقاف|وقف|لا تراسلني|لا ترسلوا لي|احذف رقمي)$/.test(text);
}
export function isWithinServiceWindow(lastInboundAt, now = Date.now()) {
  const time = Date.parse(String(lastInboundAt ?? ""));
  return Number.isFinite(time) && time <= now && (now - time) < 86400000;
}
const RISK_PATTERNS = [
  /سعر|اسعار|أسعار|تكلفة|كم السعر|عرض سعر|خصم|تفاوض|فاتورة|دفع|ادفع|تحويل|استرداد|استرجاع/,
  /عقد|اتفاق|ضمان|التزام|موعد تسليم|تعويض|شكوى|مشكلة|غاضب|محامي|قانوني|حذف بيانات|اختراق|كلمة مرور|رمز تحقق/,
  /\b(price|pricing|quote|discount|invoice|payment|refund|contract|agreement|warranty|guarantee|delivery date|complaint|lawsuit|legal|password|otp|verification code)\b/i
];
export function classifyInboundMessage(value) {
  const text = String(value ?? "").trim();
  if (!text) return { label: "non_text", safeToAuto: false, escalate: true, reason: "الرسالة لا تحتوي نصًا قابلًا للتصنيف." };
  if (isOptOutMessage(text)) return { label: "opt_out", safeToAuto: false, escalate: false, reason: "طلب إيقاف المراسلة." };
  if (RISK_PATTERNS.some((pattern) => pattern.test(text))) return { label: "sensitive", safeToAuto: false, escalate: true, reason: "موضوع يحتاج مراجعة المالك." };
  if (/^(مرحبا|مرحباً|السلام عليكم|أهلا|اهلا|ازيك|صباح الخير|مساء الخير|hi|hello|hey|good morning|good evening)[!.؟\s]*$/i.test(text)) {
    return { label: "greeting", safeToAuto: true, escalate: false, reason: "تحية عامة منخفضة المخاطر." };
  }
  if (/من أنتم|ما هي ZOZ|ماهو zoz|ماذا تقدم|what is zoz|tell me about zoz|your company/i.test(text)) {
    return { label: "company_intro", safeToAuto: true, escalate: false, reason: "استفسار عام عن الشركة." };
  }
  return { label: "needs_context", safeToAuto: false, escalate: true, reason: "يلزم فهم سياق الاستفسار قبل الرد." };
}
export function buildSafeReply(label) {
  if (label === "greeting") return "أهلًا بك في ZOZ، شكرًا لتواصلك معنا. ما طبيعة نشاطك أو الخدمة التي تبحث عنها حتى نوجّهك بشكل صحيح؟";
  if (label === "company_intro") return "نحن ZOZ، نعمل على بناء أنظمة وحلول رقمية وتشغيلية للشركات. ما طبيعة نشاط شركتك وما المشكلة التي ترغب في حلها؟";
  if (label === "needs_context") return "شكرًا لرسالتك. حتى نوجّه طلبك للشخص المختص، ما الخدمة أو المشكلة التي تحتاج المساعدة بشأنها؟";
  if (label === "sensitive") return "شكرًا لتوضيح طلبك. أحلنا رسالتك للمراجعة من فريق ZOZ، وسيتابع معك أحد المسؤولين.";
  return "شكرًا لتواصلك مع ZOZ. تم استلام رسالتك.";
}
export function canAutoSend({ enabled, emergencyStop, mode, safeToAuto, optedOut, excluded, automatedReplyAllowed, serviceWindowOpen, freeQuotaAvailable }) {
  return Boolean(enabled && !emergencyStop && mode === "safe_auto" && safeToAuto && !optedOut && !excluded && automatedReplyAllowed && serviceWindowOpen && freeQuotaAvailable);
}
