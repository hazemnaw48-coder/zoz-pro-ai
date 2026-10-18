const tool = (id, name, category, status, statusLabel, capabilities, note, links = [], extra = {}) => ({
  id, name, category, status, statusLabel, capabilities, note, links, ...extra,
});

/**
 * Human-readable inventory of ZOZ content-generation and production tools.
 * Catalog presence is not proof of account connectivity, quota, or a successful render.
 * Keep owner-reported links distinct from integrations independently verified by ZOZ Pro.
 */
export const CONTENT_TOOL_LIBRARY = Object.freeze([
  tool("google-flow", "Google Flow / Video Queue", "توليد الفيديو", "primary_manual", "مسار إنتاج أساسي محفوظ؛ فحص الحساب مطلوب", "تخطيط المشاهد، توليد لقطات فيديو وصور، وتنظيم مخرجات المشروع.", "Video Queue/Flow يظل المسار الأساسي المعروف لإنتاج الفيديو. يلزم التحقق من جلسة الحساب والرصيد وزر التوليد قبل كل جلسة؛ هذا الإدراج لا يثبت اتصالًا آليًا مباشرًا بـ ZOZ Pro.", [
    { label: "فتح Google Flow", url: "https://labs.google/fx/tools/flow" },
    { label: "تعليمات Flow", url: "https://support.google.com/flow/answer/17093911" },
  ], { priority: 1, ownerReportedConnected: false, connectionVerified: false, generationVerified: false }),
  tool("kling-ai", "Kling AI", "توليد الفيديو", "owner_reported_connected", "بحسب إفادة المالك — الاختبار المستقل مطلوب", "توليد فيديو من النص أو الصورة وفق الميزات المتاحة في حساب Kling.", "سجّلنا أن المالك أفاد بربطه. لم يثبت اختبار مستقل من داخل مسار ZOZ Pro حتى الآن. تحقّق من اعتماد API، الرصيد والتكلفة قبل أي طلب، ثم احفظ task ID وتابع الحالة والملف الناتج.", [
    { label: "فتح Kling AI", url: "https://kling.ai/" },
    { label: "بوابة API", url: "https://kling.ai/dev/api" },
  ], { priority: 2, ownerReportedConnected: true, connectionVerified: false, generationVerified: false }),
  tool("luma-dream-machine", "Luma Dream Machine", "توليد الفيديو", "owner_reported_connected", "بحسب إفادة المالك — الاختبار المستقل مطلوب", "توليد فيديو من النص أو الصورة، مع متابعة حالة التوليد عبر API عند الإعداد.", "سجّلنا أن المالك أفاد بربطه. لم يثبت بعد أن اعتماد API متاح داخل مسار ZOZ Pro. لا تخلط رصيد التطبيق برصيد API، ولا تعتبر موصل MCP أو صفحة الموقع وحدهما إثباتًا للتكامل.", [
    { label: "فتح Dream Machine", url: "https://lumalabs.ai/dream-machine" },
    { label: "وثائق Luma API", url: "https://docs.lumalabs.ai/docs/api" },
  ], { priority: 3, ownerReportedConnected: true, connectionVerified: false, generationVerified: false }),
  tool("pixverse", "PixVerse", "توليد الفيديو", "account_test_required", "حساب المستخدم والرصيد يحتاجان فحصًا", "توليد لقطات قصيرة وتحريك الصور؛ يتوفر مسار API منفصل عن رصيد الموقع.", "لا نستخدم الحصة المنشورة بديلًا عن فحص رصيد حساب المالك. افحص تكلفة النموذج قبل التوليد، ولا تفترض أن رصيد الويب يصلح لواجهة API.", [
    { label: "فتح PixVerse", url: "https://app.pixverse.ai/" },
    { label: "وثائق API", url: "https://docs.platform.pixverse.ai/" },
  ], { connectionVerified: false, generationVerified: false }),
  tool("vidu", "Vidu", "توليد الفيديو", "account_test_required", "حساب المستخدم والرصيد يحتاجان فحصًا", "توليد فيديو من النص أو الصورة ومراجع بصرية، وفق النماذج المتاحة.", "اختبر الحصة في حساب الويب. واجهة API لها اعتماد وتكلفة منفصلان، ولا تبدأ مهمة مدفوعة قبل مراجعة السعر.", [
    { label: "فتح Vidu", url: "https://www.vidu.com/" },
    { label: "بوابة المطورين", url: "https://platform.vidu.com/" },
  ], { connectionVerified: false, generationVerified: false }),
  tool("hailuo", "Hailuo AI", "توليد الفيديو", "account_test_required", "اختبار الحساب والحصة مطلوب", "توليد مشاهد فيديو قصيرة.", "لا توجد لدينا حاليًا نتيجة اختبار حديثة من حساب المستخدم تثبت حصة متجددة. افحص الحصة والعلامة المائية وشروط الاستخدام قبل الاعتماد.", [
    { label: "فتح Hailuo AI", url: "https://hailuoai.video/" },
    { label: "سياسة الدفع", url: "https://hailuoai.video/doc/payment-policy.html" },
  ], { connectionVerified: false, generationVerified: false }),
  tool("capcut-ai", "CapCut AI Video Maker", "تجميع ومونتاج", "account_test_required", "أولوية للاختبار اليدوي", "مرشح لمسار من النص/السيناريو إلى فيديو وتحرير وتعليقات وتصدير.", "قد تختلف ميزات AI المجانية حسب البلد والحساب. لا نعتمد التوليد المجاني المتكرر قبل تجربة فعلية وتأكيد تصدير ملف نهائي بلا تكلفة غير مقصودة.", [
    { label: "فتح AI Video Maker", url: "https://www.capcut.com/tools/free-ai-video-generator" },
    { label: "أسعار CapCut مصر", url: "https://www.capcut.com/ar-eg/pricing/" },
  ], { priority: 4, connectionVerified: false, generationVerified: false }),
  tool("runway", "Runway", "توليد الصور والفيديو", "connected_video_unavailable", "موصل ChatGPT متصل؛ توليد الفيديو غير متاح في آخر فحص", "أدوات الصور متاحة عبر الاتصال الحالي؛ لا تُحسب أداة فيديو نشطة لهذا الاتصال.", "آخر فحص محفوظ أظهر مصادقة ناجحة لكن قائمة نماذج الفيديو المتاحة فارغة. لا تعِد المحاولة كمولّد فيديو حتى تتغير حالة النماذج ويتحقق اختبار فعلي.", [
    { label: "فتح Runway", url: "https://runway.com/" },
    { label: "الأسعار والحصص", url: "https://runway.com/pricing" },
  ], { connectionVerified: true, generationVerified: false }),
  tool("pika", "Pika", "توليد الفيديو", "free_quota_unconfirmed", "الحصة المجانية المتجددة غير مثبتة", "مولد فيديو إضافي إذا كانت الحصة أو الخطة المناسبة متاحة.", "المراجعة السابقة لم تثبت رصيدًا مجانيًا متجددًا في الخطة المجانية. لا ندرجه في الإنتاج المجاني الدوري دون فحص الحساب الحالي.", [
    { label: "فتح Pika", url: "https://pika.art/" },
    { label: "الأسعار", url: "https://pika.art/pricing?interval=month" },
  ], { connectionVerified: false, generationVerified: false }),
  tool("gemini-content", "Gemini — مساعد النصوص والتخطيط", "الكتابة والتخطيط", "runtime_check_required", "مساعد نصي؛ فحص إعداد الخادم والنتيجة مطلوب", "المساعدة في الأفكار والسيناريوهات والملخصات النصية ضمن مسار ZOZ Pro الحالي.", "وجود مفتاح في إعدادات الخادم لا يثبت نجاح الطلب أو وجود توليد فيديو مباشر. لا تُدرج هذه الأداة كمحرك فيديو.", [
    { label: "فتح Gemini", url: "https://gemini.google.com/" },
  ], { connectionVerified: false, generationVerified: false }),
  tool("tts-maker", "TTSMaker", "الصوت والتعليق", "account_test_required", "الحصة والصوت العربي يحتاجان اختبارًا", "تحويل النص إلى كلام ومخرجات صوتية عند توافر الصوت المناسب.", "اختبر صوت العربية وجودة الملف وحد الحروف وترخيص الاستخدام قبل وضعه في فيديو منشور.", [
    { label: "فتح TTSMaker", url: "https://ttsmaker.com/ar" },
  ], { connectionVerified: false, generationVerified: false }),
  tool("elevenlabs", "ElevenLabs Studio", "الصوت والتعليق", "license_and_quota_check", "فحص الرصيد والترخيص مطلوب", "توليد الصوت والتعليق الصوتي وإنتاج أصول صوتية.", "تحقّق من الخطة والترخيص التجاري قبل استخدام الصوت في قناة ربحية؛ لا تفترض أن الخطة المجانية تمنح ترخيصًا تجاريًا.", [
    { label: "فتح Studio", url: "https://elevenlabs.io/studio" },
    { label: "شروط الاستخدام والنشر", url: "https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform" },
  ], { connectionVerified: false, generationVerified: false }),
  tool("canva", "Canva", "التصميم والأصول", "design_connector_available", "موصل التصميم متاح؛ مسار الفيديو النهائي يحتاج اختبارًا", "تصميمات وأصول بصرية وتنظيم مواد مساندة للهوية والمحتوى.", "موصل Canva متاح في ChatGPT؛ هذا لا يعني أن Canva متصل بخادم ZOZ Pro، ولا يثبت تصدير فيديو نهائي عبر الموصل.", [
    { label: "فتح Canva", url: "https://www.canva.com/" },
  ], { connectionVerified: true, generationVerified: false }),
  tool("make", "Make — ربط وأتمتة", "الربط والأتمتة", "catalog_without_account_connection", "وحدات موجودة؛ الاتصالات الجاهزة غير مثبتة", "مرشح لتنسيق المهام ومتابعة الحالة ونقل الملفات إذا توفرت الاتصالات وواجهات API.", "ظهر في الكتالوج تكامل Kling عبر PiAPI وتكامل Luma، لكن آخر فحص لم يجد اتصالات حساب جاهزة. لا تعتبر وجود الوحدة دليلًا على إمكانية التنفيذ.", [
    { label: "فتح Make", url: "https://www.make.com/" },
  ], { connectionVerified: false, generationVerified: false }),
  tool("floot-center", "Floot — مركز الإنتاج السابق", "مركز الإنتاج والتشغيل", "previous_quota_blocked", "مركز موجود محفوظ؛ الاستخدام معلّق وفق آخر إفادة", "سجلّ للمركز السابق وعلاقته بأعمال الإنتاج؛ لا يُنشأ بديل جديد ولا يعاد بناء المشروع.", "يظل المركز السابق محفوظًا في السجل. ورد سابقًا أن الحد اليومي استُنفد؛ مسار التطبيق المعتمد للاستكمال هو Cloud Run + Supabase، ولا نرجع إلى Floot كهدف تنفيذ الآن.", [
    { label: "Floot", url: "https://floot.com/" },
  ], { connectionVerified: false, generationVerified: false }),
  tool("tinyfish", "TinyFish — تحكم المتصفح", "الربط والتحكم", "browser_helper_balance_check", "مساعد متصفح؛ الرصيد والجلسات يحتاجان تحققًا", "تنفيذ بعض الخطوات عبر المتصفح إذا كانت الجلسة والرصيد متاحين؛ ليس مولد فيديو.", "آخر رصيد محفوظ كان سالبًا (-0.024 USD) بتاريخ 18 أكتوبر 2026. لا تشحن المحفظة ولا تفعّل إعادة التحميل دون موافقة؛ لا تعتبر جلسة Kling/Luma جاهزة دون تحقق.", [
    { label: "TinyFish", url: "https://tinyfish.ai/" },
  ], { connectionVerified: false, generationVerified: false }),
  tool("zoz-pro-publisher", "النشر إلى المنصات — YouTube وTikTok", "النشر والتسليم", "approval_and_platform_verification_required", "يلزم تحقق مستقل لكل منصة وموافقة قبل الإرسال", "سجل حالة ونتيجة منفصلة لكل منصة؛ الهدف دعم YouTube وTikTok على الأقل.", "النشر إجراء خارجي منفصل عن التوليد. لا يُعتبر الطلب ناجحًا قبل الحصول على رابط المنشور الفعلي لكل منصة، ولا يتم الإرسال دون موافقة صريحة.", [
    { label: "Upload-Post", url: "https://www.upload-post.com/" },
  ], { connectionVerified: false, generationVerified: false }),
]);

export function getContentToolLibrary() {
  return CONTENT_TOOL_LIBRARY.map((item) => ({
    ...item,
    links: item.links.map((link) => ({ ...link })),
  }));
}
