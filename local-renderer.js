/* ZOZ Pro local renderer — browser-only, no paid generation calls.
   Produces a real WebM recording, converts it to MP4 with MediaBunny/H.264,
   and returns the resulting File to the authenticated studio for private upload. */
(() => {
  const W = 720, H = 1280, FPS = 24, BITRATE = 2400000;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function wrap(ctx, text, maxWidth, maxLines = 3) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = []; let line = "";
    for (const word of words) {
      const candidate = line ? line + " " + word : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line); line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,،؛:!?؟]*$/, "") + "…";
      return kept;
    }
    return lines;
  }
  function drawPalm(ctx, x, y, scale, sway) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.strokeStyle = "#473c2b"; ctx.lineWidth = 13; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-10, -95, sway * 8, -180); ctx.stroke();
    ctx.strokeStyle = "#2f5440"; ctx.lineWidth = 8;
    for (let n = 0; n < 7; n++) {
      const a = -Math.PI + n * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(sway * 8, -180);
      ctx.quadraticCurveTo(Math.cos(a) * 70, -205 + Math.sin(a) * 45, Math.cos(a) * 118, -170 + Math.sin(a) * 88);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawPerson(ctx, x, y, scale, robe, motion) {
    ctx.save(); ctx.translate(x, y + Math.sin(motion * 5) * 2); ctx.scale(scale, scale);
    ctx.fillStyle = "#442e23"; ctx.beginPath(); ctx.arc(0, -45, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = robe; ctx.beginPath(); ctx.moveTo(-17, -27); ctx.lineTo(18, -27); ctx.lineTo(28, 26); ctx.lineTo(-26, 26); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#442e23"; ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-10, 24); ctx.lineTo(-14 + Math.sin(motion * 5) * 5, 52); ctx.moveTo(12, 24); ctx.lineTo(17 - Math.sin(motion * 5) * 5, 52); ctx.stroke();
    ctx.restore();
  }
  function drawAncientScene(ctx, index, p, scene) {
    const palettes = [
      ["#402b3d", "#da805e", "#f4c48b", "#b8a078"],
      ["#7e9caa", "#e4c59c", "#f0d4a5", "#bc9a6b"],
      ["#96b7b5", "#e1d4a6", "#61a1a0", "#b5aa73"],
      ["#d8a078", "#f0d5ad", "#b87749", "#e4bd7d"],
      ["#ad9880", "#dec5a1", "#b78b58", "#8d9a76"],
      ["#35435b", "#d78e6d", "#dbb17d", "#5e8c88"]
    ][index % 6];
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, palettes[0]); sky.addColorStop(.52, palettes[1]); sky.addColorStop(1, palettes[3]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const sunY = 180 + index * 13;
    ctx.fillStyle = "rgba(255,229,174,.86)"; ctx.beginPath(); ctx.arc(W * (.74 - p * .08), sunY, 70 + Math.sin(p * Math.PI) * 9, 0, Math.PI * 2); ctx.fill();
    // distant desert ridge and warm hills
    ctx.fillStyle = "rgba(100,64,48,.35)"; ctx.beginPath(); ctx.moveTo(0, 520);
    for (let x = 0; x <= W; x += 90) ctx.lineTo(x, 470 + Math.sin(x * .013 + index) * 54);
    ctx.lineTo(W, 690); ctx.lineTo(0, 690); ctx.closePath(); ctx.fill();
    ctx.fillStyle = palettes[3]; ctx.beginPath(); ctx.moveTo(0, 625);
    for (let x = 0; x <= W; x += 80) ctx.lineTo(x, 610 + Math.sin(x * .01 + index * 1.3) * 35);
    ctx.lineTo(W, 880); ctx.lineTo(0, 880); ctx.closePath(); ctx.fill();
    // Nile strip and moving highlights
    ctx.fillStyle = index === 5 ? "#356f79" : "#3d9293";
    ctx.beginPath(); ctx.moveTo(0, 740); ctx.bezierCurveTo(180, 690, 470, 790, W, 725); ctx.lineTo(W, 1050); ctx.lineTo(0, 1050); ctx.closePath(); ctx.fill();
    for (let n = 0; n < 16; n++) {
      const x = (n * 83 + (p * 90)) % (W + 100) - 50;
      const y = 795 + (n % 5) * 48;
      ctx.strokeStyle = "rgba(231,226,185," + (.15 + (n % 3) * .08) + ")";
      ctx.lineWidth = 2 + (n % 2); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20, y - 5, x + 52, y + Math.sin(p * 8 + n) * 3); ctx.stroke();
    }
    // reeds and river-bank vegetation
    ctx.strokeStyle = "#53694b"; ctx.lineWidth = 5;
    for (let n = 0; n < 15; n++) {
      const x = n * 54 - 10;
      ctx.beginPath(); ctx.moveTo(x, 755); ctx.quadraticCurveTo(x - 8, 710, x + Math.sin(n) * 12, 678); ctx.stroke();
    }
    if (index === 0 || index === 1 || index === 5) {
      // mud-brick homes: intentionally modest, not monumental palaces
      for (let n = 0; n < 4; n++) {
        const x = 30 + n * 156, y = 540 - (n % 2) * 30;
        ctx.fillStyle = "#b78258"; ctx.fillRect(x, y, 122, 152);
        ctx.fillStyle = "#d3a87c"; ctx.beginPath(); ctx.moveTo(x - 12, y + 4); ctx.lineTo(x + 61, y - 43); ctx.lineTo(x + 134, y + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#50372a"; ctx.fillRect(x + 48, y + 87, 28, 65);
        ctx.fillStyle = "#8d6344"; ctx.fillRect(x + 15, y + 35, 23, 28);
      }
    }
    drawPalm(ctx, 580, 720, .85, Math.sin(p * Math.PI * 2 + index));
    drawPalm(ctx, 55, 730, .64, Math.cos(p * Math.PI * 2 + index));
    if (index === 2) {
      // farm furrows, irrigation and workers
      ctx.strokeStyle = "#68754a"; ctx.lineWidth = 7;
      for (let n = 0; n < 8; n++) { ctx.beginPath(); ctx.moveTo(n * 94 - 30, 665); ctx.lineTo(n * 94 + 20, 780); ctx.stroke(); }
      drawPerson(ctx, 230, 700, 1.1, "#eee0c3", p);
      drawPerson(ctx, 370, 725, .88, "#b76e40", p + .3);
      ctx.fillStyle = "#94774a"; ctx.beginPath(); ctx.ellipse(295, 674, 28, 14, -.1, 0, Math.PI * 2); ctx.fill();
    } else if (index === 3) {
      // household breadmaking and pottery silhouettes
      ctx.fillStyle = "#805137"; ctx.beginPath(); ctx.ellipse(180, 753, 78, 32, -.12, 0, Math.PI * 2); ctx.fill();
      for (let n = 0; n < 4; n++) { ctx.fillStyle = ["#c58b51","#d9ae76","#9b6540","#e0c18b"][n]; ctx.beginPath(); ctx.ellipse(135 + n * 30, 742 + (n % 2) * 7, 15, 8, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#ad7445"; ctx.beginPath(); ctx.ellipse(510, 720, 45, 50, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#70432e"; ctx.beginPath(); ctx.ellipse(510, 720, 22, 26, 0, 0, Math.PI * 2); ctx.fill();
      drawPerson(ctx, 360, 736, .9, "#eee4ca", p);
    } else if (index === 4) {
      // market stalls, pottery and a scribe with papyrus
      for (let n = 0; n < 3; n++) {
        const x = 90 + n * 205;
        ctx.fillStyle = "#f0d5ad"; ctx.beginPath(); ctx.moveTo(x - 55, 585); ctx.lineTo(x, 515); ctx.lineTo(x + 55, 585); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#73513a"; ctx.fillRect(x - 48, 585, 96, 115);
      }
      drawPerson(ctx, 195, 710, .75, "#e8ddc6", p);
      drawPerson(ctx, 515, 715, .8, "#ba8450", p + .2);
      ctx.fillStyle = "#e6d09d"; ctx.fillRect(310, 680, 95, 55);
      ctx.strokeStyle = "#795b43"; ctx.lineWidth = 2;
      for (let n = 0; n < 4; n++) { ctx.beginPath(); ctx.moveTo(320, 690 + n * 10); ctx.lineTo(395, 690 + n * 10); ctx.stroke(); }
    } else {
      drawPerson(ctx, 265, 728, .94, "#f0e0c2", p);
      drawPerson(ctx, 380, 728, .98, "#d6b17e", p + .4);
      // small papyrus boat
      ctx.fillStyle = "#8c5b3a"; ctx.beginPath(); ctx.moveTo(420, 864); ctx.quadraticCurveTo(540, 904, 655, 855); ctx.lineTo(628, 893); ctx.quadraticCurveTo(530, 934, 442, 892); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#dec797"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(532, 852); ctx.lineTo(532, 774); ctx.stroke();
      ctx.fillStyle = "#e5d2a6"; ctx.beginPath(); ctx.moveTo(536, 778); ctx.lineTo(584, 840); ctx.lineTo(536, 834); ctx.closePath(); ctx.fill();
    }
    // slow parallax pan, shot border and title labels
    ctx.fillStyle = "rgba(18,25,29,.10)";
    ctx.fillRect(0, 0, W, H);
    const heading = String(scene?.on_screen_text || scene?.heading || ("مشهد " + (index + 1))).slice(0, 90);
    ctx.fillStyle = "rgba(12,18,24,.74)"; ctx.fillRect(38, 60, W - 76, 120);
    ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#e5be83"; ctx.font = "bold 23px sans-serif"; ctx.fillText("ZOZ PRO  •  حكايات من مصر القديمة", W - 62, 90);
    ctx.fillStyle = "#fff5e5"; ctx.font = "bold 30px sans-serif";
    wrap(ctx, heading, W - 132, 2).forEach((line, n) => ctx.fillText(line, W - 62, 133 + n * 38));
    const caption = String(scene?.narration || scene?.text || "").slice(0, 360);
    ctx.fillStyle = "rgba(7,14,19,.83)"; ctx.beginPath(); ctx.roundRect(36, 930, W - 72, 245, 24); ctx.fill();
    ctx.fillStyle = "#e9c58e"; ctx.font = "bold 19px sans-serif"; ctx.fillText("من حياة الناس على ضفاف النيل", W - 62, 966);
    ctx.fillStyle = "#fffaf0"; ctx.font = "600 27px sans-serif";
    wrap(ctx, caption, W - 132, 5).forEach((line, n) => ctx.fillText(line, W - 62, 1015 + n * 39));
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(40, 1200, W - 80, 4);
    ctx.fillStyle = "#d5a15f"; ctx.fillRect(40, 1200, (W - 80) * clamp((index + p) / 6, 0, 1), 4);
  }
  function drawPhotoScene(ctx, image, index, p, scene) {
    const zoom = 1.02 + p * .08;
    const scale = Math.max(W / image.width, H / image.height) * zoom;
    const dw = image.width * scale, dh = image.height * scale;
    const sway = Math.sin(p * Math.PI) * 14;
    ctx.drawImage(image, (W - dw) / 2 + sway, (H - dh) / 2, dw, dh);
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, "rgba(7,12,18,.58)"); shade.addColorStop(.48, "rgba(7,12,18,.04)"); shade.addColorStop(.70, "rgba(7,12,18,.16)"); shade.addColorStop(1, "rgba(7,12,18,.90)");
    ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
    ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#edc98d"; ctx.font = "bold 22px sans-serif";
    ctx.fillText("ZOZ PRO  •  وثائقي تاريخي", W - 48, 75);
    const title = String(scene?.on_screen_text || scene?.heading || ("مشهد " + (index + 1))).slice(0, 90);
    ctx.fillStyle = "#fffaf1"; ctx.font = "bold 37px sans-serif";
    wrap(ctx, title, W - 100, 2).forEach((line, n) => ctx.fillText(line, W - 50, 135 + n * 45));
    const caption = String(scene?.narration || scene?.text || "").slice(0, 280);
    ctx.fillStyle = "#fffaf1"; ctx.font = "600 27px sans-serif";
    wrap(ctx, caption, W - 100, 4).forEach((line, n) => ctx.fillText(line, W - 50, 1015 + n * 40));
    ctx.fillStyle = "rgba(255,255,255,.32)"; ctx.fillRect(36, 1200, W - 72, 5);
    ctx.fillStyle = "#e4ba77"; ctx.fillRect(36, 1200, (W - 72) * clamp((index + p) / 6, 0, 1), 5);
  }

  function drawRealVideoScene(ctx, video, index, p, scene, projectTitle) {
    const zoom = 1.015 + p * .045;
    const scale = Math.max(W / video.videoWidth, H / video.videoHeight) * zoom;
    const dw = video.videoWidth * scale, dh = video.videoHeight * scale;
    const sway = Math.sin(p * Math.PI) * 8;
    ctx.fillStyle = "#05080d"; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(video, (W - dw) / 2 + sway, (H - dh) / 2, dw, dh);
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, "rgba(5,9,15,.76)");
    shade.addColorStop(.28, "rgba(5,9,15,.08)");
    shade.addColorStop(.58, "rgba(5,9,15,.04)");
    shade.addColorStop(.76, "rgba(5,9,15,.48)");
    shade.addColorStop(1, "rgba(5,9,15,.92)");
    ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
    ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#f2d19b"; ctx.font = "bold 21px sans-serif";
    ctx.fillText("ZOZ NOW  •  وثائقي تاريخي", W - 42, 63);
    const heading = String(scene?.on_screen_text || scene?.heading || projectTitle || ("مشهد " + (index + 1))).slice(0, 90);
    ctx.fillStyle = "#fffaf2"; ctx.font = "bold 32px sans-serif";
    wrap(ctx, heading, W - 100, 2).forEach((line, n) => ctx.fillText(line, W - 50, 119 + n * 42));
    const caption = String(scene?.narration || scene?.text || "").slice(0, 400);
    ctx.fillStyle = "rgba(4,9,15,.80)";
    ctx.beginPath(); ctx.roundRect(32, 954, W - 64, 226, 22); ctx.fill();
    ctx.fillStyle = "#fffaf2"; ctx.font = "600 25px sans-serif";
    wrap(ctx, caption, W - 108, 4).forEach((line, n) => ctx.fillText(line, W - 54, 1003 + n * 38));
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(36, 1207, W - 72, 5);
    ctx.fillStyle = "#e5b96f"; ctx.fillRect(36, 1207, (W - 72) * clamp((index + p) / 6, 0, 1), 5);
  }
  async function loadImages(files) {
    const urls = [], images = [];
    for (const file of (files || []).slice(0, 6)) {
      if (!file || !file.type.startsWith("image/")) continue;
      const url = URL.createObjectURL(file); urls.push(url);
      const image = new Image(); image.src = url;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("تعذّر فتح إحدى صور المشاهد.")); });
      images.push(image);
    }
    return { images, urls };
  }

  async function loadVideoClips(files) {
    const urls = [], clips = [];
    const candidates = (files || []).slice(0, 6);
    for (const file of candidates) {
      if (!file) continue;
      const name = String(file.name || "").toLowerCase();
      if (!(file.type.startsWith("video/") || /\\.(mp4|webm|mov|m4v)$/i.test(name))) {
        throw new Error("أحد الملفات ليس فيديو. ارفع مقاطع MP4 أو WebM صالحة.");
      }
      const url = URL.createObjectURL(file);
      urls.push(url);
      const video = document.createElement("video");
      video.preload = "auto";
      video.playsInline = true;
      video.muted = true;
      video.src = url;
      await new Promise((resolve, reject) => {
        if (video.readyState >= 1 && Number.isFinite(video.duration)) return resolve();
        const ok = () => { clean(); resolve(); };
        const bad = () => { clean(); reject(new Error("تعذّر فتح أحد مقاطع الفيديو. أعد تنزيله من أداة التوليد بصيغة MP4 أو WebM.")); };
        const clean = () => { video.removeEventListener("loadedmetadata", ok); video.removeEventListener("error", bad); };
        video.addEventListener("loadedmetadata", ok, {once:true});
        video.addEventListener("error", bad, {once:true});
        video.load();
      });
      if (!Number.isFinite(video.duration) || video.duration < 3 || !video.videoWidth || !video.videoHeight) {
        throw new Error("أحد مقاطع الفيديو أقصر من 3 ثوانٍ أو لا يحتوي على صورة قابلة للقراءة.");
      }
      await new Promise((resolve, reject) => {
        if (video.readyState >= 2) return resolve();
        const ok = () => { clean(); resolve(); };
        const bad = () => { clean(); reject(new Error("تعذّر فك ترميز أحد مقاطع الفيديو.")); };
        const clean = () => { video.removeEventListener("loadeddata", ok); video.removeEventListener("error", bad); };
        video.addEventListener("loadeddata", ok, {once:true});
        video.addEventListener("error", bad, {once:true});
      });
      clips.push({ video, duration: video.duration });
    }
    if (!clips.length) throw new Error("ارفع مقاطع فيديو حقيقية مولدة بالذكاء الاصطناعي أولًا.");
    return { clips, urls };
  }
  function recordCanvas(canvas, stream, total, scenes, images, onProgress, audioSource = null) {
    return new Promise((resolve, reject) => {
      const preferred = "video/webm;codecs=vp9,opus";
      const mime = MediaRecorder.isTypeSupported(preferred) ? preferred :
        (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm");
      let recorder;
      try { recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITRATE }); }
      catch (_) { return reject(new Error("هذا المتصفح لا يتيح تسجيل الفيديو المحلي. افتح مركز الإنتاج في Chrome حديث.")); }
      const chunks = []; let stopped = false;
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onerror = () => { if (!stopped) { stopped = true; reject(new Error("أوقف المتصفح التسجيل؛ حاول بمدة أقصر وأبقِ الصفحة مفتوحة.")); } };
      recorder.onstop = () => {
        if (stopped) return; stopped = true;
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        if (blob.size < 1024) reject(new Error("لم ينتج التسجيل ملف فيديو صالحًا."));
        else resolve(blob);
      };
      recorder.start(500);
      if (audioSource) { try { audioSource.start(0); } catch (_) {} }
      const start = performance.now();
      const frame = () => {
        if (stopped) return;
        const elapsed = Math.min(total, (performance.now() - start) / 1000);
        const position = Math.min(scenes.length - .0001, elapsed / total * scenes.length);
        const index = Math.max(0, Math.floor(position));
        const progress = position - index;
        const image = images.length ? images[index % images.length] : null;
        const ctx = canvas.getContext("2d");
        if (!ctx) { try { recorder.stop(); } catch (_) {} return reject(new Error("تعذّر الرسم على لوحة الفيديو.")); }
        if (image) drawPhotoScene(ctx, image, index, progress, scenes[index]);
        else drawAncientScene(ctx, index, progress, scenes[index]);
        if (onProgress) onProgress(Math.min(68, Math.floor(elapsed / total * 68)));
        if (elapsed >= total) { if (recorder.state !== "inactive") recorder.stop(); return; }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  async function recordRealVideoClips(canvas, stream, total, clips, scenes, projectTitle, audioSource, speed, onProgress) {
    const preferred = "video/webm;codecs=vp9,opus";
    const mime = MediaRecorder.isTypeSupported(preferred) ? preferred :
      (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm");
    let recorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITRATE }); }
    catch (_) { throw new Error("هذا المتصفح لا يتيح تسجيل الفيديو المركب. افتح مركز الإنتاج في Chrome حديث."); }
    const chunks = [];
    return await new Promise((resolve, reject) => {
      let settled = false, lastProgress = -5, audioStarted = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        try { if (recorder.state !== "inactive") recorder.stop(); } catch (_) {}
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      recorder.ondataavailable = event => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = () => fail(new Error("أوقف المتصفح تسجيل المقاطع. أبقِ الصفحة مفتوحة وأعد المحاولة بملفات أصغر."));
      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        if (blob.size < 1024) reject(new Error("لم ينتج التسجيل ملف فيديو صالحًا."));
        else resolve(blob);
      };
      (async () => {
        recorder.start(500);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("تعذّر الرسم على لوحة الفيديو.");
        const sourceTotal = clips.reduce((sum, clip) => sum + clip.duration, 0);
        let elapsedBefore = 0;
        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i], video = clip.video, scene = scenes[i] || {};
          const segmentDuration = total * (clip.duration / sourceTotal);
          video.pause();
          try { video.currentTime = 0; } catch (_) {}
          video.playbackRate = speed;
          const clipStart = performance.now();
          await video.play();
          if (!audioStarted && audioSource) { audioSource.start(0); audioStarted = true; }
          await new Promise((done, frameReject) => {
            const frame = () => {
              try {
                const elapsed = Math.min(segmentDuration, Math.max(0, (performance.now() - clipStart) / 1000));
                const p = segmentDuration > 0 ? elapsed / segmentDuration : 1;
                drawRealVideoScene(ctx, video, i, p, scene, projectTitle);
                const overall = (elapsedBefore + elapsed) / total;
                const percent = Math.min(68, Math.floor(overall * 68));
                if (onProgress && percent - lastProgress >= 2) { lastProgress = percent; onProgress(percent); }
                if (elapsed >= segmentDuration || (video.ended && p > .96)) {
                  video.pause();
                  done();
                } else requestAnimationFrame(frame);
              } catch (error) { frameReject(error); }
            };
            requestAnimationFrame(frame);
          });
          elapsedBefore += segmentDuration;
          video.pause();
        }
        if (audioSource && !audioStarted) throw new Error("تعذّر بدء التعليق الصوتي.");
        try { if (recorder.state !== "inactive") recorder.stop(); } catch (_) {}
      })().catch(fail);
    });
  }
  async function toMp4(webm, title, hasAudio, onProgress) {
    if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
      throw new Error("تسجيل الفيديو نجح لكن هذا المتصفح لا يدعم ترميز MP4 محليًا. افتح الرابط في Chrome حديث.");
    }
    let mod, aac;
    try {
      mod = await import("https://esm.sh/mediabunny@1.61.3");
      aac = await import("https://esm.sh/@mediabunny/aac-encoder@1.61.3");
    } catch (_) {
      throw new Error("تعذّر تحميل محوّل MP4 مفتوح المصدر. تحقّق من الإنترنت ثم أعد التحويل؛ لم يُرفع ملف غير مكتمل.");
    }
    const canAvc = await mod.canEncodeVideo("avc", { width: W, height: H, bitrate: BITRATE, frameRate: FPS });
    if (!canAvc) throw new Error("هذا الجهاز لا يتيح ترميز H.264. لم يتم إنشاء ملف MP4 زائف؛ استخدم Chrome/جهازًا يدعم الترميز.");
    if (hasAudio && !(await mod.canEncodeAudio("aac"))) aac.registerAacEncoder();
    const input = new mod.Input({ source: new mod.BlobSource(webm), formats: mod.ALL_FORMATS });
    let output = null;
    try {
      if (!(await input.canRead())) throw new Error("تعذّرت قراءة الفيديو المحلي قبل التحويل.");
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error("ملف WebM لا يحتوي على مسار فيديو.");
      output = new mod.Output({ format: new mod.Mp4OutputFormat(), target: new mod.BufferTarget() });
      const config = { input, output, tracks: "primary", video: { codec: "avc", bitrate: BITRATE, frameRate: FPS, forceTranscode: true } };
      if (hasAudio) config.audio = { codec: "aac", bitrate: 96000, forceTranscode: true };
      const conversion = await mod.Conversion.init(config);
      if (!conversion.isValid) throw new Error("تعذّر إعداد التحويل؛ قد يكون مسار الصوت غير مدعوم.");
      conversion.onProgress = progress => { if (onProgress) onProgress(68 + Math.floor(progress * 31)); };
      await conversion.execute();
      const buffer = output.target instanceof mod.BufferTarget ? output.target.buffer : null;
      if (!buffer || buffer.byteLength < 1024) throw new Error("انتهى التحويل دون ملف MP4 صالح.");
      const fileName = (String(title || "ZOZ-Pro-video").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 48) || "ZOZ-Pro-video") + ".mp4";
      return new File([buffer], fileName, { type: "video/mp4" });
    } finally { input.dispose(); if (output) { try { output.dispose(); } catch (_) {} } }
  }

  async function render({ job, imageFiles = [], videoFiles = [], audioFile = null, onProgress = null }) {
    if (!job || !job.id || !job.script_json) throw new Error("اختر مهمة محفوظة تحتوي على النص والمشاهد أولًا.");
    const scenes = Array.isArray(job.script_json.scenes) ? job.script_json.scenes.slice(0, 6) : [];
    if (!scenes.length) throw new Error("المهمة لا تحتوي على مشاهد محفوظة؛ ولّد النص والمشاهد أولًا.");
    if (typeof MediaRecorder === "undefined") throw new Error("المتصفح لا يدعم تسجيل الفيديو المحلي. استخدم Chrome حديثًا.");
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    let audioContext = null, audioSource = null, stream = null;
    const { images, urls: imageUrls } = await loadImages(imageFiles);
    let videoUrls = [];
    try {
      let audioBuffer = null;
      if (audioFile) {
        audioContext = new AudioContext(); await audioContext.resume();
        try { audioBuffer = await audioContext.decodeAudioData(await audioFile.arrayBuffer()); }
        catch (_) { throw new Error("تعذّر قراءة ملف الصوت. استخدم WAV أو MP3 أو M4A صالحًا."); }
      }
      const realFiles = (videoFiles || []).filter(Boolean).slice(0, 6);
      if (realFiles.length) {
        if (realFiles.length !== scenes.length) {
          throw new Error("للحفاظ على ترتيب القصة، ارفع عدد مقاطع الفيديو نفسه لعدد المشاهد المحفوظة (" + scenes.length + " مقاطع لهذا المشروع).");
        }
        if (!audioBuffer) {
          throw new Error("لضمان وجود كلام عربي وعدم خروج فيديو صامت، أرفق ملف تعليق صوتي عربي WAV أو MP3 أو M4A قبل التجميع.");
        }
        if (audioBuffer.duration < 10 || audioBuffer.duration > 120) {
          throw new Error("مدة التعليق الصوتي يجب أن تكون بين 10 و120 ثانية.");
        }
        let sumSquares = 0, sampleCount = 0;
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
          const data = audioBuffer.getChannelData(channel);
          const stride = Math.max(1, Math.floor(data.length / 20000));
          for (let i = 0; i < data.length; i += stride) { sumSquares += data[i] * data[i]; sampleCount++; }
        }
        if (!sampleCount || Math.sqrt(sumSquares / sampleCount) < 0.0015) {
          throw new Error("ملف التعليق الصوتي شبه صامت. استخدم تسجيلًا أو تعليقًا عربيًا واضحًا.");
        }
        const loaded = await loadVideoClips(realFiles);
        videoUrls = loaded.urls;
        const clips = loaded.clips;
        const sourceDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);
        const speed = sourceDuration / audioBuffer.duration;
        if (speed < 0.65 || speed > 1.35) {
          throw new Error("مجموع مدة المقاطع (" + Math.round(sourceDuration) + " ث) بعيد عن مدة التعليق (" + Math.round(audioBuffer.duration) + " ث). قصّ المقاطع أو عدّل التعليق بحيث تكون النسبة بين 0.65 و1.35.");
        }
        const audioDestination = audioContext.createMediaStreamDestination();
        audioSource = audioContext.createBufferSource(); audioSource.buffer = audioBuffer;
        audioSource.connect(audioDestination);
        stream = canvas.captureStream(FPS);
        stream.addTrack(audioDestination.stream.getAudioTracks()[0]);
        if (onProgress) onProgress(1);
        const webm = await recordRealVideoClips(canvas, stream, audioBuffer.duration, clips, scenes, job.topic || job.script_json.title || "ZOZ Pro", audioSource, speed, onProgress);
        if (onProgress) onProgress(70);
        return await toMp4(webm, job.topic || job.script_json.title || "ZOZ-Pro-video", true, onProgress);
      }
      throw new Error("لإنتاج فيديو واقعي قابل للنشر، ارفع مقطعًا مولّدًا بالذكاء الاصطناعي لكل مشهد، مع تعليق صوتي عربي. لن يستبدل المركز ذلك برسوم توضيحية محلية.");
    } finally {
      if (audioSource) { try { if (audioSource.context.state === "running") audioSource.stop(); } catch (_) {} }
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (audioContext) { try { await audioContext.close(); } catch (_) {} }
      for (const url of [...imageUrls, ...videoUrls]) URL.revokeObjectURL(url);
    }
  }
  window.ZOZLocalRenderer = { render };
})();