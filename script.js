/**
 * Süleyman Ay — Resmi Web Sitesi
 * Bağımsız ve küçük modüller hâlinde kullanıcı arayüzü davranışları.
 */

(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const header = document.querySelector("#site-header");
  const loader = document.querySelector("#loader");
  const themeButton = document.querySelector(".theme-toggle");
  const menuButton = document.querySelector(".menu-toggle");
  const mobileMenu = document.querySelector("#mobile-menu");
  const mobileLinks = document.querySelectorAll(".mobile-menu a");
  const navLinks = document.querySelectorAll(".desktop-nav .nav-link");
  const sections = document.querySelectorAll("main section[id]");
  const revealItems = document.querySelectorAll(".reveal");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  /**
   * Yönetim panelinin güncellediği tek /content.json dosyasını okur.
   *
   * Adres, sayfanın URL'sinden değil derlenmiş modülün konumundan türetilir.
   * Böylece GitHub Pages proje alt yolu ve sondaki eğik çizgi değişiklikleri
   * veri kaynağını etkilemez.
   * Dosya erişilemezse HTML içindeki güvenli başlangıç içeriği kullanılmaya devam eder.
   */
  const initManagedContent = async () => {
    try {
      const moduleUrl = new URL(import.meta.url);
      const moduleDirectory = new URL("./", moduleUrl);
      const siteRoot = moduleUrl.pathname.includes("/assets/")
        ? new URL("../", moduleDirectory)
        : moduleDirectory;
      const contentUrl = new URL("content.json", siteRoot);
      // GitHub Pages/CDN ve tarayıcı önbelleğinin eski JSON'u döndürmesini önler.
      contentUrl.searchParams.set("v", String(Date.now()));
      const response = await fetch(contentUrl, { cache: "no-store" });
      if (!response.ok) return;
      const content = await response.json();
      if (
        !content
        || typeof content !== "object"
        || !Array.isArray(content.apps)
        || !Array.isArray(content.games)
      ) {
        return;
      }
      const settings = content.settings || {};

      const resolveHttpUrl = (value) => {
        if (!value) return null;
        try {
          const resolved = new URL(value, contentUrl);
          return ["http:", "https:"].includes(resolved.protocol) ? resolved.toString() : null;
        } catch {
          return null;
        }
      };
      const resolveAssetUrl = resolveHttpUrl;

      document.title = settings.seoTitle || settings.siteTitle || document.title;
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", settings.seoDescription || settings.siteDescription || "");
      document
        .querySelector('meta[property="og:title"]')
        ?.setAttribute("content", settings.seoTitle || settings.siteTitle || "");
      document
        .querySelector('meta[property="og:description"]')
        ?.setAttribute("content", settings.seoDescription || settings.siteDescription || "");

      document.querySelectorAll(".brand__name").forEach((element) => {
        element.textContent = settings.siteTitle || "Süleyman Ay";
      });
      const heroLead = document.querySelector(".hero__lead");
      if (heroLead && settings.siteDescription) {
        heroLead.textContent = settings.siteDescription;
      }
      const footerText = document.querySelector(".footer__bottom > p");
      if (footerText && settings.footerText) footerText.textContent = settings.footerText;

      const savedTheme = localStorage.getItem("sa-theme");
      if (!savedTheme && settings.theme) {
        root.dataset.theme =
          settings.theme === "system"
            ? matchMedia("(prefers-color-scheme: light)").matches
              ? "light"
              : "dark"
            : settings.theme;
      }

      const faviconUrl = resolveAssetUrl(settings.faviconUrl);
      if (faviconUrl) {
        let favicon = document.querySelector('link[rel="icon"]');
        if (!favicon) {
          favicon = document.createElement("link");
          favicon.rel = "icon";
          document.head.append(favicon);
        }
        favicon.href = faviconUrl;
      }

      const siteLogoUrl = resolveAssetUrl(settings.siteLogoUrl);
      if (siteLogoUrl) {
        document.querySelectorAll(".brand__mark").forEach((mark) => {
          mark.textContent = "";
          mark.classList.add("has-image");
          mark.style.backgroundImage = `url("${siteLogoUrl}")`;
        });
      }

      const heroUrl = resolveAssetUrl(settings.heroUrl);
      const hero = document.querySelector(".hero");
      if (hero && heroUrl) {
        hero.classList.add("has-managed-image");
        hero.style.setProperty("--managed-hero", `url("${heroUrl}")`);
      }

      const githubLink = document.querySelector('.contact__links a[href*="github"]');
      const githubUrl = resolveHttpUrl(settings.githubUrl);
      if (githubLink && githubUrl) githubLink.href = githubUrl;
      const emailLink = document.querySelector('.contact__links a[href^="mailto:"]');
      if (emailLink && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email || "")) {
        emailLink.href = `mailto:${settings.email}`;
      }

      const createProductCard = (item, index, kind) => {
        const tones = ["cyan", "blue", "violet", "amber", "rose"];
        const card = document.createElement("article");
        card.className = "product-card reveal is-visible";
        card.dataset.tone = tones[index % tones.length];

        const top = document.createElement("div");
        top.className = "product-card__top";
        const icon = document.createElement("div");
        icon.className = "product-icon";
        icon.setAttribute("aria-hidden", "true");
        if (item.logoUrl) {
          const image = document.createElement("img");
          image.loading = "lazy";
          image.src = resolveAssetUrl(item.logoUrl);
          image.alt = "";
          icon.append(image);
        } else {
          const initials = document.createElement("span");
          initials.textContent = item.name
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")
            .toUpperCase();
          icon.append(initials);
        }
        const status = document.createElement("span");
        status.className =
          item.status === "Google Play" || item.status === "Yayında"
            ? "status status--live"
            : "status";
        const statusDot = document.createElement("i");
        status.append(statusDot, document.createTextNode(` ${item.status || "Yakında"}`));
        top.append(icon, status);

        const details = document.createElement("div");
        const type = document.createElement("span");
        type.className = "product-card__type";
        type.textContent =
          kind === "game" ? item.platform || "Oyun" : "Mobil uygulama";
        const title = document.createElement("h3");
        title.textContent = item.name;
        const description = document.createElement("p");
        description.textContent = item.description;
        details.append(type, title, description);

        const link = document.createElement("a");
        const externalUrl = resolveHttpUrl(item.googlePlayUrl || item.websiteUrl);
        link.className = "card-link";
        link.href = externalUrl || "#iletisim";
        link.setAttribute("aria-label", `${item.name} hakkında bilgi al`);
        if (externalUrl) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        const linkIcon = document.createElement("span");
        linkIcon.textContent = "↗";
        linkIcon.setAttribute("aria-hidden", "true");
        link.append(
          document.createTextNode(externalUrl ? "İncele" : "Detaylar"),
          linkIcon,
        );

        card.append(top, details, link);
        return card;
      };

      const appsGrid = document.querySelector("#uygulamalar .card-grid");
      if (appsGrid && Array.isArray(content.apps)) {
        appsGrid.replaceChildren(
          ...content.apps.map((item, index) =>
            createProductCard(item, index, "app"),
          ),
        );
      }
      const gamesGrid = document.querySelector("#oyunlar .card-grid");
      if (gamesGrid && Array.isArray(content.games)) {
        gamesGrid.replaceChildren(
          ...content.games.map((item, index) =>
            createProductCard(item, index, "game"),
          ),
        );
      }
    } catch {
      // Statik HTML, ağ veya JSON hatalarında eksiksiz bir yedek içerik sunar.
    }
  };

  /**
   * Kısa yükleme ekranını sayfa hazır olduğunda kaldırır.
   * Azaltılmış hareket tercihinde bekleme süresini sıfırlar.
   */
  const initLoader = () => {
    const hideLoader = () => {
      window.setTimeout(() => loader?.classList.add("is-hidden"), reduceMotion.matches ? 0 : 520);
    };

    if (document.readyState === "complete") {
      hideLoader();
    } else {
      window.addEventListener("load", hideLoader, { once: true });
    }
  };

  /**
   * Tema tercihini cihazda saklar. Böylece tarayıcı yeniden açıldığında
   * son seçilen tema korunur.
   */
  const initTheme = () => {
    if (!themeButton) return;

    const updateThemeButton = (theme) => {
      const isLight = theme === "light";
      themeButton.setAttribute("aria-pressed", String(isLight));
      themeButton.setAttribute("aria-label", isLight ? "Karanlık temaya geç" : "Açık temaya geç");
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isLight ? "#f7f9fc" : "#070b14");
    };

    updateThemeButton(root.dataset.theme);

    themeButton.addEventListener("click", () => {
      const nextTheme = root.dataset.theme === "light" ? "dark" : "light";
      root.dataset.theme = nextTheme;
      localStorage.setItem("sa-theme", nextTheme);
      updateThemeButton(nextTheme);
    });
  };

  /** Mobil menünün açık/kapalı durumunu erişilebilir niteliklerle eşleştirir. */
  const initMobileMenu = () => {
    if (!menuButton || !mobileMenu) return;

    const setMenu = (isOpen) => {
      menuButton.setAttribute("aria-expanded", String(isOpen));
      menuButton.setAttribute("aria-label", isOpen ? "Menüyü kapat" : "Menüyü aç");
      mobileMenu.classList.toggle("is-open", isOpen);
      body.classList.toggle("menu-open", isOpen);
    };

    menuButton.addEventListener("click", () => {
      setMenu(menuButton.getAttribute("aria-expanded") !== "true");
    });

    mobileLinks.forEach((link) => link.addEventListener("click", () => setMenu(false)));

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setMenu(false);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 820) setMenu(false);
    });
  };

  /** Kaydırma sırasında cam başlığı ve aktif menü bağlantısını günceller. */
  const initNavigationState = () => {
    const update = () => {
      header?.classList.toggle("is-scrolled", window.scrollY > 18);

      let currentSection = "anasayfa";
      sections.forEach((section) => {
        if (window.scrollY >= section.offsetTop - 180) currentSection = section.id;
      });

      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === `#${currentSection}`);
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
  };

  /** Görünür alana giren içerikleri tek seferlik yumuşak animasyonla gösterir. */
  const initRevealAnimations = () => {
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    revealItems.forEach((item) => observer.observe(item));
  };

  /** Hero ışıklarını işaretçi hareketine çok hafif tepki verecek şekilde taşır. */
  const initHeroParallax = () => {
    if (reduceMotion.matches || !matchMedia("(pointer: fine)").matches) return;

    const glows = document.querySelectorAll(".hero__glow");
    let frame = null;

    window.addEventListener(
      "pointermove",
      (event) => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const x = (event.clientX / window.innerWidth - 0.5) * 16;
          const y = (event.clientY / window.innerHeight - 0.5) * 16;
          glows.forEach((glow, index) => {
            const direction = index === 0 ? 1 : -1;
            glow.style.translate = `${x * direction}px ${y * direction}px`;
          });
        });
      },
      { passive: true },
    );
  };

  /** Gizlilik ve kullanım koşulları içeriklerini erişilebilir dialoglarda açar. */
  const initLegalDialogs = () => {
    document.querySelectorAll("[data-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        const dialog = document.querySelector(`#${button.dataset.dialog}`);
        if (dialog instanceof HTMLDialogElement) dialog.showModal();
      });
    });

    document.querySelectorAll(".legal-dialog").forEach((dialog) => {
      dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
  };

  initLoader();
  void initManagedContent();
  initTheme();
  initMobileMenu();
  initNavigationState();
  initRevealAnimations();
  initHeroParallax();
  initLegalDialogs();
})();
