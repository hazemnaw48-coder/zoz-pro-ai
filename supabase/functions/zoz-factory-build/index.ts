import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token === authHeader) return reply({ error: "Sign in required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const githubToken = Deno.env.get("ZOZ_FACTORY_GITHUB_TOKEN") ?? "";
  if (!supabaseUrl || !anonKey) return reply({ error: "Supabase function environment is incomplete" }, 500);
  if (!githubToken) return reply({
    error: "Factory GitHub credential is not configured",
    required_secret: "ZOZ_FACTORY_GITHUB_TOKEN",
    instructions: "Add a GitHub token with Contents: read/write access to the selected existing repository. Repository-creation permission is only needed when creating a brand-new repository.",
  }, 503);

  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user || (user.email ?? "").toLowerCase() !== "hazemnaw48@gmail.com" || !user.email_confirmed_at) {
    return reply({ error: "Only the confirmed factory owner can start builds" }, 403);
  }

  let body: { product_id?: string; repository_url?: string; base_branch?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }
  if (!body.product_id) return reply({ error: "product_id is required" }, 400);

  const { data: product, error: productError } = await db
    .from("zoz_software_products")
    .select("id,name,slug,description,stage,repository_url,repository_branch")
    .eq("id", body.product_id)
    .single();
  if (productError || !product) return reply({ error: "Product not found or not owned by caller" }, 404);

  const slug = String(product.slug ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return reply({ error: "Product slug is invalid" }, 422);
  const repoName = `zoz-${slug}`.slice(0, 90);
  const requestedRepoUrl = typeof body.repository_url === "string" ? body.repository_url.trim() : String(product.repository_url ?? "").trim();
  const requestedBaseBranch = typeof body.base_branch === "string" ? body.base_branch.trim() : String(product.repository_branch ?? "").trim();
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  const { data: run, error: runError } = await db.from("zoz_software_runs").insert({
    owner_id: user.id, product_id: product.id, run_type: "build", status: "running",
    summary: "Creating isolated GitHub repository and runnable PWA scaffold",
  }).select().single();
  if (runError) return reply({ error: "Could not create factory run", detail: runError.message }, 500);

  try {
    let repo: any;
    let baseBranch = "";
    let targetPrefix = "";
    if (requestedRepoUrl) {
      let parsed: URL;
      try { parsed = new URL(requestedRepoUrl); } catch { throw new Error("رابط GitHub غير صالح. أدخل رابط المستودع فقط."); }
      const parts = parsed.pathname.split("/").filter(Boolean);
      const repoOwner = parts[0] || "";
      const repoNameFromUrl = (parts[1] || "").replace(/\.git$/i, "");
      if (parsed.hostname.toLowerCase() !== "github.com" || !repoOwner || !repoNameFromUrl || !/^[A-Za-z0-9_.-]+$/.test(repoOwner) || !/^[A-Za-z0-9_.-]+$/.test(repoNameFromUrl)) {
        throw new Error("استخدم رابط مستودع GitHub بصيغة https://github.com/owner/repository");
      }
      if (repoOwner.toLowerCase() !== "hazemnaw48-coder") {
        throw new Error("لأمان المصنع، اختر مستودعًا مملوكًا لحساب hazemnaw48-coder فقط.");
      }
      const repoResponse = await fetch("https://api.github.com/repos/" + repoOwner + "/" + repoNameFromUrl, { headers });
      if (!repoResponse.ok) {
        const detail = await repoResponse.text();
        throw new Error("تعذر الوصول إلى المستودع المحدد (" + repoResponse.status + "). تحقق من نطاق GitHub token وإتاحة المستودع.");
      }
      repo = await repoResponse.json();
      if (repo.permissions?.push !== true) throw new Error("التوكن المتصل لا يملك Contents: write على المستودع المحدد. امنحه صلاحية الكتابة لهذا المستودع ثم أعد المحاولة.");
      baseBranch = requestedBaseBranch || String(repo.default_branch || "main");
      targetPrefix = "factory-products/" + slug;
    } else {
      const createResponse = await fetch("https://api.github.com/user/repos", {
        method: "POST", headers,
        body: JSON.stringify({
          name: repoName, description: String(product.description ?? product.name).slice(0, 350),
          private: true, auto_init: true, has_issues: true, has_projects: false, has_wiki: false,
        }),
      });
      if (createResponse.ok) repo = await createResponse.json();
      else {
        const detail = await createResponse.text();
        throw new Error("تعذر إنشاء مستودع GitHub جديد (" + createResponse.status + "). استخدم مستودعًا موجودًا مع صلاحية Contents: write، أو حدّث GitHub token ليشمل إنشاء المستودعات. " + detail.slice(0, 250));
      }
      baseBranch = String(repo.default_branch || "main");
    }

    const ownerName = String(repo.owner?.login || "");
    const actualRepoName = String(repo.name || "");
    if (!ownerName || !actualRepoName) throw new Error("استجابة GitHub لا تحتوي بيانات المستودع المطلوبة.");
    const baseRefResponse = await fetch("https://api.github.com/repos/" + ownerName + "/" + actualRepoName + "/git/ref/heads/" + baseBranch, { headers });
    if (!baseRefResponse.ok) throw new Error("تعذر قراءة مرجع فرع الأساس: " + baseBranch);
    const baseRefData = await baseRefResponse.json();
    const targetBranch = "factory/" + slug + "-" + Date.now().toString(36);
    const createBranchResponse = await fetch("https://api.github.com/repos/" + ownerName + "/" + actualRepoName + "/git/refs", {
      method: "POST", headers,
      body: JSON.stringify({ ref: "refs/heads/" + targetBranch, sha: baseRefData.object.sha }),
    });
    if (!createBranchResponse.ok) {
      const detail = await createBranchResponse.text();
      throw new Error("فشل إنشاء فرع التطوير المعزول (" + createBranchResponse.status + "): " + detail.slice(0, 250));
    }

    const files: Record<string, string> = {
      "README.md": `# ${product.name}\n\n${product.description ?? "Product scaffold generated by ZOZ Software Factory."}\n\n## Run locally\n\nOpen \`index.html\` in a browser or serve this folder with any static HTTP server.\n\n## Delivery status\n\nThis is the first executable scaffold. Domain workflows, authentication, database migrations and acceptance tests must be implemented and verified before customer production use.\n`,
      "index.html": `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#102a43"><link rel="manifest" href="./manifest.webmanifest"><title>${product.name.replace(/[<>]/g,"")}</title><style>body{font:16px Tahoma,Arial;margin:0;background:#f2f6fa;color:#183247}header{background:#102a43;color:white;padding:24px}main{max-width:900px;margin:30px auto;padding:18px}.card{background:white;border:1px solid #dce5ec;border-radius:14px;padding:22px}button{padding:10px 16px;border:0;border-radius:8px;background:#176b87;color:white}</style></head><body><header><h1>${product.name.replace(/[<>]/g,"")}</h1><p>تم إنشاء هيكل التشغيل الأول بواسطة ZOZ Software Factory</p></header><main><section class="card"><h2>نسخة التطوير الأولى</h2><p>${String(product.description ?? "تم إنشاء مشروع مستقل قابل للتطوير.").replace(/[<>]/g,"")}</p><p id="health">حالة التطبيق: يعمل محليًا</p><button id="check">اختبار التشغيل</button></section></main><script>document.getElementById("check").onclick=()=>{document.getElementById("health").textContent="نجح اختبار واجهة التشغيل: "+new Date().toLocaleString("ar-EG")}</script></body></html>`,
      "manifest.webmanifest": JSON.stringify({ name: product.name, short_name: product.name.slice(0, 18), start_url: "./", display: "standalone", background_color: "#f2f6fa", theme_color: "#102a43", lang: "ar", dir: "rtl" }, null, 2),
      "sw.js": "self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',()=>{});\n",
      "package.json": JSON.stringify({ name: repoName, version: "0.1.0", private: true, scripts: { test: "node --test" } }, null, 2),
      "test/smoke.test.mjs": `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\ntest("generated app contains product title and health action",()=>{const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");assert.match(html,/<title>/);assert.match(html,/اختبار التشغيل/);});\n`,
      ".gitignore": "node_modules/\n.env\n.env.*\n!.env.example\n.DS_Store\n",
    };
    let lastCommitSha = "";
    for (const [path, content] of Object.entries(files)) {
      const targetPath = targetPrefix ? targetPrefix + "/" + path : path;
      const contentUrl = "https://api.github.com/repos/" + ownerName + "/" + actualRepoName + "/contents/" + targetPath.split("/").map(encodeURIComponent).join("/");
      const existingResponse = await fetch(contentUrl + "?ref=" + encodeURIComponent(targetBranch), { headers });
      let existingSha: string | undefined;
      if (existingResponse.ok) {
        const existing = await existingResponse.json();
        existingSha = typeof existing?.sha === "string" ? existing.sha : undefined;
      } else if (existingResponse.status !== 404) {
        const detail = await existingResponse.text();
        throw new Error("تعذر فحص الملف " + targetPath + " (" + existingResponse.status + "): " + detail.slice(0, 200));
      }
      const payload: Record<string, string> = {
        message: "factory: add " + targetPath,
        content: btoa(unescape(encodeURIComponent(content))),
        branch: targetBranch,
      };
      if (existingSha) payload.sha = existingSha;
      const put = await fetch(contentUrl, { method: "PUT", headers, body: JSON.stringify(payload) });
      if (!put.ok) {
        const detail = await put.text();
        throw new Error("كتابة " + targetPath + " فشلت (" + put.status + "): " + detail.slice(0, 300));
      }
      const putData = await put.json().catch(() => ({}));
      lastCommitSha = String(putData?.commit?.sha || lastCommitSha);
    }

    const repositoryUrl = String(repo.html_url || ("https://github.com/" + ownerName + "/" + actualRepoName));
    const resultUrl = targetPrefix
      ? repositoryUrl + "/tree/" + targetBranch + "/" + targetPrefix
      : repositoryUrl + "/tree/" + targetBranch;
    const { error: productUpdateError } = await db.from("zoz_software_products").update({
      repository_url: repositoryUrl,
      repository_branch: baseBranch,
      stage: "building",
      updated_at: new Date().toISOString(),
    }).eq("id", product.id);
    if (productUpdateError) throw new Error("تم بناء ملفات المشروع لكن تعذر تحديث سجل المنتج: " + productUpdateError.message);
    const { error: runUpdateError } = await db.from("zoz_software_runs").update({
      status: "passed",
      summary: "Created isolated GitHub development branch and executable PWA scaffold. Domain implementation, CI tests and acceptance remain open.",
      evidence_url: resultUrl,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    if (runUpdateError) throw new Error("تم حفظ المشروع لكن تعذر إغلاق سجل التشغيل: " + runUpdateError.message);
    return reply({
      ok: true,
      repository: repositoryUrl,
      branch: targetBranch,
      path: targetPrefix || "/",
      commit_sha: lastCommitSha || null,
      workspace_url: resultUrl,
      next: "Review the isolated branch, implement product requirements, run CI and acceptance tests, then request owner approval before release.",
    }, 201);
  } catch (error) {
    await db.from("zoz_software_runs").update({
      status: "failed", summary: String(error).slice(0, 900), completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return reply({ error: String(error) }, 502);
  }
});
