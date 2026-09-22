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
  let chapterSort = "asc";
  let chapterFilter = "all";
  let readingProgress = null;
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
  const fontSizeValue = $("#font-size-value");
  const main = $("#main");
  const ghostLayer = $("#eink-ghost");
  const progressBar = $("#progress-bar");
  const progressFill = $("#progress-fill");

  const viewHome = $("#view-home");
  const viewVolume = $("#view-volume");
  const viewReader = $("#view-reader");

  const seriesCover = $("#series-cover");
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
  const btnContinueHero = $("#btn-continue-hero");
  const recentChapterList = $("#recent-chapter-list");
  const volumeGrid = $("#volume-grid");
  const searchInput = $("#search-input");
  const searchResults = $("#search-results");

  const continueCard = $("#reading-progress-card");
  const continueInfo = $("#continue-info");
  const btnContinue = $("#btn-continue");

  const volumeTitle = $("#volume-title");
  const volumeChapterCount = $("#volume-chapter-count");
  const volumeSummary = $("#volume-summary");
  const chapterList = $("#chapter-list");
  const btnOpenFirstChapter = $("#btn-open-first-chapter");
  const btnOpenLatestChapter = $("#btn-open-latest-chapter");
  const btnSortChapters = $("#btn-sort-chapters");
  const btnFilterAll = $("#btn-filter-all");
  const btnFilterStory = $("#btn-filter-story");
  const btnFilterIllustration = $("#btn-filter-illustration");

  const readerSidebarTitle = $("#reader-sidebar-title");
  const readerSidebarVolume = $("#reader-sidebar-volume");
  const readerChapterSelect = $("#reader-chapter-select");
  const fontSizeDisplay = $("#font-size-display");
  const readerProgressText = $("#reader-progress-text");
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
  const btnBottomPrev = $("#btn-bottom-prev");
  const btnBottomNext = $("#btn-bottom-next");
  const btnBottomList = $("#btn-bottom-list");
  const btnBottomSettings = $("#btn-bottom-settings");

  async function loadData() {
    try {
      const res = await fetch("data.json");
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

    applyFontSize();
    applyLineHeight();
    applyFontFamily();
    applyTheme();
    hydrateSeriesMeta();
    loadReadingProgress();
    renderVolumeGrid();
    renderRecentChapters();
    attachEvents();
    restoreSession();
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
    btnBottomSettings.addEventListener("click", openSettings);
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

    searchInput.addEventListener("input", () => runSearch(searchInput.value));

    btnContinue.addEventListener("click", continueReading);
    btnContinueHero.addEventListener("click", continueReading);
    btnStartReading.addEventListener("click", startReading);

    btnOpenFirstChapter.addEventListener("click", () => {
      const target = getFirstReadableChapter(currentVolIdx);
      if (target) openChapter(target.volIdx, target.chapIdx);
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
    btnReaderList.addEventListener("click", () => openVolume(currentVolIdx));
    btnBackToVolume.addEventListener("click", () => openVolume(currentVolIdx));
    btnBottomPrev.addEventListener("click", () => navigateChapter(-1));
    btnBottomNext.addEventListener("click", () => navigateChapter(1));
    btnBottomList.addEventListener("click", () => openVolume(currentVolIdx));

    readerChapterSelect.addEventListener("change", (event) => {
      const nextIndex = parseInt(event.target.value, 10);
      if (!Number.isNaN(nextIndex)) {
        openChapter(currentVolIdx, nextIndex);
      }
    });

    window.addEventListener("scroll", updateScrollProgress, { passive: true });

    document.addEventListener("keydown", (event) => {
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
    return getVolumeCover(DATA[0]) || "";
  }

  function getVolumeCover(volume) {
    if (!volume) return "";

    const chapterWithImage = volume.chapters.find(
      (chapter) => Array.isArray(chapter.images) && chapter.images.length > 0
    );

    if (!chapterWithImage) return "";

    return `/images/${volume.dirName}/${chapterWithImage.images[0]}`;
  }

  function renderVolumeGrid() {
    volumeGrid.innerHTML = "";

    DATA.forEach((volume, volIdx) => {
      const isResume = readingProgress && readingProgress.volIdx === volIdx;
      const isRead = isVolumeRead(volIdx);
      const coverSrc = getVolumeCover(volume) || getSeriesCover();
      const card = document.createElement("article");

      card.className = `volume-card${isResume ? " is-resume" : ""}${isRead ? " is-read" : ""}`;
      card.innerHTML = `
        <div class="volume-thumb">
          <img src="${coverSrc}" alt="${escapeHtml(volume.name)}">
        </div>
        <div class="volume-body">
          <div class="volume-topline">
            <span class="volume-index">Tập ${volIdx + 1}</span>
            <span class="volume-status">${volume.chapters.length} mục</span>
          </div>
          <h3 class="volume-card-title">${escapeHtml(volume.name)}</h3>
          <p class="volume-excerpt">${buildVolumeExcerpt(volume)}</p>
        </div>
      `;

      card.addEventListener("click", () => openVolume(volIdx));
      volumeGrid.appendChild(card);
    });
  }

  function buildVolumeExcerpt(volume) {
    const storyCount = volume.chapters.filter((chapter) => !chapter.isIllustration).length;
    const illustrationCount = volume.chapters.length - storyCount;

    if (illustrationCount > 0) {
      return `${storyCount} chương chữ và ${illustrationCount} mục minh họa trong cùng một tập.`;
    }

    return `${storyCount} chương chữ trong tập này.`;
  }

  function renderRecentChapters() {
    const allChapters = [];

    DATA.forEach((volume, volIdx) => {
      volume.chapters.forEach((chapter, chapIdx) => {
        allChapters.push({ volume, chapter, volIdx, chapIdx });
      });
    });

    recentChapterList.innerHTML = "";

    allChapters
      .filter((item) => !item.chapter.isIllustration)
      .slice(-5)
      .reverse()
      .forEach((item) => {
        const button = document.createElement("button");
        const isRead = isChapterRead(item.volIdx, item.chapIdx);
        button.className = `recent-item${isRead ? " is-read" : ""}`;
        button.innerHTML = `
          <span class="recent-volume">${escapeHtml(item.volume.name)}</span>
          <span class="recent-title">${escapeHtml(item.chapter.title)}</span>
          <span class="recent-type">${item.chapIdx + 1}/${item.volume.chapters.length}${isRead ? " • Đã đọc" : ""}</span>
        `;
        button.addEventListener("click", () => openChapter(item.volIdx, item.chapIdx));
        recentChapterList.appendChild(button);
      });
  }

  function isChapterRead(volIdx, chapIdx) {
    if (!readingProgress) return false;
    if (volIdx < readingProgress.volIdx) return true;
    if (volIdx === readingProgress.volIdx && chapIdx <= readingProgress.chapIdx) return true;
    return false;
  }

  function isVolumeRead(volIdx) {
    if (!readingProgress) return false;
    return volIdx < readingProgress.volIdx;
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
          <span class="search-result-volume">Tập ${volIdx + 1} • ${volume.chapters.length} mục</span>
          <span class="search-result-title">${escapeHtml(volume.name)}</span>
        </button>
      `;
    });

    chapterMatches.slice(0, 24).forEach(({ volume, volIdx, chapter, chapIdx }) => {
      html += `
        <button type="button" class="search-result-item" data-type="chapter" data-vol="${volIdx}" data-chap="${chapIdx}">
          <span class="search-result-volume">${escapeHtml(volume.name)}</span>
          <span class="search-result-title">${escapeHtml(chapter.title)}</span>
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

  function showView(name) {
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
    window.scrollTo({ top: 0, behavior: "auto" });
    updateScrollProgress();
    saveSessionState();
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

  function goBack() {
    if (currentView === "reader") {
      openVolume(currentVolIdx);
      return;
    }

    if (currentView === "volume") {
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
    currentVolIdx = volIdx;
    const volume = DATA[volIdx];
    const storyCount = volume.chapters.filter((chapter) => !chapter.isIllustration).length;
    const illustrationCount = volume.chapters.length - storyCount;

    volumeTitle.textContent = volume.name;
    volumeChapterCount.textContent = `${volume.chapters.length} mục • ${storyCount} chương chữ${illustrationCount ? ` • ${illustrationCount} minh họa` : ""}`;
    volumeSummary.textContent = createVolumeSummary(volume, volIdx);

    renderChapterList();
  }

  function restoreVolume(volIdx) {
    renderVolumeView(volIdx);
    showView("volume");
  }

  function createVolumeSummary(volume, volIdx) {
    const storyCount = volume.chapters.filter((chapter) => !chapter.isIllustration).length;
    const illustrationCount = volume.chapters.length - storyCount;
    return illustrationCount > 0
      ? `Tập này có ${storyCount} chương chữ và ${illustrationCount} mục minh họa.`
      : `Tập này có ${storyCount} chương.`;
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

    filtered.forEach(({ chapter, chapIdx }) => {
      const isResume =
        readingProgress &&
        readingProgress.volIdx === currentVolIdx &&
        readingProgress.chapIdx === chapIdx;
      const isRead = !isResume && isChapterRead(currentVolIdx, chapIdx);
      const badge = chapter.isIllustration ? "IMG" : String(chapIdx + 1).padStart(2, "0");
      const typeLabel = chapter.isIllustration ? "Minh họa" : "Chương chữ";
      const imageLabel =
        chapter.images && chapter.images.length > 0 ? `${chapter.images.length} ảnh` : "Không có ảnh";
      const item = document.createElement("article");

      item.className = `chapter-item${chapter.isIllustration ? " is-illustration" : ""}${isResume ? " is-resume" : ""}${isRead ? " is-read" : ""}`;
      item.innerHTML = `
        <div class="chapter-badge">${badge}</div>
        <div class="chapter-copy">
          <h3 class="chapter-title">${escapeHtml(chapter.title)}</h3>
          <div class="chapter-meta-row">
            <span class="chapter-meta-pill">${typeLabel}</span>
            <span class="chapter-meta-pill">${imageLabel}</span>
            ${isResume ? '<span class="chapter-meta-pill">Đang đọc dở</span>' : ""}
            ${isRead ? '<span class="chapter-meta-pill">Đã đọc</span>' : ""}
          </div>
        </div>
        <div class="chapter-arrow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"></path>
          </svg>
        </div>
      `;

      item.addEventListener("click", () => openChapter(currentVolIdx, chapIdx));
      chapterList.appendChild(item);
    });
  }

  function openChapter(volIdx, chapIdx) {
    runEinkPageTurn(() => {
      renderChapterView(volIdx, chapIdx);
      showView("reader");
    }, { lagMs: 160, totalMs: 860 });
  }

  function renderChapterView(volIdx, chapIdx) {
    currentVolIdx = volIdx;
    currentChapIdx = chapIdx;

    const volume = DATA[volIdx];
    const chapter = volume.chapters[chapIdx];

    headerTitle.textContent = chapter.title;
    readerSidebarTitle.textContent = chapter.title;
    readerSidebarVolume.textContent = volume.name;
    readerBreadcrumb.textContent = `${volume.name} • mục ${chapIdx + 1}/${volume.chapters.length}`;
    readerStageTitle.textContent = chapter.title;

    let html = `<div class="chapter-heading">${escapeHtml(chapter.title)}</div>`;

    if (chapter.isIllustration) {
      html += renderIllustrations(volIdx, chapter.images);
    } else {
      html += renderTextContent(chapter.content);

      if (chapter.images && chapter.images.length > 0) {
        html += chapter.images
          .map((fileName) => {
            return `<div class="illustration-container"><img src="/images/${volume.dirName}/${fileName}" alt="Minh họa ${escapeHtml(chapter.title)}" class="illustration-img" loading="lazy"></div>`;
          })
          .join("");
      }
    }

    readerContent.innerHTML = html;

    populateReaderSelect(volIdx, chapIdx);
    updateNavButtons();
    saveReadingProgress(volIdx, chapIdx);
  }

  function restoreChapter(volIdx, chapIdx, scrollY) {
    renderChapterView(volIdx, chapIdx);
    showView("reader");

    if (scrollY > 0) {
      window.setTimeout(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
        updateScrollProgress();
      }, 0);
    }
  }

  function restoreSession() {
    const session = loadSessionState();
    const volume = session && DATA[session.volIdx];

    if (session && session.view === "reader" && volume && volume.chapters[session.chapIdx]) {
      restoreChapter(session.volIdx, session.chapIdx, session.scrollY || 0);
      return;
    }

    if (session && session.view === "volume" && volume) {
      restoreVolume(session.volIdx);
      return;
    }

    showView("home");
  }

  function populateReaderSelect(volIdx, activeIndex) {
    const volume = DATA[volIdx];
    readerChapterSelect.innerHTML = "";

    volume.chapters.forEach((chapter, chapIdx) => {
      const option = document.createElement("option");
      option.value = String(chapIdx);
      option.textContent = `${chapIdx + 1}. ${chapter.title}`;
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

  function renderIllustrations(volIdx, images) {
    const volume = DATA[volIdx];

    if (!images || images.length === 0) {
      return "<p>Chưa có ảnh minh họa cho mục này.</p>";
    }

    return images
      .map((fileName) => {
        return `<div class="illustration-container"><img src="/images/${volume.dirName}/${fileName}" alt="Minh họa" class="illustration-img" loading="lazy"></div>`;
      })
      .join("");
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

    chapterIndicator.textContent = `${currentChapIdx + 1} / ${volume.chapters.length}`;
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
      openChapter(target.volIdx, target.chapIdx);
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
    btnSortChapters.textContent = chapterSort === "asc" ? "Cũ -> mới" : "Mới -> cũ";
    renderChapterList();
    triggerEinkRefresh(240);
  }

  function startReading() {
    const firstTarget = getFirstReadableChapter(0) || { volIdx: 0, chapIdx: 0 };
    openChapter(firstTarget.volIdx, firstTarget.chapIdx);
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
    readerProgressText.textContent = `${Math.round(progress)}%`;
    scheduleSessionSave();
  }

  let sessionSaveScheduled = false;

  function scheduleSessionSave() {
    if (sessionSaveScheduled) return;
    sessionSaveScheduled = true;
    window.setTimeout(() => {
      sessionSaveScheduled = false;
      saveSessionState();
    }, 150);
  }

  function saveSessionState() {
    try {
      sessionStorage.setItem(
        "tenshi-session",
        JSON.stringify({
          view: currentView,
          volIdx: currentVolIdx,
          chapIdx: currentChapIdx,
          scrollY: currentView === "reader" ? window.scrollY : 0
        })
      );
    } catch (error) {
      // sessionStorage unavailable (private mode, etc.) - ignore
    }
  }

  function loadSessionState() {
    try {
      const raw = sessionStorage.getItem("tenshi-session");
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function changeFontSize(direction) {
    fontSize = clamp(fontSize + direction * 2, 16, 28);
    localStorage.setItem("tenshi-font-size", String(fontSize));
    applyFontSize();
    triggerEinkRefresh(260);
  }

  function applyFontSize() {
    document.documentElement.style.setProperty("--reader-font-size", `${fontSize}px`);
    fontSizeDisplay.textContent = `${fontSize}px`;
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
  }

  function openSettings() {
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
    updateContinueUI();
    renderChapterList();
    renderVolumeGrid();
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
    if (!readingProgress) {
      continueCard.style.display = "none";
      btnContinueHero.style.display = "none";
      continueInfo.textContent = "";
      return;
    }

    const volume = DATA[readingProgress.volIdx];
    const chapter = volume?.chapters[readingProgress.chapIdx];

    if (!volume || !chapter) {
      continueCard.style.display = "none";
      btnContinueHero.style.display = "none";
      continueInfo.textContent = "";
      return;
    }

    continueInfo.textContent = `${volume.name} • ${chapter.title}`;
    continueCard.style.display = "block";
    btnContinueHero.style.display = "inline-flex";
  }

  function continueReading() {
    if (!readingProgress) return;
    openChapter(readingProgress.volIdx, readingProgress.chapIdx);
  }

  function runEinkPageTurn(applyChange, options) {
    if (!isReadyForRefresh) {
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
    if (!isReadyForRefresh) return;

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
