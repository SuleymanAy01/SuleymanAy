import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { GitHubApiError, createGitHubClient } from "../admin/github-api.js";

const projectRoot = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

test("GitHub Pages artifact'i eksiksiz ve yalnızca statiktir", async () => {
  const required = [
    "index.html",
    "admin/index.html",
    "403.html",
    "assets",
    "favicon.svg",
    "content.json",
    "CNAME",
    "robots.txt",
    ".nojekyll",
  ];
  for (const relativePath of required) {
    await assert.doesNotReject(() => stat(new URL(relativePath, dist)), `${relativePath} eksik`);
  }

  const entries = await readdir(dist, { recursive: true });
  for (const forbidden of ["server", "_worker.js", "api", "public"]) {
    assert.equal(
      entries.some((entry) => entry.toLowerCase().split(/[\\/]/).includes(forbidden)),
      false,
      `Statik çıktıda yasaklı öğe bulundu: ${forbidden}`,
    );
  }
});

test("HTML girişleri doğru Vite modüllerini yükler", async () => {
  const main = await readFile(new URL("index.html", dist), "utf8");
  const admin = await readFile(new URL("admin/index.html", dist), "utf8");
  assert.match(main, /^<!doctype html>/i);
  assert.match(admin, /^<!doctype html>/i);
  assert.doesNotMatch(main + admin, /\/_next\/|\/api\//);
  assert.match(admin, /noindex/);

  const mainModule = main.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/i);
  const adminModule = admin.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/i);
  assert.ok(mainModule, "Ana sayfanın JavaScript modülü bulunamadı");
  assert.ok(adminModule, "Admin JavaScript modülü bulunamadı");
  await assert.doesNotReject(() => stat(new URL(mainModule[1], dist)));
  await assert.doesNotReject(() => stat(new URL(adminModule[1], new URL("admin/", dist))));

  const mainModuleSource = await readFile(new URL(mainModule[1], dist), "utf8");
  assert.doesNotMatch(mainModuleSource, /api\.github\.com|GitHub REST API istemcisi/);
});

test("content.json tek veri kaynağıdır", async () => {
  const sourceText = await readFile(new URL("content.json", projectRoot), "utf8");
  const builtText = await readFile(new URL("content.json", dist), "utf8");
  const adminApiText = await readFile(new URL("admin/github-api.js", projectRoot), "utf8");
  const source = JSON.parse(sourceText);

  await assert.rejects(
    () => stat(new URL("public/content.json", projectRoot)),
    (error) => error?.code === "ENOENT",
  );
  assert.ok(source.settings && typeof source.settings === "object");
  assert.ok(Array.isArray(source.apps));
  assert.ok(Array.isArray(source.games));
  assert.ok(Array.isArray(source.media));
  assert.equal(builtText, sourceText);
  assert.notEqual(builtText, adminApiText);
});

test("site, panel ve build aynı content.json yolunu kullanır", async () => {
  const [mainSource, adminSource, adminConfig, buildGuard] = await Promise.all([
    readFile(new URL("script.js", projectRoot), "utf8"),
    readFile(new URL("admin/admin.js", projectRoot), "utf8"),
    readFile(new URL("admin/config.js", projectRoot), "utf8"),
    readFile(new URL("scripts/prepare-pages-build.mjs", projectRoot), "utf8"),
  ]);

  assert.match(adminConfig, /contentPath:\s*"content\.json"/);
  assert.match(mainSource, /new URL\("content\.json", siteRoot\)/);
  assert.match(mainSource, /cache:\s*"no-store"/);
  assert.match(adminSource, /path:\s*contentPath/);
  assert.match(adminSource, /function publishedContentUrl/);
  assert.match(buildGuard, /new URL\("content\.json", projectRoot\)/);
  assert.doesNotMatch(mainSource + adminSource + adminConfig, /public\/content\.json/);
});

test("content.json içindeki medya dosyaları artifact'te bulunur", async () => {
  const content = JSON.parse(await readFile(new URL("content.json", projectRoot), "utf8"));
  for (const media of content.media) {
    await assert.doesNotReject(
      () => stat(new URL(media.path, dist)),
      `Medya dosyası eksik: ${media.path}`,
    );
  }
});

test("ham kaynak dosyaları artifact köküne sızmaz", async () => {
  const rootEntries = await readdir(dist);
  for (const rawSource of ["admin.js", "github-api.js", "script.js", "style.css"]) {
    assert.equal(rootEntries.includes(rawSource), false, `${rawSource} dist kökünde olmamalı`);
  }
});

test("admin CRUD, medya silme ve tek commit yayın akışını içerir", async () => {
  const [adminSource, adminConfig] = await Promise.all([
    readFile(new URL("admin/admin.js", projectRoot), "utf8"),
    readFile(new URL("admin/config.js", projectRoot), "utf8"),
  ]);

  for (const capability of [
    "saveItem",
    "deleteItem",
    "queueMedia",
    "deleteMedia",
    "saveSettings",
    "publish",
  ]) {
    assert.match(adminSource, new RegExp(`function ${capability}|async function ${capability}`));
  }

  assert.match(adminConfig, /allowedLogin:\s*"SuleymanAy01"/);
  assert.match(adminConfig, /allowedUserId:\s*297488903/);
  assert.match(adminConfig, /repositoryName:\s*"SuleymanAy"/);
  assert.match(adminSource, /pendingDeletes:\s*new Set\(\)/);
  assert.match(adminSource, /sha:\s*null/);
  assert.match(adminSource, /git\/blobs/);
  assert.match(adminSource, /git\/trees/);
  assert.match(adminSource, /git\/commits/);
  assert.match(adminSource, /git\/refs\/heads/);
  assert.doesNotMatch(adminSource, /localStorage\.setItem\([^)]*(?:token|access)/i);
  assert.doesNotMatch(
    adminSource,
    /sessionStorage\.(?:setItem|getItem)|login\/(?:oauth|device)|device_code|pages\/builds/i,
  );
});

for (const status of [401, 403, 404]) {
  test(`GitHub API HTTP ${status} yanıtını ayrıntılı raporlar`, async () => {
    const path = "/repos/SuleymanAy01/SuleymanAy/contents/content.json?ref=main";
    const client = createGitHubClient(
      () => "test-token",
      async () => new Response(
        JSON.stringify({
          message: status === 401 ? "Bad credentials" : "Not Found",
          documentation_url: "https://docs.github.com/rest",
          errors: [{ resource: "Repository", code: "missing" }],
        }),
        {
          status,
          statusText: status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Not Found",
          headers: {
            "content-type": "application/json",
            "x-github-request-id": `TEST-${status}`,
          },
        },
      ),
    );

    await assert.rejects(
      client(path),
      (error) => {
        assert.ok(error instanceof GitHubApiError);
        assert.equal(error.status, status);
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.ok(error.message.includes(`İstek: GET ${path}`));
        assert.match(error.message, /GitHub mesajı:/);
        assert.match(error.message, /Olası neden:/);
        assert.match(error.message, new RegExp(`GitHub Request ID: TEST-${status}`));
        return true;
      },
    );
  });
}

test("GitHub API istekleri önbelleği kullanmaz", async () => {
  let receivedOptions;
  const client = createGitHubClient(
    () => "test-token",
    async (_url, options) => {
      receivedOptions = options;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  await client("/user");
  assert.equal(receivedOptions.cache, "no-store");
});

test("admin güvenlik politikası ve noindex etiketleri korunur", async () => {
  const admin = await readFile(new URL("admin/index.html", dist), "utf8");
  assert.match(admin, /Content-Security-Policy/);
  assert.match(admin, /connect-src 'self' https:\/\/api\.github\.com/);
  assert.match(admin, /form-action 'self'/);
  assert.match(admin, /name="referrer" content="no-referrer"/);
  assert.match(admin, /noindex, nofollow/);
});

test("üretim çıktısına gizli anahtar gömülmez", async () => {
  const entries = await readdir(dist, { recursive: true });
  const files = [];
  for (const entry of entries) {
    const location = new URL(entry.replaceAll("\\", "/"), dist);
    if ((await stat(location)).isFile() && /\.(?:html|js|json|css)$/i.test(entry)) {
      files.push(location);
    }
  }
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /GITHUB_CLIENT_SECRET|client_secret\s*[:=]/i);
  assert.doesNotMatch(source, /login\/(?:oauth|device)|device_code|oauthScope|githubClientId/i);
});

test("GitHub Pages workflow yalnızca doğrulanmış dist artifact'ini yayınlar", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/deploy-pages.yml", projectRoot),
    "utf8",
  );
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /pnpm test/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /path:\s*dist/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.doesNotMatch(workflow, /jekyll|wrangler|server|worker/i);
});
