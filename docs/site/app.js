(() => {
  'use strict';

  const STORAGE_KEY = 'material-system-utility-docs-v1';
  const defaults = { language: 'en', englishLevel: 2, cantoneseLevel: 3, theme: 'system', density: 'comfortable', dock: 'left', page: 'home' };
  let prefs = loadPreferences();
  let lastFocus = null;

  const copy = {
    en: {
      docsLabel: 'Documentation', paletteHint: 'Find a page or command', browse: 'Browse', home: 'Home', capabilities: 'Capabilities', guides: 'Guides', safety: 'Safety', settings: 'Settings', localOnly: 'Local-only documentation', verifiedBaseline: 'Verified baseline', heroTitle: 'A focused, safer way to manage exact WinGet packages', heroBody: 'Browse a reviewed catalogue, search locally, and run exact install, uninstall, or upgrade operations from a Material Design desktop shell.', seeCapabilities: 'See verified capabilities', downloadInstaller: 'Download Windows installer', installerStatus: 'Installer status:', publishedInstaller: 'Version v0.1.0-build.4.1 · Windows x64 · unsigned Squirrel.Windows', apps: 'applications', tweaksCatalogued: 'tweaks catalogued', featuresCatalogued: 'features catalogued', realArtifact: 'Real built artifact', catalogueTitle: 'The safe package catalogue', captureCaption: 'Captured from the real built desktop application. Select the image to inspect it at full size.', releaseBoundary: 'Release boundary', honestScope: 'Available means implemented and verified', available: 'Available', unavailable: 'Unavailable', capabilityInventory: 'Capability inventory', whatWorks: 'What works in this build', inventoryIntro: 'This list distinguishes implemented behavior from catalogue-only content and unavailable future work.', buildUse: 'Build and use the verified baseline', customizeDocs: 'Customize this documentation', settingsLocal: 'These visitor preferences stay in local browser storage. They do not configure the desktop application.'
    },
    yue: {
      docsLabel: '使用說明', paletteHint: '搵頁面或者指令', browse: '瀏覽', home: '主頁', capabilities: '功能狀態', guides: '使用指南', safety: '安全', settings: '設定', localOnly: '只喺本機運作嘅說明網站', verifiedBaseline: '已驗證基線', heroTitle: '用更專注、更穩陣嘅方法管理指定 WinGet 套件', heroBody: '瀏覽已覆核清單、本機搜尋，並喺 Material Design 桌面介面執行指定安裝、解除安裝或者升級操作。', seeCapabilities: '睇已驗證功能', downloadInstaller: '下載 Windows 安裝程式', installerStatus: '安裝程式狀態：', publishedInstaller: '版本 v0.1.0-build.4.1 · Windows x64 · unsigned Squirrel.Windows', apps: '個應用程式', tweaksCatalogued: '項已收錄調整', featuresCatalogued: '項已收錄功能', realArtifact: '真實建置成品', catalogueTitle: '安全套件清單', captureCaption: '由真實建置桌面應用程式擷取；選取圖片可睇原尺寸。', releaseBoundary: '發佈界線', honestScope: '寫得可用，就代表真係已實作同驗證', available: '可用', unavailable: '未提供', capabilityInventory: '功能清單', whatWorks: '呢個版本實際做到乜', inventoryIntro: '以下清楚分開已實作功能、只收錄資料，同埋未提供嘅未來工作。', buildUse: '建置同使用已驗證基線', customizeDocs: '自訂呢個說明網站', settingsLocal: '呢啲訪客偏好只會留喺瀏覽器本機儲存空間，唔會設定桌面應用程式。'
    }
  };

  const commands = [
    { label: 'Open Home', hint: 'Page', run: () => activatePage('home') },
    { label: 'Open Capabilities', hint: 'Page', run: () => activatePage('capabilities') },
    { label: 'Open Guides', hint: 'Page', run: () => activatePage('guides') },
    { label: 'Open Safety', hint: 'Page', run: () => activatePage('safety') },
    { label: 'Open Settings', hint: 'Page', run: () => activatePage('settings') },
    { label: 'Use light theme', hint: 'Appearance', run: () => setPreference('theme', 'light') },
    { label: 'Use dark theme', hint: 'Appearance', run: () => setPreference('theme', 'dark') },
    { label: 'Follow system theme', hint: 'Appearance', run: () => setPreference('theme', 'system') },
    { label: 'Dock tabs on the left', hint: 'Navigation', run: () => setPreference('dock', 'left') },
    { label: 'Dock tabs on the right', hint: 'Navigation', run: () => setPreference('dock', 'right') },
    { label: 'Open the capability regex builder', hint: 'Search', run: () => { activatePage('capabilities'); toggleBuilder('capability'); } },
    { label: 'Open the settings regex builder', hint: 'Search', run: () => { activatePage('settings'); toggleBuilder('settings'); } }
  ];

  function loadPreferences() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
    catch { return { ...defaults }; }
  }

  function savePreferences() { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); }

  function setPreference(key, value) {
    prefs[key] = value;
    savePreferences();
    applyPreferences();
    closePalette();
    announce('Documentation preference updated.');
  }

  function applyPreferences() {
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = prefs.theme;
    const shell = document.querySelector('.app-shell');
    shell.dataset.density = prefs.density;
    shell.dataset.dock = prefs.dock;
    document.getElementById('language').value = prefs.language;
    document.getElementById('theme').value = prefs.theme;
    document.getElementById('density').value = prefs.density;
    document.getElementById('dock').value = prefs.dock;
    document.getElementById('english-level').value = String(prefs.englishLevel);
    document.getElementById('cantonese-level').value = String(prefs.cantoneseLevel);
    document.getElementById('english-level-output').textContent = `Level ${prefs.englishLevel}`;
    document.getElementById('cantonese-level-output').textContent = `Level ${prefs.cantoneseLevel}`;
    applyLanguage();
  }

  function applyLanguage() {
    const primary = prefs.language === 'yue' ? copy.yue : copy.en;
    document.documentElement.lang = prefs.language === 'en' ? 'en' : 'yue-Hant-HK';
    document.querySelectorAll('[data-copy]').forEach((node) => {
      const key = node.dataset.copy;
      if (!copy.en[key]) return;
      node.textContent = prefs.language === 'both' ? `${copy.en[key]} · ${copy.yue[key]}` : primary[key];
    });
  }

  function activatePage(page, focus = true) {
    const panel = document.querySelector(`[data-panel="${page}"]`);
    const tab = document.querySelector(`[data-page="${page}"]`);
    if (!panel || !tab) return;
    document.querySelectorAll('[data-panel]').forEach((node) => { node.hidden = true; node.classList.remove('active'); });
    document.querySelectorAll('[data-page]').forEach((node) => { node.classList.remove('active'); node.setAttribute('aria-selected', 'false'); node.tabIndex = -1; });
    panel.hidden = false;
    panel.classList.add('active');
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    tab.tabIndex = 0;
    prefs.page = page;
    savePreferences();
    closeMobileRail();
    if (focus) { document.getElementById('main-content').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  }

  function tabKeydown(event) {
    const tabs = [...document.querySelectorAll('.nav-tab')];
    const index = tabs.indexOf(event.currentTarget);
    const vertical = !['top', 'bottom'].includes(prefs.dock) || innerWidth <= 900;
    const previous = vertical ? 'ArrowUp' : 'ArrowLeft';
    const next = vertical ? 'ArrowDown' : 'ArrowRight';
    let target = -1;
    if (event.key === previous) target = (index - 1 + tabs.length) % tabs.length;
    if (event.key === next) target = (index + 1) % tabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (target >= 0) { event.preventDefault(); tabs[target].focus(); activatePage(tabs[target].dataset.page, false); }
  }

  function filterCapabilities() {
    const text = document.getElementById('capability-filter').value;
    const builder = !document.getElementById('capability-regex').hidden;
    const pattern = document.getElementById('capability-pattern').value || text;
    const flags = document.getElementById('capability-flags').value;
    let matcher;
    if (builder && pattern) {
      try {
        const regex = new RegExp(pattern.slice(0, 256), flags.replace(/[^gimsuy]/g, ''));
        matcher = (value) => regex.test(value);
        document.getElementById('regex-feedback').textContent = `Valid pattern · /${pattern}/${flags}`;
      } catch (error) {
        document.getElementById('regex-feedback').textContent = `Invalid pattern · ${error.message}`;
        matcher = () => false;
      }
    } else {
      const query = text.toLocaleLowerCase();
      matcher = (value) => value.toLocaleLowerCase().includes(query);
      document.getElementById('regex-feedback').textContent = 'Plain-text filtering is active.';
    }
    let shown = 0;
    document.querySelectorAll('#capability-list article').forEach((item) => { item.hidden = !matcher(item.dataset.search); if (!item.hidden) shown += 1; });
    document.getElementById('capability-empty').hidden = shown !== 0;
  }

  function filterSettings() {
    const text = document.getElementById('settings-search').value;
    const builder = !document.getElementById('settings-regex').hidden;
    const pattern = document.getElementById('settings-pattern').value || text;
    const flags = document.getElementById('settings-flags').value;
    let matcher;
    if (builder && pattern) {
      try {
        const regex = new RegExp(pattern.slice(0, 256), flags.replace(/[^gimsuy]/g, ''));
        matcher = (value) => regex.test(value);
        document.getElementById('settings-regex-feedback').textContent = `Valid pattern · /${pattern}/${flags}`;
      } catch (error) {
        document.getElementById('settings-regex-feedback').textContent = `Invalid pattern · ${error.message}`;
        matcher = () => false;
      }
    } else {
      const query = text.toLocaleLowerCase();
      matcher = (value) => value.toLocaleLowerCase().includes(query);
      document.getElementById('settings-regex-feedback').textContent = 'Plain-text filtering is active.';
    }
    let shown = 0;
    document.querySelectorAll('#settings-list article').forEach((item) => { item.hidden = !matcher(item.dataset.setting); if (!item.hidden) shown += 1; });
    document.getElementById('settings-empty').hidden = shown !== 0;
  }

  function toggleBuilder(kind) {
    const section = document.getElementById(`${kind}-regex`);
    const button = document.getElementById(`${kind}-regex-button`);
    section.hidden = !section.hidden;
    button.setAttribute('aria-expanded', String(!section.hidden));
    if (!section.hidden) document.getElementById(`${kind}-pattern`).focus();
    kind === 'capability' ? filterCapabilities() : filterSettings();
  }

  function openPalette() {
    lastFocus = document.activeElement;
    document.getElementById('scrim').hidden = false;
    document.getElementById('command-palette').hidden = false;
    document.body.style.overflow = 'hidden';
    renderCommands('');
    requestAnimationFrame(() => document.getElementById('palette-search').focus());
  }

  function closePalette() {
    document.getElementById('scrim').hidden = true;
    document.getElementById('command-palette').hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderCommands(query) {
    const list = document.getElementById('command-list');
    const found = commands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase()));
    list.replaceChildren(...found.map((command, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `command${index === 0 ? ' active' : ''}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      const label = document.createElement('strong'); label.textContent = command.label;
      const hint = document.createElement('span'); hint.textContent = command.hint;
      button.append(label, hint);
      button.addEventListener('click', () => { command.run(); closePalette(); });
      return button;
    }));
    document.getElementById('command-empty').hidden = found.length !== 0;
  }

  function paletteKeydown(event) {
    const options = [...document.querySelectorAll('.command')];
    const active = options.findIndex((option) => option.classList.contains('active'));
    let next = active;
    if (event.key === 'ArrowDown') next = Math.min(options.length - 1, active + 1);
    if (event.key === 'ArrowUp') next = Math.max(0, active - 1);
    if (next !== active && options[next]) {
      event.preventDefault();
      options.forEach((option) => { option.classList.remove('active'); option.setAttribute('aria-selected', 'false'); });
      options[next].classList.add('active'); options[next].setAttribute('aria-selected', 'true'); options[next].scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter' && options[active]) { event.preventDefault(); options[active].click(); }
  }

  function openMobileRail() { document.getElementById('tab-rail').classList.add('open'); document.getElementById('menu-button').setAttribute('aria-expanded', 'true'); }
  function closeMobileRail() { document.getElementById('tab-rail').classList.remove('open'); document.getElementById('menu-button').setAttribute('aria-expanded', 'false'); }

  let snackTimer;
  function announce(message) {
    const bar = document.getElementById('snackbar');
    bar.textContent = message;
    bar.hidden = false;
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => { bar.hidden = true; }, 4000);
  }

  document.querySelectorAll('[data-page]').forEach((tab) => { tab.addEventListener('click', () => activatePage(tab.dataset.page)); tab.addEventListener('keydown', tabKeydown); });
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => activatePage(button.dataset.go)));
  document.getElementById('menu-button').addEventListener('click', openMobileRail);
  document.getElementById('rail-close').addEventListener('click', closeMobileRail);
  document.getElementById('palette-launch').addEventListener('click', openPalette);
  document.getElementById('palette-close').addEventListener('click', closePalette);
  document.getElementById('scrim').addEventListener('click', closePalette);
  document.getElementById('palette-search').addEventListener('input', (event) => renderCommands(event.target.value));
  document.getElementById('command-palette').addEventListener('keydown', paletteKeydown);
  document.getElementById('capability-filter').addEventListener('input', filterCapabilities);
  document.getElementById('capability-pattern').addEventListener('input', filterCapabilities);
  document.getElementById('capability-flags').addEventListener('input', filterCapabilities);
  document.getElementById('capability-regex-button').addEventListener('click', () => toggleBuilder('capability'));
  document.getElementById('settings-search').addEventListener('input', filterSettings);
  document.getElementById('settings-pattern').addEventListener('input', filterSettings);
  document.getElementById('settings-flags').addEventListener('input', filterSettings);
  document.getElementById('settings-regex-button').addEventListener('click', () => toggleBuilder('settings'));
  document.getElementById('language').addEventListener('change', (event) => setPreference('language', event.target.value));
  document.getElementById('theme').addEventListener('change', (event) => setPreference('theme', event.target.value));
  document.getElementById('density').addEventListener('change', (event) => setPreference('density', event.target.value));
  document.getElementById('dock').addEventListener('change', (event) => setPreference('dock', event.target.value));
  document.getElementById('english-level').addEventListener('input', (event) => setPreference('englishLevel', Number(event.target.value)));
  document.getElementById('cantonese-level').addEventListener('input', (event) => setPreference('cantoneseLevel', Number(event.target.value)));
  document.getElementById('reset-preferences').addEventListener('click', () => { prefs = { ...defaults, page: 'settings' }; savePreferences(); applyPreferences(); announce('Site preferences reset.'); });
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); openPalette(); }
    if (event.key === 'Escape') { if (!document.getElementById('command-palette').hidden) closePalette(); else closeMobileRail(); }
  });

  applyPreferences();
  activatePage(prefs.page, false);
})();
