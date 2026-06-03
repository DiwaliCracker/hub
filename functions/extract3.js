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

    const FAST_PROXY = 'https://api.allorigins.win/get?url=';

    async function proxyFetch(target) {
        const res = await fetch(FAST_PROXY + encodeURIComponent(target));
        const data = await res.json();
        return data.contents;
    }

    try {
        // 1. Fetch primary layout
        const html1 = await proxyFetch(targetUrl);

        // 2. Extract PHP generator link
        const phpMatch = html1.match(/id=["']download["'][^>]*href=["']([^"']+)["']/i) || 
                         html1.match(/href=["']([^"']+)["'][^>]*id=["']download["']/i);
        if (!phpMatch) throw new Error("Could not find initial download button.");
        
        let phpUrl = phpMatch[1].startsWith('/') ? new URL(targetUrl).origin + phpMatch[1] : phpMatch[1];

        // 3. Fetch generator page
        const html2 = await proxyFetch(phpUrl);

        // 4. Locate "Download [Server : 10Gbps]" link
        // This looks for the anchor text specifically and grabs its href
        const server10GbpsRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*Download\s*\[Server\s*:\s*10Gbps\]/i;
        const match = html2.match(server10GbpsRegex);
        
        if (!match) throw new Error("10Gbps Server button not found.");
        let targetLink = match[1];

        // 5. Follow the link to get the final direct stream
        // If it's the dl.php page, we extract the 'link' parameter from it
        const resFinal = await fetch(targetLink);
        const finalUrl = resFinal.url; // Capture the final redirect location

        // If the result is the dl.php page, parse the URL parameter directly
        let streamUrl = finalUrl;
        if (finalUrl.includes("dl.php?link=")) {
            const urlParams = new URL(finalUrl);
            streamUrl = urlParams.searchParams.get("link");
        }

        // 6. Return 302 Redirect to the Googleusercontent link
        return Response.redirect(streamUrl, 302);

    } catch (error) {
        return new Response(`Stream Error: ${error.message}`, {
            status: 500,
            headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
