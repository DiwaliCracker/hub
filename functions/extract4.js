export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response('Error: Missing url parameter', { 
            status: 400, headers: { 'Access-Control-Allow-Origin': '*' } 
        });
    }

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // NATIVE FETCHER: No CORS proxies. We use pure server-to-server fetches
    // with aggressive desktop browser spoofing to bypass the 403 blocks directly.
    async function nativeFetch(fetchUrl, referer, cookieString = null) {
        const headers = new Headers({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': referer,
            'Upgrade-Insecure-Requests': '1'
        });
        
        if (cookieString) {
            headers.set('Cookie', cookieString);
        }

        const res = await fetch(fetchUrl, { headers, redirect: 'follow' });
        if (!res.ok) throw new Error(`Host returned HTTP ${res.status}`);
        return await res.text();
    }

    try {
        let cleanUrl = targetUrl;
        if (/^https:\/\/vifix\.site\/hubcloud\/([a-z0-9]+)$/i.test(targetUrl)) {
            cleanUrl = `https://hubcloud.one/drive/${targetUrl.split("/").pop()}`;
        }

        // --- STEP 1: Fetch Hop 1 (Landing Page) ---
        let html1 = await nativeFetch(cleanUrl, cleanUrl);

        // --- STEP 2: Extract Redirect Strategy (from HubCloud.ts) ---
        const redirectStrategies = [
            /var url\s*=\s*['"](.*?)['"]/,
            /window\.location(?:\.href)?\s*=\s*['"](.*?)['"]/,
            /location\.replace\(['"](.*?)['"]\)/,
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+;\s*url=(.*?)["']/i,
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

        if (!redirectUrl) throw new Error("Could not find the Hop 1 redirect URL.");
        if (redirectUrl.startsWith('/')) {
            redirectUrl = new URL(cleanUrl).origin + redirectUrl;
        }

        // --- STEP 3: Anti-Bot Cookie Extraction (from HubCloud.ts) ---
        const cookieMatch = html1.match(/stck\(\s*['"](\w+)['"]\s*,/);
        const sessionCookie = cookieMatch ? `${cookieMatch[1]}=s4t` : null;

        // --- STEP 4: Fetch Hop 2 (Download Links Page) ---
        let html2 = await nativeFetch(redirectUrl, cleanUrl, sessionCookie);

        // --- STEP 5: 2.5s Retry Logic (from HubCloud.ts) ---
        // If the 10Gbps button or FSL button is missing, we hit the token expiration wall.
        if (!html2.includes('10Gbps') && !html2.includes('FSL')) {
            await delay(2500); // 2.5 second delay required by the host
            html2 = await nativeFetch(redirectUrl, cleanUrl, sessionCookie); // Refetch
        }

        // --- STEP 6: Target "10Gbps" Button ---
        const server10GbpsRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?10Gbps/i;
        const match10g = html2.match(server10GbpsRegex);
        
        if (!match10g) throw new Error("The 10Gbps Server link was not found on the final page.");
        let hubcdnLink = match10g[1];

        // --- STEP 7: Resolve the HubCDN / Google Link (from hubcloudextractor.ts) ---
        let html3 = await nativeFetch(hubcdnLink, redirectUrl);
        let finalStreamUrl = null;

        // Try extracting from reurl variable
        const reurlMatch = html3.match(/var\s+reurl\s*=\s*["']([^"']+)["']/);
        if (reurlMatch && reurlMatch[1]) {
            let reurl = reurlMatch[1];
            
            if (reurl.includes('/dl/?link=')) {
                // Parse standard link param
                finalStreamUrl = new URL(reurl, 'https://hubcdn.fans').searchParams.get('link');
            } else if (reurl.match(/[?&]r=([A-Za-z0-9+/=]+)/)) {
                // Decode Base64 mirror format
                try {
                    const decoded = atob(reurl.match(/[?&]r=([A-Za-z0-9+/=]+)/)[1]);
                    const linkMatch = decoded.match(/[?&]link=(.+)$/);
                    finalStreamUrl = linkMatch ? decodeURIComponent(linkMatch[1]) : decoded;
                } catch(e) {}
            } else {
                finalStreamUrl = reurl;
            }
        }

        // Try <a id="vd"> pattern
        if (!finalStreamUrl) {
            const vdMatch = html3.match(/<a\s+id=["']vd["']\s+href=["']([^"']+)["']/i);
            if (vdMatch) finalStreamUrl = vdMatch[1];
        }

        // Fallback: Direct Regex for googleusercontent
        if (!finalStreamUrl) {
            const gdriveMatch = html3.match(/(https?:\/\/[^\s"'<>]*googleusercontent\.com[^\s"'<>]*)/);
            if (gdriveMatch) finalStreamUrl = gdriveMatch[1];
        }

        // Final cleanup for dl.php
        if (finalStreamUrl && finalStreamUrl.includes("dl.php")) {
            const parsedDl = new URL(finalStreamUrl, 'https://gamerxyt.com');
            const hiddenLink = parsedDl.searchParams.get("link");
            if (hiddenLink) finalStreamUrl = hiddenLink;
        }

        if (!finalStreamUrl) throw new Error("Could not extract the final Google video URL.");

        // --- STEP 8: Redirect Player ---
        return Response.redirect(finalStreamUrl, 302);

    } catch (error) {
        return new Response(`Stream Error: ${error.message}`, {
            status: 500,
            headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
