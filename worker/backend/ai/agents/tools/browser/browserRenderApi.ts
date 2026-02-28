
import { Hono, Context } from 'hono';

// --- Type Definitions for Cloudflare Browser Rendering API ---
// These types define the expected request body structure for the Hono endpoints.

export type ContentRequest = {
    url?: string;
    html?: string;
    rejectResourceTypes?: string[];
    rejectRequestPattern?: string[];
    allowResourceTypes?: string[];
    allowRequestPattern?: string[];
    userAgent?: string;
    // Add other common parameters like authenticate, cookies, gotoOptions if needed
};

export type ScreenshotRequest = {
    url?: string;
    html?: string;
    screenshotOptions?: {
        fullPage?: boolean;
        omitBackground?: boolean;
        type?: 'jpeg' | 'png' | 'webp';
        quality?: number; // 0-100 for jpeg/webp
        clip?: { x: number; y: number; width: number; height: number };
        captureBeyondViewport?: boolean;
        selector?: string;
    };
    viewport?: {
        width: number;
        height: number;
        deviceScaleFactor?: number;
    };
    gotoOptions?: {
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
        timeout?: number;
    };
    userAgent?: string;
    // ... other advanced options
};

export type PDFRequest = {
    url?: string;
    html?: string;
    pdfOptions?: {
        format?: 'a0' | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'ledger' | 'legal' | 'letter' | 'tabloid';
        landscape?: boolean;
        printBackground?: boolean;
        headerTemplate?: string;
        footerTemplate?: string;
        displayHeaderFooter?: boolean;
        scale?: number;
        margin?: { top?: string; bottom?: string; left?: string; right?: string };
    };
    userAgent?: string;
    // ... other advanced options
};

export type SnapshotRequest = ContentRequest & ScreenshotRequest & {
    setJavaScriptEnabled?: boolean;
    // The request body combines Content and Screenshot options
};

export type ScrapeElement = {
    selector: string;
    // Add optional properties like attributes to scrape if needed
};

export type ScrapeRequest = {
    url?: string;
    elements: ScrapeElement[];
    userAgent?: string;
    // ... other advanced options
};

export type JsonRequest = {
    url?: string;
    html?: string;
    prompt?: string;
    response_format?: {
        type: 'json_schema';
        schema: Record<string, any>; // JSON Schema object
    };
    custom_ai?: {
        model: string;
        authorization: string;
    }[];
    userAgent?: string;
    // ... other advanced options
};

export type LinksRequest = {
    url?: string;
    html?: string;
    visibleLinksOnly?: boolean;
    excludeExternalLinks?: boolean;
    userAgent?: string;
    // ... other advanced options
};

export type MarkdownRequest = {
    url?: string;
    html?: string;
    rejectRequestPattern?: string[];
    userAgent?: string;
    // ... other advanced options
};

// --- Service Class for Internal Usage ---

export class BrowserService {
    private env: any;

    constructor(env: any) {
        this.env = env;
    }

    private async callCloudflare(endpoint: string, requestBody: object, expectsJson: boolean = true) {
        const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDBROWSER_API_BASE_URL } = this.env;

        if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN || !CLOUDBROWSER_API_BASE_URL) {
            throw new Error('Missing Cloudflare environment variables.');
        }

        const apiUrl = `${CLOUDBROWSER_API_BASE_URL}/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering${endpoint}`;

        const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        };

        const cfResponse = await fetch(apiUrl, fetchOptions);

        if (!cfResponse.ok) {
            const errorText = await cfResponse.text();
            throw new Error(`Cloudflare API Error for ${endpoint}: ${cfResponse.status} - ${errorText}`);
        }

        if (expectsJson) {
            return await cfResponse.json();
        } else {
            return cfResponse; // Return Response object for binary handling
        }
    }

    async getContent(body: ContentRequest) {
        return this.callCloudflare('/content', body);
    }

    async getScreenshot(body: ScreenshotRequest) {
        return this.callCloudflare('/screenshot', body, false);
    }

    async getPdf(body: PDFRequest) {
        return this.callCloudflare('/pdf', body, false);
    }

    async getSnapshot(body: SnapshotRequest) {
        return this.callCloudflare('/snapshot', body);
    }

    async scrape(body: ScrapeRequest) {
        return this.callCloudflare('/scrape', body);
    }

    async getJson(body: JsonRequest) {
        return this.callCloudflare('/json', body);
    }

    async getLinks(body: LinksRequest) {
        return this.callCloudflare('/links', body);
    }

    async getMarkdown(body: MarkdownRequest) {
        return this.callCloudflare('/markdown', body);
    }
}


// --- Hono App Setup ---
const browserRender = new Hono<{
    Bindings: {
        CLOUDFLARE_ACCOUNT_ID: string;
        CLOUDFLARE_API_TOKEN: string;
        CLOUDBROWSER_API_BASE_URL: string; // e.g., "https://api.cloudflare.com/client/v4/accounts"
    }
}>();

// --- Endpoints using the Service ---

browserRender.post('/content', async (c) => {
    const body: ContentRequest = await c.req.json();
    if (!body.url && !body.html) return c.json({ success: false, error: 'Missing required field: url or html' }, 400);
    try {
        const service = new BrowserService(c.env);
        const result = await service.getContent(body);
        return c.json(result);
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});

browserRender.post('/screenshot', async (c) => {
    const body: ScreenshotRequest = await c.req.json();
    if (!body.url && !body.html) return c.json({ success: false, error: 'Missing required field: url or html' }, 400);
    try {
        const service = new BrowserService(c.env);
        const response = await service.getScreenshot(body) as Response;
        const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
        return new Response(response.body, {
            status: response.status,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="screenshot.${contentType.split('/')[1]}"`,
            },
        });
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});

browserRender.post('/pdf', async (c) => {
    const body: PDFRequest = await c.req.json();
    if (!body.url && !body.html) return c.json({ success: false, error: 'Missing required field: url or html' }, 400);
    try {
        const service = new BrowserService(c.env);
        const response = await service.getPdf(body) as Response;
        return new Response(response.body, {
            status: response.status,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="document.pdf"`,
            },
        });
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});

browserRender.post('/snapshot', async (c) => {
    const body: SnapshotRequest = await c.req.json();
    if (!body.url && !body.html) return c.json({ success: false, error: 'Missing required field: url or html' }, 400);
    try {
        const service = new BrowserService(c.env);
        const result = await service.getSnapshot(body);
        return c.json(result);
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});

browserRender.post('/scrape', async (c) => {
    const body: ScrapeRequest = await c.req.json();
    if (!body.url && body.elements.length === 0) return c.json({ success: false, error: 'Missing required field: url or elements' }, 400);
    try {
        const service = new BrowserService(c.env);
        const result = await service.scrape(body);
        return c.json(result);
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});

browserRender.post('/json', async (c) => {
    const body: JsonRequest = await c.req.json();
    if (!body.url && !body.html) return c.json({ success: false, error: 'Missing required field: url or html' }, 400);
    if (!body.prompt && !body.response_format) return c.json({ success: false, error: 'Missing required field: prompt or response_format' }, 400);
    try {
        const service = new BrowserService(c.env);
        const result = await service.getJson(body);
        return c.json(result);
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});

browserRender.post('/links', async (c) => {
    const body: LinksRequest = await c.req.json();
    if (!body.url && !body.html) return c.json({ success: false, error: 'Missing required field: url or html' }, 400);
    try {
        const service = new BrowserService(c.env);
        const result = await service.getLinks(body);
        return c.json(result);
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});

browserRender.post('/markdown', async (c) => {
    const body: MarkdownRequest = await c.req.json();
    if (!body.url && !body.html) return c.json({ success: false, error: 'Missing required field: url or html' }, 400);
    try {
        const service = new BrowserService(c.env);
        const result = await service.getMarkdown(body);
        return c.json(result);
    } catch (e: any) {
        return c.json({ success: false, error: e.message }, 500);
    }
});

export default browserRender;

