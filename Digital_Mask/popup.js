'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────
let allUAs      = [];   // wordlist.txt
let savedUAs    = [];   // chrome.storage.sync → customUAs
let siteRules   = [];   // [{pattern, ua, enabled}] (chrome.storage.sync → siteRules)
let currentGroup = 'all';
let selectedUA   = '';
let debounceTimer = null;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function classify(ua) {
    if (/bot|crawl|spider|googlebot|bingbot|slurp|duckduck/i.test(ua)) return 'bot';
    if (/mobile|android|iphone|ipad|ipod/i.test(ua)) return 'mobile';
    return 'desktop';
}

function truncate(str, n) {
    n = n || 55;
    return str.length > n ? str.substring(0, n) + '…' : str;
}

function setTerminal(msg) {
    var el = document.getElementById('terminalMsg');
    if (el) el.textContent = msg;
}

function updateUACount() {
    var el = document.getElementById('uaCount');
    if (!el) return;
    var total = allUAs.length + savedUAs.length;
    el.textContent = total;
}

function updateIOStats() {
    var wc = document.getElementById('ioWordlistCount');
    var sc = document.getElementById('ioSavedCount');
    if (wc) wc.textContent = allUAs.length;
    if (sc) sc.textContent = savedUAs.length;
}

// ─── STATUS ──────────────────────────────────────────────────────────────────
function updateStatus(isActive) {
    var dot   = document.getElementById('statusDot');
    var label = document.getElementById('statusLabel');
    if (!dot || !label) return;
    if (isActive) {
        dot.className   = 'status-dot active';
        label.className = 'status-label active';
        label.textContent = 'ACTIVE';
        setTerminal('spoof active');
    } else {
        dot.className   = 'status-dot';
        label.className = 'status-label';
        label.textContent = 'INACTIVE';
        setTerminal('system ready');
    }
}

// ─── REAL UA ─────────────────────────────────────────────────────────────────
function showRealUA() {
    var el = document.getElementById('realUA');
    if (!el) return;
    chrome.runtime.sendMessage({ action: 'getRealUA' }, function(resp) {
        var ua = (resp && resp.ua) ? resp.ua : navigator.userAgent;
        el.textContent = ua;
        el.title = ua;
    });
}

// ─── STORAGE: SAVED UAs ──────────────────────────────────────────────────────
function loadSaved(cb) {
    chrome.storage.sync.get('customUAs', function(data) {
        savedUAs = data.customUAs || [];
        if (cb) cb();
    });
}

function persistSaved(cb) {
    chrome.storage.sync.set({ customUAs: savedUAs }, function() {
        if (cb) cb();
    });
}

function saveCustomUA(ua) {
    if (!ua || savedUAs.includes(ua)) return false;
    savedUAs.unshift(ua);
    persistSaved(function() {
        renderSavedList();
        updateUACount();
        updateIOStats();
    });
    return true;
}

function renderSavedList() {
    var list = document.getElementById('savedList');
    if (!list) return;
    list.innerHTML = '';
    savedUAs.forEach(function(ua, i) {
        var item = document.createElement('div');
        item.className = 'saved-item' + (ua === selectedUA ? ' selected' : '');

        var text = document.createElement('span');
        text.className = 'saved-item-text';
        text.textContent = truncate(ua, 50);
        text.title = ua;
        text.addEventListener('click', function() {
            selectedUA = ua;
            document.getElementById('uaCustom').value = ua;
            renderSavedList();
        });

        var del = document.createElement('span');
        del.className = 'saved-item-del';
        del.textContent = '✕';
        del.title = 'Delete';
        del.addEventListener('click', function(e) {
            e.stopPropagation();
            savedUAs.splice(i, 1);
            persistSaved(function() {
                renderSavedList();
                updateUACount();
                updateIOStats();
                if (currentGroup === 'saved') renderSelect();
            });
        });

        item.appendChild(text);
        item.appendChild(del);
        list.appendChild(item);
    });
}

// ─── WORDLIST ─────────────────────────────────────────────────────────────────
function loadWordlist(cb) {
    var url = chrome.runtime.getURL('wordlist.txt');
    fetch(url)
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        })
        .then(function(data) {
            allUAs = data.split('\n')
                .map(function(l) { return l.trim(); })
                .filter(function(l) { return l && l.charAt(0) !== '#'; });
            if (cb) cb();
        })
        .catch(function(err) {
            console.error('[UA Switcher] wordlist load error:', err);
            setTerminal('wordlist error: ' + err.message);
            allUAs = [];
            if (cb) cb();
        });
}

// ─── SELECT PANEL ─────────────────────────────────────────────────────────────
function getFilteredUAs() {
    if (currentGroup === 'saved') return savedUAs.slice();
    return allUAs.filter(function(ua) {
        if (currentGroup === 'all') return true;
        return classify(ua) === currentGroup;
    });
}

function renderSelect() {
    var select = document.getElementById('uaSelect');
    if (!select) return;

    var source = getFilteredUAs();
    select.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = source.length === 0 ? '> NO ENTRIES' : '> SELECT PROFILE';
    select.appendChild(placeholder);

    source.forEach(function(ua) {
        var opt = document.createElement('option');
        opt.value = ua;
        var icon = { desktop: '🖥 ', mobile: '📱 ', bot: '🤖 ' }[classify(ua)] || '';
        opt.textContent = icon + truncate(ua, 48);
        opt.title = ua;
        select.appendChild(opt);
    });
}

// ─── RANDOM ───────────────────────────────────────────────────────────────────
function pickRandom() {
    var pool = getFilteredUAs();
    if (pool.length === 0) { setTerminal('no UA in this group'); return; }
    var ua = pool[Math.floor(Math.random() * pool.length)];
    var select = document.getElementById('uaSelect');
    if (select) select.value = ua;
    selectedUA = ua;
    applyUA(ua);
    setTerminal('random: ' + truncate(ua, 38));
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
function initTabs() {
    document.querySelectorAll('.tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
            tab.classList.add('active');
            document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
        });
    });
}

// ─── GROUPS ───────────────────────────────────────────────────────────────────
function initGroups() {
    document.querySelectorAll('.group-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.group-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            currentGroup = btn.dataset.group;
            renderSelect();
        });
    });
}

// ─── APPLY / RESET ────────────────────────────────────────────────────────────
function applyUA(ua) {
    if (!ua) { alert('[!] SELECT OR ENTER USER-AGENT'); return; }
    chrome.runtime.sendMessage({ action: 'setUserAgent', ua: ua });
    updateStatus(true);
}

function resetUA() {
    chrome.runtime.sendMessage({ action: 'resetUserAgent' });
    updateStatus(false);
}

function flashBtn(btn, text, ms) {
    var orig = btn.textContent;
    btn.textContent = text;
    setTimeout(function() { btn.textContent = orig; }, ms || 600);
}

// ─── DEBOUNCE AUTOSAVE ────────────────────────────────────────────────────────
function initCustomInput() {
    var input = document.getElementById('uaCustom');
    if (!input) return;
    input.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        var val = input.value.trim();
        if (!val) return;
        debounceTimer = setTimeout(function() {
            if (saveCustomUA(val)) {
                setTerminal('auto-saved ua');
            }
        }, 2000);
    });
}

// ─── SITE RULES ───────────────────────────────────────────────────────────────
function loadSiteRules(cb) {
    chrome.storage.sync.get('siteRules', function(data) {
        siteRules = data.siteRules || [];
        if (cb) cb();
    });
}

function persistSiteRules(cb) {
    chrome.storage.sync.set({ siteRules: siteRules }, function() {
        if (cb) cb();
    });
}

function renderRulesList() {
    var list = document.getElementById('rulesList');
    if (!list) return;
    list.innerHTML = '';

    siteRules.forEach(function(rule, i) {
        var item = document.createElement('div');
        item.className = 'rule-item';

        var toggle = document.createElement('div');
        toggle.className = 'rule-toggle' + (rule.enabled ? ' on' : '');
        toggle.title = rule.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable';
        toggle.addEventListener('click', function() {
            siteRules[i].enabled = !siteRules[i].enabled;
            persistSiteRules(function() {
                renderRulesList();
                applyAllSiteRules();
            });
        });

        var pattern = document.createElement('span');
        pattern.className = 'rule-pattern';
        pattern.textContent = rule.pattern;
        pattern.title = rule.pattern;

        var uaSpan = document.createElement('span');
        uaSpan.className = 'rule-ua';
        uaSpan.textContent = truncate(rule.ua, 38);
        uaSpan.title = rule.ua;

        var del = document.createElement('span');
        del.className = 'rule-del';
        del.textContent = '✕';
        del.addEventListener('click', function() {
            siteRules.splice(i, 1);
            persistSiteRules(function() {
                renderRulesList();
                applyAllSiteRules();
            });
        });

        item.appendChild(toggle);
        item.appendChild(pattern);
        item.appendChild(uaSpan);
        item.appendChild(del);
        list.appendChild(item);
    });
}

// google.com       → *google.com*
// *.youtube.com    → *.youtube.com*
// *youtube*        → *youtube*
function patternToUrlFilter(pattern) {
    var p = pattern.trim();
    if (!p.includes('*')) {
        return '*' + p + '*';
    }
    return p;
}

function applyAllSiteRules() {
    chrome.runtime.sendMessage({
        action: 'setSiteRules',
        rules: siteRules
    });
}

function initRulesPanel() {
    var addBtn = document.getElementById('addRuleBtn');
    if (!addBtn) return;

    addBtn.addEventListener('click', function() {
        var pattern = document.getElementById('rulePattern').value.trim();
        var ua      = document.getElementById('ruleUA').value.trim();
        if (!pattern || !ua) { alert('[!] FILL BOTH FIELDS'); return; }

        var exists = siteRules.some(function(r) { return r.pattern === pattern; });
        if (exists) { alert('[!] PATTERN ALREADY EXISTS'); return; }

        siteRules.push({ pattern: pattern, ua: ua, enabled: true });
        persistSiteRules(function() {
            renderRulesList();
            applyAllSiteRules();
            document.getElementById('rulePattern').value = '';
            document.getElementById('ruleUA').value = '';
            setTerminal('rule added: ' + pattern);
        });
    });

    document.getElementById('ruleUA').addEventListener('focus', function() {
        var selUA = document.getElementById('uaSelect') && document.getElementById('uaSelect').value;
        var custUA = document.getElementById('uaCustom') && document.getElementById('uaCustom').value.trim();
        var active = selUA || custUA || selectedUA;
        if (active && !this.value) this.value = active;
    });
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportTxt() {
    var all = allUAs.concat(savedUAs);
    var blob = new Blob([all.join('\n')], { type: 'text/plain' });
    downloadBlob(blob, 'ua-database.txt');
}

function exportJson() {
    var data = {
        version: '1.3',
        exported: new Date().toISOString(),
        wordlist: allUAs,
        custom: savedUAs,
        siteRules: siteRules
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'ua-database.json');
}

function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── IMPORT ───────────────────────────────────────────────────────────────────
function importTxt(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
        var lines = e.target.result.split('\n')
            .map(function(l) { return l.trim(); })
            .filter(function(l) { return l && l.charAt(0) !== '#'; });
        var added = 0;
        lines.forEach(function(ua) {
            if (!savedUAs.includes(ua)) { savedUAs.push(ua); added++; }
        });
        persistSaved(function() {
            renderSavedList(); renderSelect(); updateUACount(); updateIOStats();
            setTerminal('imported ' + added + ' from txt');
        });
    };
    reader.readAsText(file);
}

function importJson(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            var entries = Array.isArray(data) ? data
                        : (data.wordlist || []).concat(data.custom || []);
            var added = 0;
            entries.forEach(function(ua) {
                if (typeof ua === 'string' && ua.trim() && !savedUAs.includes(ua.trim())) {
                    savedUAs.push(ua.trim()); added++;
                }
            });
            if (data.siteRules && Array.isArray(data.siteRules)) {
                data.siteRules.forEach(function(rule) {
                    if (rule.pattern && rule.ua && !siteRules.some(function(r){ return r.pattern === rule.pattern; })) {
                        siteRules.push(rule);
                    }
                });
                persistSiteRules(function() { renderRulesList(); applyAllSiteRules(); });
            }
            persistSaved(function() {
                renderSavedList(); renderSelect(); updateUACount(); updateIOStats();
                setTerminal('imported ' + added + ' from json');
            });
        } catch(err) {
            alert('[!] INVALID JSON FILE');
        }
    };
    reader.readAsText(file);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initGroups();
    initCustomInput();
    initRulesPanel();
    initPrivacyPanel();
    showRealUA();

    chrome.storage.sync.get('spoofedUA', function(data) {
        updateStatus(!!data.spoofedUA);
    });

    var wordlistDone = false;
    var savedDone    = false;
    var rulesDone    = false;

    function onAllLoaded() {
        if (!wordlistDone || !savedDone || !rulesDone) return;
        renderSelect();
        renderSavedList();
        renderRulesList();
        updateUACount();
        updateIOStats();
        setTerminal('db loaded: ' + (allUAs.length + savedUAs.length) + ' entries');
    }

    loadWordlist(function() { wordlistDone = true; onAllLoaded(); });
    loadSaved(function()    { savedDone    = true; onAllLoaded(); });
    loadSiteRules(function(){ rulesDone    = true; onAllLoaded(); });

    // SELECT panel
    document.getElementById('uaSelect').addEventListener('change', function() {
        selectedUA = this.value;
    });

    document.getElementById('applyBtn').addEventListener('click', function() {
        var ua = document.getElementById('uaSelect').value || selectedUA;
        applyUA(ua);
        flashBtn(this, '> OK');
    });

    document.getElementById('randomBtn').addEventListener('click', function() {
        pickRandom();
    });

    document.getElementById('resetBtn').addEventListener('click', function() {
        resetUA();
        flashBtn(this, '> DONE');
    });

    // CUSTOM panel
    document.getElementById('saveCustomBtn').addEventListener('click', function() {
        var ua = document.getElementById('uaCustom').value.trim();
        if (!ua) return;
        clearTimeout(debounceTimer);
        var saved = saveCustomUA(ua);
        if (saved) {
            this.textContent = '✓ SAVED';
            this.classList.add('saved');
            var btn = this;
            setTimeout(function() { btn.textContent = '+ SAVE'; btn.classList.remove('saved'); }, 1000);
        }
    });

    document.getElementById('applyCustomBtn').addEventListener('click', function() {
        var ua = document.getElementById('uaCustom').value.trim() || selectedUA;
        applyUA(ua);
        flashBtn(this, '> OK');
    });

    document.getElementById('resetCustomBtn').addEventListener('click', function() {
        resetUA();
        flashBtn(this, '> DONE');
    });

    // I/O panel
    document.getElementById('exportTxt').addEventListener('click', exportTxt);
    document.getElementById('exportJson').addEventListener('click', exportJson);

    document.getElementById('importTxtBtn').addEventListener('click', function() {
        document.getElementById('importTxtFile').click();
    });
    document.getElementById('importJsonBtn').addEventListener('click', function() {
        document.getElementById('importJsonFile').click();
    });
    document.getElementById('importTxtFile').addEventListener('change', function() {
        if (this.files[0]) { importTxt(this.files[0]); this.value = ''; }
    });
    document.getElementById('importJsonFile').addEventListener('change', function() {
        if (this.files[0]) { importJson(this.files[0]); this.value = ''; }
    });
});

// ─── PRIVACY PANEL ───────────────────────────────────────────────────────────
function loadPrivacySettings(cb) {
    chrome.storage.sync.get('privacySettings', function(data) {
        var s = data.privacySettings || {};
        cb(s);
    });
}

function savePrivacySettings(settings, cb) {
    chrome.storage.sync.set({ privacySettings: settings }, function() {
        if (chrome.storage.session) {
            chrome.storage.session.set({ privacySettings: settings });
        }
        if (cb) cb();
    });
}

function initPrivacyPanel() {
    loadPrivacySettings(function(s) {
        document.getElementById('pWebrtc').checked     = !!s.webrtc;
        document.getElementById('pFingerprint').checked = !!s.fingerprint;
        document.getElementById('pCanvas').checked     = !!s.canvas;
        document.getElementById('pWebgl').checked      = !!s.webgl;
        document.getElementById('pTimezone').checked   = !!s.timezone;

        // Sub-options
        if (s.cores)    document.getElementById('fpCores').value   = s.cores;
        if (s.memory)   document.getElementById('fpMemory').value  = s.memory;
        if (s.screenW && s.screenH) {
            document.getElementById('fpScreen').value = s.screenW + 'x' + s.screenH;
        }
        if (s.timezoneId) document.getElementById('tzManual').value = s.timezoneId;

        toggleSubPanel('fpOptions',  !!s.fingerprint);
        toggleSubPanel('tzOptions',  !!s.timezone);
    });

    document.getElementById('pFingerprint').addEventListener('change', function() {
        toggleSubPanel('fpOptions', this.checked);
    });
    document.getElementById('pTimezone').addEventListener('change', function() {
        toggleSubPanel('tzOptions', this.checked);
    });

    document.getElementById('applyPrivacyBtn').addEventListener('click', function() {
        var screenVal = document.getElementById('fpScreen').value.split('x');
        var tzVal = document.getElementById('tzManual').value.trim();

        var settings = {
            webrtc:      document.getElementById('pWebrtc').checked,
            fingerprint: document.getElementById('pFingerprint').checked,
            canvas:      document.getElementById('pCanvas').checked,
            webgl:       document.getElementById('pWebgl').checked,
            timezone:    document.getElementById('pTimezone').checked,
            cores:       parseInt(document.getElementById('fpCores').value),
            memory:      parseInt(document.getElementById('fpMemory').value),
            screenW:     parseInt(screenVal[0]),
            screenH:     parseInt(screenVal[1]),
            timezoneId:  tzVal || null
        };

        savePrivacySettings(settings, function() {
            chrome.runtime.sendMessage({ action: 'setPrivacy', settings: settings });
            setStatus('[✓] APPLIED — reload tabs to activate', 'ok');
            setTerminal('privacy settings saved');
        });
    });
}

function toggleSubPanel(id, show) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('visible', show);
}

function setStatus(msg, cls) {
    var el = document.getElementById('privacyStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'privacy-status' + (cls ? ' ' + cls : '');
}