export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response('Missing URL', { status: 400 });

    // FAST-PATH: Use a single, high-speed proxy gateway only for the HubCloud step
    // This avoids the "cycle through 5 proxies" delay
    const FAST_PROXY = 'https://api.allorigins.win/get?url=';

    try {
        // 1. Fetch the HubCloud page using the single fast proxy
        const res1 = await fetch(FAST_PROXY + encodeURIComponent(targetUrl));
        const data1 = await res1.json();
        const html1 = data1.contents;

        // 2. Faster regex parsing to find the PHP link
        const phpMatch = html1.match(/id=["']download["'][^>]*href=["']([^"']+)["']/i) || 
                         html1.match(/href=["']([^"']+)["'][^>]*id=["']download["']/i);
        
        if (!phpMatch) throw new Error("No download link found.");
        
        let phpUrl = phpMatch[1];
        if (phpUrl.startsWith('/')) {
            const base = new URL(targetUrl);
            phpUrl = base.origin + phpUrl;
        }

        // 3. Fetch the PHP page directly - Cloudflare-to-Cloudflare is faster
        const res2 = await fetch(phpUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html2 = await res2.text();

        // 4. Optimized loop to find the best link immediately
        const linkMatch = html2.match(/href=["'](https?:\/\/[^"'\s]+obsession\.buzz[^"'\s]+)["']/i) ||
                          html2.match(/href=["'](https?:\/\/[^"'\s]+r2\.dev[^"'\s]+)["']/i);

        if (!linkMatch) throw new Error("Stream not isolated.");

        // 5. Instant 302 Redirect
        return Response.redirect(linkMatch[1], 302);

    } catch (error) {
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}
