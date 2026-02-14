export const formatDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export const toIsoDate = (value: string | null) => {
  if (!value) return null;
  return new Date(value).toISOString();
};
