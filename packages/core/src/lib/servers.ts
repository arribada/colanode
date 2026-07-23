export const isColanodeDomain = (domain: string) => {
  return domain.endsWith('.colanode.com');
};

const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

export const normalizeServerUrl = (input: string): URL | null => {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const candidate = SCHEME_REGEX.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(candidate);
  } catch {
    return null;
  }
};

export const hasConfigPath = (url: URL): boolean => {
  return url.pathname.replace(/\/+$/, '').endsWith('/config');
};

export const appendConfigPath = (url: URL): URL => {
  const result = new URL(url.toString());
  result.pathname = `${result.pathname.replace(/\/+$/, '')}/config`;
  return result;
};
