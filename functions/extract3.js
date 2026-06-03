export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response('Error: Missing url parameter', { 
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }

    // Smart Proxy Arsenal: Starts with direct fetch, then cascades through proxies
    const proxyList = [
        '', // DIRECT FETCH: Try without a proxy first (fastest)
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://api.allorigins.win/raw?url='
    ];

    // Upgraded fetch engine with advanced error/captcha handling
    async function smartFetch(target) {
        for (let proxy of proxyList) {
            const controller = new AbortController();
            // Increased timeout to 6 seconds. Free proxies are heavily loaded and slow.
            const timeoutId = setTimeout(() => controller.abort(), 6000); 

            try {
                const fetchUrl = proxy === '' ? target : `${proxy}${encodeURIComponent(target)}`;
                
                const res = await fetch(fetchUrl, {
                    signal: controller.signal,
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5'
                    }
                });
                
                clearTimeout(timeoutId);
                
                // If it throws a 403/500 network error, skip to next proxy
                if (!res.ok) continue; 

                const text = await res.text();
                
                // Security verification: Skip this proxy if it hit a Cloudflare anti-bot page
                if (!text || text.includes('<title>Just a moment...</title>') || text.includes('cf-browser-verification')) {
                    continue;
                }

                return text;
            } catch (e) {
                clearTimeout(timeoutId);
                // Failover seamlessly to next route on timeout or network block
            }
        }
        throw new Error("Network block: Direct fetch failed and all proxy fallback pathways are exhausted.");
    }

    try {
        // 1. Convert incoming mirror domain formats cleanly
        let cleanUrl = targetUrl;
        if (/^https:\/\/vifix\.site\/hubcloud\/([a-z0-9]+)$/i.test(targetUrl)) {
            cleanUrl = `https://hubcloud.one/drive/${targetUrl.split("/").pop()}`;
        }

        // 2. Extract layout content from the primary landing page
        const html1 = await smartFetch(cleanUrl);

        // 3. Match the intermediate hubcloud.php redirection pathway
        const downloadRegex = /href=["']([^"']+)["'][^>]*id=["']download["']/i;
        const downloadRegexAlt = /id=["']download["'][^>]*href=["']([^"']+)["']/i;
        const fallbackPhpRegex = /https:\/\/[^"'\s]+\/hubcloud\.php\?[^"'\s]+/i;

        let hubcloudPhpUrl = null;
        let match1 = html1.match(downloadRegex) || html1.match(downloadRegexAlt);

        if (match1) {
            hubcloudPhpUrl = match1[1];
        } else {
            let matchFallback = html1.match(fallbackPhpRegex);
            if (matchFallback) hubcloudPhpUrl = matchFallback[0];
        }

        if (!hubcloudPhpUrl) {
            throw new Error("Failed to parse generation path token.");
        }

        if (hubcloudPhpUrl.startsWith('/')) {
            const baseUrl = new URL(cleanUrl);
            hubcloudPhpUrl = `${baseUrl.origin}${hubcloudPhpUrl}`;
        }

        // 4. Fetch the final token page
        const html2 = await smartFetch(hubcloudPhpUrl);

        // 5. Look explicitly for the "Server : 10Gbps" button link
        const tenGbpsRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:(?!<\/a>)[\s\S])*?Server\s*:\s*10Gbps/i;
        const tenGbpsMatch = html2.match(tenGbpsRegex);

        if (!tenGbpsMatch) {
            throw new Error("The 'Server : 10Gbps' button could not be found on this page.");
        }

        // Clean any HTML entities like &amp; out of the URL
        const gatewayUrl = tenGbpsMatch[1].replace(/&amp;/g, '&'); 

        // 6. Aggressive extraction of the Google stream URL
        let finalStreamUrl = null;
        
        // This regex matches the exact Google User Content domain and the token path
        const googleRegex = /(https:\/\/video-downloads\.googleusercontent\.com\/[a-zA-Z0-9_\-\.\~]+)/i;

        // Helper function to decode and rip the Google URL out of a gamerxyt wrapper string
        function ripGoogleLinkFromUrl(urlStr) {
            if (!urlStr) return null;
            if (urlStr.includes('link=')) {
                try {
                    const extracted = urlStr.split('link=')[1];
                    const decoded = decodeURIComponent(extracted);
                    const match = decoded.match(googleRegex);
                    if (match) return match[1];
                } catch (e) {
                    // Ignore decoding errors and fallback to null
                }
            }
            return null;
        }

        // Check 1: Is the gateway URL itself already the gamerxyt link?
        finalStreamUrl = ripGoogleLinkFromUrl(gatewayUrl);

        // Check 2: If not, fetch the gateway page and scan the HTML
        if (!finalStreamUrl) {
            const html3 = await smartFetch(gatewayUrl);

            // Strategy A: The raw video-downloads link is sitting somewhere on the page
            const rawMatch = html3.match(googleRegex);
            if (rawMatch) {
                finalStreamUrl = rawMatch[1];
            } 
            // Strategy B: The gamerxyt link is sitting somewhere on the page
            else {
                const gamerxytRegex = /(https:\/\/gamerxyt\.com\/dl\.php\?link=[^"'\s<>]+)/i;
                const gamerMatch = html3.match(gamerxytRegex);
                if (gamerMatch) {
                    finalStreamUrl = ripGoogleLinkFromUrl(gamerMatch[1]);
                }
            }
        }

        if (!finalStreamUrl) {
            throw new Error("Successfully hit the 10Gbps gateway, but could not extract the final Google stream URL.");
        }

        // 7. Perform standard 302 stream redirection straight to the high-speed Google server
        return Response.redirect(finalStreamUrl, 302);

    } catch (error) {
        return new Response(`Stream Error: ${error.message}`, {
            status: 500,
            headers: { 
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
