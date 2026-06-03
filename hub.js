export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    // 1. Safety check for the parameter
    if (!targetUrl) {
      return new Response('Missing ?url= parameter', { status: 400 });
    }

    // Standard desktop browser profile
    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };

    try {
      // STEP 1: Fetch the initial HubCloud landing page
      const res1 = await fetch(targetUrl, { 
        method: 'GET',
        headers: baseHeaders 
      });
      
      if (!res1.ok) {
        throw new Error(`Step 1 (Hubcloud Landing) blocked: HTTP ${res1.status}`);
      }
      const html1 = await res1.text();

      // Extract the gamerxyt generator link using Regex
      const generatorRegex = /https:\/\/gamerxyt\.com\/hubcloud\.php\?[^"'\s]+/i;
      const match1 = html1.match(generatorRegex);

      if (!match1) {
        throw new Error('Failed to parse the generation token from page source.');
      }

      const generatorUrl = match1[0];

      // STEP 2: Fetch the generator page
      // CRITICAL: We must spoof the 'Referer' to make the server think we clicked the button on HubCloud
      const step2Headers = {
        ...baseHeaders,
        'Referer': targetUrl, 
        'Sec-Fetch-Site': 'cross-site'
      };

      const res2 = await fetch(generatorUrl, {
        method: 'GET',
        headers: step2Headers
      });

      if (!res2.ok) {
        throw new Error(`Step 2 (Link Generator) blocked: HTTP ${res2.status}`);
      }
      const html2 = await res2.text();

      // STEP 3: Find the FSL Server direct download link string
      const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let finalDownloadUrl = null;
      let match;

      while ((match = linkRegex.exec(html2)) !== null) {
        // match[1] = URL, match[2] = Anchor Text
        if (match[2].includes('FSL Server')) {
          finalDownloadUrl = match[1];
          break; 
        }
      }

      if (!finalDownloadUrl) {
        throw new Error('FSL Server download path could not be found in final HTML payload.');
      }

      // STEP 4: Issue a clean 302 Redirect 
      // This commands the browser search bar to instantly change to the final file location
      return Response.redirect(finalDownloadUrl, 302);

    } catch (error) {
      // Output detailed debugging info to the screen if an adjustment is needed
      return new Response(`Redirector Error: ${error.message}`, { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
};
