/**
 * Commits made from Vulgr can name Vulgr as co-author. The address is the
 * GitHub App's bot account (vulgrs[bot]), so GitHub shows Vulgr's avatar
 * next to the author.
 */
export const VULGR_CO_AUTHOR = 'Co-authored-by: Vulgr <338650678+vulgrs[bot]@users.noreply.github.com>';

/** The message with Vulgr's co-author trailer at the end, added once. */
export function withVulgrCoAuthor(message: string): string {
  const text = message.replace(/\s+$/, '');
  if (!text) return text;
  if (/^co-authored-by:\s*vulgr\b/im.test(text)) return text;
  const lines = text.split('\n');
  // Join an existing trailer block (Key: value lines at the end); otherwise start one after a blank line.
  const last = lines[lines.length - 1];
  const inTrailers = lines.length > 1 && /^[A-Za-z][\w-]*: .+/.test(last) && lines.slice(0, -1).some((l) => l.trim() === '');
  return `${text}${inTrailers ? '\n' : '\n\n'}${VULGR_CO_AUTHOR}`;
}
