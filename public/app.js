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

  const loadingScreen = $("#loading-screen");
  const header = $("#header");
  const headerTitle = $("#header-title");
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
  const readerProgressFill = $("#reader-progress-fill");
  const btnReaderSettings = $("#btn-reader-settings");
  const readerBreadcrumb = $("#reader-breadcrumb");
  const readerStageTitle = $("#reader-stage-title");
  const readerContent = $("#reader-content");
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

  async function loadData() {
    try {
      // Always revalidate: app.js is never cached, so a stale data.json from
      // an earlier deploy would pair new code with the old data shape.
      const res = await fetch("data.json", { cache: "no-cache" });
      DATA = await res.json();
      init();
    } catch (error) {
      console.error(error);
      loadingScreen.querySelector("p").textContent = "Không tải được dữ liệu truyện.";
    }
  }

  function init() {
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
    hydrateSeriesMeta();
    loadReadingProgress();
    loadReadingHistory();
    loadChapterState();
    updateContinueUI();
    renderVolumeGrid();
    renderRecentChapters();
    attachEvents();
    restoreRoute();
    isReadyForRefresh = true;

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

    searchInput.addEventListener("input", () => runSearch(searchInput.value));

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
    }, { passive: true });

    // Any deliberate input ends the "keep the restored paragraph in place" window.
    ["wheel", "touchstart", "keydown", "mousedown"].forEach((type) => {
      window.addEventListener(type, () => { pendingAnchor = null; }, { passive: true });
    });

    // Late-loading images or fonts above the restored paragraph would push it down.
    readerContent.addEventListener("load", reapplyPendingAnchor, true);

    window.addEventListener("pagehide", recordReadingPosition);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") recordReadingPosition();
    });

    readerContent.addEventListener("click", (event) => {
      const opener = event.target.closest(".illustration-open");
      if (opener) {
        openLightbox(opener.querySelector("img"));
        return;
      }

      // Touch readers: tap the page to show or hide the header and bottom bar.
      if (!window.matchMedia("(hover: none)").matches) return;
      if (String(window.getSelection ? window.getSelection() : "")) return;
      setChromeHidden(!document.body.classList.contains("is-chrome-hidden"));
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

  function normalizeText(text) {
    return text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  }

  function runSearch(rawQuery) {
    const query = rawQuery.trim();

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

    if (volumeMatches.length === 0 && chapterMatches.length === 0) {
      searchResults.innerHTML = `<p class="search-empty">Không tìm thấy kết quả cho "${escapeHtml(query)}".</p>`;
      return;
    }

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

    searchResults.innerHTML = html;

    searchResults.querySelectorAll(".search-result-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const volIdx = parseInt(btn.dataset.vol, 10);
        if (btn.dataset.type === "chapter") {
          openChapter(volIdx, parseInt(btn.dataset.chap, 10));
        } else {
          openVolume(volIdx);
        }
      });
    });
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
      document.title = `${readerStageTitle.textContent} | ${SERIES_META.titleVi}`;
    }

    closeSettings();
    hideToast();
    pendingAnchor = null;
    window.scrollTo({ top: 0, behavior: "auto" });
    lastChromeScrollY = 0;
    setChromeHidden(false);
    updateScrollProgress();
    syncHistory(historyMode || "push");
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

  function restoreRoute() {
    window.history.scrollRestoration = "manual";
    const route = parseRoute(location.hash);

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
  // between chapters swaps the history entry, so back returns to the contents.
  function openChapter(volIdx, chapIdx, options) {
    runEinkPageTurn(() => {
      renderChapterView(volIdx, chapIdx);
      showView("reader", options?.replace ? "replace" : "push");
      if (!options?.fromTop) restoreReadingPosition(volIdx, chapIdx);
    }, { lagMs: 160, totalMs: 860 });
  }

  function renderChapterView(volIdx, chapIdx) {
    recordReadingPosition();
    hideToast();
    currentVolIdx = volIdx;
    currentChapIdx = chapIdx;

    const volume = DATA[volIdx];
    const chapter = volume.chapters[chapIdx];
    const label = getChapterLabel(volume, chapIdx);

    headerTitle.textContent = label.title;
    readerSidebarTitle.textContent = label.title;
    readerSidebarVolume.textContent = volume.name;
    readerVolumeCover.innerHTML = renderCoverMarkup(volume);
    readerBreadcrumb.textContent = formatChapterPlace(volume, label);
    readerStageTitle.textContent = label.title;

    let html = "";

    if (chapter.isIllustration) {
      html += renderIllustrations(chapter.images);
    } else {
      html += renderTextContent(chapter.content);

      if (chapter.images && chapter.images.length > 0) {
        html += chapter.images
          .map((image) => renderIllustration(image, `Minh họa ${chapter.title}`))
          .join("");
      }
    }

    readerContent.innerHTML = html;

    populateReaderSelect(volIdx, chapIdx);
    updateNavButtons();
    saveReadingProgress(volIdx, chapIdx);
  }

  // Which paragraph sits at the top of the viewport, and how far into it.
  function getReadingAnchor() {
    const top = Math.max(0, header.getBoundingClientRect().bottom);
    const blocks = readerContent.children;

    for (let i = 0; i < blocks.length; i += 1) {
      const rect = blocks[i].getBoundingClientRect();
      if (rect.bottom > top) {
        return { block: i, offset: rect.height ? clamp((top - rect.top) / rect.height, 0, 1) : 0 };
      }
    }

    return { block: Math.max(blocks.length - 1, 0), offset: 1 };
  }

  function scrollToAnchor(anchor) {
    const block = readerContent.children[anchor.block];
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
    if (!state) return false;
    if (!options?.exact && (state.pct <= 2 || state.pct >= 95)) return false;

    let anchor;
    if (state.v === ANCHOR_VERSION && state.block != null) {
      anchor = { block: state.block, offset: state.offset || 0 };
    } else if (state.pct > 0) {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: (state.pct / 100) * docHeight, behavior: "auto" });
      anchor = getReadingAnchor();
    } else {
      return false;
    }

    if (!scrollToAnchor(anchor)) return false;

    pendingAnchor = anchor;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(reapplyPendingAnchor);
    }
    window.setTimeout(() => { pendingAnchor = null; }, 4000);

    if (!options?.exact) showToast();
    return true;
  }

  function reapplyPendingAnchor() {
    if (pendingAnchor && currentView === "reader") scrollToAnchor(pendingAnchor);
  }

  function recordReadingPosition() {
    if (currentView !== "reader" || currentVolIdx < 0 || currentChapIdx < 0) return;
    if (pendingAnchor) return;

    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.round(Math.min((window.scrollY / docHeight) * 100, 100)) : 0;
    const key = chapterKey(currentVolIdx, currentChapIdx);
    const next = { ...chapterState[key], ...getReadingAnchor(), pct, v: ANCHOR_VERSION };

    if (docHeight > 0 && pct >= 97) next.done = true;
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

  function renderTextContent(text) {
    if (!text || !text.trim()) {
      return "<p><em>Chưa có nội dung cho chương này.</em></p>";
    }

    return text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => {
        if (paragraph.startsWith("---") && paragraph.endsWith("---")) {
          const heading = paragraph.replace(/^-+\s*/, "").replace(/\s*-+$/, "");
          let html = '<div class="section-break">• • •</div>';
          if (heading) {
            html += `<p class="section-heading-inline">${escapeHtml(heading)}</p>`;
          }
          return html;
        }

        const isDialogue = /^["“‘「『]/.test(paragraph);
        const className = isDialogue ? ' class="dialogue"' : "";
        return `<p${className}>${escapeHtml(paragraph)}</p>`;
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

  function getAdjacentChapter(direction) {
    if (currentVolIdx < 0 || currentChapIdx < 0) return null;

    let volIdx = currentVolIdx;
    let chapIdx = currentChapIdx + direction;

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

    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? Math.min((window.scrollY / docHeight) * 100, 100) : 0;

    progressFill.style.width = `${progress}%`;
    readerProgressFill.style.width = `${progress}%`;
    readerProgressText.textContent = `${Math.round(progress)}%`;
    schedulePositionSave();
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

  function setEink(value) {
    if (value !== "on" && value !== "off") return;
    einkEnabled = value === "on";
    localStorage.setItem("tenshi-eink", value);
    applyEink();
    triggerEinkRefresh(360);
  }

  function applyEink() {
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

    lightboxImages = [...readerContent.querySelectorAll(".illustration-img")];
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
