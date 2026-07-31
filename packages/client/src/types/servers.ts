export type ServerAccountAttributes = {
  google: {
    enabled: boolean;
    clientId: string;
  };
  oidc?: {
    enabled: boolean;
    authorizeUrl?: string;
    buttonLabel?: string;
  };
};

export type ServerAttributes = {
  pathPrefix?: string | null;
  insecure?: boolean;
  account?: ServerAccountAttributes;
  sha?: string | null;
  push?: { enabled: boolean; publicKey?: string };
  apns?: { enabled: boolean; bundleId?: string };
};

export type ServerState = {
  isAvailable: boolean;
  lastCheckedAt: Date;
  lastCheckedSuccessfullyAt: Date | null;
  count: number;
};

export type Server = {
  domain: string;
  name: string;
  avatar: string;
  attributes: ServerAttributes;
  version: string;
  createdAt: Date;
  syncedAt: Date | null;
  state: ServerState | null;
  isOutdated: boolean;
  configUrl: string;
};
