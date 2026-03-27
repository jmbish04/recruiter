import { BaseAgent } from "./BaseAgent";
import { ResearchLogger } from "@research-logger";
import { getDb } from "@db";
import puppeteer from "@cloudflare/puppeteer";

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export class WebSearchAgent extends BaseAgent {
  private researchLogger?: ResearchLogger;
  private doState: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.doState = state;
  }

  async search(briefId: string, query: string): Promise<SearchResult[]> {
    const db = getDb(this.env.DB);
    this.researchLogger = new ResearchLogger(db, briefId, null, "WebSearchAgent", this.doState);
    
    await this.researchLogger.logToolInput("GoogleSearch", { query });

    let browser;
    try {
      // @ts-ignore - Browser extension types
      browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      
      await this.researchLogger?.logInfo("Puppeteer", "Navigating to Google...");
      
      // Perform search
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle0' });

      // Scrape results
      const results = await page.evaluate(() => {
        const items: SearchResult[] = [];
        const elements = document.querySelectorAll('.g');
        
        elements.forEach((el) => {
          const titleEl = el.querySelector('h3');
          const anchorEl = el.querySelector('a');
          const snippetEl = el.querySelector('.VwiC3b'); // This class changes often, falling back to general text might be safer
          
          if (titleEl && anchorEl) {
            items.push({
              title: titleEl.innerText,
              url: anchorEl.href,
              snippet: snippetEl ? (snippetEl as HTMLElement).innerText : ''
            });
          }
        });
        return items.slice(0, 10); // Limit to top 10
      });

      await this.researchLogger?.logToolOutput("GoogleSearch", { count: results.length, topResults: results.slice(0,3) });
      
      return results;

    } catch (error) {
      await this.researchLogger?.logError("GoogleSearch", error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
