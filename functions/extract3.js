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

    // Proxy gateways used to bypass environment blocks
    const corsProxies = [
        'https://api.allorigins.win/raw?url=',
        'https://api.codetabs.com/v1/proxy?quest='
    ];

    // Speed-optimized proxy engine with safety timeout
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
                // Failover seamlessly to next proxy
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

        // 2. Extract layout content from the primary landing page
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

        // 4. Fetch the final token page
        const html2 = await proxyFetch(hubcloudPhpUrl);

        // 5. Look explicitly for the "Server : 10Gbps" button link
        // This regex ensures it stops at the exact anchor tag matching your target
        const tenGbpsRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:(?!<\/a>)[\s\S])*?Server\s*:\s*10Gbps/i;
        const tenGbpsMatch = html2.match(tenGbpsRegex);

        if (!tenGbpsMatch) {
            throw new Error("The 'Server : 10Gbps' button could not be found on this page.");
        }

        const gatewayUrl = tenGbpsMatch[1]; // e.g., https://gpdl.hubcloud.cx/?id=...

        // 6. Fetch the 10Gbps gateway page to grab the underlying Google user content link
        const html3 = await proxyFetch(gatewayUrl);

        let finalStreamUrl = null;

        // This powerful regex hunts down the video-downloads.googleusercontent.com link 
        // whether it's floating freely in the HTML, embedded in a meta-refresh, 
        // or attached as a parameter to the gamerxyt.com URL.
        const googleRegex = /(https:\/\/video-downloads\.googleusercontent\.com\/[^"'\s<>]+)/i;
        const googleMatch = html3.match(googleRegex);

        if (googleMatch) {
            finalStreamUrl = googleMatch[1];
        } 
        
        // Failsafe: Just in case the gateway URL instantly gave us the gamerxyt link without loading a page
        if (!finalStreamUrl && gatewayUrl.includes("gamerxyt.com/dl.php?link=")) {
            const extractedLink = gatewayUrl.split("link=")[1];
            if (extractedLink.includes("video-downloads")) {
                finalStreamUrl = decodeURIComponent(extractedLink);
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
