export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 64);

export const extractSnippet = (text: string, query: string) => {
  const lower = text.toLowerCase();
  const index = lower.indexOf(query.toLowerCase());
  if (index === -1) return text.substring(0, 50);
  const start = Math.max(0, index - 15);
  const end = Math.min(text.length, index + query.length + 15);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.substring(start, end)}${suffix}`;
};
