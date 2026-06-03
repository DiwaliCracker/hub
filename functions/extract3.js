export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response('Missing URL', { status: 400 });

    // We use a helper to ensure we always get the raw HTML string
    async function getRawHtml(urlToFetch) {
        // Adding a User-Agent to the proxy request to prevent 403 blocks
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(urlToFetch)}`;
        const res = await fetch(proxyUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        const data = await res.json();
        return data.contents; // This is the raw HTML of the target page
    }

    try {
        // 1. Get primary page
        const html1 = await getRawHtml(targetUrl);

        // 2. Extract the hubcloud.php link
        const phpMatch = html1.match(/id=["']download["'][^>]*href=["']([^"']+)["']/i) || 
                         html1.match(/href=["']([^"']+)["'][^>]*id=["']download["']/i);
        if (!phpMatch) throw new Error("Could not find download button");
        
        let phpUrl = phpMatch[1].startsWith('/') ? new URL(targetUrl).origin + phpMatch[1] : phpMatch[1];

        // 3. Get the generator page
        const html2 = await getRawHtml(phpUrl);

        // 4. Extract the "Download [Server : 10Gbps]" link
        // We look for the anchor tag containing your specific text
        const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*Download\s*\[Server\s*:\s*10Gbps\]/i;
        const match = html2.match(regex);
        
        if (!match) throw new Error("10Gbps button not found in page");
        
        let finalLink = match[1];

        // 5. If it's a dl.php wrapper, strip the link parameter
        if (finalLink.includes("dl.php")) {
            const u = new URL(finalLink);
            finalLink = u.searchParams.get("link") || finalLink;
        }

        // 6. Return 302 Redirect
        return Response.redirect(finalLink, 302);

    } catch (error) {
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}
