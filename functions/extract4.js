export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response('Error: Missing url parameter', { 
            status: 400, headers: { 'Access-Control-Allow-Origin': '*' } 
        });
    }

    // A robust fetcher that tries direct connection first, then reliable proxies
    async function smartFetch(fetchUrl, customHeaders = {}) {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...customHeaders
        };

        const proxies = [
            '', // 1. Try Direct fetch first
            'https://corsproxy.io/?', // 2. High-speed raw text proxy
            'https://api.codetabs.com/v1/proxy?quest=' // 3. Backup raw text proxy
        ];

        for (let proxy of proxies) {
            try {
                const target = proxy === '' ? fetchUrl : `${proxy}${encodeURIComponent(fetchUrl)}`;
                const res = await fetch(target, { headers });
                
                if (res.ok) {
                    const text = await res.text();
                    // If it's not a Cloudflare blocking page, return the HTML
                    if (!text.includes('Just a moment...')) return text; 
                }
            } catch (e) {
                continue; // Move to the next proxy
            }
        }
        throw new Error("Network gateways blocked the request.");
    }

    try {
        // STEP 1: Process Target URL
        let cleanUrl = targetUrl;
        if (/^https:\/\/vifix\.site\/hubcloud\/([a-z0-9]+)$/i.test(targetUrl)) {
            cleanUrl = `https://hubcloud.one/drive/${targetUrl.split("/").pop()}`;
        }

        const html1 = await smartFetch(cleanUrl, { 'Referer': cleanUrl });

        // STEP 2: Apply REDIRECT_STRATEGIES from hubcloud.ts to find the Hop 2 link
        const redirectStrategies = [
            /var url\s*=\s*['"](.*?)['"]/,
            /window\.location(?:\.href)?\s*=\s*['"](.*?)['"]/,
            /location\.replace\(['"](.*?)['"]\)/,
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+;\s*url=(.*?)["']/i,
            /location\.href\s*=\s*['"](.*?)['"]/,
            /data-(?:url|href|link)\s*=\s*['"](.*?)['"]/
        ];

        let redirectUrl = null;
        for (const rx of redirectStrategies) {
            const match = html1.match(rx);
            if (match && match[1]) {
                redirectUrl = match[1];
                break;
            }
        }

        if (!redirectUrl) throw new Error("Hop 1 Redirect URL not found.");
        if (redirectUrl.startsWith('/')) {
            redirectUrl = new URL(cleanUrl).origin + redirectUrl;
        }

        // STEP 3: Extract Anti-Bot Cookie from hubcloud.ts
        const cookieMatch = html1.match(/stck\(\s*['"](\w+)['"]\s*,/);
        const cookieHeader = cookieMatch ? { 'Cookie': `${cookieMatch[1]}=s4t` } : {};

        // STEP 4: Fetch Download Page (Hop 2)
        const html2 = await smartFetch(redirectUrl, { 
            'Referer': cleanUrl, 
            ...cookieHeader 
        });

        // STEP 5: Locate the specific "10Gbps" server link
        const server10GbpsRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?10Gbps/i;
        const match10g = html2.match(server10GbpsRegex);
        
        if (!match10g) throw new Error("10Gbps Server button not found on page.");
        let streamLink = match10g[1];

        // STEP 6: Apply hubcdn extraction from hubcloudextractor.ts to get the Google URL
        const html3 = await smartFetch(streamLink, { 'Referer': redirectUrl });
        let finalStreamUrl = null;

        // Pattern 1: var reurl = "..."
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

        // Pattern 2: <a id="vd" href='URL'>
        if (!finalStreamUrl) {
            const vdMatch = html3.match(/<a\s+id=["']vd["']\s+href=["']([^"']+)["']/i);
            if (vdMatch) finalStreamUrl = vdMatch[1];
        }

        // Pattern 3: Fallback straight to googleusercontent regex
        if (!finalStreamUrl) {
            const gdriveMatch = html3.match(/(https?:\/\/[^\s"'<>]*googleusercontent\.com[^\s"'<>]*)/);
            if (gdriveMatch) finalStreamUrl = gdriveMatch[1];
        }

        // Pattern 4: dl.php fallback check
        if (finalStreamUrl && finalStreamUrl.includes("dl.php")) {
            const parsedDl = new URL(finalStreamUrl, 'https://gamerxyt.com');
            const hiddenLink = parsedDl.searchParams.get("link");
            if (hiddenLink) finalStreamUrl = hiddenLink;
        }

        if (!finalStreamUrl) throw new Error("Final Googleusercontent stream could not be extracted.");

        // STEP 7: Redirect player directly to the resolved stream
        return Response.redirect(finalStreamUrl, 302);

    } catch (error) {
        return new Response(`Stream Error: ${error.message}`, {
            status: 500,
            headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
