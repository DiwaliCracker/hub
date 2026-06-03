export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response('Missing URL', { status: 400 });

    const FAST_PROXY = 'https://api.allorigins.win/get?url=';

    try {
        // 1. Fetch with error handling for proxy responses
        const res1 = await fetch(FAST_PROXY + encodeURIComponent(targetUrl));
        const contentType = res1.headers.get("content-type");
        
        let html1;
        if (contentType && contentType.includes("application/json")) {
            const data1 = await res1.json();
            html1 = data1.contents;
        } else {
            // If proxy returns HTML instead of JSON, read it directly
            html1 = await res1.text();
        }

        if (!html1 || html1.includes("<!DOCTYPE")) throw new Error("Proxy failed to fetch content.");

        // 2. Faster regex parsing
        const phpMatch = html1.match(/id=["']download["'][^>]*href=["']([^"']+)["']/i) || 
                         html1.match(/href=["']([^"']+)["'][^>]*id=["']download["']/i);
        
        if (!phpMatch) throw new Error("Download button not found.");
        
        let phpUrl = phpMatch[1];
        if (phpUrl.startsWith('/')) {
            const base = new URL(targetUrl);
            phpUrl = base.origin + phpUrl;
        }

        // 3. Fetch the second stage directly (Cloudflare backbone speed)
        const res2 = await fetch(phpUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html2 = await res2.text();

        // 4. Optimized search for the direct stream link
        const linkMatch = html2.match(/href=["'](https?:\/\/[^"'\s]+obsession\.buzz[^"'\s]+)["']/i) ||
                          html2.match(/href=["'](https?:\/\/[^"'\s]+r2\.dev[^"'\s]+)["']/i) ||
                          html2.match(/href=["'](https?:\/\/[^"'\s]+pixeldrain\.com\/api\/file\/[^"'\s]+)["']/i);

        if (!linkMatch) throw new Error("Stream link not isolated.");

        // 5. Final 302 Redirect
        return Response.redirect(linkMatch[1], 302);

    } catch (error) {
        return new Response(`Stream Error: ${error.message}`, { status: 500 });
    }
}
