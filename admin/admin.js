/**
 * Süleyman Ay statik yönetim paneli.
 *
 * GitHub Pages üzerinde doğrudan tarayıcıda çalışır. Yönetici tarafından girilen
 * fine-grained personal access token yalnızca çalışma belleğinde tutulur;
 * localStorage, sessionStorage, çerez veya kaynak koduna yazılmaz.
 */
import { ADMIN_CONFIG } from "./config.js";
import { createGitHubClient } from "./github-api.js";

const app = document.querySelector("#admin-app");
const overlays = document.querySelector("#admin-overlays");
const DRAFT_KEY = "sa-admin-static-draft-v1";
const REPOSITORY_KEY = "sa-admin-repository-v1";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DEPLOYMENT_TIMEOUT = 5 * 60 * 1000;
const DEPLOYMENT_POLL_INTERVAL = 4000;

const state = {
  token: null,
  user: null,
  content: null,
  view: "dashboard",
  sidebarOpen: false,
  publishing: false,
  repositories: [],
  apiDiagnostics: [],
  pendingUploads: new Map(),
  pendingDeletes: new Set(),
  previewUrls: new Map(),
};

const viewMeta = {
  dashboard: ["Dashboard", "Sitenizin güncel içerik ve yayın özeti."],
  apps: ["Uygulamalar", "Mobil uygulama kayıtlarını ekleyin ve düzenleyin."],
  games: ["Oyunlar", "Oyun kataloğunu, platformları ve bağlantıları yönetin."],
  media: ["Medya", "Logo, hero ve ürün görsellerini yayın kuyruğuna ekleyin."],
  settings: ["Site Ayarları", "Kimlik, sosyal bağlantılar, SEO ve depo ayarları."],
};

/**
 * Güvenli HTML çıktısı için yönetilen tüm metinleri kaçırır.
 */
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "dosya";
}

function formatDate(value) {
  const date = new Date(value || Date.now());
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function inferRepositoryName() {
  if (ADMIN_CONFIG.repositoryName !== "auto") return ADMIN_CONFIG.repositoryName;
  const hostname = window.location.hostname.toLowerCase();
  if (!hostname.endsWith(".github.io")) return "";
  const [firstSegment] = window.location.pathname.split("/").filter(Boolean);
  if (firstSegment && firstSegment.toLowerCase() !== "admin") return firstSegment;
  return `${ADMIN_CONFIG.repositoryOwner}.github.io`;
}

function storedRepositorySettings() {
  try {
    return JSON.parse(localStorage.getItem(REPOSITORY_KEY) || "{}");
  } catch {
    localStorage.removeItem(REPOSITORY_KEY);
    return {};
  }
}

function normaliseContent(input = {}) {
  const repository = storedRepositorySettings();
  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    settings: {
      siteTitle: "Süleyman Ay",
      siteDescription: "Mobil uygulamalar ve oyunlar geliştiren bağımsız geliştirici.",
      footerText: "© 2026 Süleyman Ay. Tüm hakları saklıdır.",
      githubUrl: `https://github.com/${ADMIN_CONFIG.allowedLogin}`,
      email: "",
      seoTitle: "Süleyman Ay — Bağımsız Geliştirici",
      seoDescription: "Süleyman Ay'ın mobil uygulamalar ve oyunlar geliştirdiği resmi web sitesi.",
      theme: "dark",
      faviconUrl: null,
      siteLogoUrl: null,
      heroUrl: null,
      ...input.settings,
      repositoryOwner: repository.repositoryOwner || ADMIN_CONFIG.repositoryOwner,
      repositoryName: repository.repositoryName || inferRepositoryName(),
      repositoryBranch: repository.repositoryBranch || ADMIN_CONFIG.repositoryBranch,
      // Site ve panel repository kökündeki aynı content.json dosyasını kullanır.
      contentPath: ADMIN_CONFIG.contentPath,
    },
    apps: Array.isArray(input.apps) ? input.apps : [],
    games: Array.isArray(input.games) ? input.games : [],
    media: Array.isArray(input.media) ? input.media : [],
  };
}

function serialisableContent() {
  const {
    repositoryOwner,
    repositoryName,
    repositoryBranch,
    contentPath,
    ...publicSettings
  } = state.content.settings;
  return {
    ...state.content,
    settings: publicSettings,
    media: state.content.media.map(({ previewUrl, pending, repositoryPath, ...media }) => media),
  };
}

function persistDraft(message = "Taslak tarayıcıda kaydedildi.") {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(serialisableContent()));
  render();
  toast(message);
}

function repositorySettings() {
  const settings = state.content.settings;
  return {
    owner: settings.repositoryOwner.trim(),
    repo: settings.repositoryName.trim(),
    branch: settings.repositoryBranch.trim() || "main",
    contentPath: ADMIN_CONFIG.contentPath,
  };
}

const githubRequest = createGitHubClient(() => state.token);

function renderLogin(error = "") {
  app.innerHTML = `
    <main class="admin-login">
      <div class="admin-login__glow" aria-hidden="true"></div>
      <section class="login-card">
        <a class="admin-brand" href="../" aria-label="Ana sayfaya dön">
          <span aria-hidden="true">SA</span><strong>Süleyman Ay</strong>
        </a>
        <div class="login-card__icon" aria-hidden="true">GH</div>
        <span class="admin-kicker">Özel yönetim alanı</span>
        <h1>Yönetim Paneli</h1>
        <p>Yalnızca seçtiğiniz repository'ye erişebilen fine-grained token ile güvenli bir oturum açın.</p>
        <form class="token-login-form" id="token-login-form">
          <label for="github-token">Fine-grained personal access token</label>
          <div class="token-input-wrap">
            <input
              id="github-token"
              name="token"
              type="password"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="github_pat_••••••••••••"
              required
            />
            <button type="button" data-action="toggle-token" aria-label="Token'ı göster">Göster</button>
          </div>
          <button class="github-login-button" type="submit">
            <span>GH</span> Güvenli oturum aç
          </button>
        </form>
        <small>Token kaydedilmez ve sayfa yenilendiğinde bellekten silinir.</small>
        <a class="token-help-link" href="${escapeHtml(ADMIN_CONFIG.tokenCreationUrl)}" target="_blank" rel="noopener noreferrer">
          Repository ile sınırlandırılmış token oluştur ↗
        </a>
        <div class="admin-security-note">
          Yalnızca <strong>@${escapeHtml(ADMIN_CONFIG.allowedLogin)}</strong> hesabı ve seçilen repository için
          <strong>Contents: Read and write</strong> ile <strong>Actions: Read and write</strong> izinleri gerekir.
        </div>
        ${error ? `<div class="admin-alert">${escapeHtml(error)}</div>` : ""}
      </section>
    </main>`;
}

function renderLoading(message) {
  app.innerHTML = `
    <main class="admin-loading" aria-live="polite">
      <span class="admin-loader-mark" aria-hidden="true">SA</span>
      <span>${escapeHtml(message)}</span>
    </main>`;
}

function sidebarTemplate() {
  const nav = [
    ["dashboard", "DB", "Dashboard"],
    ["apps", "AP", "Uygulamalar"],
    ["games", "OY", "Oyunlar"],
    ["media", "MD", "Medya"],
    ["settings", "AY", "Site Ayarları"],
  ];

  return `
    <aside class="admin-sidebar ${state.sidebarOpen ? "is-open" : ""}">
      <div class="admin-sidebar__head">
        <a class="admin-brand" href="../"><span>SA</span><strong>Süleyman Ay</strong></a>
        <button class="sidebar-close" type="button" data-action="toggle-sidebar" aria-label="Menüyü kapat">×</button>
      </div>
      <nav class="admin-nav" aria-label="Yönetim menüsü">
        <span>Yönetim</span>
        ${nav
          .map(
            ([view, icon, label]) => `
              <button class="${state.view === view ? "is-active" : ""}" type="button" data-view="${view}">
                <i aria-hidden="true">${icon}</i>${label}
              </button>`,
          )
          .join("")}
      </nav>
      <div class="admin-sidebar__user">
        ${
          state.user.avatar_url
            ? `<img src="${escapeHtml(state.user.avatar_url)}" alt="" referrerpolicy="no-referrer" />`
            : `<span>${escapeHtml(state.user.login.slice(0, 2).toUpperCase())}</span>`
        }
        <div><strong>@${escapeHtml(state.user.login)}</strong><small>Yetkili hesap</small></div>
        <button type="button" data-action="logout" aria-label="Çıkış yap">↪</button>
      </div>
    </aside>`;
}

function headingTemplate(view, action = "") {
  const [title, description] = viewMeta[view];
  return `
    <header class="admin-page-heading ${action ? "admin-page-heading--actions" : ""}">
      <div>
        <span class="admin-kicker">Statik içerik yönetimi</span>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
      ${action}
    </header>`;
}

function dashboardTemplate() {
  const recent = [...state.content.apps.map((item) => ({ ...item, kind: "Uygulama" })),
    ...state.content.games.map((item) => ({ ...item, kind: "Oyun" }))]
    .slice(0, 5);

  return `
    ${headingTemplate("dashboard", '<span class="live-indicator"><i></i> GitHub Pages hazır</span>')}
    <section class="stat-grid" aria-label="İstatistikler">
      <article class="stat-card">
        <span class="stat-card__icon" aria-hidden="true">AP</span>
        <div><small>Toplam Uygulama</small><strong>${state.content.apps.length}</strong></div>
        <button type="button" data-view="apps">Görüntüle →</button>
      </article>
      <article class="stat-card stat-card--violet">
        <span class="stat-card__icon" aria-hidden="true">OY</span>
        <div><small>Toplam Oyun</small><strong>${state.content.games.length}</strong></div>
        <button type="button" data-view="games">Görüntüle →</button>
      </article>
      <article class="stat-card stat-card--cyan">
        <span class="stat-card__icon" aria-hidden="true">↻</span>
        <div><small>Son Güncelleme</small><strong class="stat-card__date">${escapeHtml(formatDate(state.content.generatedAt))}</strong></div>
        <button type="button" data-action="publish">Yayınla →</button>
      </article>
    </section>
    <section class="dashboard-grid">
      <article class="admin-panel-card">
        <div class="panel-card__head">
          <div><span class="admin-kicker">İçerik</span><h2>Son kayıtlar</h2></div>
          <span>${recent.length} öğe</span>
        </div>
        <div class="recent-list">
          ${
            recent.length
              ? recent
                  .map(
                    (item) => `
                      <div>
                        <span class="mini-icon ${item.kind === "Oyun" ? "mini-icon--game" : ""}">${escapeHtml(initials(item.name))}</span>
                        <div><strong>${escapeHtml(item.name)}</strong><small>${item.kind}</small></div>
                        <span class="table-status ${isLive(item.status) ? "is-live" : ""}"><i></i>${escapeHtml(item.status || "Yakında")}</span>
                      </div>`,
                  )
                  .join("")
              : '<div class="empty-state"><p>Henüz içerik bulunmuyor.</p></div>'
          }
        </div>
      </article>
      <article class="admin-panel-card publish-summary">
        <span class="publish-orb" aria-hidden="true">GH</span>
        <span class="admin-kicker">Tek commit</span>
        <h2>Değişiklikleri yayınla</h2>
        <p>İçerik JSON'u ve bekleyen medya dosyaları aynı Git commit'inde depoya gönderilir.</p>
        <code>${escapeHtml(repositorySettings().owner)}/${escapeHtml(repositorySettings().repo)}</code>
      </article>
    </section>`;
}

function initials(name = "") {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function isLive(status) {
  return ["Google Play", "Yayında", "Aktif"].includes(status);
}

function contentTemplate(kind) {
  const isGame = kind === "game";
  const view = isGame ? "games" : "apps";
  const items = isGame ? state.content.games : state.content.apps;
  const singular = isGame ? "oyun" : "uygulama";
  const action = `<button class="primary-admin-button" type="button" data-action="add-item" data-kind="${kind}">＋ Yeni ${isGame ? "Oyun" : "Uygulama"}</button>`;

  return `
    ${headingTemplate(view, action)}
    <section class="content-table-card">
      <div class="content-table__head">
        <span>İçerik</span><span>Durum</span>${isGame ? "<span>Platform</span>" : ""}<span>Güncelleme</span><span></span>
      </div>
      ${
        items.length
          ? items
              .map(
                (item) => `
                  <article class="content-table__row ${isGame ? "is-game" : ""}">
                    <div class="content-title-cell">
                      <span class="content-logo ${isGame ? "content-logo--game" : ""}">
                        ${item.logoUrl ? `<img src="${escapeHtml(resolveMediaUrl(item.logoUrl))}" alt="" loading="lazy" />` : escapeHtml(initials(item.name))}
                      </span>
                      <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description)}</small></div>
                    </div>
                    <span class="table-status ${isLive(item.status) ? "is-live" : ""}"><i></i>${escapeHtml(item.status || "Yakında")}</span>
                    ${isGame ? `<span class="platform-badge">${escapeHtml(item.platform || "Belirtilmedi")}</span>` : ""}
                    <time datetime="${escapeHtml(state.content.generatedAt)}">${escapeHtml(formatDate(state.content.generatedAt))}</time>
                    <div class="row-actions">
                      <button type="button" data-action="edit-item" data-kind="${kind}" data-id="${escapeHtml(item.id)}" aria-label="Düzenle">✎</button>
                      <button class="is-danger" type="button" data-action="delete-item" data-kind="${kind}" data-id="${escapeHtml(item.id)}" aria-label="Sil">×</button>
                    </div>
                  </article>`,
              )
              .join("")
          : `<div class="empty-state"><span>＋</span><h2>İlk ${singular} kaydını ekleyin</h2><p>Yeni kayıt düğmesiyle başlayabilirsiniz.</p></div>`
      }
    </section>`;
}

function resolveMediaUrl(path) {
  if (!path) return "";
  const media = state.content?.media.find((item) => item.path === path);
  if (media && state.previewUrls.has(media.id)) return state.previewUrls.get(media.id);
  return new URL(`../${String(path).replace(/^\/+/, "")}`, window.location.href).toString();
}

function mediaTemplate() {
  const action = `
    <label class="primary-admin-button">
      ＋ Dosya Yükle
      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" multiple data-action="upload-media" />
    </label>`;

  return `
    ${headingTemplate("media", action)}
    <section class="media-grid">
      ${
        state.content.media.length
          ? state.content.media
              .map(
                (media) => `
                  <article class="media-card">
                    <div class="media-card__preview">
                      <img src="${escapeHtml(resolveMediaUrl(media.path))}" alt="${escapeHtml(media.filename)}" loading="lazy" />
                    </div>
                    <div>
                      <strong title="${escapeHtml(media.filename)}">${escapeHtml(media.filename)}</strong>
                      <small>${escapeHtml(formatBytes(media.size))}${state.pendingUploads.has(media.id) ? " · yayın bekliyor" : ""}</small>
                      <button class="media-delete" type="button" data-action="delete-media" data-id="${escapeHtml(media.id)}">Kaldır</button>
                    </div>
                  </article>`,
              )
              .join("")
          : '<div class="empty-state media-empty"><span>◇</span><h2>Medya kitaplığı boş</h2><p>Logo, favicon veya hero görseli yükleyin.</p></div>'
      }
    </section>`;
}

function mediaOptions(selected) {
  return [
    '<option value="">Görsel seçilmedi</option>',
    ...state.content.media.map(
      (media) =>
        `<option value="${escapeHtml(media.path)}" ${media.path === selected ? "selected" : ""}>${escapeHtml(media.filename)}</option>`,
    ),
  ].join("");
}

function settingsTemplate() {
  const s = state.content.settings;
  return `
    ${headingTemplate("settings", '<button class="primary-admin-button" type="submit" form="settings-form">Değişiklikleri Kaydet</button>')}
    <form id="settings-form" class="settings-layout">
      <section class="settings-card">
        <header class="settings-card__head"><span>01</span><div><h2>Genel</h2><p>Site kimliği ve sosyal bağlantılar.</p></div></header>
        <div class="form-grid">
          ${field("siteTitle", "Site başlığı", s.siteTitle)}
          ${field("email", "E-posta", s.email, "email")}
          ${field("siteDescription", "Açıklama", s.siteDescription, "textarea", true)}
          ${field("footerText", "Footer", s.footerText, "textarea", true)}
          ${field("githubUrl", "GitHub bağlantısı", s.githubUrl, "url", true)}
          <label class="form-field"><span>Tema</span><select name="theme">
            ${["dark", "light", "system"].map((theme) => `<option value="${theme}" ${s.theme === theme ? "selected" : ""}>${theme === "dark" ? "Karanlık" : theme === "light" ? "Açık" : "Sistem"}</option>`).join("")}
          </select></label>
        </div>
      </section>
      <section class="settings-card">
        <header class="settings-card__head"><span>02</span><div><h2>SEO</h2><p>Arama sonucu başlığı ve açıklaması.</p></div></header>
        <div class="form-grid">
          ${field("seoTitle", "SEO başlığı", s.seoTitle, "text", true)}
          ${field("seoDescription", "SEO açıklaması", s.seoDescription, "textarea", true)}
        </div>
        <div class="search-preview">
          <small>Arama sonucu önizlemesi</small><span>${escapeHtml(location.origin)}</span>
          <strong>${escapeHtml(s.seoTitle)}</strong><p>${escapeHtml(s.seoDescription)}</p>
        </div>
      </section>
      <section class="settings-card">
        <header class="settings-card__head"><span>03</span><div><h2>Görseller</h2><p>Medya kitaplığından görsel seçin.</p></div></header>
        <div class="setting-media-grid">
          ${mediaPicker("siteLogoUrl", "Site logosu", s.siteLogoUrl)}
          ${mediaPicker("heroUrl", "Hero görseli", s.heroUrl)}
          ${mediaPicker("faviconUrl", "Favicon", s.faviconUrl)}
        </div>
      </section>
      <section class="settings-card">
        <header class="settings-card__head"><span>04</span><div><h2>GitHub Repository</h2><p>İçeriğin yayınlanacağı depo ve dal.</p></div></header>
        <div class="form-grid">
          ${field("repositoryOwner", "Depo sahibi", s.repositoryOwner)}
          ${repositoryField(s.repositoryName)}
          ${field("repositoryBranch", "Dal", s.repositoryBranch)}
          <label class="form-field">
            <span>İçerik dosyası</span>
            <input name="contentPath" type="text" value="${escapeHtml(ADMIN_CONFIG.contentPath)}" readonly aria-readonly="true" />
          </label>
        </div>
        <div class="settings-note"><span>i</span>Bu değerler gizli değildir. Erişim yetkisini GitHub, oturum belirtecinin izinleriyle denetler.</div>
      </section>
    </form>`;
}

function field(name, label, value, type = "text", full = false) {
  const className = `form-field ${full ? "form-field--full" : ""}`;
  if (type === "textarea") {
    return `<label class="${className}"><span>${label}</span><textarea name="${name}" rows="3">${escapeHtml(value || "")}</textarea></label>`;
  }
  return `<label class="${className}"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value || "")}" /></label>`;
}

function repositoryField(selected) {
  if (!state.repositories.length) {
    return field("repositoryName", "Depo adı", selected);
  }
  const names = new Set(state.repositories.map((repository) => repository.name));
  if (selected) names.add(selected);
  return `
    <label class="form-field">
      <span>Depo adı</span>
      <select name="repositoryName">
        <option value="">Depo seçin</option>
        ${[...names]
          .sort((left, right) => left.localeCompare(right, "tr"))
          .map((name) => `<option value="${escapeHtml(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(name)}</option>`)
          .join("")}
      </select>
    </label>`;
}

function mediaPicker(name, label, selected) {
  return `
    <label class="media-picker">
      <span>${label}</span>
      <span class="media-picker__preview">${selected ? `<img src="${escapeHtml(resolveMediaUrl(selected))}" alt="" />` : "<i>◇</i>"}</span>
      <select name="${name}">${mediaOptions(selected)}</select>
    </label>`;
}

function apiDiagnosticsTemplate() {
  if (!state.apiDiagnostics.length) return "";
  return `
    <section class="admin-api-diagnostics" role="alert" aria-labelledby="api-diagnostics-title">
      <header>
        <span aria-hidden="true">!</span>
        <div>
          <h2 id="api-diagnostics-title">GitHub bağlantı ayrıntıları</h2>
          <p>Panel yerel içerikle açıldı. Aşağıdaki API yanıtını kontrol edin.</p>
        </div>
      </header>
      ${state.apiDiagnostics
        .map(
          (diagnostic) => `
            <article>
              <strong>${escapeHtml(diagnostic.title)}</strong>
              <pre>${escapeHtml(diagnostic.message)}</pre>
            </article>`,
        )
        .join("")}
    </section>`;
}

function render() {
  if (!state.user || !state.content) return renderLogin();
  const content = state.view === "dashboard"
    ? dashboardTemplate()
    : state.view === "apps"
      ? contentTemplate("app")
      : state.view === "games"
        ? contentTemplate("game")
        : state.view === "media"
          ? mediaTemplate()
          : settingsTemplate();

  app.innerHTML = `
    <div class="admin-shell">
      ${sidebarTemplate()}
      ${state.sidebarOpen ? '<button class="sidebar-backdrop" type="button" data-action="toggle-sidebar" aria-label="Menüyü kapat"></button>' : ""}
      <div class="admin-main">
        <header class="admin-topbar">
          <div>
            <button class="mobile-sidebar-toggle" type="button" data-action="toggle-sidebar" aria-label="Menüyü aç">☰</button>
            <span class="topbar-label">${escapeHtml(viewMeta[state.view][0])}</span>
          </div>
          <div class="admin-topbar__actions">
            <a class="preview-link" href="../" target="_blank" rel="noopener">Siteyi Gör ↗</a>
            <button class="publish-button" type="button" data-action="publish" ${state.publishing ? "disabled" : ""}>
              ${state.publishing ? "Yayınlanıyor…" : "Yayınla ↑"}
            </button>
          </div>
        </header>
        <main class="admin-content">${apiDiagnosticsTemplate()}${content}</main>
      </div>
    </div>`;
}

function itemModal(kind, id = "") {
  const isGame = kind === "game";
  const collection = isGame ? state.content.games : state.content.apps;
  const item = collection.find((entry) => entry.id === id) || {
    id: "",
    name: "",
    description: "",
    status: "Yakında",
    logoUrl: null,
    googlePlayUrl: null,
    websiteUrl: null,
    platform: "Android",
    mediaUrl: null,
  };

  overlays.innerHTML = `
    <div class="admin-modal-backdrop" data-action="close-modal">
      <section class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
        <header>
          <div><span class="admin-kicker">${isGame ? "Oyun" : "Uygulama"}</span><h2 id="item-modal-title">${id ? "Kaydı düzenle" : "Yeni kayıt"}</h2></div>
          <button type="button" data-action="close-modal" aria-label="Kapat">×</button>
        </header>
        <form id="item-form" data-kind="${kind}" data-id="${escapeHtml(item.id)}">
          <div class="form-grid">
            ${field("name", "İsim", item.name)}
            <label class="form-field"><span>Durum</span><select name="status">
              ${["Yakında", "Google Play", "Geliştiriliyor", "Yayında"].map((status) => `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}
            </select></label>
            ${field("description", "Açıklama", item.description, "textarea", true)}
            ${isGame ? field("platform", "Platform", item.platform) : field("websiteUrl", "Web sitesi bağlantısı", item.websiteUrl, "url")}
            ${field("googlePlayUrl", "Google Play bağlantısı", item.googlePlayUrl, "url")}
            <label class="form-field form-field--full"><span>Mevcut logo</span><select name="logoUrl">${mediaOptions(item.logoUrl)}</select></label>
            <label class="file-drop form-field--full">
              <i>↑</i><strong>Yeni logo yükle</strong><small>PNG, JPG, WebP, SVG veya GIF · en fazla 10 MB</small>
              <input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" />
            </label>
            ${isGame ? `<label class="form-field form-field--full"><span>Oyun medyası</span><select name="mediaUrl">${mediaOptions(item.mediaUrl)}</select></label>` : ""}
          </div>
          <footer>
            <button class="secondary-admin-button" type="button" data-action="close-modal">Vazgeç</button>
            <button class="primary-admin-button" type="submit">${id ? "Değişiklikleri Kaydet" : "Kaydı Ekle"}</button>
          </footer>
        </form>
      </section>
    </div>`;
  overlays.querySelector('input[name="name"]')?.focus();
}

function closeModal() {
  overlays.replaceChildren();
}

function toast(message, isError = false) {
  const element = document.createElement("div");
  element.className = `admin-toast ${isError ? "admin-toast--error" : ""}`;
  element.innerHTML = `<span>${isError ? "!" : "✓"}</span><p>${escapeHtml(message)}</p>`;
  overlays.append(element);
  window.setTimeout(() => element.remove(), isError ? 12000 : 4200);
}

async function queueMedia(file, kind = "media") {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("Yalnızca görsel dosyaları yüklenebilir.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Dosya boyutu 10 MB sınırını aşıyor.");

  const id = uid("media");
  const uniqueName = `${Date.now()}-${slugify(file.name)}`;
  const path = `${ADMIN_CONFIG.uploadDirectory}/${uniqueName}`;
  const media = {
    id,
    filename: file.name,
    contentType: file.type,
    size: file.size,
    kind,
    path,
    repositoryPath: `${ADMIN_CONFIG.publicDirectory}/${path}`,
  };
  state.pendingUploads.set(id, file);
  state.previewUrls.set(id, URL.createObjectURL(file));
  state.content.media.unshift(media);
  return media;
}

function deleteMedia(id) {
  const media = state.content.media.find((item) => item.id === id);
  if (!media) return;
  if (!window.confirm(`"${media.filename}" kaydını kaldırmak istiyor musunuz?`)) return;
  const wasPendingUpload = state.pendingUploads.has(id);
  if (!wasPendingUpload && media.path) {
    state.pendingDeletes.add(`${ADMIN_CONFIG.publicDirectory}/${media.path}`);
  }
  if (state.previewUrls.has(id)) URL.revokeObjectURL(state.previewUrls.get(id));
  state.previewUrls.delete(id);
  state.pendingUploads.delete(id);
  for (const key of ["siteLogoUrl", "heroUrl", "faviconUrl"]) {
    if (state.content.settings[key] === media.path) state.content.settings[key] = null;
  }
  for (const item of [...state.content.apps, ...state.content.games]) {
    if (item.logoUrl === media.path) item.logoUrl = null;
    if (item.mediaUrl === media.path) item.mediaUrl = null;
  }
  state.content.media = state.content.media.filter((item) => item.id !== id);
  persistDraft("Medya kaydı taslaktan kaldırıldı.");
}

async function saveItem(form) {
  const data = new FormData(form);
  const kind = form.dataset.kind;
  const isGame = kind === "game";
  const collection = isGame ? state.content.games : state.content.apps;
  const id = form.dataset.id || uid(isGame ? "game" : "app");
  const existing = collection.find((item) => item.id === id);
  const file = data.get("logoFile");
  let logoUrl = String(data.get("logoUrl") || "") || null;

  if (file instanceof File && file.size) {
    const media = await queueMedia(file, `${kind}-logo`);
    logoUrl = media.path;
  }

  const item = {
    id,
    name: String(data.get("name") || "").trim(),
    description: String(data.get("description") || "").trim(),
    status: String(data.get("status") || "Yakında"),
    logoUrl,
    googlePlayUrl: String(data.get("googlePlayUrl") || "").trim() || null,
    ...(isGame
      ? {
          platform: String(data.get("platform") || "").trim() || "Android",
          mediaUrl: String(data.get("mediaUrl") || "").trim() || null,
        }
      : { websiteUrl: String(data.get("websiteUrl") || "").trim() || null }),
  };

  if (!item.name || !item.description) throw new Error("İsim ve açıklama alanları zorunludur.");
  if (existing) collection.splice(collection.indexOf(existing), 1, item);
  else collection.unshift(item);
  closeModal();
  persistDraft(`${item.name} ${existing ? "güncellendi" : "eklendi"}.`);
}

function deleteItem(kind, id) {
  const collection = kind === "game" ? state.content.games : state.content.apps;
  const item = collection.find((entry) => entry.id === id);
  if (!item || !window.confirm(`"${item.name}" kalıcı olarak silinsin mi?`)) return;
  const index = collection.indexOf(item);
  collection.splice(index, 1);
  persistDraft(`${item.name} taslaktan silindi.`);
}

function saveSettings(form) {
  const data = Object.fromEntries(new FormData(form));
  data.contentPath = ADMIN_CONFIG.contentPath;
  Object.assign(state.content.settings, data);
  const repository = {
    repositoryOwner: state.content.settings.repositoryOwner,
    repositoryName: state.content.settings.repositoryName,
    repositoryBranch: state.content.settings.repositoryBranch,
    contentPath: ADMIN_CONFIG.contentPath,
  };
  localStorage.setItem(REPOSITORY_KEY, JSON.stringify(repository));
  persistDraft("Site ayarları kaydedildi.");
}

function bytesToBase64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

function addApiDiagnostic(title, error) {
  state.apiDiagnostics.push({
    title,
    message: error instanceof Error ? error.message : String(error),
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function workflowApiPath(owner, repo, suffix = "") {
  const workflow = encodeURIComponent(ADMIN_CONFIG.workflowFile);
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    + `/actions/workflows/${workflow}${suffix}`;
}

async function dispatchDeployment(owner, repo, branch) {
  return githubRequest(workflowApiPath(owner, repo, "/dispatches"), {
    method: "POST",
    body: JSON.stringify({ ref: branch }),
  });
}

async function waitForDeployment(owner, repo, branch, commitSha) {
  const deadline = Date.now() + DEPLOYMENT_TIMEOUT;
  let lastStatus = "iş akışı henüz görünmüyor";

  while (Date.now() < deadline) {
    const runs = await githubRequest(
      `${workflowApiPath(owner, repo, "/runs")}`
      + `?branch=${encodeURIComponent(branch)}&per_page=20`,
    );
    const run = runs?.workflow_runs?.find((item) => item.head_sha === commitSha);
    if (run) {
      lastStatus = `${run.status}${run.conclusion ? ` / ${run.conclusion}` : ""}`;
      if (run.status === "completed") {
        if (run.conclusion === "success") return run;
        throw new Error(
          `GitHub Pages iş akışı tamamlandı ancak başarısız oldu: ${lastStatus}`
          + (run.html_url ? `\nİş akışı: ${run.html_url}` : ""),
        );
      }
    }
    await wait(DEPLOYMENT_POLL_INTERVAL);
  }

  throw new Error(`GitHub Pages iş akışı zaman aşımına uğradı. Son durum: ${lastStatus}`);
}

async function verifyPublishedContent(expectedContent) {
  const expectedText = JSON.stringify(expectedContent, null, 2);
  const deadline = Date.now() + 90 * 1000;
  let lastStatus = "canlı dosya henüz okunamadı";

  while (Date.now() < deadline) {
    const url = publishedContentUrl();
    url.searchParams.set("v", String(Date.now()));
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const liveText = await response.text();
        if (liveText.trim() === expectedText.trim()) return url;
        try {
          const liveContent = JSON.parse(liveText);
          lastStatus = `canlı generatedAt: ${liveContent.generatedAt || "yok"}`;
        } catch {
          lastStatus = "canlı dosya geçerli JSON değil";
        }
      } else {
        lastStatus = `HTTP ${response.status} ${response.statusText}`.trim();
      }
    } catch (error) {
      lastStatus = error.message;
    }
    await wait(DEPLOYMENT_POLL_INTERVAL);
  }

  throw new Error(
    `Deploy tamamlandı ancak canlı content.json repository ile eşleşmedi. ${lastStatus}`,
  );
}

/**
 * /admin veya /admin/ biçimlerinin ikisinde de tek content.json adresini bulur.
 */
function publishedContentUrl() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const adminIndex = segments.lastIndexOf("admin");
  const rootSegments = adminIndex >= 0 ? segments.slice(0, adminIndex) : segments.slice(0, -1);
  const rootPath = `/${rootSegments.length ? `${rootSegments.join("/")}/` : ""}`;
  const rootUrl = new URL(rootPath, window.location.origin);
  return new URL(ADMIN_CONFIG.contentPath, rootUrl);
}

async function loadPublishedContent() {
  const url = publishedContentUrl();
  url.searchParams.set("v", String(Date.now()));
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Başlangıç içeriği yüklenemedi.\n${url.pathname}: ${error.message}`);
  }
}

async function readRepositoryContentFile(owner, repo, branch, contentPath) {
  const remote = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${contentPath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(branch)}`,
  );
  const bytes = Uint8Array.from(
    atob(remote.content.replace(/\s/g, "")),
    (character) => character.charCodeAt(0),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function loadRepositoryContent() {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) {
    try {
      state.content = normaliseContent(JSON.parse(draft));
      return;
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }

  // Repository ayarlarını oluşturmak için önce güvenli varsayılanları hazırla.
  state.content = normaliseContent();
  const { owner, repo, branch, contentPath } = repositorySettings();

  if (owner && repo) {
    try {
      state.content = normaliseContent(
        await readRepositoryContentFile(owner, repo, branch, contentPath),
      );
      return;
    } catch (error) {
      addApiDiagnostic(`Repository içeriği okunamadı: ${contentPath}`, error);
    }
  }

  try {
    state.content = normaliseContent(await loadPublishedContent());
  } catch (fallbackError) {
    if (state.apiDiagnostics.length) {
      throw new Error(
        `${state.apiDiagnostics.map((item) => `${item.title}\n${item.message}`).join("\n\n")}\n\n`
        + fallbackError.message,
      );
    }
    throw fallbackError;
  }
}

async function publish() {
  if (state.publishing) return;
  const { owner, repo, branch, contentPath } = repositorySettings();
  if (!owner || !repo) return toast("Depo sahibi ve depo adı zorunludur.", true);

  state.publishing = true;
  render();
  try {
    const ref = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    const parentCommit = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${ref.object.sha}`,
    );

    const publishContent = serialisableContent();
    publishContent.generatedAt = new Date().toISOString();
    const contentBlob = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`,
      {
        method: "POST",
        body: JSON.stringify({
          content: textToBase64(`${JSON.stringify(publishContent, null, 2)}\n`),
          encoding: "base64",
        }),
      },
    );

    const tree = [{ path: contentPath, mode: "100644", type: "blob", sha: contentBlob.sha }];
    for (const [id, file] of state.pendingUploads) {
      const media = state.content.media.find((item) => item.id === id);
      if (!media) continue;
      const blob = await githubRequest(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`,
        {
          method: "POST",
          body: JSON.stringify({
            content: bytesToBase64(await file.arrayBuffer()),
            encoding: "base64",
          }),
        },
      );
      tree.push({
        path: media.repositoryPath || `${ADMIN_CONFIG.publicDirectory}/${media.path}`,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }
    for (const path of state.pendingDeletes) {
      tree.push({ path, mode: "100644", type: "blob", sha: null });
    }

    const nextTree = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`,
      {
        method: "POST",
        body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
      },
    );
    const commit = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`,
      {
        method: "POST",
        body: JSON.stringify({
          message: `İçerik güncellemesi · ${new Intl.DateTimeFormat("tr-TR").format(new Date())}`,
          tree: nextTree.sha,
          parents: [ref.object.sha],
        }),
      },
    );
    await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(branch)}`,
      { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) },
    );
    await dispatchDeployment(owner, repo, branch);
    const deploymentRun = await waitForDeployment(owner, repo, branch, commit.sha);
    await verifyPublishedContent(publishContent);

    state.content = normaliseContent(publishContent);
    state.pendingUploads.clear();
    state.pendingDeletes.clear();
    for (const url of state.previewUrls.values()) URL.revokeObjectURL(url);
    state.previewUrls.clear();
    localStorage.removeItem(DRAFT_KEY);
    localStorage.setItem(
      REPOSITORY_KEY,
      JSON.stringify({
        repositoryOwner: owner,
        repositoryName: repo,
        repositoryBranch: branch,
        contentPath: ADMIN_CONFIG.contentPath,
      }),
    );
    toast(
      `Yayın tamamlandı ve canlı content.json doğrulandı: ${commit.sha.slice(0, 7)}`
      + (deploymentRun.html_url ? `\n${deploymentRun.html_url}` : ""),
    );
  } catch (error) {
    toast(`Yayın başarısız: ${error.message}`, true);
  } finally {
    state.publishing = false;
    render();
  }
}

async function authenticateWithToken(token) {
  const candidate = token.trim();
  if (!candidate) {
    renderLogin("Token alanı boş bırakılamaz.");
    return;
  }
  state.token = candidate;
  state.apiDiagnostics = [];
  renderLoading("GitHub hesabı ve repository izinleri doğrulanıyor…");
  try {
    await authenticate();
  } catch (error) {
    state.token = null;
    state.user = null;
    state.content = null;
    renderLogin(`GitHub doğrulaması başarısız: ${error.message}`);
  }
}

async function authenticate() {
  state.user = await githubRequest("/user");
  const loginMatches = state.user.login.toLowerCase() === ADMIN_CONFIG.allowedLogin.toLowerCase();
  const idMatches = ADMIN_CONFIG.allowedUserId == null || state.user.id === ADMIN_CONFIG.allowedUserId;
  if (!loginMatches || !idMatches) {
    state.token = null;
    window.location.replace("../403.html");
    return;
  }
  await loadRepositoryContent();
  try {
    const repositories = await githubRequest(
      "/user/repos?affiliation=owner&per_page=100&sort=updated&direction=desc",
    );
    state.repositories = repositories.filter(
      (repository) =>
        repository.owner?.login?.toLowerCase() === ADMIN_CONFIG.allowedLogin.toLowerCase()
        && repository.permissions?.push,
    );
  } catch (error) {
    addApiDiagnostic("Yazılabilir repository listesi alınamadı", error);
    state.repositories = [];
  }
  render();
}

function logout() {
  state.token = null;
  state.user = null;
  state.content = null;
  state.apiDiagnostics = [];
  for (const url of state.previewUrls.values()) URL.revokeObjectURL(url);
  state.previewUrls.clear();
  state.pendingUploads.clear();
  state.pendingDeletes.clear();
  renderLogin("Oturum kapatıldı. GitHub yetkisini tamamen kaldırmak için GitHub ayarlarınızı kullanabilirsiniz.");
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action], [data-view]");
  if (!target) return;
  if (target.dataset.view) {
    state.view = target.dataset.view;
    state.sidebarOpen = false;
    render();
    return;
  }

  const action = target.dataset.action;
  if (action === "logout") logout();
  if (action === "toggle-token") {
    const input = document.querySelector("#github-token");
    if (input instanceof HTMLInputElement) {
      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";
      target.textContent = willShow ? "Gizle" : "Göster";
      target.setAttribute("aria-label", willShow ? "Token'ı gizle" : "Token'ı göster");
    }
  }
  if (action === "toggle-sidebar") {
    state.sidebarOpen = !state.sidebarOpen;
    render();
  }
  if (action === "publish") void publish();
  if (action === "add-item") itemModal(target.dataset.kind);
  if (action === "edit-item") itemModal(target.dataset.kind, target.dataset.id);
  if (action === "delete-item") deleteItem(target.dataset.kind, target.dataset.id);
  if (action === "delete-media") deleteMedia(target.dataset.id);
});

app.addEventListener("change", async (event) => {
  if (event.target.matches('[data-action="upload-media"]')) {
    try {
      for (const file of event.target.files) await queueMedia(file);
      persistDraft(`${event.target.files.length} dosya yayın kuyruğuna eklendi.`);
    } catch (error) {
      toast(error.message, true);
    }
  }
});

app.addEventListener("submit", (event) => {
  if (event.target.id === "token-login-form") {
    event.preventDefault();
    const token = new FormData(event.target).get("token");
    if (typeof token === "string") void authenticateWithToken(token);
  }
  if (event.target.id === "settings-form") {
    event.preventDefault();
    saveSettings(event.target);
  }
});

overlays.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  if (actionTarget.dataset.action === "close-modal") {
    if (event.target === actionTarget || actionTarget.tagName === "BUTTON") closeModal();
  }
});

overlays.addEventListener("submit", async (event) => {
  if (event.target.id !== "item-form") return;
  event.preventDefault();
  try {
    await saveItem(event.target);
  } catch (error) {
    toast(error.message, true);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

function init() {
  renderLogin();
}

void init();
