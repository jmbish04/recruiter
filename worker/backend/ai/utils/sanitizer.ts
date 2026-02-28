/**
 * @module Sanitize
 * @description Utility module for cleaning and formatting AI-generated text for safe frontend display.
 * * This module addresses two critical needs when displaying LLM output:
 * 1. **Safety:** It escapes raw HTML to prevent Cross-Site Scripting (XSS) attacks if the model generates malicious tags.
 * 2. **Formatting:** It converts standard Markdown syntax (bold, headers, code blocks) into semantic HTML tags, 
 * ensuring the text renders beautifully in the UI without requiring a heavy Markdown library.
 * * @exports sanitizeAndFormatResponse - Main function to clean and format text.
 * @exports cleanJsonOutput - Helper to strip code block wrappers from JSON strings.
 */

/**
 * Strips Markdown code block wrappers (e.g., ```json ... ```) from a string.
 * * AI models often wrap structured output (like JSON) in Markdown code blocks for readability.
 * This function removes those wrappers so the string can be parsed by `JSON.parse()`.
 * * @param text - The raw string input from the AI model.
 * @returns The cleaned string with code block markers removed.
 * * @example
 * input: "```json\n{\"key\": \"value\"}\n```"
 * output: "{\"key\": \"value\"}"
 */
export function cleanJsonOutput(output: any): string {
    if (output === null || output === undefined) {
        return "{}";
    }

    // If it's already an object (e.g., natively parsed by AI SDK), safely stringify it
    if (typeof output === 'object') {
        try {
            return JSON.stringify(output);
        } catch (e) {
            return "{}";
        }
    }

    // Ensure it's a string before calling string methods
    let text = String(output).trim();

    // Strip markdown code blocks if present
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    return text;
}

/**
 * Sanitizes and formats an AI model response for safe frontend display.
 * * This function performs a multi-stage transformation:
 * 1. **Cleanup:** Strips outer code block wrappers using `cleanJsonOutput`.
 * 2. **Sanitization:** Escapes reserved HTML characters (<, >, &, ", ') to prevent XSS injection.
 * 3. **Formatting:** Converts supported Markdown syntax into semantic HTML tags.
 * * **Supported Markdown Transformations:**
 * - Headers: `#` -> `<h1>`, `##` -> `<h2>`, `###` -> `<h3>`
 * - Bold: `**text**` -> `<strong>text</strong>`
 * - Italic: `*text*` -> `<em>text</em>`
 * - Strikethrough: `~~text~~` -> `<del>text</del>`
 * - Code Blocks: ```lang ... ``` -> `<pre><code class="language-lang">...</code></pre>`
 * - Inline Code: `text` -> `<code>text</code>`
 * - Links: `[Text](url)` -> `<a href="url" target="_blank" ...>Text</a>`
 * - Lists: `- Item` -> `<li>Item</li>`
 * - Newlines: `\n` -> `<br>` (Preserves line breaks)
 * * @param text - The raw text string from the AI model.
 * @returns A string containing safe, formatted HTML.
 */
export function sanitizeAndFormatResponse(text: string): string {
    if (!text) return "";

    // 1. Clean low hanging fruit (outer code blocks)
    let cleaned = cleanJsonOutput(text);

    // 2. Escape HTML characters to prevent XSS
    // This is CRITICAL: It ensures that if the AI outputs "<script>", 
    // it becomes "&lt;script&gt;" and renders as text, not executable code.
    cleaned = cleaned
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // 3. Convert Markdown to HTML

    // Headers (h1-h3)
    // Matches line start, hashes, space, content
    cleaned = cleaned.replace(/^### (.*$)/gm, "<h3>$1</h3>");
    cleaned = cleaned.replace(/^## (.*$)/gm, "<h2>$1</h2>");
    cleaned = cleaned.replace(/^# (.*$)/gm, "<h1>$1</h1>");

    // Bold: **text**
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Italic: *text*
    cleaned = cleaned.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Strikethrough: ~~text~~
    cleaned = cleaned.replace(/~~(.*?)~~/g, "<del>$1</del>");

    // Code Blocks: ```language\ncode```
    // Matches ```...``` across multiple lines. Captures language (group 1) and code (group 2).
    cleaned = cleaned.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });

    // Inline Code: `text`
    cleaned = cleaned.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Links: [Text](url)
    // Adds target="_blank" and rel="noopener noreferrer" for security and UX.
    cleaned = cleaned.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">$1</a>'
    );

    // Lists: - Item
    // Converts "- Item" to "<li>Item</li>". Note: Does not wrap in <ul>/ol tags.
    cleaned = cleaned.replace(/^\s*-\s+(.*$)/gm, "<li>$1</li>");

    // Newlines: Convert remaining newlines to <br> to preserve spacing
    cleaned = cleaned.replace(/\n/g, "<br>");

    // Cleanup: Remove <br> immediately following block closing tags to prevent double spacing
    cleaned = cleaned.replace(/(<\/h[1-6]>|<\/pre>|<\/li>)\s*<br>/g, "$1");

    return cleaned;
}