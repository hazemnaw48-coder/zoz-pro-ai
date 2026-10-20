(() => {
  const installButton = document.getElementById("install-app");
  let installPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.textContent = "تثبيت التطبيق";
  });

  if (installButton) {
    installButton.addEventListener("click", async () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

      if (standalone) {
        installButton.textContent = "التطبيق مثبت";
        return;
      }

      if (installPrompt) {
        installPrompt.prompt();
        try {
          const choice = await installPrompt.userChoice;
          if (choice && choice.outcome === "accepted") {
            installButton.textContent = "جارٍ التثبيت…";
          }
        } catch (_) {
          // Browser may dismiss the prompt; manual instructions remain available.
        }
        installPrompt = null;
        return;
      }

      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      window.alert(isIOS
        ? "للتثبيت على iPhone أو iPad: افتح الصفحة في Safari، واضغط «مشاركة»، ثم «إضافة إلى الشاشة الرئيسية»."
        : "للتثبيت على Android: افتح قائمة Chrome (⋮)، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». إذا لم يظهر الخيار، افتح الرابط في Chrome مع اتصال الإنترنت.");
    });
  }

  window.addEventListener("appinstalled", () => {
    if (installButton) installButton.textContent = "التطبيق مثبت";
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // The app stays usable if service worker registration is unavailable.
      });
    });
  }
})();
