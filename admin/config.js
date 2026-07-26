/**
 * Statik yönetim panelinin herkese açık çalışma ayarları.
 *
 * Bu dosyada token, parola veya başka bir gizli anahtar bulunmamalıdır.
 * Yönetici token'ı giriş ekranından her oturumda alınır ve yalnızca bellekte tutulur.
 */
export const ADMIN_CONFIG = Object.freeze({
  allowedLogin: "SuleymanAy01",
  // GitHub kullanıcı adı değişse bile yalnızca aynı hesap kabul edilir.
  allowedUserId: 297488903,
  repositoryOwner: "SuleymanAy01",
  repositoryName: "SuleymanAy",
  repositoryBranch: "main",
  contentPath: "content.json",
  publicDirectory: "public",
  uploadDirectory: "assets/uploads",
  tokenCreationUrl: "https://github.com/settings/personal-access-tokens/new",
});
