export type Config = {
  serverUrl: string;
  email: string;
  password: string;
  dataDir: string;
  workspaceId?: string;
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
};

export const loadConfig = (): Config => ({
  serverUrl: required('COLANODE_SERVER_URL'),
  email: required('COLANODE_EMAIL'),
  password: required('COLANODE_PASSWORD'),
  dataDir: required('COLANODE_DATA_DIR'),
  workspaceId: process.env.COLANODE_WORKSPACE_ID,
});
