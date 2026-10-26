/* ZOZ Pro visual-first production: free AI image queue + Arabic local TTS + browser MP4 rendering.
   No paid API keys are used. AI Horde is a volunteer queue; Wikimedia Commons is a free-image fallback.
   All generated assets are stored privately in the task's Supabase media bucket before final review.
*/
(() => {
  "use strict";
  const HORDE = "https://aihorde.net/api/v2";
  const OWNER_AGENT = "ZOZ-Pro-Visual-Studio:1.0:https://github.com/hazemnaw48-coder/zoz-pro-ai";
  const IMAGE_MODEL_HINTS = [
    "ancient egyptian art side profile frontal eye painted relief",
    "Egyptian wall painting profile face eye close detail",
    "ancient Egyptian art canon proportion grid tomb painting",
    "Egyptian limestone relief profile portrait museum",
    "ancient Egyptian painted figures profile and frontal eye",
    "ancient Egyptian tomb painting closeup archaeological museum",
    "Egyptian art museum relief head in profile"
  ];
  const $v = s => document.querySelector(s);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const say = (id, text, kind = "warn") => {
    if (typeof msg === "function") msg("#m-" + id, text, kind);
  };
  function titleFor(job) {
    return String(job?.script_json?.title || job?.topic || "ZOZ-Pro-video")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 54) || "ZOZ-Pro-video";
  }
  function imagePrompt(job, scene, index) {
    const topic = String(job?.topic || "");
    const visual = String(scene?.visual || scene?.narration || topic).slice(0, 650);
    const isEgyptArt = /(العين|الوش|الوجه|جانبي|مصر القديم|egypt|eye|profile|pharaoh|ancient egypt)/i.test(topic + " " + visual);
    const EgyptianScene = [
      "Photorealistic museum documentary close-up of an authentic-looking ancient Egyptian painted limestone relief: human head in profile, one eye rendered front-facing according to Egyptian artistic convention, ochre mineral pigment, weathered stone, realistic museum side-light, archaeological detail.",
      "Macro museum photograph of ancient Egyptian tomb painting showing the contrast between a side-facing face and a frontal eye, fine pigment and plaster texture, natural aged colors, no modern objects.",
      "Careful archaeological study scene: an authentic-style ancient Egyptian painted figure beside a faint proportional grid on a papyrus study sheet, museum conservation light, documentary realism, not fantasy.",
      "Close documentary photograph of an ancient Egyptian relief in profile, showing nose, eye and shoulder conventions, eroded sandstone and subtle pigment remnants, realistic scale and texture.",
      "Museum gallery documentary shot of ancient Egyptian painted figures whose heads are in profile while eyes and shoulders are represented more frontally, realistic wall painting and subdued warm illumination.",
      "High-detail archaeological photograph of an ancient Egyptian tomb painting fragment, profile figure and frontal eye visible, pigment cracks and plaster texture, carefully lit, accurate museum presentation."
    ];
    const visualEn = isEgyptArt ? EgyptianScene[index % EgyptianScene.length] :
      "Photorealistic educational documentary still for the topic: " + topic + ". Scene description: " + visual +
      ". Authentic materials and plausible setting, cinematic natural light, detailed realistic photography, no text or labels.";
    return visualEn + " Vertical 2:3 composition, strong visual focus, natural realistic details, no modern text, no letters, no watermark, no logos, no collage.###text, captions, logos, watermark, border, cartoon, anime, illustration, oversaturated colors, fantasy architecture";
  }
  async function generateHordeImage(prompt, onNote) {
    const response = await fetch(HORDE + "/generate/async", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: "0000000000",
        "Client-Agent": OWNER_AGENT
      },
      body: JSON.stringify({
        prompt,
        params: {
          width: 512, height: 768, steps: 18, n: 1,
          cfg_scale: 6.5, sampler_name: "k_euler_a", karras: true
        },
        nsfw: false, censor_nsfw: true, r2: true, shared: true
      }),
      signal: AbortSignal.timeout(25000)
    });
    const accepted = await response.json().catch(() => ({}));
    if (!response.ok || !accepted.id) throw new Error(accepted.message || ("AI Horde HTTP " + response.status));
    const requestId = String(accepted.id);
    const started = Date.now();
    while (Date.now() - started < 60000) {
      await wait(10000);
      const checkResponse = await fetch(HORDE + "/generate/check/" + encodeURIComponent(requestId), {
        headers: { apikey: "0000000000", "Client-Agent": OWNER_AGENT },
        signal: AbortSignal.timeout(20000)
      });
      const check = await checkResponse.json().catch(() => ({}));
      if (!checkResponse.ok) throw new Error("تعذر فحص طلب الصور المجاني (HTTP " + checkResponse.status + ").");
      if (check.faulted) throw new Error("تعطل طلب توليد الصورة في قائمة المجتمع.");
      if (onNote) onNote(check.wait_time ? ("الوقت المتوقع في قائمة التوليد: نحو " + Math.max(1, Math.ceil(Number(check.wait_time) / 60)) + " دقيقة.") : "الصورة في قائمة التوليد المجانية.");
      if (check.done) {
        const statusResponse = await fetch(HORDE + "/generate/status/" + encodeURIComponent(requestId), {
          headers: { apikey: "0000000000", "Client-Agent": OWNER_AGENT },
          signal: AbortSignal.timeout(25000)
        });
        const status = await statusResponse.json().catch(() => ({}));
        const generation = status.generations?.find(x => x && (x.img || x.generation)) || status.generations?.[0];
        if (!statusResponse.ok || !generation) throw new Error("انتهى الطلب من دون صورة قابلة للتنزيل.");
        if (typeof generation.generation === "string" && generation.generation.length > 2000) {
          try {
            const raw = generation.generation;
            const binary = atob(raw.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ""));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return { blob: new Blob([bytes], { type: "image/webp" }), source: "ai-horde", requestId, prompt };
          } catch (_) {}
        }
        const imageUrl = String(generation.img || "");
        if (!/^https:\/\//i.test(imageUrl)) throw new Error("لم يُرجع محرك الصور رابطًا آمنًا.");
        const imageResponse = await fetch(imageUrl, { mode: "cors", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(30000) });
        if (!imageResponse.ok) throw new Error("تعذر تنزيل الصورة الناتجة (HTTP " + imageResponse.status + ").");
        return { blob: await imageResponse.blob(), source: "ai-horde", requestId, prompt };
      }
    }
    throw new Error("انتهت مهلة انتظار محرك الصور المجاني بعد دقيقة؛ سيستخدم المركز صورًا تاريخية مفتوحة بدل تعطيل الإنتاج.");
  }
  async function commonsImage(job, scene, index) {
    const specific = IMAGE_MODEL_HINTS[index % IMAGE_MODEL_HINTS.length];
    const query = /(العين|الوش|الوجه|جانبي|مصر القديم|egypt|eye|profile|pharaoh|ancient egypt)/i.test(String(job.topic || "") + " " + String(scene?.visual || ""))
      ? specific
      : (String(job.topic || "") + " " + String(scene?.visual || scene?.narration || "")).slice(0, 160);
    const params = new URLSearchParams({
      action: "query", generator: "search", gsrsearch: query, gsrnamespace: "6",
      gsrlimit: "12", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1280",
      format: "json", origin: "*"
    });
    const response = await fetch("https://commons.wikimedia.org/w/api.php?" + params, {
      signal: AbortSignal.timeout(25000), cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.query?.pages) throw new Error("تعذر العثور على صورة تاريخية بديلة من Wikimedia Commons.");
    const pages = Object.values(data.query.pages).filter(p => {
      const info = p?.imageinfo?.[0];
      const url = String(info?.thumburl || info?.url || "");
      return /^https:\/\//i.test(url) && /^image\/(jpeg|png|webp)/i.test(String(info?.mime || ""));
    });
    const page = pages[index % Math.max(1, pages.length)] || pages[0];
    if (!page) throw new Error("لم يُعثر على صورة مناسبة في المصدر التاريخي المفتوح.");
    const info = page.imageinfo[0];
    const imageUrl = String(info.thumburl || info.url);
    const imageResponse = await fetch(imageUrl, { mode: "cors", credentials: "omit", signal: AbortSignal.timeout(30000) });
    if (!imageResponse.ok) throw new Error("تعذر تنزيل الصورة التاريخية من Commons.");
    const ext = info.extmetadata || {};
    const plain = key => String(ext[key]?.value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
    return {
      blob: await imageResponse.blob(), source: "wikimedia-commons", requestId: null,
      sourceUrl: "https://commons.wikimedia.org/wiki/" + encodeURIComponent(String(page.title || "").replace(/ /g, "_")),
      originalUrl: String(info.descriptionurl || ""), title: String(page.title || ""),
      attribution: plain("Artist") || plain("Credit") || plain("Attribution"),
      license: plain("LicenseShortName") || "راجع صفحة الملف لمعرفة شروط الاستخدام",
      prompt: query
    };
  }
  function canvasJpeg(blob, quality = 0.88) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
          canvas.width = Math.max(2, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(2, Math.round(image.naturalHeight * scale));
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(out => {
            URL.revokeObjectURL(url);
            if (out && out.size > 1000) resolve(out);
            else reject(new Error("تعذر تحويل الصورة إلى JPEG صالح."));
          }, "image/jpeg", quality);
        } catch (error) { URL.revokeObjectURL(url); reject(error); }
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("تعذر قراءة إحدى الصور الناتجة.")); };
      image.src = url;
    });
  }
  async function generateSceneImage(job, scene, index, total, id) {
    const prompt = imagePrompt(job, scene, index);
    let image;
    try {
      say(id, "توليد الصورة " + (index + 1) + " من " + total + " عبر قائمة الصور المجانية…");
      image = await generateHordeImage(prompt, detail => say(id, "الصورة " + (index + 1) + "/" + total + " · " + detail));
    } catch (error) {
      say(id, "لم تتوفر صورة مولدة للمشهد " + (index + 1) + " (" + String(error.message || error).slice(0, 120) + ")؛ يجري استخدام مصدر تاريخي مفتوح.", "warn");
      image = await commonsImage(job, scene, index);
    }
    image.blob = await canvasJpeg(image.blob);
    image.filename = "scene-" + String(index + 1).padStart(2, "0") + ".jpg";
    image.sceneNumber = index + 1;
    return image;
  }
  function narrationFor(job) {
    const s = job.script_json || {};
    const byScenes = (Array.isArray(s.scenes) ? s.scenes : []).map(x => String(x.narration || x.text || "").trim()).filter(Boolean).join("\n\n");
    return String(s.voiceover_script || s.script || byScenes || job.topic || "").trim().slice(0, 5000);
  }
  async function makeArabicVoiceover(text, id) {
    say(id, "تحميل محرك التعليق الصوتي العربي المجاني إلى المتصفح (أول مرة نحو 30 ميجابايت)…");
    let mod;
    try {
      mod = await import("https://esm.sh/nabra-tts@latest");
    } catch (error) {
      throw new Error("تعذر تحميل محرك الصوت العربي المجاني. افتح الصفحة في Chrome مع إنترنت ثم أعد المحاولة. لم يتم إنشاء فيديو صامت.");
    }
    const Engine = mod.NabraTTS || mod.default?.NabraTTS || mod.default;
    if (!Engine || typeof Engine.load !== "function") throw new Error("نسخة محرك الصوت العربي لا توفر واجهة التشغيل المتوقعة.");
    const tts = await Engine.load();
    const result = await tts.generate(text);
    const wavResult = tts.toWav(result.audio);
    const blob = wavResult instanceof Blob ? wavResult :
      (wavResult instanceof ArrayBuffer || ArrayBuffer.isView(wavResult))
        ? new Blob([wavResult], { type: "audio/wav" }) : null;
    if (!blob || blob.size < 2000) throw new Error("لم ينتج محرك الصوت ملف WAV صالحًا؛ أوقف المركز إنتاج الفيديو الصامت.");
    return blob;
  }
  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("تعذر تحميل صورة المشهد إلى محرك المونتاج.")); };
      image.src = url;
    });
  }
  function drawCover(ctx, image, w, h, progress, zoomOffset = 0) {
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight) * (1.03 + progress * 0.08);
    const dw = image.naturalWidth * scale, dh = image.naturalHeight * scale;
    const sx = (w - dw) / 2 + Math.sin(progress * Math.PI) * zoomOffset;
    const sy = (h - dh) / 2;
    ctx.drawImage(image, sx, sy, dw, dh);
  }
  function recordImageMontage(images, scenes, audioBlob, targetSeconds, id, onProgress) {
    const W = 720, H = 1280, FPS = 24, BITRATE = 2400000;
    return new Promise(async (resolve, reject) => {
      let audioContext, canvasStream, mergedStream, recorder, animation, source;
      const urls = [];
      let settled = false;
      const fail = error => {
        if (settled) return; settled = true;
        if (animation) cancelAnimationFrame(animation);
        try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch (_) {}
        for (const track of mergedStream?.getTracks?.() || []) track.stop();
        for (const u of urls) URL.revokeObjectURL(u);
        try { audioContext?.close(); } catch (_) {}
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      try {
        const loaded = [];
        for (let i = 0; i < images.length; i++) {
          const item = await loadImage(images[i].blob);
          urls.push(item.url); loaded.push(item.image);
        }
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
        const total = clamp(Math.max(Number(targetSeconds) || 45, audioBuffer.duration), 20, 150);
        const audioSource = audioContext.createBufferSource();
        source = audioSource; source.buffer = audioBuffer;
        const audioDestination = audioContext.createMediaStreamDestination();
        audioSource.connect(audioDestination);
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("تعذر إنشاء لوحة الفيديو على هذا الهاتف.");
        canvasStream = canvas.captureStream(FPS);
        mergedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioDestination.stream.getAudioTracks()
        ]);
        const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" :
          (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm");
        recorder = new MediaRecorder(mergedStream, { mimeType: mime, videoBitsPerSecond: BITRATE, audioBitsPerSecond: 128000 });
        const chunks = [];
        recorder.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
        recorder.onerror = () => fail(new Error("أوقف المتصفح تسجيل الفيديو. أبقِ الصفحة مفتوحة وأعد المحاولة."));
        recorder.onstop = () => {
          if (settled) return;
          settled = true;
          for (const track of mergedStream?.getTracks?.() || []) track.stop();
          for (const u of urls) URL.revokeObjectURL(u);
          try { audioContext?.close(); } catch (_) {}
          const webm = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
          if (webm.size < 5000) return reject(new Error("فشل تسجيل الفيديو من الصور والصوت."));
          resolve({ webm, duration: total, audioDuration: audioBuffer.duration });
        };
        recorder.start(500);
        await audioContext.resume();
        const started = performance.now();
        const drawFrame = () => {
          const elapsed = Math.min(total, (performance.now() - started) / 1000);
          const position = Math.min(loaded.length - 0.0001, elapsed / total * loaded.length);
          const index = Math.max(0, Math.floor(position));
          const localProgress = position - index;
          ctx.fillStyle = "#080b10"; ctx.fillRect(0, 0, W, H);
          drawCover(ctx, loaded[index], W, H, localProgress, 10);
          const fadeWindow = 0.12;
          if (localProgress > 1 - fadeWindow / (total / loaded.length) && index < loaded.length - 1) {
            const alpha = (localProgress - (1 - fadeWindow / (total / loaded.length))) / (fadeWindow / (total / loaded.length));
            ctx.save(); ctx.globalAlpha = clamp(alpha, 0, 1);
            drawCover(ctx, loaded[index + 1], W, H, 0, 0);
            ctx.restore();
          }
          if (onProgress) onProgress(Math.min(65, Math.floor(elapsed / total * 65)));
          if (elapsed >= total) {
            if (animation) cancelAnimationFrame(animation);
            try { recorder.stop(); } catch (error) { fail(error); }
            return;
          }
          animation = requestAnimationFrame(drawFrame);
        };
        audioSource.onended = () => { /* video may continue after narration so each image remains on screen */ };
        audioSource.start(0);
        drawFrame();
      } catch (error) { fail(error); }
    });
  }
  async function convertWebmToMp4(webmBlob, job, id, onProgress) {
    if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
      throw new Error("التسجيل المحلي نجح، لكن هذا المتصفح لا يدعم تحويل MP4. افتح المركز في أحدث إصدار من Chrome.");
    }
    let mod, aac;
    try {
      mod = await import("https://esm.sh/mediabunny@1.61.3");
      aac = await import("https://esm.sh/@mediabunny/aac-encoder@1.61.3");
    } catch (_) { throw new Error("تعذر تحميل محول MP4 المفتوح المصدر؛ لم يُرفع فيديو غير مكتمل."); }
    const canAvc = await mod.canEncodeVideo("avc", { width: 720, height: 1280, bitrate: 2400000, frameRate: 24 });
    if (!canAvc) throw new Error("هذا الجهاز لا يتيح ترميز H.264 اللازم لإخراج MP4؛ لم يُنشأ ملف زائف.");
    if (!(await mod.canEncodeAudio("aac"))) aac.registerAacEncoder();
    const input = new mod.Input({ source: new mod.BlobSource(webmBlob), formats: mod.ALL_FORMATS });
    let output = null;
    try {
      if (!(await input.canRead())) throw new Error("تعذر قراءة التسجيل المحلي قبل التحويل.");
      const videoTrack = await input.getPrimaryVideoTrack();
      const audioTrack = await input.getPrimaryAudioTrack();
      if (!videoTrack || !audioTrack) throw new Error("لم يتضمن التسجيل مساري الفيديو والصوت معًا؛ أوقف الحفظ.");
      output = new mod.Output({ format: new mod.Mp4OutputFormat(), target: new mod.BufferTarget() });
      const config = {
        input, output, tracks: "primary",
        video: { codec: "avc", bitrate: 2400000, frameRate: 24, forceTranscode: true },
        audio: { codec: "aac", bitrate: 128000, forceTranscode: true }
      };
      const conversion = await mod.Conversion.init(config);
      if (!conversion.isValid) throw new Error("تعذر إعداد تحويل MP4 بالصوت.");
      conversion.onProgress = p => onProgress?.(68 + Math.floor(p * 31));
      await conversion.execute();
      const buffer = output.target instanceof mod.BufferTarget ? output.target.buffer : null;
      if (!buffer || buffer.byteLength < 5000) throw new Error("لم ينتج محول MP4 ملفًا صالحًا.");
      if (buffer.byteLength > 50 * 1024 * 1024) throw new Error("حجم الفيديو تجاوز حد التخزين الحالي 50 ميجابايت؛ أوقف الحفظ دون ضغط إضافي.");
      onProgress?.(99);
      return new File([buffer], titleFor(job) + ".mp4", { type: "video/mp4" });
    } finally { input.dispose(); if (output) { try { output.dispose(); } catch (_) {} } }
  }
  async function uploadMedia(id, blob, filename, mime, sourceMetadata = {}) {
    const prepared = await call(MEDIA, {
      action: "prepare_upload", job_id: id, filename, mime_type: mime, size: blob.size,
      source_tool: "zoz-pro-free-image-audio"
    });
    const { data, error } = await sb.storage.from("zoz-pro-media").uploadToSignedUrl(
      prepared.path, prepared.token, new File([blob], filename, { type: mime }), { contentType: mime }
    );
    if (error || !data) throw new Error("فشل حفظ " + filename + " في التخزين الخاص: " + (error?.message || "لم يؤكد التخزين اكتمال الرفع."));
    const finalized = await call(MEDIA, {
      action: "finalize_upload", job_id: id, path: prepared.path, mime_type: mime,
      size: blob.size, filename, source_tool: "zoz-pro-free-image-audio",
      source_metadata: sourceMetadata
    });
    if (!finalized.verified_in_storage) throw new Error("لم يؤكد المركز حفظ الملف " + filename + ".");
    return finalized;
  }
  function vttSubtitles(job, totalSeconds) {
    const scenes = Array.isArray(job.script_json?.scenes) ? job.script_json.scenes : [];
    const chunks = scenes.map(sc => String(sc.narration || sc.text || "").trim()).filter(Boolean);
    const weight = chunks.reduce((sum, x) => sum + Math.max(1, x.length), 0) || 1;
    let cursor = 0;
    const stamp = seconds => {
      const ms = Math.max(0, Math.round(seconds * 1000));
      const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
      const m = String(Math.floor(ms % 3600000 / 60000)).padStart(2, "0");
      const s = String(Math.floor(ms % 60000 / 1000)).padStart(2, "0");
      const x = String(ms % 1000).padStart(3, "0");
      return h + ":" + m + ":" + s + "." + x;
    };
    return "WEBVTT\n\n" + chunks.map((chunk, i) => {
      const start = cursor, duration = totalSeconds * Math.max(1, chunk.length) / weight;
      cursor += duration;
      return (i + 1) + "\n" + stamp(start) + " --> " + stamp(Math.min(totalSeconds, cursor)) + "\n" + chunk + "\n";
    }).join("\n");
  }
  async function runProduction(id, button) {
    const job = (typeof state !== "undefined" ? (state?.jobs || []).find(x => x.id === id) : null);
    if (!job?.script_json || !Array.isArray(job.script_json.scenes) || !job.script_json.scenes.length) {
      throw new Error("ولّد النص والمشاهد أولًا، ثم ابدأ إنتاج الصور والصوت.");
    }
    if (!confirm("سيحاول المركز توليد صور مجانية عبر AI Horde (قائمة مجتمعية قد تكون بطيئة)، ويستخدم صور Wikimedia Commons عند تعذر التوليد، ثم يصنع تعليقًا صوتيًا عربيًا محليًا. قد تُشارك أوصاف المشاهد غير السرية مع خدمة الصور المجانية. لا توجد رسوم API، ولن يتم النشر. متابعة؟")) return;
    button.disabled = true;
    const scenes = job.script_json.scenes.slice(0, 12);
    const imageFiles = [];
    const sourceLog = [];
    try {
      say(id, "بدأ الإنتاج من دون رفع يدوي: " + scenes.length + " مشاهد، ثم صوت عربي محلي وتجميع MP4.", "warn");
      for (let i = 0; i < scenes.length; i++) {
        const image = await generateSceneImage(job, scenes[i], i, scenes.length, id);
        imageFiles.push(image);
        sourceLog.push({
          scene_number: i + 1, source: image.source, prompt: image.prompt,
          source_url: image.originalUrl || image.sourceUrl || null,
          attribution: image.attribution || null, license: image.license || null,
          generation_request_id: image.requestId || null
        });
        const preview = $v("#m-" + id);
        if (preview) preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      say(id, "اكتملت الصور (" + imageFiles.filter(x => x.source === "ai-horde").length + " مولدة و" +
        imageFiles.filter(x => x.source === "wikimedia-commons").length + " تاريخية مفتوحة). تجهيز التعليق الصوتي العربي…", "warn");
      const voiceText = narrationFor(job);
      if (!voiceText) throw new Error("لا يوجد نص صوتي يمكن تحويله إلى تعليق.");
      const audioBlob = await makeArabicVoiceover(voiceText, id);
      const target = clamp(Number(job.duration_seconds) || Number(job.script_json.duration_seconds) || 45, 20, 150);
      say(id, "تجهيز الفيديو المتحرك بالصوت؛ أبقِ الصفحة مفتوحة حتى ينتهي التسجيل والتحويل.", "warn");
      const recorded = await recordImageMontage(imageFiles, scenes, audioBlob, target, id,
        p => say(id, "تسجيل الفيديو مع التعليق الصوتي: " + p + "%", "warn"));
      const video = await convertWebmToMp4(recorded.webm, job, id,
        p => say(id, "تحويل الفيديو بالصوت إلى MP4: " + p + "%", "warn"));
      if (video.type !== "video/mp4" || video.size < 5000) throw new Error("لم ينتج ملف MP4 صالح.");
      const max = 50 * 1024 * 1024;
      if (video.size > max) throw new Error("حجم MP4 أكبر من حد التخزين الحالي 50 ميجابايت؛ لم أضغطه أو أحذف الصوت.");
      say(id, "حفظ الصور الناتجة مع بيانات المصدر…", "warn");
      for (const image of imageFiles) {
        await uploadMedia(id, image.blob, image.filename, "image/jpeg", {
          visual_source: image.source, prompt: String(image.prompt || "").slice(0, 1500),
          source_url: image.originalUrl || image.sourceUrl || null,
          attribution: image.attribution || null, license: image.license || null,
          generation_request_id: image.requestId || null, scene_number: image.sceneNumber,
          historical_accuracy_note: image.source === "ai-horde" ? "صورة مولدة توضيحية وليست صورة أثر أصلي" : "صورة أرشيفية؛ راجع صفحة المصدر وشروط الرخصة قبل إعادة الاستخدام خارج سياق المشروع"
        });
        await wait(80);
      }
      say(id, "التعليق الصوتي مضمّن داخل MP4؛ حفظ الترجمة النصية…", "warn");
      say(id, "حفظ الترجمة النصية المتزامنة…", "warn");
      const subtitleBlob = new Blob([vttSubtitles(job, recorded.duration)], { type: "text/vtt;charset=utf-8" });
      await uploadMedia(id, subtitleBlob, titleFor(job) + "-subtitles.vtt", "text/vtt", {
        generated_locally: true, language: "ar", format: "webvtt"
      });
      say(id, "حفظ الفيديو النهائي والتحقق منه في Supabase…", "warn");
      await call(MEDIA, {
        action: "save_prompt", job_id: id,
        prompt: String(job.script_json.original_prompt || job.script_json.script || job.topic || ""),
        source_tool: "zoz-pro-free-image-audio",
        notes: "توليد صور مجاني (AI Horde مع بديل Wikimedia Commons)، تعليق عربي محلي Nabra TTS، حركة كاميرا/انتقالات، MP4 H.264/AAC، ترجمة WebVTT. لا توجد API مدفوعة. بيانات المصادر والرخصة محفوظة مع أصول الصور. لم يتم النشر."
      });
      const final = await uploadMedia(id, video, video.name, "video/mp4", {
        visual_source: "zoz-pro-free-image-audio", images_count: imageFiles.length,
        generated_images_count: imageFiles.filter(x => x.source === "ai-horde").length,
        archival_images_count: imageFiles.filter(x => x.source === "wikimedia-commons").length,
        voiceover_engine: "nabra-tts-local", voiceover_language: "ar",
        duration_seconds: recorded.duration, source_records: sourceLog,
        contains_synthetic_media: true, final_video: true
      });
      if (!final.job?.video_url || !final.verified_in_storage) throw new Error("رُفع MP4 لكن لم يؤكد المركز ربطه بالمهمة.");
      say(id, final.production_export?.ok
        ? "نجح الإنتاج: الصور والصوت والترجمة وMP4 محفوظة ومتحقق منها، وصُدّر الفيديو إلى قائمة مراجعة النشر. لم يتم النشر العام."
        : "نجح الإنتاج: تم حفظ MP4 مع الصور والصوت والترجمة داخل Supabase، وأصبح جاهزًا لمراجعتك. لم يتم النشر العام."
        + (final.production_export?.error ? " ملاحظة التصدير: " + final.production_export.error : ""), "good");
      if (typeof refresh === "function") await refresh();
    } catch (error) {
      say(id, "لم يكتمل الإنتاج: " + String(error?.message || error).slice(0, 600), "bad");
    } finally {
      button.disabled = false;
    }
  }
  document.addEventListener("click", event => {
    const button = event.target.closest("button[data-visual-production]");
    if (!button) return;
    event.preventDefault();
    const id = button.dataset.visualProduction;
    runProduction(id, button).catch(error => say(id, "تعذر بدء الإنتاج: " + String(error?.message || error), "bad"));
  });
})();