

/**
 * Safely extracts string content from a ChatCompletion message.
 * Handles string, null, undefined, and array (multimodal) content types.
 */
export function getMessageContent(content: string | null | undefined | Array<any>): string {
  if (!content) return "";
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if ('text' in part) return part.text;
        return '';
      })
      .join('');
  }
  return "";
}
