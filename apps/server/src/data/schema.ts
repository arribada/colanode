import {
  ColumnType,
  Insertable,
  JSONColumnType,
  Selectable,
  Updateable,
} from 'kysely';

import {
  NodeAttributes,
  NodeRole,
  NodeType,
  WorkspaceRole,
  UserStatus,
  DocumentType,
  DocumentContent,
  UpdateMergeMetadata,
} from '@colanode/core';
import { AccountAttributes } from '@colanode/server/types/accounts';

interface AccountTable {
  id: ColumnType<string, string, never>;
  name: ColumnType<string, string, string>;
  email: ColumnType<string, string, never>;
  avatar: ColumnType<string | null, string | null, string | null>;
  password: ColumnType<string | null, string | null, string | null>;
  attributes: JSONColumnType<
    AccountAttributes | null,
    string | null,
    string | null
  >;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  status: ColumnType<number, number, number>;
}

export type SelectAccount = Selectable<AccountTable>;
export type CreateAccount = Insertable<AccountTable>;
export type UpdateAccount = Updateable<AccountTable>;

interface DeviceTable {
  id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  token_hash: ColumnType<string, string, string>;
  token_salt: ColumnType<string, string, string>;
  token_generated_at: ColumnType<Date, Date, Date>;
  previous_token_hash: ColumnType<string | null, string | null, string | null>;
  previous_token_salt: ColumnType<string | null, string | null, string | null>;
  type: ColumnType<number, number, number>;
  version: ColumnType<string, string, string>;
  platform: ColumnType<string | null, string | null, string | null>;
  ip: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
  synced_at: ColumnType<Date | null, Date | null, Date>;
}

export type SelectDevice = Selectable<DeviceTable>;
export type CreateDevice = Insertable<DeviceTable>;
export type UpdateDevice = Updateable<DeviceTable>;

interface WorkspaceTable {
  id: ColumnType<string, string, never>;
  name: ColumnType<string, string, string>;
  description: ColumnType<string | null, string | null, string | null>;
  avatar: ColumnType<string | null, string | null, string | null>;
  attrs: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  created_by: ColumnType<string, string, never>;
  updated_by: ColumnType<string | null, string | null, string>;
  status: ColumnType<number, number, number>;
  max_file_size: ColumnType<string | null, string | null, string | null>;
}

export type SelectWorkspace = Selectable<WorkspaceTable>;
export type CreateWorkspace = Insertable<WorkspaceTable>;
export type UpdateWorkspace = Updateable<WorkspaceTable>;

interface UserTable {
  id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  email: ColumnType<string, string, string>;
  role: ColumnType<WorkspaceRole, WorkspaceRole, WorkspaceRole>;
  name: ColumnType<string, string, string>;
  avatar: ColumnType<string | null, string | null, string | null>;
  custom_name: ColumnType<string | null, string | null, string | null>;
  custom_avatar: ColumnType<string | null, string | null, string | null>;
  storage_limit: ColumnType<string, string, string>;
  max_file_size: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  updated_by: ColumnType<string | null, string | null, string>;
  status: ColumnType<UserStatus, UserStatus, UserStatus>;
}

export type SelectUser = Selectable<UserTable>;
export type CreateUser = Insertable<UserTable>;
export type UpdateUser = Updateable<UserTable>;

interface NodeTable {
  id: ColumnType<string, string, never>;
  type: ColumnType<NodeType, never, never>;
  parent_id: ColumnType<string | null, never, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, string, string>;
  attributes: JSONColumnType<NodeAttributes, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  updated_by: ColumnType<string | null, string | null, string>;
}

export type SelectNode = Selectable<NodeTable>;
export type CreateNode = Insertable<NodeTable>;
export type UpdateNode = Updateable<NodeTable>;

interface NodeUpdateTable {
  id: ColumnType<string, string, never>;
  node_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  data: ColumnType<Uint8Array, Uint8Array, Uint8Array>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  merged_updates: ColumnType<
    UpdateMergeMetadata[] | null,
    string | null,
    string | null
  >;
}

export type SelectNodeUpdate = Selectable<NodeUpdateTable>;
export type CreateNodeUpdate = Insertable<NodeUpdateTable>;
export type UpdateNodeUpdate = Updateable<NodeUpdateTable>;

interface NodeInteractionTable {
  node_id: ColumnType<string, string, never>;
  collaborator_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  first_seen_at: ColumnType<Date | null, Date | null, Date | null>;
  last_seen_at: ColumnType<Date | null, Date | null, Date | null>;
  first_opened_at: ColumnType<Date | null, Date | null, Date | null>;
  last_opened_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectNodeInteraction = Selectable<NodeInteractionTable>;
export type CreateNodeInteraction = Insertable<NodeInteractionTable>;
export type UpdateNodeInteraction = Updateable<NodeInteractionTable>;

interface NodeReactionTable {
  node_id: ColumnType<string, string, never>;
  collaborator_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  reaction: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, Date>;
  deleted_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectNodeReaction = Selectable<NodeReactionTable>;
export type CreateNodeReaction = Insertable<NodeReactionTable>;
export type UpdateNodeReaction = Updateable<NodeReactionTable>;

interface NodeTombstoneTable {
  id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  deleted_at: ColumnType<Date, Date, Date>;
  deleted_by: ColumnType<string, string, never>;
}

export type SelectNodeTombstone = Selectable<NodeTombstoneTable>;
export type CreateNodeTombstone = Insertable<NodeTombstoneTable>;
export type UpdateNodeTombstone = Updateable<NodeTombstoneTable>;

interface NodePathTable {
  ancestor_id: ColumnType<string, string, never>;
  descendant_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  level: ColumnType<number, number, number>;
}

export type SelectNodePath = Selectable<NodePathTable>;
export type CreateNodePath = Insertable<NodePathTable>;
export type UpdateNodePath = Updateable<NodePathTable>;

interface CollaborationTable {
  node_id: ColumnType<string, string, never>;
  collaborator_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  role: ColumnType<NodeRole, NodeRole, NodeRole>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
  updated_by: ColumnType<string | null, string | null, string | null>;
  deleted_at: ColumnType<Date | null, Date | null, Date | null>;
  deleted_by: ColumnType<string | null, string | null, string | null>;
}

export type SelectCollaboration = Selectable<CollaborationTable>;
export type CreateCollaboration = Insertable<CollaborationTable>;
export type UpdateCollaboration = Updateable<CollaborationTable>;

interface DocumentTable {
  id: ColumnType<string, string, never>;
  type: ColumnType<DocumentType, never, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, string, string>;
  content: JSONColumnType<DocumentContent, string, string>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  updated_by: ColumnType<string | null, string | null, string>;
}

export type SelectDocument = Selectable<DocumentTable>;
export type CreateDocument = Insertable<DocumentTable>;
export type UpdateDocument = Updateable<DocumentTable>;

interface DocumentUpdateTable {
  id: ColumnType<string, string, never>;
  document_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  data: ColumnType<Uint8Array, Uint8Array, Uint8Array>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  merged_updates: ColumnType<
    UpdateMergeMetadata[] | null,
    string | null,
    string | null
  >;
}

export type SelectDocumentUpdate = Selectable<DocumentUpdateTable>;
export type CreateDocumentUpdate = Insertable<DocumentUpdateTable>;
export type UpdateDocumentUpdate = Updateable<DocumentUpdateTable>;

interface DocumentSnapshotTable {
  id: ColumnType<string, string, never>;
  document_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, string, never>;
  content: JSONColumnType<DocumentContent, string, never>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
}

export type SelectDocumentSnapshot = Selectable<DocumentSnapshotTable>;
export type CreateDocumentSnapshot = Insertable<DocumentSnapshotTable>;

interface UploadTable {
  file_id: ColumnType<string, string, never>;
  upload_id: ColumnType<string, string, string>;
  workspace_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  mime_type: ColumnType<string, string, string>;
  size: ColumnType<number, number, number>;
  path: ColumnType<string, string, string>;
  version_id: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, Date>;
  created_by: ColumnType<string, string, string>;
  uploaded_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectUpload = Selectable<UploadTable>;
export type CreateUpload = Insertable<UploadTable>;
export type UpdateUpload = Updateable<UploadTable>;

interface NodeEmbeddingTable {
  node_id: ColumnType<string, string, never>;
  chunk: ColumnType<number, number, number>;
  revision: ColumnType<string, string, string>;
  workspace_id: ColumnType<string, string, never>;
  text: ColumnType<string, string, string>;
  summary: ColumnType<string | null, string | null, string | null>;
  embedding_vector: ColumnType<number[], number[], number[]>;
  search_vector: ColumnType<never, never, never>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectNodeEmbedding = Selectable<NodeEmbeddingTable>;
export type CreateNodeEmbedding = Insertable<NodeEmbeddingTable>;
export type UpdateNodeEmbedding = Updateable<NodeEmbeddingTable>;

interface DocumentEmbeddingTable {
  document_id: ColumnType<string, string, never>;
  chunk: ColumnType<number, number, number>;
  revision: ColumnType<string, string, string>;
  workspace_id: ColumnType<string, string, never>;
  text: ColumnType<string, string, string>;
  summary: ColumnType<string | null, string | null, string | null>;
  embedding_vector: ColumnType<number[], number[], number[]>;
  search_vector: ColumnType<never, never, never>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectDocumentEmbedding = Selectable<DocumentEmbeddingTable>;
export type CreateDocumentEmbedding = Insertable<DocumentEmbeddingTable>;
export type UpdateDocumentEmbedding = Updateable<DocumentEmbeddingTable>;

// Per-user AI credentials: each workspace user may store their own provider,
// API key and model, used to construct the LLM for their own AI requests
// instead of (or when the server has none of) the server-global config.ai.
// NOTE: api_key is stored as-is (no encryption helper exists in this codebase
// yet). TODO: encrypt at rest once such a helper lands.
interface UserAiSettingTable {
  user_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  provider: ColumnType<string, string, string>;
  api_key: ColumnType<string, string, string>;
  model: ColumnType<string, string, string>;
  enabled: ColumnType<boolean, boolean, boolean>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectUserAiSetting = Selectable<UserAiSettingTable>;
export type CreateUserAiSetting = Insertable<UserAiSettingTable>;
export type UpdateUserAiSetting = Updateable<UserAiSettingTable>;

// Workspace-level shared AI credentials: one row per workspace, managed by
// admins, used as a fallback for members without their own user_ai_settings so
// the whole team can bill to a single key. NOTE: api_key is stored as-is (no
// encryption helper exists in this codebase yet). TODO: encrypt at rest.
interface WorkspaceAiSettingTable {
  workspace_id: ColumnType<string, string, never>;
  provider: ColumnType<string, string, string>;
  api_key: ColumnType<string, string, string>;
  model: ColumnType<string, string, string>;
  enabled: ColumnType<boolean, boolean, boolean>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectWorkspaceAiSetting = Selectable<WorkspaceAiSettingTable>;
export type CreateWorkspaceAiSetting = Insertable<WorkspaceAiSettingTable>;
export type UpdateWorkspaceAiSetting = Updateable<WorkspaceAiSettingTable>;

interface CounterTable {
  key: ColumnType<string, string, never>;
  value: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
}

interface NotificationTable {
  id: ColumnType<string, string, never>;
  user_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  type: ColumnType<string, string, never>;
  source_node_id: ColumnType<string, string, never>;
  actor_id: ColumnType<string | null, string | null, never>;
  preview: ColumnType<Record<string, unknown>, Record<string, unknown>, never>;
  created_at: ColumnType<Date, Date, never>;
  read_at: ColumnType<Date | null, Date | null, Date | null>;
  revision: ColumnType<string, never, never>;
}

export type SelectNotification = Selectable<NotificationTable>;
export type CreateNotification = Insertable<NotificationTable>;
export type UpdateNotification = Updateable<NotificationTable>;

interface PushSubscriptionTable {
  id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  device_id: ColumnType<string, string, never>;
  endpoint: ColumnType<string, string, string>;
  p256dh: ColumnType<string, string, string>;
  auth: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
  last_failure_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectPushSubscription = Selectable<PushSubscriptionTable>;
export type CreatePushSubscription = Insertable<PushSubscriptionTable>;
export type UpdatePushSubscription = Updateable<PushSubscriptionTable>;

interface ApnsSubscriptionTable {
  id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  device_id: ColumnType<string, string, never>;
  device_token: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
  last_failure_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectApnsSubscription = Selectable<ApnsSubscriptionTable>;
export type CreateApnsSubscription = Insertable<ApnsSubscriptionTable>;
export type UpdateApnsSubscription = Updateable<ApnsSubscriptionTable>;

interface NotificationMuteTable {
  id: ColumnType<string, string, never>;
  user_id: ColumnType<string, string, never>;
  node_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  muted: ColumnType<boolean, boolean, boolean>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
  revision: ColumnType<string, never, never>;
}

export type SelectNotificationMute = Selectable<NotificationMuteTable>;
export type CreateNotificationMute = Insertable<NotificationMuteTable>;
export type UpdateNotificationMute = Updateable<NotificationMuteTable>;

// Per-user MCP access tokens: opaque bearer tokens that let an external MCP
// client (e.g. Claude Desktop) act as the user inside a workspace via the
// remote MCP server. NOTE: token is stored as-is (no encryption helper exists
// in this codebase yet). TODO: encrypt at rest.
interface McpAccessTokenTable {
  id: ColumnType<string, string, never>;
  token: ColumnType<string, string, never>;
  user_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  name: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
  last_used_at: ColumnType<Date | null, Date | null, Date | null>;
  revoked_at: ColumnType<Date | null, Date | null, Date | null>;
  client_id: ColumnType<string | null, string | null, string | null>;
  expires_at: ColumnType<Date | null, Date | null, Date | null>;
  refresh_token: ColumnType<string | null, string | null, string | null>;
  refresh_token_expires_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectMcpAccessToken = Selectable<McpAccessTokenTable>;
export type CreateMcpAccessToken = Insertable<McpAccessTokenTable>;
export type UpdateMcpAccessToken = Updateable<McpAccessTokenTable>;

interface McpOauthClientTable {
  id: ColumnType<string, string, never>;
  secret: ColumnType<string | null, string | null, string | null>;
  name: ColumnType<string | null, string | null, string | null>;
  redirect_uris: JSONColumnType<string[], string, string>;
  grant_types: JSONColumnType<string[] | null, string | null, string | null>;
  response_types: JSONColumnType<string[] | null, string | null, string | null>;
  scope: ColumnType<string | null, string | null, string | null>;
  token_endpoint_auth_method: ColumnType<string | null, string | null, string | null>;
  metadata: JSONColumnType<
    Record<string, unknown> | null,
    string | null,
    string | null
  >;
  created_at: ColumnType<Date, Date, never>;
}

export type SelectMcpOauthClient = Selectable<McpOauthClientTable>;
export type CreateMcpOauthClient = Insertable<McpOauthClientTable>;
export type UpdateMcpOauthClient = Updateable<McpOauthClientTable>;

interface McpOauthCodeTable {
  code: ColumnType<string, string, never>;
  client_id: ColumnType<string, string, never>;
  user_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  redirect_uri: ColumnType<string, string, never>;
  code_challenge: ColumnType<string, string, never>;
  code_challenge_method: ColumnType<string, string, never>;
  scope: ColumnType<string | null, string | null, string | null>;
  resource: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
  expires_at: ColumnType<Date, Date, never>;
  consumed_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectMcpOauthCode = Selectable<McpOauthCodeTable>;
export type CreateMcpOauthCode = Insertable<McpOauthCodeTable>;
export type UpdateMcpOauthCode = Updateable<McpOauthCodeTable>;

export interface DatabaseSchema {
  accounts: AccountTable;
  devices: DeviceTable;
  workspaces: WorkspaceTable;
  users: UserTable;
  nodes: NodeTable;
  node_updates: NodeUpdateTable;
  node_interactions: NodeInteractionTable;
  node_reactions: NodeReactionTable;
  node_paths: NodePathTable;
  node_tombstones: NodeTombstoneTable;
  collaborations: CollaborationTable;
  documents: DocumentTable;
  document_updates: DocumentUpdateTable;
  document_snapshots: DocumentSnapshotTable;
  uploads: UploadTable;
  node_embeddings: NodeEmbeddingTable;
  document_embeddings: DocumentEmbeddingTable;
  counters: CounterTable;
  notifications: NotificationTable;
  push_subscriptions: PushSubscriptionTable;
  apns_subscriptions: ApnsSubscriptionTable;
  notification_mutes: NotificationMuteTable;
  user_ai_settings: UserAiSettingTable;
  workspace_ai_settings: WorkspaceAiSettingTable;
  mcp_access_tokens: McpAccessTokenTable;
  mcp_oauth_clients: McpOauthClientTable;
  mcp_oauth_codes: McpOauthCodeTable;
}
