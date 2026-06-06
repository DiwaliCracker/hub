export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response('Error: Missing url parameter', { 
            status: 400, headers: { 'Access-Control-Allow-Origin': '*' } 
        });
    }

    // Delay function taken directly from your uploaded hubcloud.ts logic
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Aggressive proxy fetcher using raw endpoints to avoid JSON crashes completely
    async function smartFetch(fetchUrl, customHeaders = {}) {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Upgrade-Insecure-Requests': '1',
            ...customHeaders
        };

        // Upgraded proxy list using /raw endpoints
        const proxies = [
            '', // 1. Direct fetch attempt
            'https://api.allorigins.win/raw?url=', // 2. Raw HTML return (No JSON)
            'https://corsproxy.io/?', // 3. Backup CORS bypass
            'https://api.codetabs.com/v1/proxy?quest=' // 4. Secondary backup
        ];

        let lastError = "";

        for (let proxy of proxies) {
            try {
                const target = proxy === '' ? fetchUrl : `${proxy}${encodeURIComponent(fetchUrl)}`;
                const res = await fetch(target, { headers });
                
                if (res.ok) {
                    const text = await res.text();
                    // Detect if Cloudflare intercepted the proxy request
                    if (!text.includes('Just a moment...') && !text.includes('Enable JavaScript and cookies')) {
                        return text; 
                    } else {
                        lastError = "Cloudflare CAPTCHA blocked the proxy.";
                    }
                } else {
                    lastError = `Proxy returned HTTP ${res.status}`;
                }
            } catch (e) {
                lastError = e.message;
                continue; // Move to the next proxy
            }
        }
        throw new Error(`Gateways blocked. Last reason: ${lastError}`);
    }

    try {
        // STEP 1: Process Target URL
        let cleanUrl = targetUrl;
        if (/^https:\/\/vifix\.site\/hubcloud\/([a-z0-9]+)$/i.test(targetUrl)) {
            cleanUrl = `https://hubcloud.one/drive/${targetUrl.split("/").pop()}`;
        }

        let html1 = await smartFetch(cleanUrl, { 'Referer': cleanUrl });

        // STEP 2: Extract Redirect URL (Hop 2)
        const redirectStrategies = [
            /var url\s*=\s*['"](.*?)['"]/,
            /window\.location(?:\.href)?\s*=\s*['"](.*?)['"]/,
            /location\.replace\(['"](.*?)['"]\)/
        ];

        let redirectUrl = null;
        for (const rx of redirectStrategies) {
            const match = html1.match(rx);
            if (match && match[1]) {
                redirectUrl = match[1];
                break;
            }
        }

        if (!redirectUrl) throw new Error("Hop 1 Redirect URL not found. Page might be dead.");
        if (redirectUrl.startsWith('/')) {
            redirectUrl = new URL(cleanUrl).origin + redirectUrl;
        }

        // STEP 3: Extract Anti-Bot Cookie
        const cookieMatch = html1.match(/stck\(\s*['"](\w+)['"]\s*,/);
        const cookieHeader = cookieMatch ? { 'Cookie': `${cookieMatch[1]}=s4t` } : {};

        // STEP 4: Fetch Download Page (Hop 2)
        let html2 = await smartFetch(redirectUrl, { 
            'Referer': cleanUrl, 
            ...cookieHeader 
        });

        // STEP 5: THE HUBCLOUD.TS RETRY LOGIC
        // If the page doesn't contain our file sizes or download buttons, it's the fake "expired" page
        if (!html2.includes('10Gbps') && !html2.includes('FSL')) {
            // Wait exactly 2.5 seconds as dictated by the original source code
            await delay(2500);
            
            // Re-fetch the generator link with the established cookie
            html2 = await smartFetch(redirectUrl, { 
                'Referer': cleanUrl, 
                ...cookieHeader 
            });
        }

        // STEP 6: Locate the specific "10Gbps" server link
        const server10GbpsRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?10Gbps/i;
        const match10g = html2.match(server10GbpsRegex);
        
        if (!match10g) throw new Error("10Gbps Server button not found on final page.");
        let streamLink = match10g[1];

        // STEP 7: Resolve the HubCDN / Google link
        let html3 = await smartFetch(streamLink, { 'Referer': redirectUrl });
        let finalStreamUrl = null;

        // Extract from var reurl = "..."
        const reurlMatch = html3.match(/var\s+reurl\s*=\s*["']([^"']+)["']/);
        if (reurlMatch && reurlMatch[1]) {
            let reurl = reurlMatch[1];
            if (reurl.includes('/dl/?link=')) {
                finalStreamUrl = new URL(reurl, 'https://hubcdn.fans').searchParams.get('link');
            } else if (reurl.match(/[?&]r=([A-Za-z0-9+/=]+)/)) {
                try {
                    const decoded = atob(reurl.match(/[?&]r=([A-Za-z0-9+/=]+)/)[1]);
                    const linkMatch = decoded.match(/[?&]link=(.+)$/);
                    finalStreamUrl = linkMatch ? decodeURIComponent(linkMatch[1]) : decoded;
                } catch(e) {}
            } else {
                finalStreamUrl = reurl;
            }
        }

        // Fallback to direct googleusercontent regex
        if (!finalStreamUrl) {
            const gdriveMatch = html3.match(/(https?:\/\/[^\s"'<>]*googleusercontent\.com[^\s"'<>]*)/);
            if (gdriveMatch) finalStreamUrl = gdriveMatch[1];
        }

        // Strip dl.php wrapper if it exists
        if (finalStreamUrl && finalStreamUrl.includes("dl.php")) {
            const parsedDl = new URL(finalStreamUrl, 'https://gamerxyt.com');
            const hiddenLink = parsedDl.searchParams.get("link");
            if (hiddenLink) finalStreamUrl = hiddenLink;
        }

        if (!finalStreamUrl) throw new Error("Googleusercontent stream could not be isolated.");

        // Redirect player
        return Response.redirect(finalStreamUrl, 302);

    } catch (error) {
        return new Response(`Stream Error: ${error.message}`, {
            status: 500,
            headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
