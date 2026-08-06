import { Migration } from 'kysely';

import { createAccountsTable } from './00001-create-accounts-table';
import { createDevicesTable } from './00002-create-devices-table';
import { createWorkspacesTable } from './00003-create-workspaces-table';
import { createUsersTable } from './00004-create-users-table';
import { createNodesTable } from './00005-create-nodes-table';
import { createNodeUpdatesTable } from './00006-create-node-updates-table';
import { createNodeReactionsTable } from './00007-create-node-reactions-table';
import { createNodeInteractionsTable } from './00008-create-node-interactions-table';
import { createNodeTombstonesTable } from './00009-create-node-tombstones-table';
import { createNodePathsTable } from './00010-create-node-paths-table';
import { createCollaborationsTable } from './00011-create-collaborations-table';
import { createDocumentsTable } from './00012-create-documents-table';
import { createDocumentUpdatesTable } from './00013-create-document-updates-table';
import { createUploadsTable } from './00014-create-uploads-table';
import { createNodePathsIndexes } from './00015-create-node-paths-indexes';
import { createUserAccountIdIndex } from './00016-create-user-account-id-index';
import { createVectorExtension } from './00017-create-vector-extension';
import { createNodeEmbeddingsTable } from './00018-create-node-embeddings-table';
import { createDocumentEmbeddingsTable } from './00019-create-document-embeddings-table';
import { alterDevicesPlatformColumn } from './00020-alter-devices-platform-column';
import { renameAccountAttributesColumn } from './00021-rename-account-attributes-column';
import { createCountersTable } from './00022-create-counters-table';
import { createWorkspaceUserCounterTriggers } from './00023-create-workspace-user-counter-triggers';
import { createWorkspaceNodeCounterTriggers } from './00024-create-workspace-node-counter-triggers';
import { createWorkspaceUploadCounterTriggers } from './00025-create-workspace-upload-counter-triggers';
import { createUserUploadCounterTriggers } from './00026-create-user-upload-counter-triggers';
import { removeNodeUpdateRevisionTrigger } from './00027-remove-node-update-revision-trigger';
import { removeDocumentUpdateRevisionTrigger } from './00028-remove-document-update-revision-trigger';
import { addWorkspaceStorageLimitColumns } from './00029-add-workspace-storage-limit-columns';
import { addWorkspaceIndexToUploads } from './00030-add-workspace-index-to-uploads';
import { addCreatedAtIndexToUploads } from './00031-add-created-at-index-to-uploads';
import { cleanupCounterTriggers } from './00032-cleanup-counter-triggers';
import { createNotificationsTable } from './00033-create-notifications-table';
import { createPushSubscriptionsTable } from './00034-create-push-subscriptions-table';
import { createNotificationMutesTable } from './00035-create-notification-mutes-table';
import { createApnsSubscriptionsTable } from './00036-create-apns-subscriptions-table';
import { createDocumentSnapshotsTable } from './00037-create-document-snapshots-table';
import { createUserAiSettingsTable } from './00038-create-user-ai-settings-table';
import { createWorkspaceAiSettingsTable } from './00039-create-workspace-ai-settings-table';
import { createMcpAccessTokensTable } from './00040-create-mcp-access-tokens-table';
import { addOauthColumnsToMcpAccessTokens } from './00041-add-oauth-columns-to-mcp-access-tokens';
import { createMcpOauthClientsTable } from './00042-create-mcp-oauth-clients-table';
import { createMcpOauthCodesTable } from './00043-create-mcp-oauth-codes-table';
import { fixNodePathUpdateTrigger } from './00044-fix-node-path-update-trigger';
import { createNodeSnapshotsTable } from './00045-create-node-snapshots-table';
import { createNodeSharesTable } from './00046-create-node-shares-table';
import { createShareSuggestionsTable } from './00047-create-share-suggestions-table';

export const databaseMigrations: Record<string, Migration> = {
  '00001_create_accounts_table': createAccountsTable,
  '00002_create_devices_table': createDevicesTable,
  '00003_create_workspaces_table': createWorkspacesTable,
  '00004_create_users_table': createUsersTable,
  '00005_create_nodes_table': createNodesTable,
  '00006_create_node_updates_table': createNodeUpdatesTable,
  '00007_create_node_reactions_table': createNodeReactionsTable,
  '00008_create_node_interactions_table': createNodeInteractionsTable,
  '00009_create_node_tombstones_table': createNodeTombstonesTable,
  '00010_create_node_paths_table': createNodePathsTable,
  '00011_create_collaborations_table': createCollaborationsTable,
  '00012_create_documents_table': createDocumentsTable,
  '00013_create_document_updates_table': createDocumentUpdatesTable,
  '00014_create_uploads_table': createUploadsTable,
  '00015_create_node_paths_indexes': createNodePathsIndexes,
  '00016_create_user_account_id_index': createUserAccountIdIndex,
  '00017_create_vector_extension': createVectorExtension,
  '00018_create_node_embeddings_table': createNodeEmbeddingsTable,
  '00019_create_document_embeddings_table': createDocumentEmbeddingsTable,
  '00020_alter_devices_platform_column': alterDevicesPlatformColumn,
  '00021_rename_account_attributes_column': renameAccountAttributesColumn,
  '00022_create_counters_table': createCountersTable,
  '00023_create_workspace_user_counter_triggers':
    createWorkspaceUserCounterTriggers,
  '00024_create_workspace_node_counter_triggers':
    createWorkspaceNodeCounterTriggers,
  '00025_create_workspace_upload_counter_triggers':
    createWorkspaceUploadCounterTriggers,
  '00026_create_user_upload_counter_triggers': createUserUploadCounterTriggers,
  '00027_remove_node_update_revision_trigger': removeNodeUpdateRevisionTrigger,
  '00028_remove_document_update_revision_trigger':
    removeDocumentUpdateRevisionTrigger,
  '00029_add_workspace_storage_limit_columns': addWorkspaceStorageLimitColumns,
  '00030_add_workspace_index_to_uploads': addWorkspaceIndexToUploads,
  '00031_add_created_at_index_to_uploads': addCreatedAtIndexToUploads,
  '00032_cleanup_counter_triggers': cleanupCounterTriggers,
  '00033_create_notifications_table': createNotificationsTable,
  '00034_create_push_subscriptions_table': createPushSubscriptionsTable,
  '00035_create_notification_mutes_table': createNotificationMutesTable,
  '00036_create_apns_subscriptions_table': createApnsSubscriptionsTable,
  '00037_create_document_snapshots_table': createDocumentSnapshotsTable,
  '00038_create_user_ai_settings_table': createUserAiSettingsTable,
  '00039_create_workspace_ai_settings_table': createWorkspaceAiSettingsTable,
  '00040_create_mcp_access_tokens_table': createMcpAccessTokensTable,
  '00041_add_oauth_columns_to_mcp_access_tokens': addOauthColumnsToMcpAccessTokens,
  '00042_create_mcp_oauth_clients_table': createMcpOauthClientsTable,
  '00043_create_mcp_oauth_codes_table': createMcpOauthCodesTable,
  '00044_fix_node_path_update_trigger': fixNodePathUpdateTrigger,
  '00045_create_node_snapshots_table': createNodeSnapshotsTable,
  '00046_create_node_shares_table': createNodeSharesTable,
  '00047_create_share_suggestions_table': createShareSuggestionsTable,
};
