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

    // Optimized proxy gateways. 
    // CHANGED: Switched allorigins to /raw so it returns pure text instantly without JSON overhead.
    const corsProxies = [
        'https://api.allorigins.win/raw?url=',
        'https://api.codetabs.com/v1/proxy?quest='
    ];

    // Speed-optimized proxy engine with an aggressive failover timeout
    async function proxyFetch(target) {
        for (let proxy of corsProxies) {
            const controller = new AbortController();
            // If a public proxy doesn't respond in 3.5 seconds, abort and skip to the next one
            const timeoutId = setTimeout(() => controller.abort(), 3500); 

            try {
                const proxyUrl = `${proxy}${encodeURIComponent(target)}`;
                const res = await fetch(proxyUrl, {
                    signal: controller.signal,
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
                    }
                });
                
                clearTimeout(timeoutId);

                if (!res.ok) continue;

                // Both endpoints now return raw HTML text directly, saving CPU cycles and network lag
                return await res.text();
            } catch (e) {
                clearTimeout(timeoutId);
                // Route failed or timed out; automatically jumps to the next proxy line item
            }
        }
        throw new Error("All proxy network pathways are exhausted or timed out.");
    }

    try {
        // 1. Process and convert incoming mirror URLs safely
        let cleanUrl = targetUrl;
        if (/^https:\/\/vifix\.site\/hubcloud\/([a-z0-9]+)$/i.test(targetUrl)) {
            cleanUrl = `https://hubcloud.one/drive/${targetUrl.split("/").pop()}`;
        }

        // 2. Fetch primary landing layout via the proxy engine
        const html1 = await proxyFetch(cleanUrl);

        // 3. Robust Regex pattern matching to extract the intermediate hubcloud.php link
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

        // 4. Fetch the token generation page content
        const html2 = await proxyFetch(hubcloudPhpUrl);

        // 5. Scan anchors using your explicit extraction filters
        const hrefPattern = /href=["']([^"']+)["']/gi;
        let finalStreamUrl = null;
        let currentMatch;
        const discoveredLinks = [];

        while ((currentMatch = hrefPattern.exec(html2)) !== null) {
            discoveredLinks.push(currentMatch[1]);
        }

        for (const href of discoveredLinks) {
            if (
                href.includes("r2.dev") || 
                href.includes("cloudflare") || 
                href.includes("pixeldrain") || 
                href.includes("workers.dev") || 
                href.includes("googleusercontent") ||
                href.includes("obsession.buzz") ||
                href.match(/\.(zip|rar|7z|mkv|mp4|avi|mov)$/i)
            ) {
                if (href.includes("pixeldrain.com/u/")) {
                    finalStreamUrl = "https://pixeldrain.com/api/file/" + href.split("/u/").pop();
                } else {
                    finalStreamUrl = href;
                }
                break;
            }
        }

        // Structural backup filter checking text matching rules
        if (!finalStreamUrl) {
            const structuralMatch = html2.match(/href=["']([^"']+)["'][^>]*>[\s\S]*?FSL Server/i);
            if (structuralMatch) finalStreamUrl = structuralMatch[1];
        }

        if (!finalStreamUrl) {
            throw new Error("Direct high-speed streaming link could not be isolated.");
        }

        // 6. Issue a solid HTTP 302 Redirect response straight to the video stream
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
