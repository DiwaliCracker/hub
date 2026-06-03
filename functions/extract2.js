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

    // Proxy gateways used to bypass Hubcloud environment blocks
    const corsProxies = [
        'https://api.allorigins.win/raw?url=',
        'https://api.codetabs.com/v1/proxy?quest='
    ];

    // Speed-optimized proxy engine with a safety timeout failover
    async function proxyFetch(target) {
        for (let proxy of corsProxies) {
            const controller = new AbortController();
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

                return await res.text();
            } catch (e) {
                clearTimeout(timeoutId);
                // Failover seamlessly to next proxy if one hangs or errors
            }
        }
        throw new Error("All proxy network pathways are exhausted or timed out.");
    }

    try {
        // 1. Convert incoming mirror domain formats cleanly
        let cleanUrl = targetUrl;
        if (/^https:\/\/vifix\.site\/hubcloud\/([a-z0-9]+)$/i.test(targetUrl)) {
            cleanUrl = `https://hubcloud.one/drive/${targetUrl.split("/").pop()}`;
        }

        // 2. Extract layout content from the landing page
        const html1 = await proxyFetch(cleanUrl);

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

        // 4. Extract target data from the final token page
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
            // Explicitly ignore stylesheets or scripts that sneak into parsing loops
            if (href.endsWith('.css') || href.endsWith('.js')) continue;

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

        // FIX: Structural backup filter rewrite
        // Forces the match to begin with a legitimate anchor tag link (<a href=...)
        // Uses (?!<\/a>) to allow button icons (<i>) without escaping out into other elements on the page.
        if (!finalStreamUrl) {
            const structuralMatch = html2.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:(?!<\/a>)[\s\S])*?FSL Server/i);
            if (structuralMatch) finalStreamUrl = structuralMatch[1];
        }

        if (!finalStreamUrl) {
            throw new Error("Direct high-speed streaming link could not be isolated.");
        }

        // 6. Perform standard 302 stream redirection straight to video engine
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
