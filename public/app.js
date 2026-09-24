(function () {
  "use strict";

  const SERIES_META = {
    titleVi: "Thiên Sứ Nhà Bên",
    titleJp: "Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken",
    author: "Saekisan",
    illustrator: "Hanekoto",
    status: "Đang cập nhật",
    description:
      "Amane sống một mình trong căn hộ cạnh bên Shiina Mahiru, cô gái hoàn hảo đến mức được ví như thiên sứ. Từ một cuộc gặp dưới mưa, khoảng cách giữa hai người dần thay đổi theo những ngày rất đỗi bình thường.",
    tags: ["Romance", "Đời thường", "Học đường", "Light Novel"]
  };

  let DATA = [];
  let currentView = "home";
  let currentVolIdx = -1;
  let currentChapIdx = -1;
  let fontSize = 20;
  let lineHeight = 2.02;
  let fontFamily = "serif";
  let theme = "sepia";
  let imageMode = "color";
  let einkEnabled = true;
  let continuousEnabled = true;
  let tapPagingEnabled = true;
  let wakeLockEnabled = true;
  let chapterSort = "asc";
  let chapterFilter = "all";
  let readingProgress = null;
  let readingHistory = [];
  // Per-chapter reading state, keyed "volIdx:chapIdx":
  // { block, offset } = paragraph anchor, pct = scroll %, done = reached the end,
  // v = ANCHOR_VERSION the anchor was saved under.
  let chapterState = {};
  // Bump when the chapter text is re-split into different paragraphs: older
  // anchors then point at the wrong block, so those fall back to pct.
  const ANCHOR_VERSION = 2;
  let pendingAnchor = null;
  let lastChromeScrollY = 0;
  let toastTimer = null;
  let lightboxImages = [];
  let lightboxIndex = 0;
  let lightboxPushed = false;
  let lightboxTouch = null;
  let isReadyForRefresh = false;
  let einkRefreshTimer = null;
  let einkGhostTimer = null;
  let einkApplyTimer = null;
  let einkTransitionToken = 0;

  const $ = (selector) => document.querySelector(selector);

  // Vietnamese words are single syllables; ~280 a minute is an easy
  // silent-reading pace for fiction.
  const READING_PACE = 280;

  function readingMinutes(words) {
    return Math.max(1, Math.round(words / READING_PACE));
  }

  const loadingScreen = $("#loading-screen");
  const header = $("#header");
  const headerTitle = $("#header-title");
  const headerSub = $("#header-sub");
  const btnBack = $("#btn-back");
  const btnLogo = $("#btn-logo");
  const btnFontUp = $("#btn-font-up");
  const btnFontDown = $("#btn-font-down");
  const btnSettings = $("#btn-settings");
  const settingsOverlay = $("#settings-overlay");
  const settingsPanel = $("#settings-panel");
  const btnSettingsClose = $("#btn-settings-close");
  const themeSwitch = $("#theme-switch");
  const lineHeightSwitch = $("#line-height-switch");
  const fontFamilySwitch = $("#font-family-switch");
  const imageModeSwitch = $("#image-mode-switch");
  const einkSwitch = $("#eink-switch");
  const continuousSwitch = $("#continuous-switch");
  const tapPageSwitch = $("#tap-page-switch");
  const wakeLockSwitch = $("#wake-lock-switch");
  const wakeLockGroup = $("#wake-lock-group");
  const fontSizeValue = $("#font-size-value");
  const main = $("#main");
  const ghostLayer = $("#eink-ghost");
  const progressBar = $("#progress-bar");
  const progressFill = $("#progress-fill");

  const viewHome = $("#view-home");
  const viewVolume = $("#view-volume");
  const viewReader = $("#view-reader");

  const seriesHero = $("#series-hero");
  const homeGrid = $("#home-grid");
  const seriesCover = $("#series-cover");
  const seriesBackdrop = $("#series-backdrop");
  const seriesTitleVi = $("#series-title-vi");
  const seriesTitleJp = $("#series-title-jp");
  const seriesDescription = $("#series-description");
  const seriesTags = $("#series-tags");
  const statVolumes = $("#stat-volumes");
  const statChapters = $("#stat-chapters");
  const statIllustrations = $("#stat-illustrations");
  const metaAuthor = $("#meta-author");
  const metaIllustrator = $("#meta-illustrator");
  const metaStatus = $("#meta-status");
  const btnStartReading = $("#btn-start-reading");
  const recentChapterList = $("#recent-chapter-list");
  const volumeGrid = $("#volume-grid");
  const searchInput = $("#search-input");
  const searchResults = $("#search-results");

  const continueCard = $("#reading-progress-card");
  const continueInfo = $("#continue-info");
  const btnContinue = $("#btn-continue");

  const volumeCover = $("#volume-cover");
  const volumeBackdrop = $("#volume-backdrop");
  const volumeTitle = $("#volume-title");
  const volumeChapterCount = $("#volume-chapter-count");
  const volumeSummary = $("#volume-summary");
  const chapterList = $("#chapter-list");
  const btnOpenFirstChapter = $("#btn-open-first-chapter");
  const btnOpenLatestChapter = $("#btn-open-latest-chapter");
  const btnSaveOffline = $("#btn-save-offline");
  const btnSortChapters = $("#btn-sort-chapters");
  const sortLabel = btnSortChapters.querySelector(".sort-label");
  const btnFilterAll = $("#btn-filter-all");
  const btnFilterStory = $("#btn-filter-story");
  const btnFilterIllustration = $("#btn-filter-illustration");

  const readerVolumeCover = $("#reader-volume-cover");
  const readerSidebarTitle = $("#reader-sidebar-title");
  const readerSidebarVolume = $("#reader-sidebar-volume");
  const readerChapterSelect = $("#reader-chapter-select");
  const readerProgressText = $("#reader-progress-text");
  const readerTimeLeft = $("#reader-time-left");
  const readerProgressFill = $("#reader-progress-fill");
  const btnReaderSettings = $("#btn-reader-settings");
  const readerChapters = $("#reader-chapters");
  const chapterIndicator = $("#chapter-indicator");
  const btnReaderPrev = $("#btn-reader-prev");
  const btnReaderList = $("#btn-reader-list");
  const btnReaderNext = $("#btn-reader-next");
  const btnPrevInline = $("#btn-prev-inline");
  const btnBackToVolume = $("#btn-back-to-volume");
  const btnNextInline = $("#btn-next-inline");
  const prevInlineTitle = $("#prev-inline-title");
  const nextInlineTitle = $("#next-inline-title");
  const readerToast = $("#reader-toast");
  const appToast = $("#app-toast");
  const btnToastTop = $("#btn-toast-top");
  const lightbox = $("#lightbox");
  const lightboxStage = $("#lightbox-stage");
  const lightboxImg = $("#lightbox-img");
  const lightboxCount = $("#lightbox-count");
  const lightboxClose = $("#lightbox-close");
  const lightboxPrev = $("#lightbox-prev");
  const lightboxNext = $("#lightbox-next");
  const btnBottomPrev = $("#btn-bottom-prev");
  const btnBottomNext = $("#btn-bottom-next");
  const btnBottomList = $("#btn-bottom-list");
  const readerBottomNav = $("#reader-bottom-nav");
  const btnBottomListen = $("#btn-bottom-listen");
  const btnReaderListen = $("#btn-reader-listen");
  const listenBar = $("#listen-bar");
  const listenWhere = $("#listen-where");
  const listenState = $("#listen-state");
  const listenTitle = $("#listen-title");
  const listenClose = $("#listen-close");
  const listenSleep = $("#listen-sleep");
  const listenSleepLabel = $("#listen-sleep-label");
  const listenPrev = $("#listen-prev");
  const listenToggle = $("#listen-toggle");
  const listenNext = $("#listen-next");
  const listenRate = $("#listen-rate");
  const listenVoiceGroup = $("#listen-voice-group");
  const listenVoiceSelect = $("#listen-voice");
  const listenVoiceHint = $("#listen-voice-hint");

  async function loadData() {
    try {
      // Always revalidate: app.js is never cached, so a stale index from an
      // earlier deploy would pair new code with the old data shape.
      const res = await fetch("/data/index.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      DATA = await res.json();
      await init();
    } catch (error) {
      console.error(error);
      loadingScreen.querySelector("p").textContent = "Không tải được dữ liệu truyện.";
    }
  }

  // ------------------------------------------------------------
  //  Chapter text lives in one file per volume, fetched the first time a
  //  chapter from that volume is needed (see build-data.js).
  // ------------------------------------------------------------

  const volumeTextRequests = new Map();
  const loadedVolumes = new Set();
  let pendingOpenToken = 0;

  function loadVolumeText(volIdx) {
    if (!volumeTextRequests.has(volIdx)) {
      const request = fetch(DATA[volIdx].text)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((texts) => {
          DATA[volIdx].chapters.forEach((chapter, chapIdx) => {
            chapter.content = texts[chapIdx] || "";
          });
          loadedVolumes.add(volIdx);
        });
      // A failed fetch (offline, say) may be retried on the next open.
      request.catch(() => volumeTextRequests.delete(volIdx));
      volumeTextRequests.set(volIdx, request);
    }
    return volumeTextRequests.get(volIdx);
  }

  // Runs `then` once the volume's text is available. Only the latest request
  // wins, so tapping two chapters quickly opens the second one.
  function withVolumeText(volIdx, then) {
    if (loadedVolumes.has(volIdx)) {
      then();
      return;
    }

    const token = ++pendingOpenToken;
    document.body.classList.add("is-fetching");
    loadVolumeText(volIdx)
      .then(() => {
        if (token === pendingOpenToken) then();
      })
      .catch(() => {
        if (token === pendingOpenToken) showMessage("Không tải được chương này. Kiểm tra kết nối mạng rồi thử lại.");
      })
      .finally(() => {
        if (token === pendingOpenToken) document.body.classList.remove("is-fetching");
      });
  }

  // ------------------------------------------------------------
  //  Offline: sw.js keeps every chapter and picture that has been opened;
  //  "Tải về đọc offline" fetches a whole volume ahead of time. The cache
  //  names must match sw.js.
  // ------------------------------------------------------------

  const TEXT_CACHE = "tenshi-text-v1";
  const IMAGE_CACHE = "tenshi-img-v1";
  let offlineSaveVolume = -1;

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker not registered", error));
  }

  function volumeFiles(volIdx) {
    const volume = DATA[volIdx];
    const images = volume.chapters.flatMap((chapter) => chapter.images.map((image) => image.src));
    return [volume.text, ...(volume.cover ? [volume.cover] : []), ...images];
  }

  function cacheFor(url) {
    return caches.open(url.startsWith("/data/") ? TEXT_CACHE : IMAGE_CACHE);
  }

  async function isVolumeSaved(volIdx) {
    const found = await Promise.all(volumeFiles(volIdx).map(async (url) => Boolean(await (await cacheFor(url)).match(url))));
    return found.every(Boolean);
  }

  function setOfflineButton(label, disabled) {
    btnSaveOffline.textContent = label;
    btnSaveOffline.disabled = disabled;
  }

  function updateOfflineButton(volIdx) {
    btnSaveOffline.hidden = !("caches" in window && "serviceWorker" in navigator);
    if (btnSaveOffline.hidden || offlineSaveVolume === volIdx) return;

    setOfflineButton("Tải về đọc offline", false);
    isVolumeSaved(volIdx)
      .then((saved) => {
        if (saved && currentVolIdx === volIdx && offlineSaveVolume !== volIdx) setOfflineButton("✓ Đã lưu để đọc offline", true);
      })
      .catch(() => {});
  }

  async function saveVolumeOffline(volIdx) {
    if (offlineSaveVolume >= 0) return;
    offlineSaveVolume = volIdx;

    const files = volumeFiles(volIdx);
    let done = 0;
    const report = () => {
      if (currentVolIdx === volIdx) setOfflineButton(`Đang tải… ${done}/${files.length}`, true);
    };
    report();

    try {
      // A few at a time: quick on a good connection, gentle on a poor one.
      const queue = [...files];
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (queue.length) {
          const url = queue.shift();
          const cache = await cacheFor(url);
          if (!(await cache.match(url))) await cache.add(url);
          done += 1;
          report();
        }
      }));
      // Ask the browser not to evict what the reader chose to keep.
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      offlineSaveVolume = -1;
      if (currentVolIdx === volIdx) setOfflineButton("✓ Đã lưu để đọc offline", true);
    } catch (error) {
      offlineSaveVolume = -1;
      if (currentVolIdx === volIdx) setOfflineButton("Chưa tải xong, bấm để thử lại", false);
      showMessage("Không tải được hết tập này. Kiểm tra kết nối mạng rồi thử lại.");
    }
  }

  let messageTimer = null;

  function showMessage(text) {
    appToast.textContent = text;
    appToast.hidden = false;
    clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => { appToast.hidden = true; }, 5000);
  }

  async function init() {
    const savedSize = parseInt(localStorage.getItem("tenshi-font-size"), 10);
    if (!Number.isNaN(savedSize)) {
      fontSize = clamp(savedSize, 16, 28);
    }

    const savedLineHeight = parseFloat(localStorage.getItem("tenshi-line-height"));
    if (!Number.isNaN(savedLineHeight)) {
      lineHeight = savedLineHeight;
    }

    const savedFontFamily = localStorage.getItem("tenshi-font-family");
    if (savedFontFamily === "serif" || savedFontFamily === "sans" || savedFontFamily === "system") {
      fontFamily = savedFontFamily;
    }

    const savedTheme = localStorage.getItem("tenshi-theme");
    if (savedTheme === "light" || savedTheme === "sepia" || savedTheme === "dark") {
      theme = savedTheme;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme = "dark";
    }

    const savedImageMode = localStorage.getItem("tenshi-image-mode");
    if (savedImageMode === "color" || savedImageMode === "mono") {
      imageMode = savedImageMode;
    }

    const savedContinuous = localStorage.getItem("tenshi-continuous");
    if (savedContinuous === "on" || savedContinuous === "off") {
      continuousEnabled = savedContinuous === "on";
    }

    const savedTapPaging = localStorage.getItem("tenshi-tap-page");
    if (savedTapPaging === "on" || savedTapPaging === "off") {
      tapPagingEnabled = savedTapPaging === "on";
    }

    const savedWakeLock = localStorage.getItem("tenshi-wake-lock");
    if (savedWakeLock === "on" || savedWakeLock === "off") {
      wakeLockEnabled = savedWakeLock === "on";
    }

    const savedRate = parseFloat(localStorage.getItem("tenshi-listen-rate"));
    if (LISTEN_RATES.includes(savedRate)) listen.rate = savedRate;
    listen.voiceURI = localStorage.getItem("tenshi-listen-voice") || "";

    const savedEink = localStorage.getItem("tenshi-eink");
    if (savedEink === "on" || savedEink === "off") {
      einkEnabled = savedEink === "on";
    } else if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      einkEnabled = false;
    }

    applyFontSize();
    applyLineHeight();
    applyFontFamily();
    applyTheme();
    applyImageMode();
    applyEink();
    applyContinuous();
    applyTapPaging();
    applyWakeLock();
    initListening();
    hydrateSeriesMeta();
    loadReadingProgress();
    loadReadingHistory();
    loadChapterState();
    updateContinueUI();
    renderVolumeGrid();
    renderRecentChapters();
    attachEvents();
    await restoreRoute();
    isReadyForRefresh = true;
    registerServiceWorker();

    loadingScreen.classList.add("hidden");
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 350);
  }

  function attachEvents() {
    btnBack.addEventListener("click", goBack);
    btnLogo.addEventListener("click", goHome);
    btnFontUp.addEventListener("click", () => changeFontSize(1));
    btnFontDown.addEventListener("click", () => changeFontSize(-1));

    btnSettings.addEventListener("click", openSettings);
    btnReaderSettings.addEventListener("click", openSettings);
    btnSettingsClose.addEventListener("click", closeSettings);
    settingsOverlay.addEventListener("click", closeSettings);

    themeSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setTheme(btn.dataset.themeValue));
    });

    lineHeightSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setLineHeight(parseFloat(btn.dataset.lineValue)));
    });

    fontFamilySwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setFontFamily(btn.dataset.fontValue));
    });

    imageModeSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setImageMode(btn.dataset.imageValue));
    });

    einkSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setEink(btn.dataset.einkValue));
    });

    continuousSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setContinuous(btn.dataset.continuousValue));
    });

    tapPageSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setTapPaging(btn.dataset.tapValue));
    });

    wakeLockSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setWakeLock(btn.dataset.wakeValue));
    });

    searchInput.addEventListener("input", () => runSearch(searchInput.value));
    searchResults.addEventListener("click", handleSearchResultClick);

    btnContinue.addEventListener("click", continueReading);
    btnStartReading.addEventListener("click", startReading);

    btnOpenFirstChapter.addEventListener("click", () => {
      const target = getFirstReadableChapter(currentVolIdx);
      if (target) openChapter(target.volIdx, target.chapIdx, { fromTop: true });
    });

    btnOpenLatestChapter.addEventListener("click", () => {
      const target = getLastReadableChapter(currentVolIdx);
      if (target) openChapter(target.volIdx, target.chapIdx);
    });

    btnSortChapters.addEventListener("click", toggleChapterSort);
    btnSaveOffline.addEventListener("click", () => saveVolumeOffline(currentVolIdx));
    btnFilterAll.addEventListener("click", () => setChapterFilter("all"));
    btnFilterStory.addEventListener("click", () => setChapterFilter("story"));
    btnFilterIllustration.addEventListener("click", () => setChapterFilter("illustration"));

    btnReaderPrev.addEventListener("click", () => navigateChapter(-1));
    btnReaderNext.addEventListener("click", () => navigateChapter(1));
    btnPrevInline.addEventListener("click", () => navigateChapter(-1));
    btnNextInline.addEventListener("click", () => navigateChapter(1));
    btnReaderList.addEventListener("click", goBack);
    btnBackToVolume.addEventListener("click", goBack);
    btnBottomPrev.addEventListener("click", () => navigateChapter(-1));
    btnBottomNext.addEventListener("click", () => navigateChapter(1));
    btnBottomList.addEventListener("click", goBack);

    readerChapterSelect.addEventListener("change", (event) => {
      const nextIndex = parseInt(event.target.value, 10);
      if (!Number.isNaN(nextIndex)) {
        openChapter(currentVolIdx, nextIndex, { replace: true });
      }
    });

    window.addEventListener("scroll", () => {
      updateScrollProgress();
      updateChromeVisibility();
      if (currentView === "reader") noteReaderActivity();
    }, { passive: true });

    // Any deliberate input ends the "keep the restored paragraph in place" window.
    ["wheel", "touchstart", "keydown", "mousedown"].forEach((type) => {
      window.addEventListener(type, (event) => {
        pendingAnchor = null;
        if (currentView === "reader") noteReaderActivity();
        // The reader moving the page themselves: stop following the voice
        // for a while so it does not yank them back.
        if (listen.active && !listenBar.contains(event.target)) listen.followPausedAt = Date.now();
      }, { passive: true });
    });

    // Late-loading images or fonts above the restored paragraph would push it down.
    readerChapters.addEventListener("load", reapplyPendingAnchor, true);

    window.addEventListener("pagehide", () => {
      recordReadingPosition();
      if (speech) speech.cancel();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") recordReadingPosition();
      // The browser drops the screen lock whenever the tab is hidden.
      syncWakeLock();
      if (document.visibilityState === "visible") nudgeListening();
    });

    readerChapters.addEventListener("click", (event) => {
      const opener = event.target.closest(".illustration-open");
      if (opener) {
        openLightbox(opener.querySelector("img"));
        return;
      }

      // Touch readers: tap low on the page to turn forward, high to turn
      // back, and in the middle to show or hide the header and bottom bar.
      if (!window.matchMedia("(hover: none)").matches) return;
      if (String(window.getSelection ? window.getSelection() : "")) return;
      if (event.target.closest("a, button")) return;

      const zone = tapPagingEnabled ? tapZone(event.clientY) : 0;
      if (zone) turnPage(zone);
      else setChromeHidden(!document.body.classList.contains("is-chrome-hidden"));
    });

    btnToastTop.addEventListener("click", () => {
      hideToast();
      pendingAnchor = null;
      window.scrollTo({ top: 0, behavior: "auto" });
    });

    lightboxClose.addEventListener("click", closeLightbox);
    lightboxPrev.addEventListener("click", () => stepLightbox(-1));
    lightboxNext.addEventListener("click", () => stepLightbox(1));
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox || event.target === lightboxStage) closeLightbox();
    });
    lightbox.addEventListener("touchstart", (event) => {
      lightboxTouch = event.touches.length === 1
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
        : null;
    }, { passive: true });
    lightbox.addEventListener("touchend", (event) => {
      if (!lightboxTouch) return;
      const dx = event.changedTouches[0].clientX - lightboxTouch.x;
      const dy = event.changedTouches[0].clientY - lightboxTouch.y;
      lightboxTouch = null;

      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        stepLightbox(dx < 0 ? 1 : -1);
      } else if (dy > 90 && dy > Math.abs(dx) * 1.5) {
        closeLightbox();
      }
    });
    window.addEventListener("popstate", () => {
      if (!lightbox.hidden) {
        lightboxPushed = false;
        hideLightbox();
        return;
      }
      // Back/forward overrides a chapter still waiting on its text.
      pendingOpenToken += 1;
      document.body.classList.remove("is-fetching");
      applyRoute(parseRoute(location.hash));
    });

    document.addEventListener("keydown", (event) => {
      if (!lightbox.hidden) {
        if (event.key === "Escape") closeLightbox();
        if (event.key === "ArrowLeft") stepLightbox(-1);
        if (event.key === "ArrowRight") stepLightbox(1);
        return;
      }

      if (event.key === "Escape" && settingsPanel.classList.contains("is-open")) {
        closeSettings();
        return;
      }

      if (currentView !== "reader") return;
      if (document.body.classList.contains("is-eink-busy")) return;
      if (settingsPanel.classList.contains("is-open")) return;

      if (event.key === "ArrowLeft") {
        navigateChapter(-1);
      }

      if (event.key === "ArrowRight") {
        navigateChapter(1);
      }
    });
  }

  function hydrateSeriesMeta() {
    const totals = getSeriesTotals();
    seriesTitleVi.textContent = SERIES_META.titleVi;
    seriesTitleJp.textContent = SERIES_META.titleJp;
    seriesDescription.textContent = SERIES_META.description;
    metaAuthor.textContent = SERIES_META.author;
    metaIllustrator.textContent = SERIES_META.illustrator;
    metaStatus.textContent = SERIES_META.status;
    statVolumes.textContent = totals.volumes;
    statChapters.textContent = totals.chapters;
    statIllustrations.textContent = totals.illustrations;
    seriesCover.src = getSeriesCover();
    seriesBackdrop.src = getSeriesCover();

    seriesTags.innerHTML = "";
    SERIES_META.tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tag;
      seriesTags.appendChild(chip);
    });
  }

  function getSeriesTotals() {
    return DATA.reduce(
      (acc, volume) => {
        acc.volumes += 1;
        acc.chapters += volume.chapters.length;
        acc.illustrations += volume.chapters.filter((chapter) => chapter.isIllustration).length;
        return acc;
      },
      { volumes: 0, chapters: 0, illustrations: 0 }
    );
  }

  function getSeriesCover() {
    return getVolumeCover(DATA[0]);
  }

  function getVolumeCover(volume) {
    return (volume && volume.cover) || "";
  }

  // Volumes without scanned art (e.g. the special-edition side stories) get
  // a typeset cover instead of borrowing another volume's artwork.
  function renderCoverMarkup(volume) {
    const src = getVolumeCover(volume);

    if (src) {
      return `<img src="${src}" alt="Bìa ${escapeHtml(volume.name)}" loading="lazy">`;
    }

    const [, mainName, edition] = volume.name.match(/^(.*?)\s*(?:\((.+)\))?$/);

    return `
      <span class="cover-fallback">
        <span class="cover-fallback-series">${escapeHtml(SERIES_META.titleVi)}</span>
        <span class="cover-fallback-title">
          ${escapeHtml(mainName)}
          ${edition ? `<span class="cover-fallback-edition">${escapeHtml(edition)}</span>` : ""}
        </span>
        <span class="cover-fallback-mark" aria-hidden="true">天</span>
      </span>
    `;
  }

  // Raw titles look like "Chương 3: Lời sẻ chia của thiên sứ", "illu vol 1",
  // or a bare title. Split them into a short label and a display title.
  // Bare titles get no label: their volumes are not numbered by chapter,
  // so `num` is only the entry's position in the list.
  function getChapterLabel(volume, chapIdx) {
    const chapter = volume.chapters[chapIdx];

    if (chapter.isIllustration) {
      return { kicker: "Minh họa", title: "Tranh minh họa", num: null };
    }

    const storyIndex = volume.chapters
      .slice(0, chapIdx + 1)
      .filter((item) => !item.isIllustration).length;
    const numbered = chapter.title.match(/^Chương\s*(\d+)\s*[:：]\s*(.+)$/i);
    const prefixed = chapter.title.match(/^(Ngoại truyện[^:：]*?)\s*[:：]\s*(.+)$/i);

    if (numbered) {
      return { kicker: `Chương ${numbered[1]}`, title: numbered[2].trim(), num: parseInt(numbered[1], 10) };
    }

    if (prefixed) {
      return { kicker: prefixed[1].trim(), title: prefixed[2].trim(), num: storyIndex };
    }

    return { kicker: null, title: chapter.title.trim(), num: storyIndex };
  }

  function formatChapterPlace(volume, label) {
    return [volume.name, label.kicker].filter(Boolean).join(" · ");
  }

  function getVolumeProgress(volIdx) {
    return countFinishedChapters(volIdx) / DATA[volIdx].chapters.length;
  }

  function renderVolumeGrid() {
    volumeGrid.innerHTML = "";

    DATA.forEach((volume, volIdx) => {
      const isResume = readingProgress && readingProgress.volIdx === volIdx;
      const isRead = isVolumeRead(volIdx);
      const progress = getVolumeProgress(volIdx);
      const card = document.createElement("button");

      card.type = "button";
      card.className = `volume-card${isResume ? " is-resume" : ""}${isRead ? " is-read" : ""}`;
      card.innerHTML = `
        <span class="book">
          ${renderCoverMarkup(volume)}
          ${isResume ? '<span class="volume-flag">Đang đọc</span>' : ""}
        </span>
        ${progress > 0 ? `<span class="volume-progress"><span style="width:${Math.round(progress * 100)}%"></span></span>` : ""}
        <span class="volume-card-title">${escapeHtml(volume.name)}</span>
        <span class="volume-card-meta">${buildVolumeExcerpt(volume)}</span>
      `;

      card.addEventListener("click", () => openVolume(volIdx));
      volumeGrid.appendChild(card);
    });
  }

  function buildVolumeExcerpt(volume) {
    const storyCount = volume.chapters.filter((chapter) => !chapter.isIllustration).length;
    const illustrationCount = volume.chapters.length - storyCount;

    return illustrationCount > 0
      ? `${storyCount} chương · ${illustrationCount} minh họa`
      : `${storyCount} chương`;
  }

  // The data has no publish dates, so the sidebar shows the reader's own
  // history. The newest entry is already the hero's "continue" block.
  function renderRecentChapters() {
    const entries = readingHistory
      .filter((entry) => !(
        readingProgress &&
        entry.volIdx === readingProgress.volIdx &&
        entry.chapIdx === readingProgress.chapIdx
      ))
      .slice(0, 5);

    recentChapterList.innerHTML = "";
    homeGrid.classList.toggle("has-sidebar", entries.length > 0);

    entries.forEach((entry) => {
      const volume = DATA[entry.volIdx];
      const label = getChapterLabel(volume, entry.chapIdx);
      const partial = getPartialPercent(entry.volIdx, entry.chapIdx);
      let status = "";
      if (isChapterRead(entry.volIdx, entry.chapIdx)) status = "Đã đọc xong · ";
      else if (partial) status = `Đã đọc ${partial}% · `;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "recent-item";
      button.innerHTML = `
        <span class="recent-volume">${escapeHtml(formatChapterPlace(volume, label))}</span>
        <span class="recent-title">${escapeHtml(label.title)}</span>
        <span class="recent-time">${status}${formatTimeAgo(entry.timestamp)}</span>
      `;
      button.addEventListener("click", () => openChapter(entry.volIdx, entry.chapIdx));
      recentChapterList.appendChild(button);
    });
  }

  function loadReadingHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem("tenshi-history"));
      if (Array.isArray(saved)) {
        readingHistory = saved.filter(
          (entry) => entry && DATA[entry.volIdx] && DATA[entry.volIdx].chapters[entry.chapIdx]
        );
      }
    } catch (error) {
      console.warn("Could not parse reading history", error);
    }
  }

  function recordReadingHistory(volIdx, chapIdx) {
    readingHistory = [
      { volIdx, chapIdx, timestamp: Date.now() },
      ...readingHistory.filter((entry) => !(entry.volIdx === volIdx && entry.chapIdx === chapIdx))
    ].slice(0, 8);

    localStorage.setItem("tenshi-history", JSON.stringify(readingHistory));
  }

  const relativeTime = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
  const TIME_UNITS = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60]
  ];

  function formatTimeAgo(timestamp) {
    const seconds = Math.round((timestamp - Date.now()) / 1000);

    for (const [unit, size] of TIME_UNITS) {
      if (Math.abs(seconds) >= size) {
        const text = relativeTime.format(Math.round(seconds / size), unit);
        return text.charAt(0).toUpperCase() + text.slice(1);
      }
    }

    return "Vừa xong";
  }

  function chapterKey(volIdx, chapIdx) {
    return `${volIdx}:${chapIdx}`;
  }

  function getChapterState(volIdx, chapIdx) {
    return chapterState[chapterKey(volIdx, chapIdx)] || null;
  }

  function isChapterRead(volIdx, chapIdx) {
    const state = getChapterState(volIdx, chapIdx);
    return Boolean(state && state.done);
  }

  function countFinishedChapters(volIdx) {
    return DATA[volIdx].chapters.filter((_, chapIdx) => isChapterRead(volIdx, chapIdx)).length;
  }

  function isVolumeRead(volIdx) {
    return countFinishedChapters(volIdx) === DATA[volIdx].chapters.length;
  }

  // Percent read of a chapter that was started but not finished, else 0.
  function getPartialPercent(volIdx, chapIdx) {
    const state = getChapterState(volIdx, chapIdx);
    return state && !state.done && state.pct > 2 ? state.pct : 0;
  }

  function loadChapterState() {
    try {
      const saved = JSON.parse(localStorage.getItem("tenshi-chapters"));
      if (saved && typeof saved === "object") {
        chapterState = saved;
        return;
      }
    } catch (error) {
      console.warn("Could not parse chapter state", error);
    }

    // First visit with per-chapter tracking: carry over the old read marks
    // (everything before the bookmark) so returning readers keep their ticks.
    if (!readingProgress) return;

    DATA.forEach((volume, volIdx) => {
      volume.chapters.forEach((_, chapIdx) => {
        const isBefore =
          volIdx < readingProgress.volIdx ||
          (volIdx === readingProgress.volIdx && chapIdx < readingProgress.chapIdx);
        if (isBefore) chapterState[chapterKey(volIdx, chapIdx)] = { done: true, pct: 100 };
      });
    });
    saveChapterState();
  }

  function saveChapterState() {
    localStorage.setItem("tenshi-chapters", JSON.stringify(chapterState));
  }

  // Accent-folded, lower-case copy used for matching. The text is NFC
  // (build-data.js), so this keeps one character per character and a
  // match's offsets also locate it in the original.
  function normalizeText(text) {
    return text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  }

  // The chapter split into paragraphs, as the reader shows them. Empty until
  // the volume's text has been fetched.
  function chapterParagraphs(chapter) {
    if (chapter.content === undefined) return [];
    if (!chapter.paragraphs) {
      chapter.paragraphs = chapter.content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
    }
    return chapter.paragraphs;
  }

  function foldedParagraphs(chapter) {
    if (!chapter.folded) chapter.folded = chapterParagraphs(chapter).map(normalizeText);
    return chapter.folded;
  }

  const CONTENT_SEARCH_LIMIT = 40;
  let contentSearchTimer = null;
  let contentSearchToken = 0;

  function runSearch(rawQuery) {
    const query = rawQuery.trim();
    clearTimeout(contentSearchTimer);
    contentSearchToken += 1;

    if (!query) {
      searchResults.style.display = "none";
      searchResults.innerHTML = "";
      volumeGrid.style.display = "";
      return;
    }

    const needle = normalizeText(query);
    volumeGrid.style.display = "none";
    searchResults.style.display = "grid";

    const volumeMatches = DATA
      .map((volume, volIdx) => ({ volume, volIdx }))
      .filter(({ volume }) => normalizeText(volume.name).includes(needle));

    const chapterMatches = [];
    DATA.forEach((volume, volIdx) => {
      volume.chapters.forEach((chapter, chapIdx) => {
        if (normalizeText(chapter.title).includes(needle)) {
          chapterMatches.push({ volume, volIdx, chapter, chapIdx });
        }
      });
    });

    let html = "";

    volumeMatches.slice(0, 6).forEach(({ volume, volIdx }) => {
      html += `
        <button type="button" class="search-result-item" data-type="volume" data-vol="${volIdx}">
          <span class="search-result-volume">Tập truyện · ${buildVolumeExcerpt(volume)}</span>
          <span class="search-result-title">${escapeHtml(volume.name)}</span>
        </button>
      `;
    });

    chapterMatches.slice(0, 24).forEach(({ volume, volIdx, chapIdx }) => {
      const label = getChapterLabel(volume, chapIdx);
      html += `
        <button type="button" class="search-result-item" data-type="chapter" data-vol="${volIdx}" data-chap="${chapIdx}">
          <span class="search-result-volume">${escapeHtml(formatChapterPlace(volume, label))}</span>
          <span class="search-result-title">${escapeHtml(label.title)}</span>
        </button>
      `;
    });

    const hasTitleMatches = html !== "";
    const searchesContent = needle.length >= 2;
    html += '<div class="search-content"></div>';
    searchResults.innerHTML = html;

    const contentBox = searchResults.querySelector(".search-content");
    if (!searchesContent) {
      if (!hasTitleMatches) contentBox.innerHTML = `<p class="search-empty">Không tìm thấy kết quả cho "${escapeHtml(query)}".</p>`;
      return;
    }

    contentBox.innerHTML = '<p class="search-note">Đang tìm trong nội dung truyện…</p>';
    const token = contentSearchToken;
    contentSearchTimer = window.setTimeout(() => {
      searchContent(needle, query, hasTitleMatches, contentBox, token);
    }, 250);
  }

  // Full-text search needs every volume's text; fetch whatever is missing
  // (once), then search what arrived.
  async function searchContent(needle, query, hasTitleMatches, contentBox, token) {
    const loads = await Promise.allSettled(DATA.map((_, volIdx) => loadVolumeText(volIdx)));
    if (token !== contentSearchToken) return;

    const missing = loads.filter((result) => result.status === "rejected").length;
    const hits = [];
    let total = 0;

    DATA.forEach((volume, volIdx) => {
      if (!loadedVolumes.has(volIdx)) return;
      volume.chapters.forEach((chapter, chapIdx) => {
        if (chapter.isIllustration) return;
        foldedParagraphs(chapter).forEach((folded, p) => {
          const start = folded.indexOf(needle);
          if (start < 0) return;
          total += 1;
          if (hits.length < CONTENT_SEARCH_LIMIT) hits.push({ volIdx, chapIdx, p, start, len: needle.length });
        });
      });
    });

    let html = "";
    if (hits.length) {
      html += `<p class="search-section">Trong nội dung · ${total} đoạn${total > hits.length ? `, hiện ${hits.length} đoạn đầu` : ""}</p>`;
      hits.forEach((hit) => {
        const volume = DATA[hit.volIdx];
        const label = getChapterLabel(volume, hit.chapIdx);
        const text = chapterParagraphs(volume.chapters[hit.chapIdx])[hit.p];
        html += `
          <button type="button" class="search-result-item" data-type="hit" data-vol="${hit.volIdx}" data-chap="${hit.chapIdx}" data-p="${hit.p}" data-start="${hit.start}" data-len="${hit.len}">
            <span class="search-result-volume">${escapeHtml(formatChapterPlace(volume, label))} · ${escapeHtml(label.title)}</span>
            <span class="search-snippet">${renderSnippet(text, hit.start, hit.len)}</span>
          </button>
        `;
      });
    } else if (!hasTitleMatches) {
      html += `<p class="search-empty">Không tìm thấy kết quả cho "${escapeHtml(query)}".</p>`;
    }

    if (missing) {
      html += `<p class="search-note">Chưa tải được ${missing} tập nên chưa tìm trong các tập đó. Kiểm tra kết nối mạng.</p>`;
    }

    contentBox.innerHTML = html;
  }

  // A line of context around a match, cut at word boundaries.
  function renderSnippet(text, start, len) {
    let from = Math.max(0, start - 60);
    let to = Math.min(text.length, start + len + 110);
    if (from > 0) from = text.indexOf(" ", from) + 1 || from;
    if (to < text.length) to = text.lastIndexOf(" ", to) > start + len ? text.lastIndexOf(" ", to) : to;

    return `${from > 0 ? "…" : ""}${escapeHtml(text.slice(from, start))}<mark class="search-hit">${escapeHtml(text.slice(start, start + len))}</mark>${escapeHtml(text.slice(start + len, to))}${to < text.length ? "…" : ""}`;
  }

  function handleSearchResultClick(event) {
    const btn = event.target.closest(".search-result-item");
    if (!btn) return;

    const volIdx = parseInt(btn.dataset.vol, 10);
    const chapIdx = parseInt(btn.dataset.chap, 10);
    if (btn.dataset.type === "volume") {
      openVolume(volIdx);
    } else if (btn.dataset.type === "hit") {
      const hit = { p: parseInt(btn.dataset.p, 10), start: parseInt(btn.dataset.start, 10), len: parseInt(btn.dataset.len, 10) };
      openChapter(volIdx, chapIdx, { hit });
    } else {
      openChapter(volIdx, chapIdx);
    }
  }

  // Opens a chapter on a search match (or any paragraph, when `hit` has no
  // `len`): the paragraph goes to the top of the screen, matched words marked.
  function revealSearchHit(volIdx, chapIdx, hit) {
    const section = sectionFor(volIdx, chapIdx);
    const el = section && section.querySelector(`.reader-content > [data-p="${hit.p}"]`);
    if (!el) return;

    const text = chapterParagraphs(DATA[volIdx].chapters[chapIdx])[hit.p];
    if (hit.len && el.textContent === text) {
      el.innerHTML = `${escapeHtml(text.slice(0, hit.start))}<mark class="search-hit">${escapeHtml(text.slice(hit.start, hit.start + hit.len))}</mark>${escapeHtml(text.slice(hit.start + hit.len))}`;
    }

    const blocks = [...section.querySelector(".reader-content").children];
    holdAnchor(section, { block: blocks.indexOf(el), offset: 0 });
  }

  // `historyMode`: "push" (default) adds a browser history entry for the new
  // view, "replace" swaps the current one, "none" leaves history alone.
  function showView(name, historyMode) {
    // Leaving the reader: the page still shows the chapter, so save where we were.
    if (currentView === "reader" && name !== "reader") recordReadingPosition();

    [viewHome, viewVolume, viewReader].forEach((view) => view.classList.remove("active"));
    currentView = name;
    document.body.dataset.view = name;

    if (name === "home") {
      viewHome.classList.add("active");
      headerTitle.textContent = SERIES_META.titleVi;
      btnBack.style.display = "none";
      progressBar.style.display = "none";
      document.title = SERIES_META.titleVi;
      renderVolumeGrid();
      updateContinueUI();
      renderRecentChapters();
    } else if (name === "volume") {
      viewVolume.classList.add("active");
      btnBack.style.display = "inline-flex";
      progressBar.style.display = "none";
      headerTitle.textContent = DATA[currentVolIdx]?.name || SERIES_META.titleVi;
      document.title = `${DATA[currentVolIdx]?.name || SERIES_META.titleVi} | ${SERIES_META.titleVi}`;
      renderVolumeGrid();
    } else {
      viewReader.classList.add("active");
      btnBack.style.display = "inline-flex";
      progressBar.style.display = "block";
      document.title = chapterDocTitle();
    }

    closeSettings();
    hideToast();
    pendingAnchor = null;
    window.scrollTo({ top: 0, behavior: "auto" });
    lastChromeScrollY = 0;
    setChromeHidden(false);
    if (name === "volume") revealResumeChapter();
    updateScrollProgress();
    syncHistory(historyMode || "push");
    if (name === "reader") noteReaderActivity();
    else syncWakeLock();
  }

  // Long volumes (the side-story book has 37 entries) would otherwise open
  // their contents far above the chapter being read.
  function revealResumeChapter() {
    const item = chapterList.querySelector(".chapter-item.is-resume");
    if (!item) return;

    const rect = item.getBoundingClientRect();
    if (rect.bottom <= window.innerHeight - 24) return;
    window.scrollTo({ top: rect.top + window.scrollY - window.innerHeight / 3, behavior: "auto" });
  }

  // ------------------------------------------------------------
  //  Routing: #/tap-1 (table of contents), #/tap-1/3 (chapter index 3).
  //  Each view gets a history entry, so the phone's back gesture walks
  //  chapter → contents → home instead of leaving the site, and a chapter
  //  link can be bookmarked or shared.
  // ------------------------------------------------------------

  function volumeSlug(volIdx) {
    return normalizeText(DATA[volIdx].name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function routeHash(route) {
    if (route.view === "volume") return `#/${volumeSlug(route.volIdx)}`;
    if (route.view === "reader") return `#/${volumeSlug(route.volIdx)}/${route.chapIdx}`;
    return "";
  }

  function parseRoute(hash) {
    let parts = [];
    try {
      parts = decodeURIComponent(hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
    } catch (error) {
      // Malformed escape in a hand-edited URL: treat as home.
    }

    const volIdx = parts.length ? DATA.findIndex((_, i) => volumeSlug(i) === parts[0]) : -1;
    if (volIdx < 0) return { view: "home" };

    const chapIdx = /^\d+$/.test(parts[1] || "") ? parseInt(parts[1], 10) : -1;
    if (!DATA[volIdx].chapters[chapIdx]) return { view: "volume", volIdx };

    return { view: "reader", volIdx, chapIdx };
  }

  function currentRoute() {
    return { view: currentView, volIdx: currentVolIdx, chapIdx: currentChapIdx };
  }

  function syncHistory(mode) {
    if (mode === "none") return;

    const route = routeHash(currentRoute());
    const current = window.history.state;
    if (current && current.route === route) return;

    const url = `${location.pathname}${location.search}${route}`;
    if (mode === "replace") {
      window.history.replaceState({ route, prev: current ? current.prev : undefined }, "", url);
    } else {
      window.history.pushState({ route, prev: current ? current.route : undefined }, "", url);
    }
  }

  // Show whatever the URL points at (back/forward, or the first load).
  function applyRoute(route, options) {
    if (routeHash(route) === routeHash(currentRoute())) return;

    if (route.view === "reader" && !loadedVolumes.has(route.volIdx)) {
      withVolumeText(route.volIdx, () => applyRoute(route, options));
      return;
    }

    const change = () => {
      if (route.view === "reader") {
        renderChapterView(route.volIdx, route.chapIdx);
        showView("reader", options?.history || "none");
        restoreReadingPosition(route.volIdx, route.chapIdx, options);
      } else if (route.view === "volume") {
        renderVolumeView(route.volIdx);
        showView("volume", options?.history || "none");
      } else {
        showView("home", options?.history || "none");
      }
    };

    // A history move must land even mid page-turn, or the URL and the page
    // would disagree.
    if (document.body.classList.contains("is-eink-busy")) {
      cancelEinkPageTurn();
      change();
      return;
    }

    runEinkPageTurn(change, { lagMs: 120, totalMs: 760 });
  }

  async function restoreRoute() {
    window.history.scrollRestoration = "manual";
    let route = parseRoute(location.hash);

    // Fetch a linked chapter's text behind the loading screen; if that fails
    // (offline and never read), fall back to the volume's contents.
    if (route.view === "reader") {
      try {
        await loadVolumeText(route.volIdx);
      } catch (error) {
        route = { view: "volume", volIdx: route.volIdx };
        showMessage("Không tải được chương này. Kiểm tra kết nối mạng rồi thử lại.");
      }
    }

    if (route.view === "home") {
      showView("home", "replace");
    } else {
      applyRoute(route, { history: "replace", exact: true });
    }
  }

  function goHome() {
    if (currentView === "home") {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    runEinkPageTurn(() => {
      showView("home");
    }, { lagMs: 120, totalMs: 760 });
  }

  // Up one level: chapter → contents → home. When that level is the page we
  // came from, step back through history rather than stacking a new entry.
  function goBack() {
    if (currentView === "home") return;
    const parent = currentView === "reader" ? { view: "volume", volIdx: currentVolIdx } : { view: "home" };

    if (window.history.state && window.history.state.prev === routeHash(parent)) {
      window.history.back();
    } else if (parent.view === "volume") {
      openVolume(parent.volIdx);
    } else {
      goHome();
    }
  }

  function openVolume(volIdx) {
    runEinkPageTurn(() => {
      renderVolumeView(volIdx);
      showView("volume");
    }, { lagMs: 120, totalMs: 740 });
  }

  function renderVolumeView(volIdx) {
    recordReadingPosition();
    currentVolIdx = volIdx;
    const volume = DATA[volIdx];
    const storyCount = volume.chapters.filter((chapter) => !chapter.isIllustration).length;
    const illustrationCount = volume.chapters.length - storyCount;

    volumeTitle.textContent = volume.name;
    volumeChapterCount.textContent = `${storyCount} chương chữ${illustrationCount ? ` · ${illustrationCount} bộ minh họa` : ""}`;
    volumeSummary.textContent = createVolumeSummary(volume, volIdx);
    volumeCover.innerHTML = renderCoverMarkup(volume);
    volumeBackdrop.src = getVolumeCover(volume);

    renderChapterList();
    updateOfflineButton(volIdx);
  }

  function createVolumeSummary(volume, volIdx) {
    const finished = countFinishedChapters(volIdx);
    if (finished === volume.chapters.length) return "Bạn đã đọc hết tập này.";

    if (readingProgress && readingProgress.volIdx === volIdx) {
      const label = getChapterLabel(volume, readingProgress.chapIdx);
      return `Đang đọc dở: ${[label.kicker, label.title].filter(Boolean).join(" — ")}`;
    }

    return finished > 0 ? `Đã đọc ${finished}/${volume.chapters.length} mục.` : "";
  }

  function renderChapterList() {
    if (currentVolIdx < 0) return;

    const volume = DATA[currentVolIdx];
    const entries = volume.chapters.map((chapter, chapIdx) => ({ chapter, chapIdx }));
    const filtered = entries.filter(({ chapter }) => {
      if (chapterFilter === "story") return !chapter.isIllustration;
      if (chapterFilter === "illustration") return chapter.isIllustration;
      return true;
    });

    if (chapterSort === "desc") {
      filtered.reverse();
    }

    chapterList.innerHTML = "";

    if (filtered.length === 0) {
      chapterList.innerHTML = '<p class="chapter-empty">Tập này không có mục nào thuộc loại này.</p>';
      return;
    }

    filtered.forEach(({ chapter, chapIdx }) => {
      const isResume =
        readingProgress &&
        readingProgress.volIdx === currentVolIdx &&
        readingProgress.chapIdx === chapIdx;
      const isRead = !isResume && isChapterRead(currentVolIdx, chapIdx);
      const partial = getPartialPercent(currentVolIdx, chapIdx);
      const label = getChapterLabel(volume, chapIdx);
      const imageCount = chapter.images ? chapter.images.length : 0;
      const num = chapter.isIllustration
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="m21 16-5-5-9 9"></path></svg>'
        : label.num;
      const meta = [];

      if (!chapter.isIllustration && label.kicker && !label.kicker.startsWith("Chương")) meta.push(escapeHtml(label.kicker));
      if (!chapter.isIllustration && chapter.words) meta.push(`~${readingMinutes(chapter.words)} phút`);
      if (imageCount > 0) meta.push(chapter.isIllustration ? `${imageCount} ảnh` : `${imageCount} ảnh minh họa`);
      if (isResume && partial) meta.push(`đã đọc ${partial}%`);

      let state = "";
      if (isResume) state = '<span class="state-pill">Đang đọc</span>';
      else if (partial) state = `<span class="state-progress" title="Đã đọc ${partial}%">${partial}%</span>`;
      else if (isRead) state = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Đã đọc"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';

      const item = document.createElement("button");
      item.type = "button";
      item.className = `chapter-item${chapter.isIllustration ? " is-illustration" : ""}${isResume ? " is-resume" : ""}${isRead ? " is-read" : ""}`;
      item.innerHTML = `
        <span class="chapter-num">${num}</span>
        <span class="chapter-copy">
          <span class="chapter-title">${escapeHtml(label.title)}</span>
          ${meta.length ? `<span class="chapter-meta">${meta.join(" · ")}</span>` : ""}
        </span>
        <span class="chapter-state">${state}</span>
        <span class="chapter-arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"></path>
          </svg>
        </span>
      `;

      item.addEventListener("click", () => openChapter(currentVolIdx, chapIdx));
      chapterList.appendChild(item);
    });
  }

  // options.fromTop: ignore the saved position; options.replace: moving
  // between chapters swaps the history entry, so back returns to the contents;
  // options.hit: a search match to scroll to and highlight.
  function openChapter(volIdx, chapIdx, options) {
    withVolumeText(volIdx, () => runEinkPageTurn(() => {
      renderChapterView(volIdx, chapIdx);
      showView("reader", options?.replace ? "replace" : "push");
      if (options?.hit) revealSearchHit(volIdx, chapIdx, options.hit);
      else if (!options?.fromTop) restoreReadingPosition(volIdx, chapIdx);
    }, { lagMs: 160, totalMs: 860 }));
  }

  function renderChapterView(volIdx, chapIdx) {
    recordReadingPosition();
    hideToast();

    readerChapters.innerHTML = "";
    readerChapters.appendChild(renderChapterSection(volIdx, chapIdx, "h1"));
    setCurrentChapter(volIdx, chapIdx);
    showListeningParagraph(false);
  }

  // One chapter as a page of the book. Chapters appended below in continuous
  // mode get an h2 so the page keeps a single h1.
  function renderChapterSection(volIdx, chapIdx, headingTag) {
    const volume = DATA[volIdx];
    const chapter = volume.chapters[chapIdx];
    const label = getChapterLabel(volume, chapIdx);

    let html = "";

    if (chapter.isIllustration) {
      html += renderIllustrations(chapter.images);
    } else {
      html += renderTextContent(chapterParagraphs(chapter));

      if (chapter.images && chapter.images.length > 0) {
        html += chapter.images
          .map((image) => renderIllustration(image, `Minh họa ${chapter.title}`))
          .join("");
      }
    }

    const section = document.createElement("article");
    section.className = "reader-frame";
    section.dataset.vol = String(volIdx);
    section.dataset.chap = String(chapIdx);
    section.innerHTML = `
      <header class="reader-head">
        <p class="reader-breadcrumb">${escapeHtml(formatChapterPlace(volume, label))}</p>
        <${headingTag} class="reader-stage-title">${escapeHtml(label.title)}</${headingTag}>
        <p class="reader-meta">${chapter.isIllustration
          ? `${chapter.images.length} ảnh minh họa`
          : `Khoảng ${readingMinutes(chapter.words)} phút đọc`}</p>
        <div class="reader-ornament" aria-hidden="true"><span></span><i>✦</i><span></span></div>
      </header>
      <div class="reader-content">${html}</div>
      <div class="reader-fin" aria-hidden="true"><span></span>Hết chương<span></span></div>
    `;
    return section;
  }

  // Points the header, sidebar, chapter picker and saved progress at the
  // chapter being read.
  function setCurrentChapter(volIdx, chapIdx) {
    currentVolIdx = volIdx;
    currentChapIdx = chapIdx;

    const volume = DATA[volIdx];
    const label = getChapterLabel(volume, chapIdx);

    headerTitle.textContent = label.title;
    readerSidebarTitle.textContent = label.title;
    readerSidebarVolume.textContent = volume.name;
    if (readerVolumeCover.dataset.vol !== String(volIdx)) {
      readerVolumeCover.innerHTML = renderCoverMarkup(volume);
      readerVolumeCover.dataset.vol = String(volIdx);
    }

    populateReaderSelect(volIdx, chapIdx);
    updateNavButtons();
    saveReadingProgress(volIdx, chapIdx);
  }

  function chapterDocTitle() {
    return `${getChapterLabel(DATA[currentVolIdx], currentChapIdx).title} | ${SERIES_META.titleVi}`;
  }

  function chapterSections() {
    return [...readerChapters.children];
  }

  function sectionFor(volIdx, chapIdx) {
    return chapterSections().find(
      (section) => Number(section.dataset.vol) === volIdx && Number(section.dataset.chap) === chapIdx
    ) || null;
  }

  // The line just under the header (or the top edge while it is hidden) that
  // counts as "where the reader is".
  function readingLine() {
    return Math.max(0, header.getBoundingClientRect().bottom);
  }

  // How far the reader is through a chapter: 100 once its last line has come
  // into view at the bottom of the screen.
  function chapterPercent(section) {
    const rect = section.getBoundingClientRect();
    const line = readingLine();
    const span = rect.height - (window.innerHeight - line);
    if (span <= 0) return rect.bottom <= window.innerHeight ? 100 : 0;
    return clamp(((line - rect.top) / span) * 100, 0, 100);
  }

  // Continuous mode: whichever chapter is under the reading line becomes the
  // current one, so the header, URL and saved progress follow the scroll.
  function trackCurrentChapter() {
    const line = readingLine();
    const sections = chapterSections();
    // At the very top the line sits above the first chapter's page; that
    // chapter is still the one on screen. In the gap between two pages,
    // keep whichever was current.
    const section = sections.find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.top <= line && rect.bottom > line;
    }) || (sections[0] && sections[0].getBoundingClientRect().top > line ? sections[0] : null);
    if (!section) return;

    const volIdx = Number(section.dataset.vol);
    const chapIdx = Number(section.dataset.chap);
    if (volIdx === currentVolIdx && chapIdx === currentChapIdx) return;

    // Saves the chapter being left; one scrolled past records as finished.
    recordReadingPosition();
    setCurrentChapter(volIdx, chapIdx);
    document.title = chapterDocTitle();
    syncHistory("replace");
  }

  // Continuous mode: once the last chapter on the page is within a couple of
  // screens of running out, put the next one underneath it.
  function maybeAppendNextChapter() {
    if (!continuousEnabled) return;

    for (let added = 0; added < 3; added += 1) {
      const sections = chapterSections();
      const last = sections[sections.length - 1];
      if (!last || last.getBoundingClientRect().bottom > window.innerHeight * 3) return;

      const next = getAdjacentChapter(1, { volIdx: Number(last.dataset.vol), chapIdx: Number(last.dataset.chap) });
      if (!next) return;

      // Next volume's text not here yet: fetch it and try again once it is.
      if (!loadedVolumes.has(next.volIdx)) {
        loadVolumeText(next.volIdx)
          .then(() => { if (currentView === "reader") maybeAppendNextChapter(); })
          .catch(() => {});
        return;
      }

      readerChapters.appendChild(renderChapterSection(next.volIdx, next.chapIdx, "h2"));
      showListeningParagraph(false);
    }
  }

  // Which paragraph of a chapter sits at the top of the viewport, and how far into it.
  function getReadingAnchor(section) {
    const top = readingLine();
    const blocks = section.querySelector(".reader-content").children;

    for (let i = 0; i < blocks.length; i += 1) {
      const rect = blocks[i].getBoundingClientRect();
      if (rect.bottom > top) {
        return { block: i, offset: rect.height ? clamp((top - rect.top) / rect.height, 0, 1) : 0 };
      }
    }

    return { block: Math.max(blocks.length - 1, 0), offset: 1 };
  }

  function scrollToAnchor(section, anchor) {
    const block = section.querySelector(".reader-content").children[anchor.block];
    if (!block) return false;

    const rect = block.getBoundingClientRect();
    const target = rect.top + window.scrollY + anchor.offset * rect.height - header.offsetHeight - 12;
    window.scrollTo({ top: Math.max(0, target), behavior: "auto" });
    lastChromeScrollY = window.scrollY;
    updateScrollProgress();
    return true;
  }

  // Reopens a chapter where the reader stopped. Without `exact` (a normal
  // open rather than a page refresh), only a mid-chapter position counts:
  // a chapter left at the very start or end opens from the top.
  function restoreReadingPosition(volIdx, chapIdx, options) {
    const state = getChapterState(volIdx, chapIdx);
    const section = sectionFor(volIdx, chapIdx);
    if (!state || !section) return false;
    if (!options?.exact && (state.pct <= 2 || state.pct >= 95)) return false;

    let anchor;
    if (state.v === ANCHOR_VERSION && state.block != null) {
      anchor = { block: state.block, offset: state.offset || 0 };
    } else if (state.pct > 0) {
      const rect = section.getBoundingClientRect();
      const line = readingLine();
      const span = Math.max(0, rect.height - (window.innerHeight - line));
      window.scrollTo({ top: rect.top + window.scrollY - line + (state.pct / 100) * span, behavior: "auto" });
      anchor = getReadingAnchor(section);
    } else {
      return false;
    }

    if (!holdAnchor(section, anchor)) return false;

    if (!options?.exact) showToast();
    return true;
  }

  // Scrolls to an anchor and keeps it in place for a few seconds while late
  // fonts or pictures above it settle.
  function holdAnchor(section, anchor) {
    if (!scrollToAnchor(section, anchor)) return false;

    pendingAnchor = { section, ...anchor };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(reapplyPendingAnchor);
    }
    window.setTimeout(() => { pendingAnchor = null; }, 4000);
    return true;
  }

  function reapplyPendingAnchor() {
    if (pendingAnchor && currentView === "reader" && pendingAnchor.section.isConnected) {
      scrollToAnchor(pendingAnchor.section, pendingAnchor);
    }
  }

  function recordReadingPosition() {
    if (currentView !== "reader" || currentVolIdx < 0 || currentChapIdx < 0) return;
    if (pendingAnchor) return;

    const section = sectionFor(currentVolIdx, currentChapIdx);
    if (!section) return;

    const pct = Math.round(chapterPercent(section));
    const key = chapterKey(currentVolIdx, currentChapIdx);
    const next = { ...chapterState[key], ...getReadingAnchor(section), pct, v: ANCHOR_VERSION };

    if (pct >= 97) next.done = true;
    chapterState[key] = next;
    saveChapterState();
  }

  function populateReaderSelect(volIdx, activeIndex) {
    const volume = DATA[volIdx];
    readerChapterSelect.innerHTML = "";

    volume.chapters.forEach((chapter, chapIdx) => {
      const option = document.createElement("option");
      const label = getChapterLabel(volume, chapIdx);
      option.value = String(chapIdx);
      if (chapter.isIllustration) option.textContent = label.title;
      else if (label.kicker) option.textContent = `${label.kicker}: ${label.title}`;
      else option.textContent = `${label.num}. ${label.title}`;
      option.selected = chapIdx === activeIndex;
      readerChapterSelect.appendChild(option);
    });
  }

  // data-p ties each element back to its paragraph, for search matches.
  function renderTextContent(paragraphs) {
    if (!paragraphs.length) {
      return "<p><em>Chưa có nội dung cho chương này.</em></p>";
    }

    return paragraphs
      .map((paragraph, p) => {
        if (paragraph.startsWith("---") && paragraph.endsWith("---")) {
          const heading = paragraph.replace(/^-+\s*/, "").replace(/\s*-+$/, "");
          if (!heading) return `<div class="section-break" data-p="${p}">• • •</div>`;
          return `<div class="section-break">• • •</div><p class="section-heading-inline" data-p="${p}">${escapeHtml(heading)}</p>`;
        }

        const isDialogue = /^["“‘「『]/.test(paragraph);
        const className = isDialogue ? ' class="dialogue"' : "";
        return `<p${className} data-p="${p}">${escapeHtml(paragraph)}</p>`;
      })
      .join("");
  }

  function renderIllustrations(images) {
    if (!images || images.length === 0) {
      return "<p>Chưa có ảnh minh họa cho mục này.</p>";
    }

    return images.map((image) => renderIllustration(image, "Minh họa")).join("");
  }

  // width/height reserve the picture's space before it loads, so the text
  // below it does not jump while the reader is partway down the page.
  function renderIllustration(image, alt) {
    return `
      <div class="illustration-container">
        <button type="button" class="illustration-open" aria-label="Phóng to ảnh">
          <img src="${image.src}" width="${image.w}" height="${image.h}" alt="${escapeHtml(alt)}" class="illustration-img" loading="lazy" decoding="async">
        </button>
      </div>
    `;
  }

  function updateNavButtons() {
    const prevTarget = getAdjacentChapter(-1);
    const nextTarget = getAdjacentChapter(1);
    const volume = DATA[currentVolIdx];

    btnReaderPrev.disabled = !prevTarget;
    btnReaderNext.disabled = !nextTarget;
    btnPrevInline.disabled = !prevTarget;
    btnNextInline.disabled = !nextTarget;
    btnBottomPrev.disabled = !prevTarget;
    btnBottomNext.disabled = !nextTarget;

    prevInlineTitle.textContent = prevTarget ? describeTarget(prevTarget) : "Đây là chương đầu tiên";
    nextInlineTitle.textContent = nextTarget ? describeTarget(nextTarget) : "Bạn đã đọc đến chương mới nhất";

    chapterIndicator.textContent = `${currentChapIdx + 1} / ${volume.chapters.length}`;
  }

  function describeTarget(target) {
    const volume = DATA[target.volIdx];
    const title = getChapterLabel(volume, target.chapIdx).title;
    return target.volIdx === currentVolIdx ? title : `${volume.name} · ${title}`;
  }

  // The chapter before/after `from` (default: the current one), crossing
  // into the neighbouring volume at either end.
  function getAdjacentChapter(direction, from) {
    const start = from || { volIdx: currentVolIdx, chapIdx: currentChapIdx };
    if (start.volIdx < 0 || start.chapIdx < 0) return null;

    let volIdx = start.volIdx;
    let chapIdx = start.chapIdx + direction;

    while (volIdx >= 0 && volIdx < DATA.length) {
      const volume = DATA[volIdx];

      if (chapIdx >= 0 && chapIdx < volume.chapters.length) {
        return { volIdx, chapIdx };
      }

      volIdx += direction > 0 ? 1 : -1;

      if (volIdx < 0 || volIdx >= DATA.length) {
        return null;
      }

      chapIdx = direction > 0 ? 0 : DATA[volIdx].chapters.length - 1;
    }

    return null;
  }

  function navigateChapter(direction) {
    const target = getAdjacentChapter(direction);
    if (target) {
      openChapter(target.volIdx, target.chapIdx, { replace: true });
    }
  }

  function setChapterFilter(filter) {
    chapterFilter = filter;
    btnFilterAll.classList.toggle("is-active", filter === "all");
    btnFilterStory.classList.toggle("is-active", filter === "story");
    btnFilterIllustration.classList.toggle("is-active", filter === "illustration");
    renderChapterList();
    triggerEinkRefresh(240);
  }

  function toggleChapterSort() {
    chapterSort = chapterSort === "asc" ? "desc" : "asc";
    btnSortChapters.dataset.order = chapterSort;
    sortLabel.textContent = chapterSort === "asc" ? "Cũ → mới" : "Mới → cũ";
    renderChapterList();
    triggerEinkRefresh(240);
  }

  function startReading() {
    const firstTarget = getFirstReadableChapter(0) || { volIdx: 0, chapIdx: 0 };
    openChapter(firstTarget.volIdx, firstTarget.chapIdx, { fromTop: true });
  }

  function getFirstReadableChapter(volIdx) {
    const volume = DATA[volIdx];
    if (!volume) return null;

    const chapIdx = volume.chapters.findIndex((chapter) => !chapter.isIllustration);
    return { volIdx, chapIdx: chapIdx >= 0 ? chapIdx : 0 };
  }

  function getLastReadableChapter(volIdx) {
    const volume = DATA[volIdx];
    if (!volume) return null;

    for (let i = volume.chapters.length - 1; i >= 0; i -= 1) {
      if (!volume.chapters[i].isIllustration) {
        return { volIdx, chapIdx: i };
      }
    }

    return { volIdx, chapIdx: Math.max(volume.chapters.length - 1, 0) };
  }

  function updateScrollProgress() {
    if (currentView !== "reader") return;

    trackCurrentChapter();
    maybeAppendNextChapter();

    const section = sectionFor(currentVolIdx, currentChapIdx);
    const progress = section ? chapterPercent(section) : 0;

    progressFill.style.width = `${progress}%`;
    readerProgressFill.style.width = `${progress}%`;
    readerProgressText.textContent = `${Math.round(progress)}%`;

    const left = minutesLeft(DATA[currentVolIdx].chapters[currentChapIdx], progress);
    headerSub.textContent = left === null ? "" : left === 0 ? "Sắp hết chương" : `Còn khoảng ${left} phút`;
    readerTimeLeft.textContent = left === null ? "—" : left === 0 ? "Sắp hết" : `~${left} phút`;
    schedulePositionSave();
  }

  // Minutes of reading left in a chapter: null for picture pages, 0 once
  // the end is in sight.
  function minutesLeft(chapter, progress) {
    if (chapter.isIllustration || !chapter.words) return null;
    if (progress >= 97) return 0;
    return readingMinutes(chapter.words * (1 - progress / 100));
  }

  let positionSaveScheduled = false;

  function schedulePositionSave() {
    if (positionSaveScheduled) return;
    positionSaveScheduled = true;
    window.setTimeout(() => {
      positionSaveScheduled = false;
      recordReadingPosition();
    }, 150);
  }

  function changeFontSize(direction) {
    fontSize = clamp(fontSize + direction * 2, 16, 28);
    localStorage.setItem("tenshi-font-size", String(fontSize));
    applyFontSize();
    triggerEinkRefresh(260);
  }

  function applyFontSize() {
    document.documentElement.style.setProperty("--reader-font-size", `${fontSize}px`);
    fontSizeValue.textContent = `${fontSize}px`;
    btnFontDown.disabled = fontSize <= 16;
    btnFontUp.disabled = fontSize >= 28;
  }

  function setLineHeight(value) {
    if (Number.isNaN(value)) return;
    lineHeight = value;
    localStorage.setItem("tenshi-line-height", String(lineHeight));
    applyLineHeight();
    triggerEinkRefresh(260);
  }

  function applyLineHeight() {
    document.documentElement.style.setProperty("--reader-line-height", String(lineHeight));
    lineHeightSwitch.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", parseFloat(btn.dataset.lineValue) === lineHeight);
    });
  }

  function setFontFamily(value) {
    if (value !== "serif" && value !== "sans" && value !== "system") return;
    fontFamily = value;
    localStorage.setItem("tenshi-font-family", fontFamily);
    applyFontFamily();
    triggerEinkRefresh(260);
  }

  function applyFontFamily() {
    document.documentElement.style.setProperty("--reader-font-family", `var(--font-${fontFamily})`);
    fontFamilySwitch.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.fontValue === fontFamily);
    });
  }

  function setTheme(value) {
    if (value !== "light" && value !== "sepia" && value !== "dark") return;
    theme = value;
    localStorage.setItem("tenshi-theme", theme);
    applyTheme();
    triggerEinkRefresh(360);
  }

  function applyTheme() {
    document.body.dataset.theme = theme;
    themeSwitch.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.themeValue === theme);
    });

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.content = getComputedStyle(document.body).getPropertyValue("--bg").trim();
    }
  }

  function setImageMode(value) {
    if (value !== "color" && value !== "mono") return;
    imageMode = value;
    localStorage.setItem("tenshi-image-mode", imageMode);
    applyImageMode();
    triggerEinkRefresh(360);
  }

  function applyImageMode() {
    document.body.dataset.images = imageMode;
    imageModeSwitch.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.imageValue === imageMode);
    });
  }

  function setContinuous(value) {
    if (value !== "on" && value !== "off") return;
    continuousEnabled = value === "on";
    localStorage.setItem("tenshi-continuous", value);
    applyContinuous();

    // Switching to one chapter per page: drop the chapters stacked around the
    // one being read and put the reader back on the same paragraph.
    if (currentView === "reader" && !continuousEnabled && chapterSections().length > 1) {
      recordReadingPosition();
      renderChapterView(currentVolIdx, currentChapIdx);
      restoreReadingPosition(currentVolIdx, currentChapIdx, { exact: true });
    }

    updateScrollProgress();
    triggerEinkRefresh(260);
  }

  function setTapPaging(value) {
    if (value !== "on" && value !== "off") return;
    tapPagingEnabled = value === "on";
    localStorage.setItem("tenshi-tap-page", value);
    applyTapPaging();
    triggerEinkRefresh(260);
  }

  function applyTapPaging() {
    tapPageSwitch.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", (btn.dataset.tapValue === "on") === tapPagingEnabled);
    });
  }

  function setWakeLock(value) {
    if (value !== "on" && value !== "off") return;
    wakeLockEnabled = value === "on";
    localStorage.setItem("tenshi-wake-lock", value);
    applyWakeLock();
    syncWakeLock();
    triggerEinkRefresh(260);
  }

  function applyWakeLock() {
    wakeLockGroup.hidden = !("wakeLock" in navigator);
    wakeLockSwitch.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", (btn.dataset.wakeValue === "on") === wakeLockEnabled);
    });
  }

  function applyContinuous() {
    continuousSwitch.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", (btn.dataset.continuousValue === "on") === continuousEnabled);
    });
  }

  function setEink(value) {
    if (value !== "on" && value !== "off") return;
    einkEnabled = value === "on";
    localStorage.setItem("tenshi-eink", value);
    applyEink();
    triggerEinkRefresh(360);
  }

  function applyEink() {
    document.body.dataset.eink = einkEnabled ? "on" : "off";
    einkSwitch.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", (btn.dataset.einkValue === "on") === einkEnabled);
    });
  }

  function setChromeHidden(hidden) {
    document.body.classList.toggle("is-chrome-hidden", hidden);
  }

  // Reader only: scrolling down into the text hides the header and bottom
  // bar; scrolling up, reaching either end, or opening settings shows them.
  function updateChromeVisibility() {
    const y = window.scrollY;

    // A tap-turned page scrolls on its own; it should not pop the bars back.
    if (Date.now() < chromeLockedUntil) {
      lastChromeScrollY = y;
      return;
    }

    if (currentView !== "reader" || settingsPanel.classList.contains("is-open")) {
      setChromeHidden(false);
      lastChromeScrollY = y;
      return;
    }

    const nearBottom = y + window.innerHeight >= document.documentElement.scrollHeight - 120;
    if (y < 80 || nearBottom) {
      setChromeHidden(false);
      lastChromeScrollY = y;
      return;
    }

    const delta = y - lastChromeScrollY;
    if (Math.abs(delta) < 12) return;

    setChromeHidden(delta > 0);
    lastChromeScrollY = y;
  }

  // ------------------------------------------------------------
  //  Tap to turn the page (touch screens).
  // ------------------------------------------------------------

  let chromeLockedUntil = 0;

  // Lower third of the screen turns forward, the top quarter back.
  function tapZone(y) {
    if (y > window.innerHeight * 0.67) return 1;
    if (y < window.innerHeight * 0.25) return -1;
    return 0;
  }

  // Moves one screenful of text, keeping about a line of overlap so the eye
  // can find its place. Turning forward also tucks the bars away.
  function turnPage(direction) {
    const chromeShown = !document.body.classList.contains("is-chrome-hidden");
    const nav = chromeShown && getComputedStyle(readerBottomNav).display !== "none"
      ? readerBottomNav.getBoundingClientRect().top
      : window.innerHeight;
    const visibleTop = readingLine();
    const overlap = fontSize * lineHeight * 1.2;
    const distance = direction > 0 ? nav - overlap : -(nav - overlap - visibleTop);

    chromeLockedUntil = Date.now() + 800;
    if (direction > 0) setChromeHidden(true);
    window.scrollBy({ top: distance, behavior: einkEnabled ? "auto" : "smooth" });
    triggerEinkRefresh(260);
  }

  // ------------------------------------------------------------
  //  Keep the screen on while reading. The lock lapses after ten idle
  //  minutes, so a phone left face-up still goes to sleep.
  // ------------------------------------------------------------

  const WAKE_IDLE_MS = 10 * 60 * 1000;
  let wakeLock = null;
  let wakeLockRequest = null;
  let wakeIdle = false;
  let wakeIdleTimer = null;
  let lastActivityAt = 0;

  // While a device voice reads the screen stays on regardless: browsers stop
  // speaking once it goes off. The online voice plays on with it off.
  function wantsWakeLock() {
    if (document.visibilityState !== "visible") return false;
    if (listen.playing && listen.engine === "device") return true;
    return wakeLockEnabled && !wakeIdle && currentView === "reader";
  }

  function syncWakeLock() {
    if (!("wakeLock" in navigator)) return;
    if (!wantsWakeLock()) {
      releaseWakeLock();
      return;
    }
    if (wakeLock || wakeLockRequest) return;

    wakeLockRequest = navigator.wakeLock.request("screen")
      .then((lock) => {
        wakeLock = lock;
        lock.addEventListener("release", () => {
          if (wakeLock === lock) wakeLock = null;
        });
        if (!wantsWakeLock()) releaseWakeLock();
      })
      .catch(() => {})
      .finally(() => { wakeLockRequest = null; });
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    const lock = wakeLock;
    wakeLock = null;
    lock.release().catch(() => {});
  }

  function noteReaderActivity() {
    const now = Date.now();
    // Restarting the idle timer on every scroll event is wasteful; every few
    // seconds is plenty against a ten-minute timeout.
    if (wakeIdle || !wakeIdleTimer || now - lastActivityAt > 5000) {
      lastActivityAt = now;
      wakeIdle = false;
      clearTimeout(wakeIdleTimer);
      wakeIdleTimer = window.setTimeout(() => {
        wakeIdle = true;
        syncWakeLock();
      }, WAKE_IDLE_MS);
    }
    syncWakeLock();
  }

  // ------------------------------------------------------------
  //  Nghe truyện: the device's own text-to-speech voice reads the story
  //  aloud. It runs from the story data rather than the page, so it keeps
  //  going chapter after chapter (and into the next volume) wherever the
  //  reader is in the app; the paragraph being read is highlighted, and
  //  followed, whenever it is on screen.
  // ------------------------------------------------------------

  const speech = "speechSynthesis" in window ? window.speechSynthesis : null;
  // Two ways to read aloud: the device's own voice (Web Speech API), or the
  // voice behind translate.google.com's speaker button, fetched as audio a
  // sentence at a time. The online one works in every browser and keeps
  // playing with the screen off, but it is unofficial: Google may throttle
  // or change it, so a failure falls back to the device voice.
  const ONLINE_VOICE = "online:google";
  const LISTEN_RATES = [0.75, 1, 1.25, 1.5];
  const LISTEN_SLEEP = [0, 15, 30, 60, "chapter"];
  // Chrome silently drops an utterance that runs past ~15 seconds, so text
  // is spoken in sentence-sized pieces.
  const LISTEN_CHUNK = 160;
  const FOLLOW_PAUSE_MS = 8000;
  // CSS Custom Highlight API: marks the sentence and word being spoken
  // without touching the page's markup.
  const canHighlightSpeech = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight === "function";

  const listen = {
    active: false,
    playing: false,
    volIdx: -1,
    chapIdx: -1,
    queue: [],
    i: 0,
    token: 0,
    errors: 0,
    lastEventAt: 0,
    followPausedAt: 0,
    rate: 1,
    voiceURI: "",
    speakingEl: null,
    engine: "device",
    onlineFailed: false,
    audio: null,
    mediaKey: null,
    // Word timing: real boundary events where the voice sends them,
    // otherwise an estimate from how fast earlier pieces were spoken.
    realBoundaries: false,
    msPerChar: 70,
    wordTimer: null,
    sleep: 0,
    sleepTimer: null,
    sleepTicker: null,
    sleepUntil: 0
  };

  function initListening() {
    [btnBottomListen, btnReaderListen].forEach((btn) => {
      btn.addEventListener("click", listenFromReader);
    });

    renderVoiceOptions();
    if (speech) {
      speech.addEventListener("voiceschanged", renderVoiceOptions);
      // Not every browser announces voices that arrive late.
      [300, 1000, 3000].forEach((ms) => window.setTimeout(renderVoiceOptions, ms));
    }
    listenVoiceSelect.addEventListener("change", () => {
      listen.voiceURI = listenVoiceSelect.value;
      listen.realBoundaries = false;
      listen.onlineFailed = false;
      localStorage.setItem("tenshi-listen-voice", listen.voiceURI);
      renderVoiceOptions();
      if (listen.playing) speakCurrent();
    });

    // Lock-screen and headset controls (they act on the online voice, which
    // plays through an <audio> element).
    if ("mediaSession" in navigator) {
      const actions = {
        play: () => setListenPlaying(true),
        pause: () => setListenPlaying(false),
        previoustrack: () => stepListening(-1),
        nexttrack: () => stepListening(1),
        stop: closeListening
      };
      Object.entries(actions).forEach(([action, handler]) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch (error) {
          // Action not supported by this browser.
        }
      });
    }

    listenToggle.addEventListener("click", () => setListenPlaying(!listen.playing));
    listenPrev.addEventListener("click", () => stepListening(-1));
    listenNext.addEventListener("click", () => stepListening(1));
    listenRate.addEventListener("click", cycleListenRate);
    listenSleep.addEventListener("click", cycleListenSleep);
    listenClose.addEventListener("click", closeListening);
    listenWhere.addEventListener("click", revealListening);

    // Some voices stall without an error; restart the current piece if
    // nothing has been heard for a while (or give up on a stuck download).
    window.setInterval(() => {
      if (!listen.playing) return;
      const idle = Date.now() - listen.lastEventAt;
      if (listen.engine === "online") {
        if (idle > 20000 && listen.audio && (listen.audio.paused || listen.audio.readyState < 3)) onlineFailure();
      } else if ((idle > 8000 && !speech.speaking && !speech.pending) || idle > 20000) {
        speakCurrent();
      }
    }, 4000);
  }

  function vietnameseVoices() {
    return speech ? speech.getVoices().filter((voice) => /^vi([-_]|$)/i.test(voice.lang)) : [];
  }

  // Neural/online voices (Edge's HoaiMy and NamMinh, Android's "Google Tiếng
  // Việt … (Natural)") sound far better than the older on-device ones.
  function voiceScore(voice) {
    let score = 0;
    if (/natural|online|neural|premium|enhanced/i.test(voice.name)) score += 4;
    if (/hoaimy|namminh|google/i.test(voice.name)) score += 2;
    return score;
  }

  function listenVoice() {
    const voices = vietnameseVoices();
    return voices.find((voice) => voice.voiceURI === listen.voiceURI)
      || voices.slice().sort((a, b) => voiceScore(b) - voiceScore(a))[0]
      || null;
  }

  function renderVoiceOptions() {
    const voices = vietnameseVoices();
    listenVoiceSelect.innerHTML = "";
    const auto = document.createElement("option");
    auto.value = "";
    auto.textContent = "Tự chọn";
    listenVoiceSelect.appendChild(auto);
    const online = document.createElement("option");
    online.value = ONLINE_VOICE;
    online.textContent = "Google Dịch (trực tuyến)";
    listenVoiceSelect.appendChild(online);
    voices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      option.textContent = voice.name.replace(/\s*-\s*Vietnamese \(Vietnam\)/i, "");
      listenVoiceSelect.appendChild(option);
    });
    const known = listen.voiceURI === ONLINE_VOICE || voices.some((voice) => voice.voiceURI === listen.voiceURI);
    listenVoiceSelect.value = known ? listen.voiceURI : "";

    const onlineNote = "Google Dịch: dùng được trên mọi máy và nghe được cả khi tắt màn hình, cần có mạng (dịch vụ không chính thức, nếu lỗi sẽ tự chuyển sang giọng của máy).";
    listenVoiceHint.textContent = voices.length
      ? `${onlineNote} Giọng của máy: không cần mạng nhưng màn hình phải luôn sáng; hay nhất là Edge (HoaiMy, NamMinh) và Android (Google Tiếng Việt).`
      : `${onlineNote} Máy này chưa có giọng tiếng Việt riêng để đọc khi mất mạng. ${voiceInstallHint()}`;
  }

  // Which voice reads: the one chosen in settings; on "Tự chọn", a neural
  // device voice on a computer (Edge's HoaiMy sounds best and the screen is
  // on anyway), otherwise the online voice, which keeps playing with a
  // phone's screen off. Falls back to any device voice once online fails.
  function chooseListenEngine() {
    const device = listenVoice();
    if (listen.voiceURI === ONLINE_VOICE) return !listen.onlineFailed ? "online" : device ? "device" : null;
    if (listen.voiceURI && device && device.voiceURI === listen.voiceURI) return "device";

    const onComputer = !window.matchMedia("(hover: none)").matches;
    if (device && onComputer && voiceScore(device) >= 4) return "device";
    if (!listen.onlineFailed) return "online";
    return device ? "device" : null;
  }

  // Where to get a Vietnamese voice on this device. Websites only get the
  // voices the operating system provides (plus Edge's online ones): Chrome's
  // own Google voices have no Vietnamese on a laptop, so there Edge is
  // usually the easy answer.
  function voiceInstallHint() {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) {
      return "Android: Cài đặt › Chuyển văn bản thành giọng nói › tải giọng Tiếng Việt, rồi mở lại trình duyệt.";
    }
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
      return "iPhone/iPad: Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói › Tiếng Việt, rồi mở lại Safari.";
    }
    if (/Edg\//.test(ua)) {
      return "Giọng HoaiMy và NamMinh của Edge cần có mạng: kiểm tra kết nối rồi tải lại trang.";
    }
    if (/Windows/i.test(ua)) {
      return "Trên Windows, dễ nhất là mở trang bằng Microsoft Edge (có sẵn giọng HoaiMy, NamMinh rất hay). Hoặc cài giọng cho Windows: Cài đặt › Thời gian và ngôn ngữ › Giọng nói › Thêm giọng nói › Tiếng Việt, rồi mở lại trình duyệt.";
    }
    if (/Macintosh/.test(ua)) {
      return "Trên Mac: Cài đặt hệ thống › Trợ năng › Nội dung được đọc › Giọng hệ thống › Quản lý giọng nói › Tiếng Việt, rồi mở lại trình duyệt. Hoặc mở trang bằng Microsoft Edge.";
    }
    return "Hãy mở trang bằng Microsoft Edge trên máy tính, hoặc Chrome trên Android.";
  }

  // What gets spoken for a chapter: its title, then every paragraph in
  // pieces of a sentence or two.
  function buildListenQueue(volIdx, chapIdx) {
    const volume = DATA[volIdx];
    const label = getChapterLabel(volume, chapIdx);
    const queue = [{ p: -1, text: `${[label.kicker, label.title].filter(Boolean).join(". ")}.`, start: null }];

    chapterParagraphs(volume.chapters[chapIdx]).forEach((paragraph, p) => {
      if (paragraph.startsWith("---") && paragraph.endsWith("---")) {
        const heading = paragraph.replace(/^-+\s*/, "").replace(/\s*-+$/, "");
        if (heading) splitForSpeech(heading).forEach((piece) => queue.push({ p, ...piece }));
        return;
      }
      splitForSpeech(paragraph).forEach((piece) => queue.push({ p, ...piece }));
    });
    return queue;
  }

  // Pieces of a sentence or two, each with its [start, end) in the
  // paragraph so the words can be marked as they are spoken. The spoken text
  // keeps the paragraph's length (symbols become spaces), so a voice's
  // character offsets map straight back onto the page.
  function splitForSpeech(paragraph) {
    const sentences = [];
    const sentencePattern = /[^.!?…]+(?:[.!?…]+["”’»)]*|$)/g;
    let match;
    while ((match = sentencePattern.exec(paragraph))) sentences.push([match.index, match.index + match[0].length]);
    if (!sentences.length) sentences.push([0, paragraph.length]);

    // Trim, and break any sentence too long for one utterance at a comma,
    // else a space.
    const pieces = [];
    sentences.forEach(([from, to]) => {
      let start = from;
      let end = to;
      while (start < end && /\s/.test(paragraph[start])) start += 1;
      while (end > start && /\s/.test(paragraph[end - 1])) end -= 1;
      while (end - start > LISTEN_CHUNK) {
        const span = paragraph.slice(start, start + LISTEN_CHUNK);
        let cut = span.lastIndexOf(",");
        if (cut < LISTEN_CHUNK / 2) cut = span.lastIndexOf(" ");
        if (cut <= 0) cut = LISTEN_CHUNK - 1;
        pieces.push([start, start + cut + 1]);
        start += cut + 1;
        while (start < end && /\s/.test(paragraph[start])) start += 1;
      }
      if (end > start) pieces.push([start, end]);
    });

    // Then pack short sentences together: fewer gaps between utterances.
    const chunks = [];
    pieces
      .filter(([start, end]) => /[\p{L}\p{N}]/u.test(paragraph.slice(start, end)))
      .forEach(([start, end]) => {
        const last = chunks[chunks.length - 1];
        if (last && end - last[0] <= LISTEN_CHUNK) last[1] = end;
        else chunks.push([start, end]);
      });

    return chunks.map(([start, end]) => ({
      start,
      end,
      text: paragraph.slice(start, end).replace(/[*_~「」『』[\]]/g, " ")
    }));
  }

  // Starts from the paragraph at the top of the screen (or the chapter title
  // when the reader has not scrolled into the chapter yet).
  function listenFromReader() {
    // Pressing "Nghe" again gives the online voice another chance.
    listen.onlineFailed = false;

    // No usable voice (a foreign device voice would mangle the text): show
    // how to get one instead.
    if (!chooseListenEngine()) {
      renderVoiceOptions();
      openSettings();
      listenVoiceGroup.scrollIntoView({ block: "center" });
      return;
    }

    const section = sectionFor(currentVolIdx, currentChapIdx);
    let startP = null;
    if (section && section.getBoundingClientRect().top < readingLine() - 40) {
      const anchor = getReadingAnchor(section);
      const blocks = section.querySelector(".reader-content").children;
      for (let b = anchor.block; b < blocks.length; b += 1) {
        if (blocks[b].dataset.p != null) {
          startP = Number(blocks[b].dataset.p);
          break;
        }
      }
    }

    startListening(currentVolIdx, currentChapIdx, startP);
  }

  function startListening(volIdx, chapIdx, startP) {
    // Warm up the connection to the online voice.
    if (!document.querySelector('link[href="https://translate.google.com"]')) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = "https://translate.google.com";
      document.head.appendChild(link);
    }
    listen.active = true;
    listen.playing = true;
    listen.errors = 0;
    listen.followPausedAt = 0;
    listenBar.hidden = false;
    document.body.classList.add("is-listening");
    setListenChapter(volIdx, chapIdx, startP);

    // Must speak straight away: iOS only allows speech started by a tap.
    if (DATA[volIdx].chapters[chapIdx].isIllustration) finishListenChapter();
    else speakCurrent();
    syncWakeLock();
  }

  function setListenChapter(volIdx, chapIdx, startP) {
    listen.volIdx = volIdx;
    listen.chapIdx = chapIdx;
    listen.queue = buildListenQueue(volIdx, chapIdx);
    if (startP == null) {
      listen.i = 0;
    } else {
      const index = listen.queue.findIndex((item) => item.p >= startP);
      listen.i = index < 0 ? listen.queue.length : index;
    }
    renderListenBar();
  }

  function speakCurrent() {
    const item = listen.queue[listen.i];
    if (!item) {
      finishListenChapter();
      return;
    }

    const token = ++listen.token;
    const busy = Boolean(speech && (speech.speaking || speech.pending));
    stopAllSpeech();

    listen.engine = chooseListenEngine();
    if (!listen.engine) {
      setListenPlaying(false);
      showMessage("Máy chưa có giọng đọc tiếng Việt. Xem cách cài trong Cài đặt đọc.");
      return;
    }

    if (listen.engine === "online") speakOnline(item, token);
    else speakOnDevice(item, token, busy);

    showListeningParagraph(true);
    renderListenBar();
    syncWakeLock();
  }

  function speakOnDevice(item, token, busy) {
    // Only ever a real Vietnamese voice: left to itself, Safari reads the
    // text with the default (English) voice.
    const voice = listenVoice();
    if (!voice) {
      setListenPlaying(false);
      showMessage("Máy chưa có giọng đọc tiếng Việt. Chọn giọng Google Dịch trong Cài đặt đọc.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = listen.rate;

    let startedAt = 0;
    let boundaries = 0;
    const heard = () => {
      if (token !== listen.token) return;
      listen.lastEventAt = Date.now();
      listen.errors = 0;
    };
    utterance.onstart = () => {
      if (token !== listen.token) return;
      heard();
      startedAt = Date.now();
      estimateWords(item, token, startedAt);
    };
    utterance.onboundary = (event) => {
      if (token !== listen.token) return;
      heard();
      if (event.name && event.name !== "word") return;
      // A voice that reports words: trust it from now on (one stray event
      // at the start is not enough).
      boundaries += 1;
      if (boundaries >= 2) {
        listen.realBoundaries = true;
        stopWordEstimate();
      }
      markSpokenWord(event.charIndex, event.charLength);
    };
    utterance.onend = () => {
      if (token !== listen.token) return;
      heard();
      stopWordEstimate();
      // Learn this voice's pace for the estimated word marking.
      const took = Date.now() - startedAt;
      if (startedAt && took > 400 && item.text.length > 20) {
        listen.msPerChar = listen.msPerChar * 0.7 + ((took * listen.rate) / item.text.length) * 0.3;
      }
      listen.i += 1;
      if (listen.playing) speakCurrent();
    };
    utterance.onerror = (event) => {
      if (token !== listen.token) return;
      // Our own cancel() when skipping or pausing.
      if (event.error === "interrupted" || event.error === "canceled") return;
      listen.errors += 1;
      // Needs a fresh tap (iOS after the tab was hidden), or the voice keeps
      // failing: stop rather than race through the book.
      if (event.error === "not-allowed" || listen.errors >= 3) {
        setListenPlaying(false);
        if (event.error !== "not-allowed") showMessage("Giọng đọc đang gặp lỗi. Thử chọn giọng khác trong Cài đặt đọc.");
        return;
      }
      listen.i += 1;
      if (listen.playing) speakCurrent();
    };

    listen.lastEventAt = Date.now();
    // Safari can drop an utterance queued in the same tick as cancel().
    if (busy) {
      window.setTimeout(() => {
        if (token === listen.token) speech.speak(utterance);
      }, 60);
    } else {
      speech.speak(utterance);
    }
  }

  function listenAudio() {
    if (!listen.audio) {
      listen.audio = new Audio();
      listen.audio.preload = "auto";
    }
    return listen.audio;
  }

  function onlineSpeechUrl(text) {
    return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=vi&q=${encodeURIComponent(text)}`;
  }

  // One piece through Google Dịch's voice. Plain audio, so it keeps playing
  // in the background, and its own clock drives the word marking.
  function speakOnline(item, token) {
    const audio = listenAudio();
    audio.onplaying = () => {
      if (token !== listen.token) return;
      listen.lastEventAt = Date.now();
      listen.errors = 0;
      followAudioWords(item, token, audio);
    };
    audio.onended = () => {
      if (token !== listen.token) return;
      stopWordEstimate();
      listen.i += 1;
      if (listen.playing) speakCurrent();
    };
    audio.onerror = () => {
      if (token === listen.token) onlineFailure();
    };

    listen.lastEventAt = Date.now();
    audio.src = onlineSpeechUrl(item.text);
    audio.defaultPlaybackRate = listen.rate;
    audio.playbackRate = listen.rate;
    audio.play().catch((error) => {
      if (token !== listen.token || error.name === "AbortError") return;
      // Autoplay refused (needs a tap): wait for the reader.
      if (error.name === "NotAllowedError") setListenPlaying(false);
      else onlineFailure();
    });
  }

  // Retry the piece once, then fall back to the device voice for the rest of
  // the session (or pause when there is none).
  function onlineFailure() {
    listen.errors += 1;
    if (listen.errors < 2) {
      speakCurrent();
      return;
    }

    listen.errors = 0;
    listen.onlineFailed = true;
    if (chooseListenEngine() === "device") {
      showMessage("Giọng Google Dịch đang không dùng được, chuyển sang giọng có sẵn trên máy.");
      speakCurrent();
    } else {
      setListenPlaying(false);
      showMessage("Không tải được giọng Google Dịch. Kiểm tra kết nối mạng rồi thử lại.");
    }
  }

  function followAudioWords(item, token, audio) {
    stopWordEstimate();
    if (!canHighlightSpeech || item.start == null) return;

    const words = [...item.text.matchAll(/\S+/g)].map((word) => [word.index, word[0].length]);
    if (!words.length) return;
    listen.wordTimer = window.setInterval(() => {
      if (token !== listen.token) {
        stopWordEstimate();
        return;
      }
      if (!audio.duration || !Number.isFinite(audio.duration)) return;
      const at = (audio.currentTime / audio.duration) * item.text.length;
      const word = words.find(([start, length]) => start + length > at) || words[words.length - 1];
      markSpokenWord(word[0], word[1]);
    }, 90);
  }

  function stopAllSpeech() {
    if (speech && (speech.speaking || speech.pending)) speech.cancel();
    if (listen.audio && !listen.audio.paused) listen.audio.pause();
    stopWordEstimate();
  }

  function setListenPlaying(playing) {
    if (!listen.active) return;
    listen.playing = playing;
    if (playing) {
      listen.errors = 0;
      listen.onlineFailed = false;
      speakCurrent();
    } else {
      listen.token += 1;
      stopAllSpeech();
      if (canHighlightSpeech) CSS.highlights.delete("tts-word");
      renderListenBar();
    }
    syncWakeLock();
  }

  // The chapter has been read out: mark it finished and carry on with the
  // next chapter that has text (picture pages are skipped).
  function finishListenChapter() {
    const key = chapterKey(listen.volIdx, listen.chapIdx);
    chapterState[key] = { ...chapterState[key], done: true, pct: 100 };
    saveChapterState();

    if (listen.sleep === "chapter") {
      setListenSleep(0);
      setListenPlaying(false);
      showMessage("Đã dừng ở cuối chương theo hẹn giờ.");
      return;
    }

    let next = getAdjacentChapter(1, { volIdx: listen.volIdx, chapIdx: listen.chapIdx });
    while (next && DATA[next.volIdx].chapters[next.chapIdx].isIllustration) next = getAdjacentChapter(1, next);
    if (!next) {
      closeListening();
      showMessage("Đã nghe hết các chương hiện có.");
      return;
    }

    const token = ++listen.token;
    loadVolumeText(next.volIdx)
      .then(() => {
        if (token !== listen.token || !listen.active) return;
        setListenChapter(next.volIdx, next.chapIdx, null);
        if (currentView === "reader") followListenChapter();
        else saveReadingProgress(next.volIdx, next.chapIdx);
        if (listen.playing) speakCurrent();
      })
      .catch(() => {
        if (token !== listen.token) return;
        setListenPlaying(false);
        showMessage("Không tải được chương sau. Kiểm tra kết nối mạng rồi thử lại.");
      });
  }

  // In the reader, bring the chapter being read out onto the page, unless
  // the reader is busy looking elsewhere.
  function followListenChapter() {
    if (Date.now() - listen.followPausedAt < FOLLOW_PAUSE_MS) return;
    if (sectionFor(listen.volIdx, listen.chapIdx)) return;
    openChapter(listen.volIdx, listen.chapIdx, { replace: true, fromTop: true });
  }

  // Previous: back to the start of this paragraph, or the one before if
  // already there. Next: on to the following paragraph (or chapter).
  function stepListening(direction) {
    if (!listen.active) return;
    const current = listen.queue[listen.i];
    listen.followPausedAt = 0;

    if (direction > 0) {
      const index = current ? listen.queue.findIndex((item) => item.p > current.p) : -1;
      if (index < 0) {
        listen.i = listen.queue.length;
        if (listen.playing) speakCurrent();
        else finishListenChapter();
        return;
      }
      listen.i = index;
    } else {
      const p = current ? current.p : listen.queue[listen.queue.length - 1].p;
      const start = listen.queue.findIndex((item) => item.p === p);
      if (listen.i > start) {
        listen.i = start;
      } else {
        const before = listen.queue[Math.max(0, start - 1)].p;
        listen.i = listen.queue.findIndex((item) => item.p === before);
      }
    }

    if (listen.playing) speakCurrent();
    else {
      showListeningParagraph(true);
      renderListenBar();
    }
  }

  function cycleListenRate() {
    listen.rate = LISTEN_RATES[(LISTEN_RATES.indexOf(listen.rate) + 1) % LISTEN_RATES.length];
    localStorage.setItem("tenshi-listen-rate", String(listen.rate));
    if (listen.playing) speakCurrent();
    else renderListenBar();
  }

  function cycleListenSleep() {
    setListenSleep(LISTEN_SLEEP[(LISTEN_SLEEP.indexOf(listen.sleep) + 1) % LISTEN_SLEEP.length]);
  }

  function setListenSleep(value) {
    listen.sleep = value;
    clearTimeout(listen.sleepTimer);
    clearInterval(listen.sleepTicker);
    listen.sleepUntil = 0;

    if (typeof value === "number" && value > 0) {
      listen.sleepUntil = Date.now() + value * 60000;
      listen.sleepTimer = window.setTimeout(() => {
        setListenSleep(0);
        setListenPlaying(false);
        showMessage("Đã tạm dừng theo hẹn giờ.");
      }, value * 60000);
      listen.sleepTicker = window.setInterval(renderListenBar, 20000);
    }
    renderListenBar();
  }

  function closeListening() {
    listen.active = false;
    listen.playing = false;
    listen.token += 1;
    stopAllSpeech();
    setListenSleep(0);
    listenBar.hidden = true;
    document.body.classList.remove("is-listening");
    showListeningParagraph(false);
    if ("mediaSession" in navigator) {
      listen.mediaKey = null;
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
    syncWakeLock();
  }

  // Back from another tab or app: some browsers stopped speaking meanwhile.
  function nudgeListening() {
    if (listen.playing && listen.engine === "device" && speech && !speech.speaking && !speech.pending) speakCurrent();
  }

  // Marks the paragraph being read; with `follow`, also scrolls it into view
  // unless the reader recently moved the page themselves.
  function showListeningParagraph(follow) {
    document.querySelectorAll(".is-speaking").forEach((el) => el.classList.remove("is-speaking"));
    if (canHighlightSpeech) {
      CSS.highlights.delete("tts-sentence");
      CSS.highlights.delete("tts-word");
    }
    listen.speakingEl = null;
    if (!listen.active) return;

    const item = listen.queue[listen.i];
    const section = item && sectionFor(listen.volIdx, listen.chapIdx);
    if (!section) return;

    const el = item.p < 0
      ? section.querySelector(".reader-stage-title")
      : section.querySelector(`.reader-content > [data-p="${item.p}"]`);
    if (!el) return;

    el.classList.add("is-speaking");
    listen.speakingEl = el;
    const sentence = item.start == null ? null : textRange(el, item.start, item.end);
    if (sentence && canHighlightSpeech) CSS.highlights.set("tts-sentence", new Highlight(sentence));

    if (follow && currentView === "reader" && Date.now() - listen.followPausedAt > FOLLOW_PAUSE_MS) {
      // Follow the sentence, so long paragraphs scroll along as they are read.
      keepInView((sentence || el).getBoundingClientRect());
    }
  }

  // A DOM Range over [start, end) of an element's text, across the text
  // nodes a search mark may have split it into.
  function textRange(el, start, end) {
    if (!el.isConnected) return null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let pos = 0;
    let started = false;
    let node;
    while ((node = walker.nextNode())) {
      const length = node.data.length;
      if (!started && start <= pos + length) {
        range.setStart(node, start - pos);
        started = true;
      }
      if (started && end <= pos + length) {
        range.setEnd(node, end - pos);
        return range;
      }
      pos += length;
    }
    return null;
  }

  function markSpokenWord(charIndex, charLength) {
    const item = listen.queue[listen.i];
    const el = listen.speakingEl;
    if (!canHighlightSpeech || !item || item.start == null || !el || charIndex == null) return;

    let length = charLength;
    if (!length) {
      const word = /^\S+/.exec(item.text.slice(charIndex));
      length = word ? word[0].length : 1;
    }
    const from = item.start + charIndex;
    const range = textRange(el, from, Math.min(from + length, item.end));
    if (range) CSS.highlights.set("tts-word", new Highlight(range));
  }

  // For voices that never report word boundaries (Android's Google voices,
  // mostly): step through the words at the pace this voice has shown so far.
  function estimateWords(item, token, startedAt) {
    stopWordEstimate();
    if (!canHighlightSpeech || listen.realBoundaries || item.start == null) return;

    const words = [...item.text.matchAll(/\S+/g)].map((word) => [word.index, word[0].length]);
    if (!words.length) return;
    const msPerChar = listen.msPerChar / listen.rate;
    listen.wordTimer = window.setInterval(() => {
      if (token !== listen.token || listen.realBoundaries) {
        stopWordEstimate();
        return;
      }
      const at = (Date.now() - startedAt) / msPerChar;
      const word = words.find(([start, length]) => start + length > at) || words[words.length - 1];
      markSpokenWord(word[0], word[1]);
    }, 90);
  }

  function stopWordEstimate() {
    clearInterval(listen.wordTimer);
    listen.wordTimer = null;
  }

  function keepInView(rect) {
    const top = readingLine();
    const bottom = listenBar.hidden ? window.innerHeight : listenBar.getBoundingClientRect().top;
    // Fine while its first line sits in the upper part of the free space.
    if (rect.top >= top && rect.top <= top + (bottom - top) * 0.6) return;

    chromeLockedUntil = Date.now() + 800;
    window.scrollBy({ top: rect.top - (top + (bottom - top) * 0.2), behavior: einkEnabled ? "auto" : "smooth" });
  }

  // The player's title: go to what is being read.
  function revealListening() {
    listen.followPausedAt = 0;
    const item = listen.queue[listen.i];
    const p = item ? Math.max(0, item.p) : 0;

    if (currentView === "reader" && sectionFor(listen.volIdx, listen.chapIdx)) {
      const el = item && item.p >= 0
        ? sectionFor(listen.volIdx, listen.chapIdx).querySelector(`.reader-content > [data-p="${p}"]`)
        : sectionFor(listen.volIdx, listen.chapIdx).querySelector(".reader-stage-title");
      if (el) {
        chromeLockedUntil = Date.now() + 800;
        const rect = el.getBoundingClientRect();
        window.scrollBy({ top: rect.top - readingLine() - 24, behavior: einkEnabled ? "auto" : "smooth" });
      }
      return;
    }

    openChapter(listen.volIdx, listen.chapIdx, { hit: { p } });
  }

  function renderListenBar() {
    if (!listen.active) return;
    const volume = DATA[listen.volIdx];
    const label = getChapterLabel(volume, listen.chapIdx);

    listenState.textContent = `${listen.playing ? "Đang nghe" : "Tạm dừng"} · ${formatChapterPlace(volume, label)}`;
    listenTitle.textContent = label.title;
    listenToggle.classList.toggle("is-playing", listen.playing);
    listenToggle.setAttribute("aria-label", listen.playing ? "Tạm dừng" : "Nghe tiếp");
    listenRate.textContent = `${String(listen.rate).replace(".", ",")}×`;

    let sleepLabel = "Hẹn giờ";
    if (listen.sleep === "chapter") sleepLabel = "Hết chương";
    else if (listen.sleepUntil) sleepLabel = `${Math.max(1, Math.ceil((listen.sleepUntil - Date.now()) / 60000))} phút`;
    listenSleepLabel.textContent = sleepLabel;
    listenSleep.classList.toggle("is-on", Boolean(listen.sleep));

    if ("mediaSession" in navigator && "MediaMetadata" in window) {
      const key = chapterKey(listen.volIdx, listen.chapIdx);
      if (listen.mediaKey !== key || !navigator.mediaSession.metadata) {
        listen.mediaKey = key;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: label.title,
          artist: formatChapterPlace(volume, label),
          album: SERIES_META.titleVi,
          artwork: volume.cover
            ? [{ src: volume.cover, sizes: "520x736", type: "image/webp" }]
            : [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }]
        });
      }
      navigator.mediaSession.playbackState = listen.playing ? "playing" : "paused";
    }
  }

  function showToast() {
    clearTimeout(toastTimer);
    readerToast.hidden = false;
    toastTimer = window.setTimeout(hideToast, 6000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    readerToast.hidden = true;
  }

  function openLightbox(img) {
    if (!img) return;

    lightboxImages = [...img.closest(".reader-content").querySelectorAll(".illustration-img")];
    lightboxIndex = Math.max(0, lightboxImages.indexOf(img));
    showLightboxImage();

    lightbox.hidden = false;
    document.body.classList.add("is-lightbox-open");

    // A history entry lets the phone's back gesture close the viewer
    // instead of leaving the site.
    history.pushState({ lightbox: true }, "");
    lightboxPushed = true;
    lightboxClose.focus();
  }

  function showLightboxImage() {
    const source = lightboxImages[lightboxIndex];
    const total = lightboxImages.length;

    lightboxImg.src = source.currentSrc || source.src;
    lightboxImg.alt = source.alt;
    lightboxCount.textContent = `${lightboxIndex + 1} / ${total}`;
    lightbox.classList.toggle("is-single", total < 2);
    lightboxPrev.disabled = lightboxIndex === 0;
    lightboxNext.disabled = lightboxIndex === total - 1;

    const upcoming = lightboxImages[lightboxIndex + 1];
    if (upcoming) new Image().src = upcoming.currentSrc || upcoming.src;
  }

  function stepLightbox(direction) {
    const next = lightboxIndex + direction;
    if (next < 0 || next >= lightboxImages.length) return;
    lightboxIndex = next;
    showLightboxImage();
  }

  function closeLightbox() {
    if (lightboxPushed) {
      lightboxPushed = false;
      history.back();
      return;
    }
    hideLightbox();
  }

  function hideLightbox() {
    const opener = lightboxImages[lightboxIndex]?.closest(".illustration-open");

    lightbox.hidden = true;
    lightboxImg.removeAttribute("src");
    document.body.classList.remove("is-lightbox-open");
    if (opener) opener.focus({ preventScroll: true });
  }

  function openSettings() {
    if (speech) renderVoiceOptions();
    setChromeHidden(false);
    settingsPanel.classList.add("is-open");
    settingsOverlay.classList.add("is-open");
    settingsPanel.setAttribute("aria-hidden", "false");
  }

  function closeSettings() {
    settingsPanel.classList.remove("is-open");
    settingsOverlay.classList.remove("is-open");
    settingsPanel.setAttribute("aria-hidden", "true");
  }

  function saveReadingProgress(volIdx, chapIdx) {
    readingProgress = {
      volIdx,
      chapIdx,
      timestamp: Date.now()
    };

    localStorage.setItem("tenshi-progress", JSON.stringify(readingProgress));
    recordReadingHistory(volIdx, chapIdx);
    updateContinueUI();
    renderChapterList();
    renderVolumeGrid();
    renderRecentChapters();
  }

  function loadReadingProgress() {
    const raw = localStorage.getItem("tenshi-progress");

    if (!raw) {
      updateContinueUI();
      return;
    }

    try {
      const saved = JSON.parse(raw);
      const volume = DATA[saved.volIdx];

      if (volume && volume.chapters[saved.chapIdx]) {
        readingProgress = saved;
      }
    } catch (error) {
      console.warn("Could not parse saved progress", error);
    }

    updateContinueUI();
  }

  function updateContinueUI() {
    const volume = readingProgress && DATA[readingProgress.volIdx];
    const chapter = volume && volume.chapters[readingProgress.chapIdx];
    const isReturning = Boolean(chapter);

    seriesHero.classList.toggle("is-returning", isReturning);
    continueCard.style.display = isReturning ? "" : "none";
    btnContinue.style.display = isReturning ? "" : "none";
    btnStartReading.className = isReturning ? "btn-secondary" : "btn-primary";

    if (!isReturning) {
      continueInfo.textContent = "";
      return;
    }

    const label = getChapterLabel(volume, readingProgress.chapIdx);
    const partial = getPartialPercent(readingProgress.volIdx, readingProgress.chapIdx);
    const place = formatChapterPlace(volume, label) + (partial ? ` · đã đọc ${partial}%` : "");
    continueInfo.innerHTML = `
      <span class="continue-volume">${escapeHtml(place)}</span>
      <span class="continue-title">${escapeHtml(label.title)}</span>
    `;
  }

  function continueReading() {
    if (!readingProgress) return;
    openChapter(readingProgress.volIdx, readingProgress.chapIdx);
  }

  function runEinkPageTurn(applyChange, options) {
    if (!isReadyForRefresh || !einkEnabled) {
      applyChange();
      return;
    }

    if (document.body.classList.contains("is-eink-busy")) {
      return;
    }

    const lagMs = options?.lagMs ?? 140;
    const totalMs = options?.totalMs ?? 780;
    const token = ++einkTransitionToken;

    clearTimeout(einkApplyTimer);
    clearTimeout(einkGhostTimer);

    captureEinkGhost();
    document.body.classList.add("is-eink-busy");
    triggerEinkRefresh(totalMs);

    einkApplyTimer = window.setTimeout(() => {
      if (token !== einkTransitionToken) return;
      applyChange();
    }, lagMs);

    einkGhostTimer = window.setTimeout(() => {
      if (token !== einkTransitionToken) return;
      clearEinkGhost();
      document.body.classList.remove("is-eink-busy");
    }, totalMs);
  }

  function cancelEinkPageTurn() {
    einkTransitionToken += 1;
    clearTimeout(einkApplyTimer);
    clearTimeout(einkGhostTimer);
    clearEinkGhost();
    document.body.classList.remove("is-eink-busy");
  }

  function captureEinkGhost() {
    if (!ghostLayer) return;

    const ghostHeader = header.cloneNode(true);
    const ghostMain = main.cloneNode(true);

    sanitizeGhostNode(ghostHeader);
    sanitizeGhostNode(ghostMain);

    ghostHeader.classList.add("ghost-header");
    ghostMain.classList.add("ghost-main");
    ghostMain.style.transform = `translateY(${-window.scrollY}px)`;

    ghostLayer.innerHTML = "";
    ghostLayer.appendChild(ghostHeader);
    ghostLayer.appendChild(ghostMain);

    ghostLayer.classList.remove("is-active");
    void ghostLayer.offsetWidth;
    ghostLayer.classList.add("is-active");
  }

  function clearEinkGhost() {
    if (!ghostLayer) return;
    ghostLayer.classList.remove("is-active");
    ghostLayer.innerHTML = "";
  }

  function sanitizeGhostNode(root) {
    if (!root) return;

    if (root.hasAttribute && root.hasAttribute("id")) {
      root.removeAttribute("id");
    }

    root.querySelectorAll("[id]").forEach((node) => {
      node.removeAttribute("id");
    });

    root.querySelectorAll("button, a, input, select, textarea").forEach((node) => {
      node.setAttribute("tabindex", "-1");
      node.setAttribute("aria-hidden", "true");
    });
  }

  function triggerEinkRefresh(duration) {
    if (!isReadyForRefresh || !einkEnabled) return;

    clearTimeout(einkRefreshTimer);
    document.body.classList.remove("is-eink-refreshing");
    void document.body.offsetWidth;
    document.body.classList.add("is-eink-refreshing");

    einkRefreshTimer = window.setTimeout(() => {
      document.body.classList.remove("is-eink-refreshing");
    }, duration || 360);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  loadData();
})();
