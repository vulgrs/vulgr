/**
 * A release's notes (Markdown, or the HTML GitHub renders from it) reduced to
 * a few short bullet lines for the update card.
 */
export function releaseHighlights(notes: unknown, max = 5): string[] {
  const text = Array.isArray(notes)
    ? notes.map((n) => (typeof n === 'string' ? n : n?.note ?? '')).join('\n')
    : typeof notes === 'string'
      ? notes
      : '';
  const plain = text
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|li|h\d|ul|ol)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const out: string[] = [];
  for (const raw of plain.split('\n')) {
    const m = raw.match(/^\s*[-*•]\s+(.+)$/);
    if (!m) continue;
    // Drop links, PR/author credits and Markdown emphasis.
    const line = m[1]
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+by @\S+.*$/i, '')
      .replace(/\s+in https?:\/\/\S+$/i, '')
      .replace(/[*_`]/g, '')
      .trim();
    if (!line || /^full changelog/i.test(line)) continue;
    out.push(line.length > 110 ? `${line.slice(0, 107).trimEnd()}…` : line);
    if (out.length >= max) break;
  }
  return out;
}
