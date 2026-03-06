(function spoofEarly() {
    const storage = chrome.storage.session || chrome.storage.sync;

    storage.get(['spoofedUA', 'privacySettings'], data => {
        const ua       = data.spoofedUA       || null;
        const privacy  = data.privacySettings || {};

        if (ua)                    injectUASpoof(ua);
        if (privacy.fingerprint)   injectFingerprintSpoof(privacy);
        if (privacy.canvas)        injectCanvasSpoof();
        if (privacy.webgl)         injectWebGLSpoof();
        if (privacy.timezone)      injectTimezoneSpoof(privacy.timezoneId || null);
    });

    // ─── UA SPOOF ──────────────────────────────────────────────────────────────
    function parseUA(ua) {
        const r = {
            isMobile: false, platform: 'Windows', platformVersion: '10.0.0',
            arch: 'x86', bitness: '64', model: '', fullVersion: '120.0.6099.199',
            majorVersion: '120', brands: [], isFirefox: false, isSafari: false, isChrome: false
        };
        const isFirefox   = /Firefox\/[\d.]+/.test(ua) && !/Seamonkey/.test(ua);
        const isSafariOnly= /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua);
        const isChrome    = /Chrome\/([\d.]+)/.test(ua);
        r.isFirefox = isFirefox; r.isSafari = isSafariOnly; r.isChrome = isChrome;
        r.isMobile = /Mobile|Android|iPhone|iPad/.test(ua);

        if      (/iPhone/.test(ua))           { r.platform='iOS';      r.model='iPhone'; r.arch='arm'; const v=ua.match(/CPU iPhone OS ([\d_]+)/); r.platformVersion=v?v[1].replace(/_/g,'.'):'17.0.0'; }
        else if (/iPad/.test(ua))             { r.platform='iOS';      r.model='iPad';   r.arch='arm'; const v=ua.match(/CPU OS ([\d_]+)/);        r.platformVersion=v?v[1].replace(/_/g,'.'):'17.0.0'; }
        else if (/Android/.test(ua))          { r.platform='Android';  r.arch='arm';     const v=ua.match(/Android ([\d.]+)/); r.platformVersion=v?v[1]+'.0':'13.0.0'; const m=ua.match(/;\s*([^;)]+)\)\s*AppleWebKit/); if(m) r.model=m[1].trim(); }
        else if (/Windows NT/.test(ua))       { r.platform='Windows';  r.arch='x86';     const v=ua.match(/Windows NT ([\d.]+)/); if(v){const map={'10.0':'10.0.0','6.3':'8.1.0','6.2':'8.0.0','6.1':'7.0.0'}; r.platformVersion=map[v[1]]||'10.0.0';} }
        else if (/Macintosh|Mac OS X/.test(ua)){ r.platform='macOS';   r.arch='arm';     const v=ua.match(/Mac OS X ([\d_.]+)/); r.platformVersion=v?v[1].replace(/_/g,'.'):'14.0.0'; }
        else if (/Linux/.test(ua))            { r.platform='Linux';    r.arch='x86';     r.platformVersion='5.15.0'; }
        else if (/CrOS/.test(ua))             { r.platform='Chrome OS';r.arch='x86';     r.platformVersion='14541.0.0'; }

        if (isChrome) {
            const v = ua.match(/Chrome\/([\d.]+)/);
            if (v) { r.fullVersion=v[1]; r.majorVersion=v[1].split('.')[0]; }
            r.brands = [{brand:'Not:A-Brand',version:'99'},{brand:'Chromium',version:r.majorVersion},{brand:'Google Chrome',version:r.majorVersion}];
        } else if (/Edg\//.test(ua)) {
            const ev=ua.match(/Chrome\/([\d.]+)/); const ev2=ua.match(/Edg\/([\d.]+)/);
            if(ev){r.fullVersion=ev[1]; r.majorVersion=ev[1].split('.')[0];}
            r.brands=[{brand:'Not:A-Brand',version:'99'},{brand:'Chromium',version:r.majorVersion},{brand:'Microsoft Edge',version:ev2?ev2[1].split('.')[0]:r.majorVersion}];
        } else if (/OPR\//.test(ua)) {
            const ov=ua.match(/OPR\/([\d.]+)/); const cv=ua.match(/Chrome\/([\d.]+)/);
            if(cv){r.fullVersion=cv[1]; r.majorVersion=cv[1].split('.')[0];}
            r.brands=[{brand:'Not:A-Brand',version:'99'},{brand:'Chromium',version:r.majorVersion},{brand:'Opera',version:ov?ov[1].split('.')[0]:'105'}];
        } else if (/Googlebot/.test(ua)) {
            r.brands=[{brand:'Googlebot',version:'2.1'}]; r.platform=''; r.isMobile=false;
        }
        return r;
    }

    function injectUASpoof(ua) {
        const p = parseUA(ua);
        let code;

        if (p.isFirefox || p.isSafari) {
            code = `(function(){try{Object.defineProperty(navigator,'userAgentData',{value:undefined,writable:false,configurable:false,enumerable:false});}catch(e){}})();`;
        } else {
            if (!p.brands.length) return;
            const fullVersionList = p.brands.map(b => ({
                brand: b.brand,
                version: b.brand === 'Not:A-Brand' ? '99.0.0.0' : p.fullVersion
            }));
            code = `(function(){try{
                const _b=${JSON.stringify(p.brands)},_m=${p.isMobile},_pl=${JSON.stringify(p.platform)},
                      _pv=${JSON.stringify(p.platformVersion)},_ar=${JSON.stringify(p.arch)},
                      _bi=${JSON.stringify(p.bitness)},_mo=${JSON.stringify(p.model)},
                      _fv=${JSON.stringify(p.fullVersion)},_fl=${JSON.stringify(fullVersionList)};
                const d={brands:_b,mobile:_m,platform:_pl,
                    getHighEntropyValues:function(h){return Promise.resolve(h.reduce(function(a,k){
                        if(k==='platform')a.platform=_pl;
                        if(k==='platformVersion')a.platformVersion=_pv;
                        if(k==='architecture')a.architecture=_ar;
                        if(k==='bitness')a.bitness=_bi;
                        if(k==='model')a.model=_mo;
                        if(k==='uaFullVersion')a.uaFullVersion=_fv;
                        if(k==='fullVersionList')a.fullVersionList=_fl;
                        if(k==='wow64')a.wow64=false;
                        return a;
                    },{})};},
                    toJSON:function(){return{brands:_b,mobile:_m,platform:_pl};}};
                Object.freeze(d.brands);
                Object.defineProperty(Navigator.prototype,'userAgentData',{get:function(){return d;},configurable:false,enumerable:true});
            }catch(e){}})();`;
        }
        inject(code);
    }

    // ─── FINGERPRINT SPOOF ────────────────────────────────────────────────────
    function injectFingerprintSpoof(privacy) {
        const cores  = privacy.cores  || 4;
        const memory = privacy.memory || 8;
        const sw     = privacy.screenW || 1920;
        const sh     = privacy.screenH || 1080;

        const code = `(function(){
            try {
                // hardwareConcurrency
                Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
                    get: function(){ return ${cores}; }, configurable: false, enumerable: true
                });
                // deviceMemory
                Object.defineProperty(Navigator.prototype, 'deviceMemory', {
                    get: function(){ return ${memory}; }, configurable: false, enumerable: true
                });
                // screen dimensions
                ['width','availWidth'].forEach(function(k){
                    Object.defineProperty(Screen.prototype, k, { get: function(){ return ${sw}; }, configurable: false });
                });
                ['height','availHeight'].forEach(function(k){
                    Object.defineProperty(Screen.prototype, k, { get: function(){ return ${sh}; }, configurable: false });
                });
                Object.defineProperty(Screen.prototype, 'colorDepth',  { get: function(){ return 24; }, configurable: false });
                Object.defineProperty(Screen.prototype, 'pixelDepth',  { get: function(){ return 24; }, configurable: false });
                // outerWidth/Height
                Object.defineProperty(Window.prototype, 'outerWidth',  { get: function(){ return ${sw}; }, configurable: false });
                Object.defineProperty(Window.prototype, 'outerHeight', { get: function(){ return ${sh}; }, configurable: false });
            } catch(e) {}
        })();`;
        inject(code);
    }

    // ─── CANVAS SPOOF ─────────────────────────────────────────────────────────
    function injectCanvasSpoof() {
        const code = `(function(){
            try {
                const _seed = Math.floor(Math.random() * 0xFFFFFF);
                function _noise(x, y) {
                    const n = Math.sin(_seed + x * 127.1 + y * 311.7) * 43758.5453;
                    return (n - Math.floor(n)) < 0.5 ? 1 : 0;
                }

                const _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
                HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
                    const ctx = this.getContext('2d');
                    if (ctx) {
                        try {
                            const d = ctx.getImageData(0, 0, this.width, this.height);
                            const px = (_seed % Math.max(1, this.width)) * 4;
                            d.data[px] = (d.data[px] + 1) % 256;
                            ctx.putImageData(d, 0, 0);
                        } catch(e) {}
                    }
                    return _origToDataURL.call(this, type, quality);
                };

                const _origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
                CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
                    const d = _origGetImageData.call(this, sx, sy, sw, sh);
                    if (d.data.length > 4) {
                        d.data[0] = (d.data[0] + (_seed & 1)) % 256;
                    }
                    return d;
                };

                const _origToBlob = HTMLCanvasElement.prototype.toBlob;
                HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
                    const ctx = this.getContext('2d');
                    if (ctx) {
                        try {
                            const d = ctx.getImageData(0, 0, Math.max(1,this.width), Math.max(1,this.height));
                            d.data[0] = (d.data[0] + 1) % 256;
                            ctx.putImageData(d, 0, 0);
                        } catch(e) {}
                    }
                    return _origToBlob.call(this, cb, type, quality);
                };
            } catch(e) {}
        })();`;
        inject(code);
    }

    // ─── WEBGL SPOOF ──────────────────────────────────────────────────────────
    function injectWebGLSpoof() {
        const code = `(function(){
            try {
                function patchGetParameter(proto) {
                    const _orig = proto.getParameter;
                    proto.getParameter = function(param) {
                        // UNMASKED_VENDOR_EXT   = 37445
                        // UNMASKED_RENDERER_EXT = 37446
                        if (param === 37445) return 'Intel Inc.';
                        if (param === 37446) return 'Intel Iris OpenGL Engine';
                        return _orig.call(this, param);
                    };
                }
                patchGetParameter(WebGLRenderingContext.prototype);
                if (window.WebGL2RenderingContext) {
                    patchGetParameter(WebGL2RenderingContext.prototype);
                }

                function patchGetExtension(proto) {
                    const _origExt = proto.getExtension;
                    proto.getExtension = function(name) {
                        if (name === 'WEBGL_debug_renderer_info') {
                            return {
                                UNMASKED_VENDOR_WEBGL:   37445,
                                UNMASKED_RENDERER_WEBGL: 37446
                            };
                        }
                        return _origExt.call(this, name);
                    };
                }
                patchGetExtension(WebGLRenderingContext.prototype);
                if (window.WebGL2RenderingContext) {
                    patchGetExtension(WebGL2RenderingContext.prototype);
                }
            } catch(e) {}
        })();`;
        inject(code);
    }

    // ─── TIMEZONE SPOOF ───────────────────────────────────────────────────────
    function injectTimezoneSpoof(tzId) {
        if (!tzId) {
            chrome.runtime.sendMessage({ action: 'getTimezone' }, function(resp) {
                if (resp && resp.timezone) {
                    injectTimezoneSpoof(resp.timezone);
                }
            });
            return;
        }

        const code = `(function(){
            try {
                const _tz = ${JSON.stringify(tzId)};

                const _origDTF = Intl.DateTimeFormat;
                Intl.DateTimeFormat = function(locale, options) {
                    options = options || {};
                    if (!options.timeZone) options.timeZone = _tz;
                    return new _origDTF(locale, options);
                };
                Intl.DateTimeFormat.prototype = _origDTF.prototype;
                Object.defineProperty(Intl, 'DateTimeFormat', { value: Intl.DateTimeFormat, writable: true });

                // resolvedOptions
                const _origResolvedOptions = _origDTF.prototype.resolvedOptions;
                _origDTF.prototype.resolvedOptions = function() {
                    const r = _origResolvedOptions.call(this);
                    r.timeZone = _tz;
                    return r;
                };

            } catch(e) {}
        })();`;
        inject(code);
    }

    // ─── INJECT HELPER ────────────────────────────────────────────────────────
    function inject(code) {
        const s = document.createElement('script');
        s.textContent = code;
        (document.documentElement || document).prepend(s);
        s.remove();
    }

})();