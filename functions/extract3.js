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

    // 1. Smart Fetch Engine: Tries reliable raw-text proxies first to avoid JSON crashes
    async function smartFetch(target) {
        const proxies = [
            'https://api.codetabs.com/v1/proxy?quest=', // Returns raw text (Primary)
            'https://thingproxy.freeboard.io/fetch/',   // Returns raw text (Backup 1)
            'https://api.allorigins.win/get?url='       // JSON wrapper (Backup 2)
        ];

        for (let proxy of proxies) {
            try {
                const proxyUrl = `${proxy}${encodeURIComponent(target)}`;
                const res = await fetch(proxyUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                const rawText = await res.text();

                // If the proxy returns a Cloudflare error (like 520), throw to trigger the next proxy
                if (rawText.includes("error code: 520") || !res.ok) {
                    throw new Error("Proxy connection dropped");
                }

                // If it's allorigins, safely parse the JSON. If it fails, it moves to the next proxy.
                if (proxy.includes('allorigins.win')) {
                    try {
                        const data = JSON.parse(rawText);
                        return data.contents;
                    } catch (e) {
                        throw new Error("Proxy returned invalid JSON");
                    }
                }

                // For codetabs and thingproxy, just return the raw HTML string
                return rawText;
            } catch (e) {
                // Silently catch and let the loop try the next proxy in the list
                continue; 
            }
        }
        throw new Error("All proxies are currently blocked or returning errors.");
    }

    try {
        // Step 1: Fetch primary layout safely
        const html1 = await smartFetch(targetUrl);

        // Step 2: Extract PHP generator link
        const phpMatch = html1.match(/id=["']download["'][^>]*href=["']([^"']+)["']/i) || 
                         html1.match(/href=["']([^"']+)["'][^>]*id=["']download["']/i);
        
        if (!phpMatch) throw new Error("Could not find the initial HubCloud download button.");
        
        let phpUrl = phpMatch[1];
        if (phpUrl.startsWith('/')) {
            phpUrl = new URL(targetUrl).origin + phpUrl;
        }

        // Step 3: Fetch generator page (The page with the 10Gbps button)
        const html2 = await smartFetch(phpUrl);

        // Step 4: Locate "Download [Server : 10Gbps]" link strictly
        const server10GbpsRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*Download\s*\[Server\s*:\s*10Gbps\]/i;
        const match = html2.match(server10GbpsRegex);
        
        if (!match) throw new Error("10Gbps Server button is missing from this page.");
        let streamUrl = match[1];

        // Step 5: Clean the link if it is wrapped in dl.php
        if (streamUrl.includes("dl.php")) {
            const parsedUrl = new URL(streamUrl, 'https://gamerxyt.com');
            const hiddenLink = parsedUrl.searchParams.get("link");
            if (hiddenLink) streamUrl = hiddenLink;
        }

        // Step 6: Instantly redirect the video player to the extracted stream
        return Response.redirect(streamUrl, 302);

    } catch (error) {
        return new Response(`Stream Error: ${error.message}`, {
            status: 500,
            headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
