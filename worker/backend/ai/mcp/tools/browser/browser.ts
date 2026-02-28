import puppeteer from "@cloudflare/puppeteer";

export class BrowserTool {
    constructor(private env: Env) { }

    private async getBrowser() {
        if (!this.env.BROWSER) {
            throw new Error("BROWSER binding missing");
        }
        return await puppeteer.launch(this.env.BROWSER);
    }

    async scrape(url: string): Promise<string> {
        let browser;
        try {
            browser = await this.getBrowser();
            const page = await browser.newPage();

            // Set reasonable viewport
            await page.setViewport({ width: 1280, height: 800 });

            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

            // Extract text
            // @ts-ignore
            const text = await page.evaluate(() => document.body.innerText);
            return text;
        } catch (e) {
            console.error(`Browser Scrape Error (${url}):`, e);
            throw e;
        } finally {
            if (browser) await browser.close();
        }
    }

    async screenshot(url: string): Promise<string> {
        let browser;
        try {
            browser = await this.getBrowser();
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

            const imgBuffer = await page.screenshot({ encoding: 'base64' });
            return imgBuffer as string;
        } catch (e) {
            console.error(`Browser Screenshot Error (${url}):`, e);
            throw e;
        } finally {
            if (browser) await browser.close();
        }
    }

    async pdf(url: string): Promise<Uint8Array> {
        let browser;
        try {
            browser = await this.getBrowser();
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

            const pdfBuffer = await page.pdf({ format: 'A4' });
            return pdfBuffer;
        } catch (e) {
            console.error(`Browser PDF Error (${url}):`, e);
            throw e;
        } finally {
            if (browser) await browser.close();
        }
    }

    async checkHealth(): Promise<boolean> {
        try {
            const browser = await this.getBrowser();
            await browser.close();
            return true;
        } catch (e) {
            console.error("Browser Health Check Failed:", e);
            return false;
        }
    }
}
