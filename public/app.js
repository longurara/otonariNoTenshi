(function () {
  "use strict";

  // ===== STATE =====
  let DATA = [];
  let currentView = "home"; // home | volume | reader
  let currentVolIdx = -1;
  let currentChapIdx = -1;
  let fontSize = 18;

  // ===== DOM REFS =====
  const $ = (sel) => document.querySelector(sel);
  const loadingScreen = $("#loading-screen");
  const header = $("#header");
  const headerTitle = $("#header-title");
  const btnBack = $("#btn-back");
  const btnFontUp = $("#btn-font-up");
  const btnFontDown = $("#btn-font-down");
  const progressBar = $("#progress-bar");
  const progressFill = $("#progress-fill");
  const viewHome = $("#view-home");
  const viewVolume = $("#view-volume");
  const viewReader = $("#view-reader");
  const volumeGrid = $("#volume-grid");
  const volumeTitle = $("#volume-title");
  const volumeChapterCount = $("#volume-chapter-count");
  const chapterList = $("#chapter-list");
  const readerContent = $("#reader-content");
  const bottomNav = $("#bottom-nav");
  const btnPrev = $("#btn-prev");
  const btnNext = $("#btn-next");
  const chapterIndicator = $("#chapter-indicator");
  const continueCard = $("#reading-progress-card");
  const continueInfo = $("#continue-info");
  const btnContinue = $("#btn-continue");

  // ===== LOAD DATA =====
  async function loadData() {
    try {
      const res = await fetch("data.json");
      DATA = await res.json();
      init();
    } catch (err) {
      loadingScreen.querySelector("p").textContent = "Lỗi tải dữ liệu!";
      console.error(err);
    }
  }

  // ===== INIT =====
  function init() {
    // Restore font size
    const savedSize = localStorage.getItem("tenshi-font-size");
    if (savedSize) fontSize = parseInt(savedSize) || 18;
    applyFontSize();

    renderVolumeGrid();
    loadReadingProgress();

    loadingScreen.classList.add("hidden");
    setTimeout(() => (loadingScreen.style.display = "none"), 500);

    // Events
    btnBack.addEventListener("click", goBack);
    btnPrev.addEventListener("click", prevChapter);
    btnNext.addEventListener("click", nextChapter);
    btnFontUp.addEventListener("click", () => changeFontSize(1));
    btnFontDown.addEventListener("click", () => changeFontSize(-1));
    btnContinue.addEventListener("click", continueReading);

    // Scroll progress
    window.addEventListener("scroll", updateScrollProgress);

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (currentView !== "reader") return;
      if (e.key === "ArrowLeft") prevChapter();
      if (e.key === "ArrowRight") nextChapter();
    });
  }

  // ===== VIEWS =====
  function showView(name) {
    [viewHome, viewVolume, viewReader].forEach((v) => v.classList.remove("active"));
    currentView = name;

    if (name === "home") {
      viewHome.classList.add("active");
      btnBack.style.display = "none";
      btnFontUp.style.display = "none";
      btnFontDown.style.display = "none";
      bottomNav.style.display = "none";
      progressBar.style.display = "none";
      headerTitle.textContent = "Thiên Sứ Nhà Bên";
    } else if (name === "volume") {
      viewVolume.classList.add("active");
      btnBack.style.display = "flex";
      btnFontUp.style.display = "none";
      btnFontDown.style.display = "none";
      bottomNav.style.display = "none";
      progressBar.style.display = "none";
    } else if (name === "reader") {
      viewReader.classList.add("active");
      btnBack.style.display = "flex";
      btnFontUp.style.display = "flex";
      btnFontDown.style.display = "flex";
      bottomNav.style.display = "flex";
      progressBar.style.display = "block";
    }

    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function goBack() {
    if (currentView === "reader") {
      showView("volume");
      openVolume(currentVolIdx);
    } else if (currentView === "volume") {
      showView("home");
    }
  }

  // ===== VOLUME GRID =====
  function renderVolumeGrid() {
    volumeGrid.innerHTML = "";
    DATA.forEach((vol, idx) => {
      const card = document.createElement("div");
      card.className = "volume-card";
      card.id = `vol-card-${idx}`;

      // Extract number from name
      const numMatch = vol.name.match(/[\d.]+/);
      const displayNum = numMatch ? numMatch[0] : (idx + 1);

      card.innerHTML = `
        <div class="vol-num">${displayNum}</div>
        <div class="vol-name">${vol.name}</div>
        <div class="vol-chapters">${vol.chapters.length} chương</div>
      `;
      card.addEventListener("click", () => openVolume(idx));
      volumeGrid.appendChild(card);
    });
  }

  // ===== VOLUME VIEW =====
  function openVolume(volIdx) {
    currentVolIdx = volIdx;
    const vol = DATA[volIdx];
    volumeTitle.textContent = vol.name;
    volumeChapterCount.textContent = `${vol.chapters.length} chương`;
    headerTitle.textContent = vol.name;

    chapterList.innerHTML = "";
    vol.chapters.forEach((ch, idx) => {
      const item = document.createElement("div");
      item.className = "chapter-item" + (ch.isIllustration ? " is-illustration" : "");
      item.id = `ch-item-${volIdx}-${idx}`;
      item.innerHTML = `
        <div class="chapter-num">${ch.isIllustration ? "🖼" : idx + 1}</div>
        <div class="chapter-title">${ch.title}</div>
        <div class="chapter-indicator-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      `;
      item.addEventListener("click", () => openChapter(volIdx, idx));
      chapterList.appendChild(item);
    });

    showView("volume");
  }

  // ===== READER =====
  function openChapter(volIdx, chapIdx) {
    currentVolIdx = volIdx;
    currentChapIdx = chapIdx;
    const vol = DATA[volIdx];
    const ch = vol.chapters[chapIdx];

    headerTitle.textContent = ch.title;

    // Render content
    let html = `<div class="chapter-heading">${ch.title}</div>`;

    if (ch.isIllustration) {
      html += renderIllustrations(volIdx, ch.images);
    } else {
      html += renderTextContent(ch.content);
      // Add inline chapter images if any
      if (ch.images && ch.images.length > 0) {
        const vol = DATA[volIdx];
        html += ch.images.map(f => `<div class="illustration-container"><img src="/images/${vol.dirName}/${f}" alt="Minh họa" class="illustration-img" loading="lazy"></div>`).join("");
      }
    }

    readerContent.innerHTML = html;

    // No async loading needed - images are static
    if (false) {
    }

    // Update nav
    updateNavButtons();

    // Save progress
    saveReadingProgress(volIdx, chapIdx);

    showView("reader");
  }

  function renderTextContent(text) {
    if (!text || text.trim().length === 0) return "<p><em>Không có nội dung</em></p>";

    const paragraphs = text.split("\n\n");
    let html = "";

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      // Section break
      if (trimmed.startsWith("---") && trimmed.endsWith("---")) {
        const heading = trimmed.replace(/^-+\s*/, "").replace(/\s*-+$/, "");
        html += `<div class="section-break">✦ ✦ ✦</div>`;
        if (heading) html += `<p style="text-align:center;text-indent:0;font-weight:bold;margin:1em 0;">${heading}</p>`;
        continue;
      }

      // Dialogue (starts with quotation marks)
      const isDialogue = /^[""\u201C\u300C「『]/.test(trimmed);
      if (isDialogue) {
        html += `<p class="dialogue">${escapeHtml(trimmed)}</p>`;
      } else {
        html += `<p>${escapeHtml(trimmed)}</p>`;
      }
    }

    return html;
  }

  function renderIllustrations(volIdx, images) {
    const vol = DATA[volIdx];
    if (!images || images.length === 0) {
      return `<p style="text-indent:0;color:var(--text-muted);">Không có ảnh minh họa</p>`;
    }
    return images.map(f => `<div class="illustration-container"><img src="/images/${vol.dirName}/${f}" alt="Minh họa" class="illustration-img" loading="lazy"></div>`).join("");
  }

  // sanitizeVolumeName kept for compatibility
  function _unused_loadIllustrationImages(volIdx) {
    const vol = DATA[volIdx];
    // This function is no longer used - images come from data.json
    return;
  }

  function sanitizeVolumeName(name) {
    return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "_").trim();
  }

  // ===== NAV =====
  function updateNavButtons() {
    const vol = DATA[currentVolIdx];
    const totalChaps = vol.chapters.length;

    btnPrev.disabled = currentChapIdx <= 0;
    btnNext.disabled = currentChapIdx >= totalChaps - 1;
    chapterIndicator.textContent = `${currentChapIdx + 1}/${totalChaps}`;
  }

  function prevChapter() {
    if (currentChapIdx > 0) {
      openChapter(currentVolIdx, currentChapIdx - 1);
    }
  }

  function nextChapter() {
    const vol = DATA[currentVolIdx];
    if (currentChapIdx < vol.chapters.length - 1) {
      openChapter(currentVolIdx, currentChapIdx + 1);
    }
  }

  // ===== SCROLL PROGRESS =====
  function updateScrollProgress() {
    if (currentView !== "reader") return;
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressFill.style.width = Math.min(progress, 100) + "%";
  }

  // ===== FONT SIZE =====
  function changeFontSize(delta) {
    fontSize = Math.max(14, Math.min(28, fontSize + delta * 2));
    applyFontSize();
    localStorage.setItem("tenshi-font-size", fontSize);
  }

  function applyFontSize() {
    document.documentElement.style.setProperty("--font-size", fontSize + "px");
  }

  // ===== READING PROGRESS =====
  function saveReadingProgress(volIdx, chapIdx) {
    const data = { volIdx, chapIdx, timestamp: Date.now() };
    localStorage.setItem("tenshi-progress", JSON.stringify(data));
  }

  function loadReadingProgress() {
    const raw = localStorage.getItem("tenshi-progress");
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (data.volIdx < DATA.length) {
        const vol = DATA[data.volIdx];
        if (data.chapIdx < vol.chapters.length) {
          const ch = vol.chapters[data.chapIdx];
          continueCard.style.display = "block";
          continueInfo.textContent = `${vol.name} — ${ch.title}`;
          continueCard.dataset.volIdx = data.volIdx;
          continueCard.dataset.chapIdx = data.chapIdx;
        }
      }
    } catch (e) {}
  }

  function continueReading() {
    const volIdx = parseInt(continueCard.dataset.volIdx);
    const chapIdx = parseInt(continueCard.dataset.chapIdx);
    currentVolIdx = volIdx;
    openChapter(volIdx, chapIdx);
  }

  // ===== UTILS =====
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== START =====
  loadData();
})();
