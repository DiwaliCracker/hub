export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response('Missing URL', { status: 400 });

    const FAST_PROXY = 'https://api.allorigins.win/get?url=';

    try {
        // 1. Fetch the HubCloud page
        const res1 = await fetch(FAST_PROXY + encodeURIComponent(targetUrl));
        const data1 = await res1.json();
        const html1 = data1.contents;

        // 2. Find the hubcloud.php link
        const phpMatch = html1.match(/id=["']download["'][^>]*href=["']([^"']+)["']/i) || 
                         html1.match(/href=["']([^"']+)["'][^>]*id=["']download["']/i);
        
        if (!phpMatch) throw new Error("Could not find initial download button.");
        
        let phpUrl = phpMatch[1];
        if (phpUrl.startsWith('/')) {
            const base = new URL(targetUrl);
            phpUrl = base.origin + phpUrl;
        }

        // 3. Fetch the generator page
        const res2 = await fetch(phpUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html2 = await res2.text();

        // 4. Look specifically for the "10Gbps" server link
        // This regex looks for the specific hubcloud.cx domain pattern you provided
        const serverMatch = html2.match(/href=["'](https?:\/\/[\w\.-]+\.hubcloud\.cx\/\?id=[^"']+)["'][^>]*>.*?10Gbps.*?<\/a>/i);
        
        if (!serverMatch) throw new Error("10Gbps Server link not found.");

        const directLink = serverMatch[1];

        // 5. Follow the redirect to the final Googleusercontent link
        // We use 'manual' redirect mode to capture the final location header
        const res3 = await fetch(directLink, {
            redirect: 'manual',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        // 6. Final Extraction: 
        // If the server returns a 302/301, grab the 'location' header.
        // If it returns HTML (dl.php page), parse it for the direct download button.
        let finalStreamUrl = res3.headers.get('location');

        if (!finalStreamUrl) {
            const html3 = await res3.text();
            const dlMatch = html3.match(/href=["'](https:\/\/video-downloads\.googleusercontent\.com\/[^"']+)["']/i);
            if (dlMatch) {
                finalStreamUrl = dlMatch[1];
            } else {
                throw new Error("Could not extract final Googleusercontent stream.");
            }
        }

        // 7. Instant 302 Redirect to the video file
        return Response.redirect(finalStreamUrl, 302);

    } catch (error) {
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}
