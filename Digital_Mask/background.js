chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'setUserAgent' && request.ua) {
        applyUserAgent(request.ua);
        const ua = request.ua;
        if (chrome.storage.session) {
            chrome.storage.session.set({ spoofedUA: ua });
        }
        chrome.storage.sync.set({ spoofedUA: ua });
        sendResponse({ status: 'ok' });
    } else if (request.action === 'resetUserAgent') {
        resetUserAgent();
        if (chrome.storage.session) {
            chrome.storage.session.remove('spoofedUA');
        }
        chrome.storage.sync.remove('spoofedUA');
        sendResponse({ status: 'ok' });
    } else if (request.action === 'getRealUA') {
        sendResponse({ ua: navigator.userAgent });
    } else if (request.action === 'setSiteRules') {
        applySiteRules(request.rules || []);
        sendResponse({ status: 'ok' });
    } else if (request.action === 'setPrivacy') {
        applyPrivacySettings(request.settings || {});
        sendResponse({ status: 'ok' });
    } else if (request.action === 'getTimezone') {
        fetchTimezoneByIP().then(tz => sendResponse({ timezone: tz })).catch(() => sendResponse({ timezone: null }));
    }
    return true;
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.sync.get(['spoofedUA', 'siteRules'], data => {
        if (data.spoofedUA) {
            if (chrome.storage.session) chrome.storage.session.set({ spoofedUA: data.spoofedUA });
            applyUserAgent(data.spoofedUA);
        }
        if (data.siteRules && data.siteRules.length) applySiteRules(data.siteRules);
    });
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(['spoofedUA', 'siteRules'], data => {
        if (data.spoofedUA) {
            if (chrome.storage.session) chrome.storage.session.set({ spoofedUA: data.spoofedUA });
            applyUserAgent(data.spoofedUA);
        }
        if (data.siteRules && data.siteRules.length) applySiteRules(data.siteRules);
    });
});

function applyUserAgent(uaString) {
    chrome.declarativeNetRequest.getDynamicRules(rules => {
        const ruleIds = rules.map(r => r.id);
        const hints = generateClientHints(uaString);

        const requestHeaders = [
            { header: 'user-agent', operation: 'set', value: uaString }
        ];

        if (hints.sendClientHints) {
            requestHeaders.push(
                { header: 'sec-ch-ua',                  operation: 'set',    value: hints.secChUa },
                { header: 'sec-ch-ua-platform',         operation: 'set',    value: hints.secChUaPlatform },
                { header: 'sec-ch-ua-mobile',           operation: 'set',    value: hints.secChUaMobile },
                { header: 'sec-ch-ua-full-version',     operation: 'set',    value: hints.secChUaFullVersion },
                { header: 'sec-ch-ua-arch',             operation: 'set',    value: hints.secChUaArch },
                { header: 'sec-ch-ua-model',            operation: 'set',    value: hints.secChUaModel },
                { header: 'sec-ch-ua-platform-version', operation: 'set',    value: hints.secChUaPlatformVersion },
                { header: 'sec-ch-ua-full-version-list','operation': 'set',  value: hints.secChUaFullVersionList }
            );
        } else {
            ['sec-ch-ua','sec-ch-ua-platform','sec-ch-ua-mobile','sec-ch-ua-full-version',
             'sec-ch-ua-arch','sec-ch-ua-model','sec-ch-ua-platform-version','sec-ch-ua-full-version-list']
            .forEach(h => requestHeaders.push({ header: h, operation: 'remove' }));
        }

        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: ruleIds,
            addRules: [{
                id: 1,
                priority: 1,
                action: { type: 'modifyHeaders', requestHeaders },
                condition: {
                    resourceTypes: [
                        'main_frame','sub_frame','stylesheet','script','image',
                        'font','object','xmlhttprequest','ping','csp_report',
                        'media','websocket','webtransport','webbundle','other'
                    ]
                }
            }]
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('[UA Switcher] Ошибка:', chrome.runtime.lastError);
            } else {
                console.log('[UA Switcher] Глобальное правило обновлено');
            }
        });
    });
}

function resetUserAgent() {
    chrome.declarativeNetRequest.getDynamicRules(rules => {
        const ruleIds = rules.map(r => r.id);
        if (ruleIds.length > 0) {
            chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
        }
    });
}

function generateClientHints(ua) {
    const isFirefox = /Firefox\//.test(ua) && !/Seamonkey/.test(ua);
    const isSafariOnly = /Safari\//.test(ua) && !/Chrome\//.test(ua);
    const isGooglebot = /Googlebot/.test(ua);

    // Firefox и Safari don`t send Client Hints
    if (isFirefox || isSafariOnly) {
        return { sendClientHints: false };
    }

    // --- Default values (Chrome Windows) ---
    let major = '120';
    let fullVersion = '120.0.6099.199';
    let secChUaMobile = '?0';
    let secChUaPlatform = '"Windows"';
    let secChUaPlatformVersion = '"10.0.0"';
    let secChUaArch = '"x86"';
    let secChUaModel = '""';
    let brandName = 'Google Chrome';

    // --- Check version ---
    const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
    if (chromeMatch) {
        fullVersion = chromeMatch[1];
        major = chromeMatch[1].split('.')[0];
    }

    // --- Check browser ---
    if (/Edg\//.test(ua)) {
        brandName = 'Microsoft Edge';
        const edgeMatch = ua.match(/Edg\/([\d.]+)/);
        if (edgeMatch) major = edgeMatch[1].split('.')[0];
    } else if (/OPR\//.test(ua)) {
        brandName = 'Opera';
        const operaMatch = ua.match(/OPR\/([\d.]+)/);
        if (operaMatch) major = operaMatch[1].split('.')[0];
    }

    // --- Mobile ---
    const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
    secChUaMobile = isMobile ? '?1' : '?0';

    // --- Platform ---
    if (/iPhone|iPad/.test(ua)) {
        secChUaPlatform = '"iOS"';
        const v = ua.match(/CPU (?:iPhone )?OS ([\d_]+)/);
        secChUaPlatformVersion = v ? `"${v[1].replace(/_/g, '.')}"` : '"17.0.0"';
        secChUaArch = '"arm"';
        secChUaModel = /iPhone/.test(ua) ? '"iPhone"' : '"iPad"';
    } else if (/Android/.test(ua)) {
        secChUaPlatform = '"Android"';
        const v = ua.match(/Android ([\d.]+)/);
        secChUaPlatformVersion = v ? `"${v[1]}"` : '"13.0.0"';
        secChUaArch = '"arm"';
        const modelMatch = ua.match(/;\s*([^;)]+)\)\s*AppleWebKit/);
        secChUaModel = modelMatch ? `"${modelMatch[1].trim()}"` : '"SM-S918B"';
    } else if (/Windows NT/.test(ua)) {
        secChUaPlatform = '"Windows"';
        const v = ua.match(/Windows NT ([\d.]+)/);
        const ntMap = { '10.0': '"10.0.0"', '6.3': '"8.1.0"', '6.2': '"8.0.0"', '6.1': '"7.0.0"' };
        secChUaPlatformVersion = (v && ntMap[v[1]]) ? ntMap[v[1]] : '"10.0.0"';
        secChUaArch = '"x86"';
    } else if (/Macintosh|Mac OS X/.test(ua)) {
        secChUaPlatform = '"macOS"';
        const v = ua.match(/Mac OS X ([\d_.]+)/);
        secChUaPlatformVersion = v ? `"${v[1].replace(/_/g, '.')}"` : '"14.0.0"';
        secChUaArch = '"arm"';
    } else if (/CrOS/.test(ua)) {
        secChUaPlatform = '"Chrome OS"';
        secChUaPlatformVersion = '"14541.0.0"';
        secChUaArch = '"x86"';
    } else if (/Linux/.test(ua)) {
        secChUaPlatform = '"Linux"';
        secChUaPlatformVersion = '"5.15.0"';
        secChUaArch = '"x86"';
    }

    if (isGooglebot) {
        return {
            sendClientHints: true,
            secChUa: '"Googlebot";v="2.1"',
            secChUaPlatform: '""',
            secChUaMobile: '?0',
            secChUaFullVersion: '"2.1"',
            secChUaFullVersionList: '"Googlebot";v="2.1"',
            secChUaArch: '""',
            secChUaModel: '""',
            secChUaPlatformVersion: '""'
        };
    }

    // sec-ch-ua
    const chromiumMajor = chromeMatch ? chromeMatch[1].split('.')[0] : major;
    const secChUa = `"Not:A-Brand";v="99", "Chromium";v="${chromiumMajor}", "${brandName}";v="${major}"`;

    // full-version-list
    const secChUaFullVersionList = `"Not:A-Brand";v="99.0.0.0", "Chromium";v="${fullVersion}", "${brandName}";v="${fullVersion}"`;

    return {
        sendClientHints: true,
        secChUa,
        secChUaPlatform,
        secChUaMobile,
        secChUaFullVersion: `"${fullVersion}"`,
        secChUaFullVersionList,
        secChUaArch,
        secChUaModel,
        secChUaPlatformVersion
    };
}

const SITE_RULE_BASE_ID = 100;

function patternToUrlFilter(pattern) {
    const p = pattern.trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '');

    if (p.includes('*')) return p;

    if (!p.includes('/')) return '||' + p;

    return p;
}

function buildHeadersForUA(ua) {
    const hints = generateClientHints(ua);
    const headers = [{ header: 'user-agent', operation: 'set', value: ua }];
    if (hints.sendClientHints) {
        headers.push(
            { header: 'sec-ch-ua',                   operation: 'set', value: hints.secChUa },
            { header: 'sec-ch-ua-platform',          operation: 'set', value: hints.secChUaPlatform },
            { header: 'sec-ch-ua-mobile',            operation: 'set', value: hints.secChUaMobile },
            { header: 'sec-ch-ua-full-version',      operation: 'set', value: hints.secChUaFullVersion },
            { header: 'sec-ch-ua-full-version-list', operation: 'set', value: hints.secChUaFullVersionList },
            { header: 'sec-ch-ua-arch',              operation: 'set', value: hints.secChUaArch },
            { header: 'sec-ch-ua-model',             operation: 'set', value: hints.secChUaModel },
            { header: 'sec-ch-ua-platform-version',  operation: 'set', value: hints.secChUaPlatformVersion }
        );
    } else {
        ['sec-ch-ua','sec-ch-ua-platform','sec-ch-ua-mobile','sec-ch-ua-full-version',
         'sec-ch-ua-arch','sec-ch-ua-model','sec-ch-ua-platform-version','sec-ch-ua-full-version-list']
        .forEach(h => headers.push({ header: h, operation: 'remove' }));
    }
    return headers;
}

const RESOURCE_TYPES = [
    'main_frame','sub_frame','stylesheet','script','image',
    'font','object','xmlhttprequest','ping','media','other'
];

function applySiteRules(rules) {
    chrome.declarativeNetRequest.getDynamicRules(existing => {
        const siteRuleIds = existing.map(r => r.id).filter(id => id >= SITE_RULE_BASE_ID);
        const enabledRules = (rules || []).filter(r => r.enabled);

        const newRules = enabledRules.map((rule, i) => ({
            id: SITE_RULE_BASE_ID + i,
            priority: 2,
            action: {
                type: 'modifyHeaders',
                requestHeaders: buildHeadersForUA(rule.ua)
            },
            condition: {
                urlFilter: patternToUrlFilter(rule.pattern),
                resourceTypes: RESOURCE_TYPES
            }
        }));

        chrome.declarativeNetRequest.updateDynamicRules(
            { removeRuleIds: siteRuleIds, addRules: newRules },
            () => {
                if (chrome.runtime.lastError) {
                    console.error('[UA Switcher] Site rules error:', chrome.runtime.lastError.message);
                } else {
                    console.log('[UA Switcher] Site rules applied:', newRules.length,
                        newRules.map(r => r.condition.urlFilter));
                }
            }
        );
    });
}

// ─── PRIVACY: WEBRTC + TIMEZONE ──────────────────────────────────────────────

function applyPrivacySettings(settings) {
    if (chrome.privacy && chrome.privacy.network) {
        if (settings.webrtc) {
            chrome.privacy.network.webRTCIPHandlingPolicy.set({
                value: 'disable_non_proxied_udp'
            });
        } else {
            chrome.privacy.network.webRTCIPHandlingPolicy.set({
                value: 'default'
            });
        }
    }

    if (chrome.storage.session) {
        chrome.storage.session.set({ privacySettings: settings });
    }
}

async function fetchTimezoneByIP() {
    try {
        const resp = await fetch('http://ip-api.com/json/?fields=timezone', {
            signal: AbortSignal.timeout(3000)
        });
        const data = await resp.json();
        return data.timezone || null;
    } catch (e) {
        console.warn('[UA Switcher] Timezone fetch failed:', e.message);
        return null;
    }
}

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.sync.get('privacySettings', data => {
        if (data.privacySettings) applyPrivacySettings(data.privacySettings);
    });
});