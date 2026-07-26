import assert from "node:assert/strict";
import { copyFile, readFile, stat } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const sourceContentUrl = new URL("content.json", projectRoot);
const legacyContentUrl = new URL("public/content.json", projectRoot);
const outputContentUrl = new URL("dist/content.json", projectRoot);
const adminApiUrl = new URL("admin/github-api.js", projectRoot);

/**
 * GitHub Pages artifact'inde yayınlanacak içeriği tek ve açık bir kopyalama
 * adımıyla sabitler. Böylece aynı isimli başka bir dosya content.json üzerine
 * yazılmışsa build başarıyla tamamlanamaz.
 */
async function preparePagesContent() {
  await stat(new URL("dist/index.html", projectRoot));
  await assert.rejects(
    () => stat(legacyContentUrl),
    (error) => error?.code === "ENOENT",
    "Çift veri kaynağı bulundu: public/content.json kaldırılmalı",
  );

  const sourceText = await readFile(sourceContentUrl, "utf8");
  const sourceContent = JSON.parse(sourceText);

  assert.equal(typeof sourceContent, "object", "content.json bir JSON nesnesi olmalı");
  assert.ok(sourceContent && !Array.isArray(sourceContent), "content.json bir JSON nesnesi olmalı");
  assert.equal(typeof sourceContent.settings, "object", "content.json settings alanı eksik");
  assert.ok(Array.isArray(sourceContent.apps), "content.json apps alanı dizi olmalı");
  assert.ok(Array.isArray(sourceContent.games), "content.json games alanı dizi olmalı");

  await copyFile(sourceContentUrl, outputContentUrl);

  const [outputText, adminApiText] = await Promise.all([
    readFile(outputContentUrl, "utf8"),
    readFile(adminApiUrl, "utf8"),
  ]);

  assert.equal(outputText, sourceText, "dist/content.json kaynak JSON ile aynı değil");
  assert.notEqual(
    outputText,
    adminApiText,
    "dist/content.json yanlışlıkla admin/github-api.js içeriğiyle değiştirildi",
  );
  JSON.parse(outputText);

  console.log("Pages içerik doğrulaması başarılı: content.json -> dist/content.json");
}

await preparePagesContent();
