(() => {
  'use strict';

  const STORAGE_KEY = 'material-system-utility.site-state.v3';
  const PRIVATE_VOCABULARY_KEY = 'material-system-utility.private-vocabulary.v1';
  const MAX_HISTORY = 100;
  const defaults = {
    schemaVersion: 3,
    page: 'home', language: 'en', englishLevel: 2, cantoneseLevel: 3,
    school: { enabled: false, name: 'School mode' }, dialogEmoji: true,
    theme: 'system', density: 100, dock: 'left', preset: 'system',
    pinnedTabs: [], tabGroups: { learn: ['home', 'capabilities', 'guides'], workspace: ['settings', 'schedule', 'tools', 'records', 'changelog'] },
    collapsedGroups: [], schedules: [], notifications: [], history: [], locks: [], totpEntries: [], tickets: [], appearance: {}
  };

  const copy = {
    en: {
      docsLabel: 'Documentation', paletteHint: 'Find a page, setting, or command', home: 'Home', capabilities: 'Capabilities', guides: 'Guides', settings: 'Settings',
      heroTitle: ['Manage exact WinGet packages with clear boundaries.', 'A focused, safer way to manage exact WinGet packages.', 'Package management without mystery meat buttons.', 'Exact package actions, because guessing is not a workflow.', 'WinGet, but the chaos has been politely asked to leave.'],
      heroBody: ['Browse a reviewed catalogue and run supported exact operations.', 'Browse a reviewed catalogue, search locally, and run exact package operations from a Material Design desktop shell.', 'Search locally, inspect the actual identifier, then let the supported operation do precisely one job.', 'A reviewed catalogue keeps wildcard roulette away from the install button.', 'The package gremlins get exact identifiers and absolutely no improvisation privileges.']
    },
    yue: {
      docsLabel: '使用說明', paletteHint: '搵頁面、設定或者指令', home: '主頁', capabilities: '功能狀態', guides: '使用指南', settings: '設定',
      heroTitle: ['清楚界線管理指定 WinGet 套件。', '用更專注、更穩陣嘅方法管理指定 WinGet 套件。', '管理套件唔使估估下。', '指定操作做指定嘢，唔玩按鈕抽獎。', 'WinGet 今次坐定定，唔准套件妖怪自由發揮。'],
      heroBody: ['瀏覽已覆核清單，再執行支援嘅指定操作。', '瀏覽已覆核清單、本機搜尋，並喺 Material Design 桌面介面執行指定套件操作。', '先本機搜尋同核對識別碼，再叫支援嘅操作專心做一件事。', '清單已覆核，安裝掣唔使再玩 wildcard 輪盤。', '每隻套件妖怪只會收到指定識別碼，冇即興演出環節。']
    }
  };

  const dimSum = [
    { en: 'Classic Har Gow', zh: '蝦餃', anchor: 'classic-har-gow' },
    { en: 'Siu Mai', zh: '燒賣', anchor: 'siu-mai' },
    { en: 'Char Siu Bao', zh: '叉燒包', anchor: 'char-siu-bao' },
    { en: 'Steamed Rice Roll', zh: '腸粉', anchor: 'steamed-rice-roll' }
  ];

  let state = loadState();
  let vocabulary = loadVocabulary();
  let activeTabForMenu = null;
  let lastPaletteFocus = null;
  let appearanceTarget = 'hero';
  let scheduleTimer = null;
  let scheduleOverride = {};

  function $(id) { return document.getElementById(id); }
  function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { ...deepClone(defaults), ...parsed, school: { ...defaults.school, ...(parsed.school || {}) }, tabGroups: { ...defaults.tabGroups, ...(parsed.tabGroups || {}) }, appearance: parsed.appearance || {} };
    } catch { return deepClone(defaults); }
  }
  function loadVocabulary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRIVATE_VOCABULARY_KEY) || 'null');
      return validateVocabularyObject(parsed, false);
    } catch { return null; }
  }
  function persist(action, detail = '') {
    state.history = [...(state.history || []), { id: crypto.randomUUID(), at: new Date().toISOString(), action, detail: String(detail).slice(0, 160) }].slice(-MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderRecords();
  }
  function notify(title, message, level = 'info') {
    const item = { id: crypto.randomUUID(), at: new Date().toISOString(), title: String(title).slice(0, 80), message: String(message).slice(0, 240), level, dismissed: false };
    state.notifications = [...(state.notifications || []), item].slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const node = document.createElement('div'); node.className = 'snackbar';
    const emoji = state.dialogEmoji && !state.school.enabled ? (level === 'error' ? '⚠️ ' : level === 'success' ? '✅ ' : 'ℹ️ ') : '';
    if (emoji) { const decoration = document.createElement('span'); decoration.setAttribute('aria-hidden', 'true'); decoration.textContent = emoji; node.append(decoration); }
    node.append(document.createTextNode(`${title}: ${message}`)); $('snackbar-stack').append(node);
    setTimeout(() => node.remove(), level === 'error' ? 12000 : 5000);
    renderRecords();
  }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function download(name, mime, content) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function textFor(key) {
    const language = state.school.enabled ? 'en' : (scheduleOverride.language || state.language);
    const enValue = copy.en[key]; const yueValue = copy.yue[key];
    const choose = (value, level) => Array.isArray(value) ? value[Math.max(0, Math.min(4, level - 1))] : value;
    if (language === 'yue') return choose(yueValue, state.cantoneseLevel);
    if (language === 'both') return `${choose(enValue, state.englishLevel)} / ${choose(yueValue, state.cantoneseLevel)}`;
    return choose(enValue, state.englishLevel);
  }
  function applyVocabulary(value) {
    if (!vocabulary || state.school.enabled) return value;
    let output = String(value);
    for (const [source, replacement] of Object.entries(vocabulary.replacements)) output = output.split(source).join(replacement);
    return output;
  }
  function renderCopy() {
    document.documentElement.lang = state.school.enabled || state.language === 'en' ? 'en' : state.language === 'yue' ? 'yue-Hant-HK' : 'en';
    document.querySelectorAll('[data-copy]').forEach((node) => { const value = textFor(node.dataset.copy); if (value) node.textContent = applyVocabulary(value); });
    $('hero-title').textContent = applyVocabulary(textFor('heroTitle'));
    $('hero-body').textContent = applyVocabulary(textFor('heroBody'));
    $('school-label').textContent = state.school.name;
    $('capability-school-name').textContent = state.school.name;
    $('school-name').value = state.school.name;
    $('school-enabled').checked = state.school.enabled;
    $('dialog-emoji').checked = state.dialogEmoji;
    document.querySelectorAll('[data-school-sensitive]').forEach((node) => { node.hidden = state.school.enabled; });
    if (state.school.enabled) $('dim-sum-surprise').hidden = true;
    $('settings-boundary').textContent = state.school.enabled ? `${state.school.name} is active. English presentation is forced and private playful controls are omitted.` : 'Preferences are stored only in this browser and do not configure the desktop application.';
    document.querySelectorAll('input[name="language"]').forEach((input) => { input.checked = input.value === state.language; });
    $('english-level').value = state.englishLevel; $('cantonese-level').value = state.cantoneseLevel;
    $('english-level-output').textContent = `English level ${state.englishLevel}`; $('cantonese-level-output').textContent = `Cantonese level ${state.cantoneseLevel}`;
    $('vocabulary-status').textContent = vocabulary ? `${Object.keys(vocabulary.replacements).length} private replacements loaded locally.` : 'No private vocabulary loaded.';
  }

  function applyAppearance() {
    const root = document.documentElement;
    const effectivePreset = scheduleOverride.theme || state.preset;
    const effectiveDensity = scheduleOverride.density || state.density;
    root.dataset.theme = effectivePreset === 'system' ? '' : effectivePreset;
    root.style.setProperty('--font-scale', String((state.fontScale || 100) / 100));
    root.style.setProperty('--density', String((effectiveDensity || 100) / 100));
    if (state.accent) root.style.setProperty('--primary', state.accent);
    $('app-shell').dataset.dock = state.dock;
    document.querySelectorAll('input[name="preset"]').forEach((input) => { input.checked = input.value === state.preset; });
    document.querySelectorAll('input[name="dock"]').forEach((input) => { input.checked = input.value === state.dock; });
    $('accent-color').value = state.accent || '#6750a4'; $('font-scale').value = state.fontScale || 100; $('density-scale').value = state.density || 100;
    for (const [target, values] of Object.entries(state.appearance || {})) {
      const node = document.querySelector(`[data-appearance-target="${CSS.escape(target)}"]`);
      if (!node) continue;
      node.style.borderRadius = values.radius ? `${values.radius}px` : '';
      node.style.setProperty('--primary', values.accent || '');
      node.style.fontSize = values.scale ? `${values.scale}%` : '';
    }
    syncTabOrientation();
  }
  function syncTabOrientation() { $('documentation-tab-list').setAttribute('aria-orientation', ['left', 'right'].includes(state.dock) ? 'vertical' : 'horizontal'); }

  function renderTabs() {
    for (const [group, pages] of Object.entries(state.tabGroups)) {
      const container = $(`group-${group}-tabs`); if (!container) continue;
      pages.forEach((page) => { const tab = document.querySelector(`[data-page="${CSS.escape(page)}"]`); if (tab) { container.append(tab); tab.classList.toggle('pinned', state.pinnedTabs.includes(page)); } });
    }
    document.querySelectorAll('.tab-group').forEach((group) => { const collapsed = state.collapsedGroups.includes(group.dataset.tabGroup); group.querySelector('.group-toggle').setAttribute('aria-expanded', String(!collapsed)); group.querySelector('.tab-list').hidden = collapsed; });
  }
  function activatePage(page, focus = true, targetId = '') {
    const panel = $(`panel-${page}`); const tab = document.querySelector(`[data-page="${CSS.escape(page)}"]`); if (!panel || !tab) return;
    document.querySelectorAll('.page-panel').forEach((node) => { node.hidden = true; node.classList.remove('active'); });
    document.querySelectorAll('.nav-tab').forEach((node) => { node.classList.remove('active'); node.setAttribute('aria-selected', 'false'); node.tabIndex = -1; });
    panel.hidden = false; panel.classList.add('active'); tab.classList.add('active'); tab.setAttribute('aria-selected', 'true'); tab.tabIndex = 0; state.page = page;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); closeRail(false);
    requestAnimationFrame(() => { const target = targetId ? $(targetId) : panel; target?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); if (focus) target?.focus?.(); target?.classList.add('highlight-target'); setTimeout(() => target?.classList.remove('highlight-target'), 1600); });
    if (page === 'records') renderRecords(); if (page === 'schedule') renderSchedules(); if (page === 'tools') { renderLocks(); renderTotp(); renderTickets(); }
  }
  function tabKeydown(event) {
    const tabs = [...document.querySelectorAll('.nav-tab:not([hidden])')]; const index = tabs.indexOf(event.currentTarget); const vertical = ['left', 'right'].includes(state.dock);
    const prev = vertical ? 'ArrowUp' : 'ArrowLeft'; const next = vertical ? 'ArrowDown' : 'ArrowRight'; let target = -1;
    if (event.key === prev) target = (index - 1 + tabs.length) % tabs.length; if (event.key === next) target = (index + 1) % tabs.length; if (event.key === 'Home') target = 0; if (event.key === 'End') target = tabs.length - 1;
    if (target >= 0) { event.preventDefault(); tabs[target].focus(); activatePage(tabs[target].dataset.page, false); }
    if (event.altKey && event.key.toLowerCase() === 'p') togglePin(event.currentTarget.dataset.page);
  }
  function openRail() { $('tab-rail').classList.add('open'); $('menu-button').setAttribute('aria-expanded', 'true'); $('tab-rail').removeAttribute('inert'); }
  function closeRail(restore = true) { $('tab-rail').classList.remove('open'); $('menu-button').setAttribute('aria-expanded', 'false'); if (matchMedia('(max-width: 900px)').matches) $('tab-rail').setAttribute('inert', ''); else $('tab-rail').removeAttribute('inert'); if (restore) $('menu-button').focus(); }
  function togglePin(page) { state.pinnedTabs = state.pinnedTabs.includes(page) ? state.pinnedTabs.filter((item) => item !== page) : [...state.pinnedTabs, page]; persist('tab pin changed', page); renderTabs(); }

  function matcherFor(searchId) {
    const search = $(searchId); const builder = document.querySelector(`[data-builder="${CSS.escape(searchId)}"]`); const feedback = document.querySelector(`[data-feedback-for="${CSS.escape(searchId)}"]`);
    const plain = (search?.value || '').slice(0, 256); if (!builder || builder.hidden) { if (feedback) feedback.textContent = 'Plain-text search'; return (text) => String(text).toLocaleLowerCase().includes(plain.toLocaleLowerCase()); }
    const pattern = (document.querySelector(`[data-pattern-for="${CSS.escape(searchId)}"]`)?.value || '').slice(0, 256); const flags = (document.querySelector(`[data-flags-for="${CSS.escape(searchId)}"]`)?.value || '').replace(/[^imsu]/g, '');
    try { const regex = new RegExp(pattern, flags); if (feedback) feedback.textContent = `Valid pattern /${pattern}/${flags}`; return (text) => { regex.lastIndex = 0; return regex.test(String(text)); }; }
    catch (error) { if (feedback) feedback.textContent = `Invalid pattern: ${error.message}`; return () => false; }
  }
  function filterNodes(searchId, selector, emptyId) { const match = matcherFor(searchId); let visible = 0; document.querySelectorAll(selector).forEach((node) => { const show = match(node.dataset.filter || node.textContent); node.hidden = !show; if (show) visible += 1; }); if (emptyId) $(emptyId).hidden = visible > 0; return visible; }
  function toggleBuilder(searchId) { const builder = document.querySelector(`[data-builder="${CSS.escape(searchId)}"]`); const button = document.querySelector(`[data-builder-for="${CSS.escape(searchId)}"]`); if (!builder || !button) return; builder.hidden = !builder.hidden; button.setAttribute('aria-expanded', String(!builder.hidden)); if (!builder.hidden) { const pattern = document.querySelector(`[data-pattern-for="${CSS.escape(searchId)}"]`); if (pattern && !pattern.value) pattern.value = $(searchId)?.value || ''; pattern?.focus(); } runSearch(searchId); }
  function runSearch(id) {
    if (id === 'capability-search') filterNodes(id, '#capability-list article', 'capability-empty');
    else if (id === 'settings-search') filterNodes(id, '#settings-list .setting-card', 'settings-empty');
    else if (id === 'tab-search') filterNodes(id, '.nav-tab');
    else if (id === 'group-search') filterNodes(id, '.tab-group');
    else if (id === 'master-tab-search') filterNodes(id, '.nav-tab');
    else if (id === 'learn-tab-search') filterNodes(id, '#group-learn-tabs .nav-tab');
    else if (id === 'workspace-tab-search') filterNodes(id, '#group-workspace-tabs .nav-tab');
    else if (id === 'schedule-search') renderSchedules();
    else if (id === 'lock-search') renderLocks();
    else if (id === 'record-search') renderRecords();
    else if (id === 'changelog-search') renderChangelog();
    else if (id === 'palette-search') renderCommands();
    else if (id === 'tab-menu-search') filterNodes(id, '#tab-context-menu [data-tab-action]');
  }

  const commands = [
    ...['home', 'capabilities', 'guides', 'settings', 'schedule', 'tools', 'records', 'changelog'].map((page) => ({ label: `Open ${page}`, hint: 'Page', run: () => activatePage(page) })),
    { label: 'Toggle School mode', hint: 'Live switch', control: 'school', run: () => { state.school.enabled = !state.school.enabled; persist('School mode changed', state.school.enabled ? 'enabled' : 'disabled'); renderAll(); } },
    { label: 'Toggle dialog emoji', hint: 'Live switch', control: 'emoji', run: () => { state.dialogEmoji = !state.dialogEmoji; persist('dialog emoji changed', String(state.dialogEmoji)); renderAll(); } },
    { label: 'Open personal vocabulary upload', hint: 'Exact setting', run: () => activatePage('settings', true, 'vocabulary-file') },
    { label: 'Edit hero appearance', hint: 'Exact control', run: () => { appearanceTarget = 'hero'; activatePage('tools', true, 'accent-color'); renderAppearanceTarget(); } },
    { label: 'Open notification centre', hint: 'Exact list', run: () => activatePage('records', true, 'notification-list') }
  ];
  function renderCommands() {
    const match = matcherFor('palette-search'); const list = $('command-list'); list.replaceChildren();
    const commandLabel = (command) => command.control === 'school' ? `Toggle ${state.school.name}` : command.label;
    const results = commands.filter((command) => match(`${commandLabel(command)} ${command.hint}`));
    results.forEach((command, index) => {
      const row = document.createElement(command.control ? 'label' : 'button'); row.className = `command${index === 0 ? ' active' : ''}`; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(index === 0));
      if (!command.control) row.type = 'button';
      const label = document.createElement('span'); label.textContent = commandLabel(command); row.append(label);
      if (command.control) { const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = command.control === 'school' ? state.school.enabled : state.dialogEmoji; toggle.setAttribute('aria-label', commandLabel(command)); toggle.addEventListener('change', () => { closePalette(); command.run(); }); row.append(toggle); }
      const hint = document.createElement('small'); hint.textContent = command.hint; row.append(hint);
      if (!command.control) row.addEventListener('click', () => { closePalette(); command.run(); }); list.append(row);
    });
    $('command-result-count').textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;
  }
  function openPalette() { if (!$('command-palette').hidden) return; lastPaletteFocus = document.activeElement; $('scrim').hidden = false; $('command-palette').hidden = false; $('palette-search').value = ''; renderCommands(); requestAnimationFrame(() => $('palette-search').focus()); }
  function closePalette() { $('command-palette').hidden = true; $('scrim').hidden = true; lastPaletteFocus?.focus?.(); }
  function paletteKeydown(event) { const options = [...$('command-list').querySelectorAll('.command')]; const current = options.findIndex((node) => node.classList.contains('active')); if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length; options.forEach((node, index) => { node.classList.toggle('active', index === next); node.setAttribute('aria-selected', String(index === next)); }); options[next]?.scrollIntoView({ block: 'nearest' }); } if (event.key === 'Enter') { event.preventDefault(); options[Math.max(0, current)]?.click(); } if (event.key === 'Escape') closePalette(); if (event.key === 'Tab') { const focusable = [...$('command-palette').querySelectorAll('button:not([disabled]),input:not([disabled])')]; const first = focusable[0]; const last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }

  function detectDuplicateKeys(text) {
    const stack = []; let inString = false; let escaped = false; let token = ''; let expectingKey = false;
    for (let i = 0; i < text.length; i += 1) { const char = text[i]; if (inString) { if (escaped) { escaped = false; token += `\\${char}`; } else if (char === '\\') escaped = true; else if (char === '"') { inString = false; let j = i + 1; while (/\s/.test(text[j] || '')) j += 1; if (text[j] === ':' && stack.length) { const key = JSON.parse(`"${token}"`); const keys = stack.at(-1); if (keys.has(key)) throw new Error(`Duplicate key is not allowed: ${key}`); keys.add(key); } token = ''; } else token += char; continue; } if (char === '"') { inString = true; token = ''; } else if (char === '{') { stack.push(new Set()); if (stack.length > 8) throw new Error('JSON nesting exceeds the depth limit of 8.'); expectingKey = true; } else if (char === '}') { stack.pop(); expectingKey = false; } }
    return expectingKey || true;
  }
  function validateVocabularyObject(parsed, throwOnError = true) {
    const fail = (message) => { if (throwOnError) throw new Error(message); return null; };
    const depth = (value, level = 1) => value && typeof value === 'object' ? Math.max(level, ...Object.values(value).map((child) => depth(child, level + 1))) : level;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('The root must be an object.');
    if (depth(parsed) > 8) return fail('JSON nesting exceeds the depth limit of 8.');
    if (Object.keys(parsed).some((key) => !['schemaVersion', 'replacements'].includes(key))) return fail('Unknown root fields are not allowed.');
    if (parsed.schemaVersion !== 1 || !parsed.replacements || typeof parsed.replacements !== 'object' || Array.isArray(parsed.replacements)) return fail('Use schemaVersion 1 with a replacements object.');
    const entries = Object.entries(parsed.replacements); if (entries.length > 128) return fail('At most 128 replacements are allowed.');
    for (const [key, value] of entries) { if (['__proto__', 'prototype', 'constructor'].includes(key)) return fail('Unsafe object keys are rejected.'); if (!key || key.length > 80 || typeof value !== 'string' || value.length > 200) return fail('Replacement keys and values exceed the documented limits.'); }
    return { schemaVersion: 1, replacements: Object.fromEntries(entries) };
  }
  async function loadVocabularyFile(file) {
    if (!file) return; if (file.size > 65536) throw new Error('The file exceeds the 64 KiB limit.'); const text = await file.text(); detectDuplicateKeys(text); const parsed = JSON.parse(text); const validated = validateVocabularyObject(parsed);
    localStorage.setItem(PRIVATE_VOCABULARY_KEY, JSON.stringify(validated)); vocabulary = validated; persist('private vocabulary changed', `${Object.keys(validated.replacements).length} replacements; payload omitted`); renderCopy(); notify('Vocabulary loaded', 'Validated private replacements are active only in this browser.', 'success');
  }

  function scheduleMatches(rule, date = new Date()) {
    if (!rule.enabled || !rule.weekdays.includes(date.getDay())) return false; const iso = date.toISOString().slice(0, 10); if (rule.startDate && iso < rule.startDate) return false; if (rule.endDate && iso > rule.endDate) return false;
    const now = date.getHours() * 60 + date.getMinutes(); const [sh, sm] = rule.start.split(':').map(Number); const [eh, em] = rule.end.split(':').map(Number); const start = sh * 60 + sm; const end = eh * 60 + em; return start === end || (start < end ? now >= start && now < end : now >= start || now < end);
  }
  function applySchedules() { const matching = state.schedules.filter((rule) => scheduleMatches(rule)); const rule = matching.at(-1); scheduleOverride = {}; if (rule?.setting === 'theme' && ['system', 'light', 'dark', 'contrast'].includes(rule.value)) scheduleOverride.theme = rule.value; if (rule?.setting === 'language' && ['en', 'yue', 'both'].includes(rule.value) && !state.school.enabled) scheduleOverride.language = rule.value; if (rule?.setting === 'density') { const value = Number(rule.value); if (value >= 80 && value <= 120) scheduleOverride.density = value; } applyAppearance(); renderCopy(); }
  function renderSchedules() { const match = matcherFor('schedule-search'); const list = $('schedule-list'); list.replaceChildren(); state.schedules.filter((rule) => match(`${rule.label} ${rule.setting} ${rule.value}`)).forEach((rule) => { const item = document.createElement('article'); item.className = 'record-item'; item.innerHTML = `<div class="item-body"><h3>${escapeHtml(rule.label)}</h3><p>${escapeHtml(rule.setting)} → ${escapeHtml(rule.value)} · ${escapeHtml(rule.start)}–${escapeHtml(rule.end)} · browser local time</p></div><div class="record-actions"><button class="text-button" type="button" data-toggle-rule="${rule.id}">${rule.enabled ? 'Disable' : 'Enable'}</button><button class="text-button" type="button" data-delete-rule="${rule.id}">Delete</button></div>`; list.append(item); }); if (!list.children.length) list.innerHTML = '<p class="empty-state">No local schedule rules match.</p>'; }

  async function hashPassword(password, salt) { const bytes = new TextEncoder().encode(`${salt}:${password}`); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
  async function createLock(target, password) { const salt = crypto.randomUUID(); const hash = await hashPassword(password, salt); state.locks.push({ id: crypto.randomUUID(), target, salt, hash, createdAt: new Date().toISOString() }); persist('lock created', target); renderLocks(); notify('Local lock created', `${target} now has its own for-fun browser lock.`, 'success'); }
  function renderLocks() { const match = matcherFor('lock-search'); const list = $('lock-list'); list.replaceChildren(); state.locks.filter((lock) => match(lock.target)).forEach((lock) => { const item = document.createElement('article'); item.className = 'record-item'; item.innerHTML = `<div class="item-body"><h3>${escapeHtml(lock.target)}</h3><p>Separate local password hash · created ${escapeHtml(new Date(lock.createdAt).toLocaleString())}</p><label>Unlock password<input type="password" data-unlock-input="${lock.id}" autocomplete="current-password"></label></div><div class="record-actions"><button class="text-button" type="button" data-unlock="${lock.id}">Check</button><button class="text-button" type="button" data-remove-lock="${lock.id}">Remove</button></div>`; list.append(item); }); if (!list.children.length) list.innerHTML = '<p class="empty-state">No local locks match.</p>'; }

  function base32Decode(value) { const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const normalized = value.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/g, ''); if (!/^[A-Z2-7]{16,256}$/.test(normalized)) throw new Error('The base32 secret is invalid or outside the 16–256 character bound.'); let bits = ''; for (const char of normalized) bits += alphabet.indexOf(char).toString(2).padStart(5, '0'); const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return new Uint8Array(bytes); }
  async function totpCode(entry, offset = 0) { const counter = Math.floor(Date.now() / 1000 / entry.period) + offset; const buffer = new ArrayBuffer(8); new DataView(buffer).setBigUint64(0, BigInt(counter)); const key = await crypto.subtle.importKey('raw', base32Decode(entry.secret), { name: 'HMAC', hash: entry.algorithm }, false, ['sign']); const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, buffer)); const position = signature.at(-1) & 15; const value = ((signature[position] & 127) << 24 | signature[position + 1] << 16 | signature[position + 2] << 8 | signature[position + 3]) % (10 ** entry.digits); return String(value).padStart(entry.digits, '0'); }
  function parseOtpAuth(uri) { const parsed = new URL(uri); if (parsed.protocol !== 'otpauth:' || parsed.hostname !== 'totp') throw new Error('Only otpauth://totp URIs are supported.'); const secret = parsed.searchParams.get('secret'); if (!secret) throw new Error('The URI has no secret.'); const algorithm = (parsed.searchParams.get('algorithm') || 'SHA1').toUpperCase().replace('SHA1', 'SHA-1').replace('SHA256', 'SHA-256').replace('SHA512', 'SHA-512'); if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithm)) throw new Error('Unsupported algorithm.'); const digits = Number(parsed.searchParams.get('digits') || 6); const period = Number(parsed.searchParams.get('period') || 30); if (![6, 7, 8].includes(digits) || period < 5 || period > 300) throw new Error('Digits or period are outside supported bounds.'); const label = decodeURIComponent(parsed.pathname.slice(1)) || 'Local entry'; return { id: crypto.randomUUID(), label: label.slice(0, 120), issuer: (parsed.searchParams.get('issuer') || '').slice(0, 80), secret, algorithm, digits, period, createdAt: new Date().toISOString() }; }
  async function renderTotp() { const list = $('totp-list'); list.replaceChildren(); for (const entry of state.totpEntries) { const current = await totpCode(entry); const next = await totpCode(entry, 1); const remaining = entry.period - (Math.floor(Date.now() / 1000) % entry.period); const item = document.createElement('article'); item.className = 'record-item'; item.innerHTML = `<div class="item-body"><h3>${escapeHtml(entry.label)}</h3><p><strong>${current.replace(/(.{3})/g, '$1 ').trim()}</strong> · ${remaining}s · next ${next.replace(/(.{3})/g, '$1 ').trim()}</p><small>${escapeHtml(entry.algorithm)} · ${entry.digits} digits · ${entry.period}s</small></div><div class="record-actions"><button class="text-button" type="button" data-copy-code="${current}">Copy code</button><button class="text-button" type="button" data-remove-totp="${entry.id}">Remove</button></div>`; list.append(item); } if (!list.children.length) list.innerHTML = '<p class="empty-state">No local authenticator entries.</p>'; }
  function renderTickets() { const list = $('ticket-list'); list.replaceChildren(); state.tickets.forEach((ticket) => { const item = document.createElement('article'); item.className = 'record-item'; item.innerHTML = `<div class="item-body"><h3>${escapeHtml(ticket.number)} · ${escapeHtml(ticket.category)}</h3><p>${escapeHtml(ticket.status)} — ${escapeHtml(ticket.response)}</p></div></article>`; list.append(item); }); if (!list.children.length) list.innerHTML = '<p class="empty-state">No fictional local tickets.</p>'; }

  function redactedExport() { return { schemaVersion: 1, exportedAt: new Date().toISOString(), notice: 'Private vocabulary payloads and metadata, lock credentials, password hashes, authenticator secrets, and ticket descriptions are omitted.', preferences: { language: state.language, englishLevel: state.englishLevel, cantoneseLevel: state.cantoneseLevel, school: { enabled: state.school.enabled, name: state.school.name }, dialogEmoji: state.dialogEmoji, theme: state.preset, dock: state.dock, density: state.density }, schedules: state.schedules, notifications: state.notifications.map(({ id, at, title, message, level, dismissed }) => ({ id, at, title, message, level, dismissed })), history: state.history, tabs: { pinned: state.pinnedTabs, groups: state.tabGroups, collapsedGroups: state.collapsedGroups }, appearance: state.appearance, locks: state.locks.map(({ id, target, createdAt }) => ({ id, target, createdAt, credential: 'omitted' })), authenticator: state.totpEntries.map(({ id, label, issuer, algorithm, digits, period, createdAt }) => ({ id, label, issuer, algorithm, digits, period, createdAt, secret: 'omitted' })) }; }
  function renderRecords() { const match = matcherFor('record-search'); const notices = $('notification-list'); const history = $('history-list'); notices.replaceChildren(); history.replaceChildren(); state.notifications.filter((item) => !item.dismissed && match(`${item.title} ${item.message}`)).slice().reverse().forEach((item) => { const node = document.createElement('article'); node.className = 'record-item'; node.innerHTML = `<div class="item-body"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.message)}</p><small>${escapeHtml(new Date(item.at).toLocaleString())}</small></div><button class="text-button" type="button" data-dismiss-notification="${item.id}">Dismiss</button>`; notices.append(node); }); state.history.filter((item) => match(`${item.action} ${item.detail}`)).slice().reverse().forEach((item) => { const node = document.createElement('article'); node.className = 'record-item'; node.innerHTML = `<div class="item-body"><h3>${escapeHtml(item.action)}</h3><p>${escapeHtml(item.detail || 'No additional public detail.')}</p><small>${escapeHtml(new Date(item.at).toLocaleString())}</small></div>`; history.append(node); }); if (!notices.children.length) notices.innerHTML = '<p class="empty-state">No visible notifications match.</p>'; if (!history.children.length) history.innerHTML = '<p class="empty-state">No local history matches.</p>'; }
  function renderChangelog() { const match = matcherFor('changelog-search'); const from = $('changelog-date').value; document.querySelectorAll('#changelog-list article').forEach((node) => { node.hidden = !match(node.dataset.filter) || Boolean(from && node.dataset.date < from); }); }
  function renderAppearanceTarget() { $('appearance-target-name').textContent = appearanceTarget; const values = state.appearance[appearanceTarget] || {}; $('accent-color').value = values.accent || state.accent || '#6750a4'; $('font-scale').value = values.scale || 100; $('corner-radius').value = values.radius ?? 24; }

  function openTabMenu(tab, event) { activeTabForMenu = tab; const menu = $('tab-context-menu'); menu.hidden = false; menu.style.left = `${Math.min(event.clientX || 24, innerWidth - 450)}px`; menu.style.top = `${Math.min(event.clientY || 80, innerHeight - 400)}px`; $('tab-menu-search').value = ''; runSearch('tab-menu-search'); requestAnimationFrame(() => $('tab-menu-search').focus()); }
  function closeTabMenu() { $('tab-context-menu').hidden = true; activeTabForMenu?.focus?.(); }
  function showDimSumMaybe() { if (state.school.enabled || Math.random() >= .1) return; const dish = dimSum[Math.floor(Math.random() * dimSum.length)]; $('surprise-title').textContent = `${dish.en} · ${dish.zh}`; $('surprise-copy').textContent = state.language === 'yue' ? '今日開機點心彩蛋，只出現一次，唔會阻住你。' : 'Today’s one-time startup dim-sum surprise. It will not block your work.'; $('surprise-link').href = 'https://github.com/Ding-Ding-Projects/dim-sum-photos/blob/main/catalog/index.json'; $('dim-sum-surprise').hidden = false; setTimeout(() => { $('dim-sum-surprise').hidden = true; }, 10000); }
  function renderAll() { renderTabs(); renderCopy(); applyAppearance(); renderSchedules(); renderLocks(); renderTotp(); renderTickets(); renderRecords(); activatePage(state.page, false); }

  document.querySelectorAll('.nav-tab').forEach((tab) => { tab.addEventListener('click', () => activatePage(tab.dataset.page)); tab.addEventListener('keydown', tabKeydown); tab.addEventListener('contextmenu', (event) => { event.preventDefault(); openTabMenu(tab, event); }); });
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => activatePage(button.dataset.go, true, button.dataset.focus || '')));
  document.querySelectorAll('[data-builder-for]').forEach((button) => button.addEventListener('click', () => toggleBuilder(button.dataset.builderFor)));
  document.querySelectorAll('[id$="-search"]').forEach((input) => input.addEventListener('input', () => runSearch(input.id)));
  document.querySelectorAll('[data-pattern-for],[data-flags-for]').forEach((input) => input.addEventListener('input', () => runSearch(input.dataset.patternFor || input.dataset.flagsFor)));
  document.querySelectorAll('.group-toggle').forEach((button) => button.addEventListener('click', () => { const group = button.closest('.tab-group').dataset.tabGroup; state.collapsedGroups = state.collapsedGroups.includes(group) ? state.collapsedGroups.filter((item) => item !== group) : [...state.collapsedGroups, group]; persist('tab group collapsed state changed', group); renderTabs(); }));
  document.querySelectorAll('.group-menu-button').forEach((button) => button.addEventListener('click', (event) => openTabMenu(button.closest('.tab-group').querySelector('.nav-tab'), event)));
  document.querySelectorAll('input[name="language"]').forEach((input) => input.addEventListener('change', () => { state.language = input.value; persist('language changed', input.value); renderCopy(); notify('Language updated', textFor('docsLabel'), 'success'); }));
  document.querySelectorAll('input[name="preset"]').forEach((input) => input.addEventListener('change', () => { state.preset = input.value; persist('appearance preset changed', input.value); applyAppearance(); }));
  document.querySelectorAll('input[name="dock"]').forEach((input) => input.addEventListener('change', () => { state.dock = input.value; persist('tab dock changed', input.value); applyAppearance(); }));
  $('english-level').addEventListener('input', () => { state.englishLevel = Number($('english-level').value); persist('English humor level changed', state.englishLevel); renderCopy(); });
  $('cantonese-level').addEventListener('input', () => { state.cantoneseLevel = Number($('cantonese-level').value); persist('Cantonese humor level changed', state.cantoneseLevel); renderCopy(); });
  $('school-enabled').addEventListener('change', () => { state.school.enabled = $('school-enabled').checked; persist(`${state.school.name} changed`, state.school.enabled ? 'enabled' : 'disabled'); renderAll(); notify(state.school.name, state.school.enabled ? 'English-only presentation is active.' : 'Previous presentation preferences are restored.', 'success'); });
  $('school-name').addEventListener('change', () => { const value = $('school-name').value.trim(); if (value) state.school.name = value; persist(`${state.school.name} renamed`, 'presentation label changed'); renderCopy(); });
  $('dialog-emoji').addEventListener('change', () => { state.dialogEmoji = $('dialog-emoji').checked; persist('dialog emoji changed', String(state.dialogEmoji)); notify('Dialog emoji', state.dialogEmoji ? 'Decoration is enabled.' : 'Decoration is disabled.', 'success'); });
  $('vocabulary-file').addEventListener('change', async () => { try { await loadVocabularyFile($('vocabulary-file').files[0]); } catch (error) { $('vocabulary-status').textContent = `Invalid file: ${error.message}`; notify('Vocabulary rejected', error.message, 'error'); } finally { $('vocabulary-file').value = ''; } });
  $('vocabulary-clear').addEventListener('click', () => { localStorage.removeItem(PRIVATE_VOCABULARY_KEY); vocabulary = null; persist('private vocabulary cleared', 'payload omitted'); renderCopy(); notify('Vocabulary cleared', 'Original shipped wording is restored.', 'success'); });
  $('schedule-form').addEventListener('submit', (event) => { event.preventDefault(); const weekdays = [...document.querySelectorAll('input[name="weekday"]:checked')].map((input) => Number(input.value)); if (!weekdays.length) return notify('Schedule rejected', 'Choose at least one weekday.', 'error'); const rule = { id: crypto.randomUUID(), label: $('schedule-label').value.trim(), setting: document.querySelector('input[name="schedule-setting"]:checked').value, value: $('schedule-value').value.trim(), start: $('schedule-start').value, end: $('schedule-end').value, startDate: $('schedule-start-date').value, endDate: $('schedule-end-date').value, weekdays, enabled: true }; state.schedules.push(rule); persist('schedule created', rule.label); renderSchedules(); applySchedules(); notify('Schedule saved', `${rule.label} is stored in this browser.`, 'success'); });
  $('schedule-list').addEventListener('click', (event) => { const toggle = event.target.closest('[data-toggle-rule]'); const remove = event.target.closest('[data-delete-rule]'); if (toggle) { const rule = state.schedules.find((item) => item.id === toggle.dataset.toggleRule); rule.enabled = !rule.enabled; persist('schedule state changed', rule.label); renderSchedules(); applySchedules(); } if (remove) { const rule = state.schedules.find((item) => item.id === remove.dataset.deleteRule); state.schedules = state.schedules.filter((item) => item.id !== remove.dataset.deleteRule); persist('schedule deleted', rule?.label || 'unknown'); renderSchedules(); } });
  $('appearance-apply').addEventListener('click', () => { state.appearance[appearanceTarget] = { accent: $('accent-color').value, scale: Number($('font-scale').value), radius: Number($('corner-radius').value) }; state.accent = $('accent-color').value; state.fontScale = Number($('font-scale').value); state.density = Number($('density-scale').value); persist('element appearance changed', appearanceTarget); applyAppearance(); notify('Appearance applied', appearanceTarget, 'success'); });
  $('appearance-reset').addEventListener('click', () => { delete state.appearance[appearanceTarget]; persist('element appearance reset', appearanceTarget); applyAppearance(); renderAppearanceTarget(); });
  $('appearance-export').addEventListener('click', () => download('material-system-utility-theme.json', 'application/json', JSON.stringify({ schemaVersion: 1, preset: state.preset, accent: state.accent, fontScale: state.fontScale, density: state.density, appearance: state.appearance }, null, 2)));
  document.querySelectorAll('[data-appearance-target]').forEach((node) => node.addEventListener('contextmenu', (event) => { if (event.target.closest('.nav-tab')) return; event.preventDefault(); appearanceTarget = node.dataset.appearanceTarget; renderAppearanceTarget(); activatePage('tools', true, 'appearance-card'); }));
  $('lock-form').addEventListener('submit', async (event) => { event.preventDefault(); await createLock($('lock-target').value.trim(), $('lock-password').value); $('lock-password').value = ''; });
  $('lock-list').addEventListener('click', async (event) => { const unlock = event.target.closest('[data-unlock]'); const remove = event.target.closest('[data-remove-lock]'); if (unlock) { const lock = state.locks.find((item) => item.id === unlock.dataset.unlock); const input = document.querySelector(`[data-unlock-input="${CSS.escape(lock.id)}"]`); const matches = await hashPassword(input.value, lock.salt) === lock.hash; input.value = ''; notify(matches ? 'Lock matched' : 'Lock did not match', matches ? `${lock.target} is unlocked for this interaction.` : 'Try again or clear this site data to recover.', matches ? 'success' : 'error'); } if (remove) { const lock = state.locks.find((item) => item.id === remove.dataset.removeLock); state.locks = state.locks.filter((item) => item.id !== remove.dataset.removeLock); persist('lock removed', lock?.target || 'unknown'); renderLocks(); } });
  $('totp-form').addEventListener('submit', (event) => { event.preventDefault(); try { const entry = parseOtpAuth($('totp-uri').value); state.totpEntries.push(entry); $('totp-uri').value = ''; persist('authenticator entry created', `${entry.label}; secret omitted`); renderTotp(); notify('Authenticator entry added', 'The secret stays in this browser and is excluded from ordinary export.', 'success'); } catch (error) { notify('Authenticator entry rejected', error.message, 'error'); } });
  $('totp-list').addEventListener('click', async (event) => { const copyButton = event.target.closest('[data-copy-code]'); const remove = event.target.closest('[data-remove-totp]'); if (copyButton) { try { await navigator.clipboard.writeText(copyButton.dataset.copyCode); notify('Code copied', 'The current code was copied to the clipboard.', 'success'); } catch { notify('Copy failed', 'Clipboard access was refused. Select the displayed digits instead.', 'error'); } } if (remove) { const entry = state.totpEntries.find((item) => item.id === remove.dataset.removeTotp); state.totpEntries = state.totpEntries.filter((item) => item.id !== remove.dataset.removeTotp); persist('authenticator entry removed', `${entry?.label || 'unknown'}; secret omitted`); renderTotp(); } });
  $('ticket-form').addEventListener('submit', (event) => { event.preventDefault(); const ticket = { id: crypto.randomUUID(), number: `LOCAL-${Date.now().toString(36).toUpperCase()}`, category: $('ticket-category').value.trim(), status: 'Resolved locally', response: 'Open browser settings for this site, then clear stored site data. Nothing was sent.' }; state.tickets.unshift(ticket); persist('fictional local ticket created', ticket.number); renderTickets(); notify('Local ticket resolved', ticket.number, 'success'); });
  $('clear-site-data').addEventListener('click', () => { $('reset-confirmation').hidden = false; $('scrim').hidden = false; $('reset-key-one').focus(); });
  ['reset-key-one', 'reset-key-two'].forEach((id) => $(id).addEventListener('change', () => { const ready = $('reset-key-one').checked && $('reset-key-two').checked; $('reset-slider').disabled = !ready; $('reset-progress').textContent = ready ? 'Slide fully to authorize reset.' : 'Two acknowledgements are required.'; }));
  $('reset-slider').addEventListener('input', () => { const done = Number($('reset-slider').value) === 100; $('reset-complete').disabled = !done; $('reset-progress').textContent = done ? 'Reset authorized. Use the final button to complete.' : `${$('reset-slider').value}%`; });
  $('reset-cancel').addEventListener('click', () => { $('reset-confirmation').hidden = true; $('scrim').hidden = true; $('clear-site-data').focus(); });
  $('reset-complete').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(PRIVATE_VOCABULARY_KEY); location.reload(); });
  $('notification-list').addEventListener('click', (event) => { const button = event.target.closest('[data-dismiss-notification]'); if (!button) return; const item = state.notifications.find((notice) => notice.id === button.dataset.dismissNotification); if (item) item.dismissed = true; persist('notification dismissed', item?.title || 'unknown'); renderRecords(); });
  $('dismiss-notifications').addEventListener('click', () => { const match = matcherFor('record-search'); let count = 0; state.notifications.forEach((item) => { if (!item.dismissed && match(`${item.title} ${item.message}`)) { item.dismissed = true; count += 1; } }); persist('notifications dismissed in bulk', `${count} visible`); renderRecords(); });
  document.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', () => { const data = redactedExport(); if (button.dataset.export === 'json') download('material-system-utility-site-export.json', 'application/json', JSON.stringify(data, null, 2)); else if (button.dataset.export === 'csv') { const rows = [['type', 'time', 'title', 'detail'], ...data.notifications.map((item) => ['notification', item.at, item.title, item.message]), ...data.history.map((item) => ['history', item.at, item.action, item.detail])]; download('material-system-utility-site-records.csv', 'text/csv', rows.map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\r\n')); } else download('material-system-utility-site-export.md', 'text/markdown', `# Material System Utility local site export\n\n${data.notice}\n\n## Preferences\n\n\`\`\`json\n${JSON.stringify(data.preferences, null, 2)}\n\`\`\`\n\n## History\n\n${data.history.map((item) => `- ${item.at} — ${item.action}: ${item.detail}`).join('\n')}`); persist('redacted export created', button.dataset.export); notify('Export created', `${button.dataset.export.toUpperCase()} excludes private vocabulary and secrets.`, 'success'); }));
  $('changelog-date').addEventListener('change', renderChangelog);
  $('palette-launch').addEventListener('click', openPalette); $('palette-close').addEventListener('click', closePalette); $('command-palette').addEventListener('keydown', paletteKeydown);
  $('menu-button').addEventListener('click', openRail); $('rail-close').addEventListener('click', () => closeRail(true));
  $('tab-menu-close').addEventListener('click', closeTabMenu); $('tab-context-menu').addEventListener('click', (event) => { const action = event.target.closest('[data-tab-action]'); if (!action || !activeTabForMenu) return; const page = activeTabForMenu.dataset.page; if (action.dataset.tabAction === 'pin') togglePin(page); if (action.dataset.tabAction === 'move') { const current = Object.entries(state.tabGroups).find(([, pages]) => pages.includes(page))?.[0]; const target = current === 'learn' ? 'workspace' : 'learn'; state.tabGroups[current] = state.tabGroups[current].filter((item) => item !== page); state.tabGroups[target].push(page); persist('tab moved between groups', `${page} to ${target}`); renderTabs(); } if (action.dataset.tabAction === 'appearance') { appearanceTarget = `tab-${page}`; renderAppearanceTarget(); activatePage('tools', true, 'appearance-card'); } closeTabMenu(); });
  $('surprise-close').addEventListener('click', () => { $('dim-sum-surprise').hidden = true; });
  $('scrim').addEventListener('click', () => { if (!$('command-palette').hidden) closePalette(); });
  document.addEventListener('keydown', (event) => { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); openPalette(); } if (event.key === 'Escape') { if (!$('reset-confirmation').hidden) $('reset-cancel').click(); else if (!$('tab-context-menu').hidden) closeTabMenu(); else if (!$('command-palette').hidden) closePalette(); else closeRail(false); } });
  addEventListener('resize', () => { if (!matchMedia('(max-width: 900px)').matches) $('tab-rail').removeAttribute('inert'); else if (!$('tab-rail').classList.contains('open')) $('tab-rail').setAttribute('inert', ''); });

  renderAll(); applySchedules(); showDimSumMaybe();
  scheduleTimer = setInterval(() => { applySchedules(); if (state.page === 'tools') renderTotp(); }, 1000);
  addEventListener('pagehide', () => clearInterval(scheduleTimer), { once: true });
  if (matchMedia('(max-width: 900px)').matches) $('tab-rail').setAttribute('inert', '');
})();
