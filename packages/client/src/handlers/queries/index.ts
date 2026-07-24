import { QueryHandler } from '@colanode/client/lib/types';
import { QueryMap } from '@colanode/client/queries';
import { AppService } from '@colanode/client/services/app-service';

import { AccountListQueryHandler } from './accounts/accounts-list';
import { MetadataListQueryHandler } from './apps/metadata-list';
import { TabsListQueryHandler } from './apps/tabs-list';
import { AvatarGetQueryHandler } from './avatars/avatar-get';
import { DocumentGetQueryHandler } from './documents/document-get';
import { DocumentSnapshotGetQueryHandler } from './documents/document-snapshot-get';
import { DocumentSnapshotListQueryHandler } from './documents/document-snapshot-list';
import { DocumentStateGetQueryHandler } from './documents/document-state-get';
import { DocumentUpdatesListQueryHandler } from './documents/document-update-list';
import { EmojiCategoryListQueryHandler } from './emojis/emoji-category-list';
import { EmojiGetQueryHandler } from './emojis/emoji-get';
import { EmojiGetBySkinIdQueryHandler } from './emojis/emoji-get-by-skin-id';
import { EmojiListQueryHandler } from './emojis/emoji-list';
import { EmojiSearchQueryHandler } from './emojis/emoji-search';
import { EmojiSvgGetQueryHandler } from './emojis/emoji-svg-get';
import { DownloadListQueryHandler } from './files/download-list';
import { FileDownloadRequestGetQueryHandler } from './files/file-download-request-get';
import { LocalFileGetQueryHandler } from './files/local-file-get';
import { TempFileListQueryHandler } from './files/temp-file-list';
import { UploadListQueryHandler } from './files/upload-list';
import { IconCategoryListQueryHandler } from './icons/icon-category-list';
import { IconListQueryHandler } from './icons/icon-list';
import { IconSearchQueryHandler } from './icons/icon-search';
import { IconSvgGetQueryHandler } from './icons/icon-svg-get';
import { NodeInteractionGetQueryHandler } from './interactions/node-interaction-get';
import { RadarDataGetQueryHandler } from './interactions/radar-data-get';
import { NodeBacklinkListQueryHandler } from './nodes/node-backlink-list';
import { NodeListQueryHandler } from './nodes/node-list';
import { NodeMentionSearchQueryHandler } from './nodes/node-mention-search';
import { NodeReactionsListQueryHandler } from './nodes/node-reaction-list';
import { NodeSearchQueryHandler } from './nodes/node-search';
import { NodeTrashListQueryHandler } from './nodes/node-trash-list';
import { NotificationListQueryHandler } from './notifications/notification-list';
import { NotificationMuteGetQueryHandler } from './notifications/notification-mute-get';
import { NotificationUnreadCountQueryHandler } from './notifications/notification-unread-count';
import { PageTemplateListQueryHandler } from './pages/page-template-list';
import { PlaneIssueGetQueryHandler } from './plane/plane-issue-get';
import { PresenceListQueryHandler } from './presence/presence-list';
import { RecordFieldValueCountQueryHandler } from './records/record-field-value-count';
import { RecordSearchQueryHandler } from './records/record-search';
import { RecordTemplateListQueryHandler } from './records/record-template-list';
import { ServerListQueryHandler } from './servers/server-list';
import { UserListQueryHandler } from './users/user-list';
import { UserSearchQueryHandler } from './users/user-search';
import { WorkspaceListQueryHandler } from './workspaces/workspace-list';

export type QueryHandlerMap = {
  [K in keyof QueryMap]: QueryHandler<QueryMap[K]['input']>;
};

export const buildQueryHandlerMap = (app: AppService): QueryHandlerMap => {
  return {
    'metadata.list': new MetadataListQueryHandler(app),
    'avatar.get': new AvatarGetQueryHandler(app),
    'account.list': new AccountListQueryHandler(app),
    'node.interaction.get': new NodeInteractionGetQueryHandler(app),
    'node.reaction.list': new NodeReactionsListQueryHandler(app),
    'node.list': new NodeListQueryHandler(app),
    'node.search': new NodeSearchQueryHandler(app),
    'node.mention.search': new NodeMentionSearchQueryHandler(app),
    'node.backlink.list': new NodeBacklinkListQueryHandler(app),
    'node.trash.list': new NodeTrashListQueryHandler(app),
    'record.field.value.count': new RecordFieldValueCountQueryHandler(app),
    'user.search': new UserSearchQueryHandler(app),
    'workspace.list': new WorkspaceListQueryHandler(app),
    'user.list': new UserListQueryHandler(app),
    'emoji.list': new EmojiListQueryHandler(app),
    'emoji.get': new EmojiGetQueryHandler(app),
    'emoji.get.by.skin.id': new EmojiGetBySkinIdQueryHandler(app),
    'emoji.category.list': new EmojiCategoryListQueryHandler(app),
    'emoji.search': new EmojiSearchQueryHandler(app),
    'icon.list': new IconListQueryHandler(app),
    'icon.search': new IconSearchQueryHandler(app),
    'icon.category.list': new IconCategoryListQueryHandler(app),
    'radar.data.get': new RadarDataGetQueryHandler(app),
    'record.search': new RecordSearchQueryHandler(app),
    'local.file.get': new LocalFileGetQueryHandler(app),
    'file.download.request.get': new FileDownloadRequestGetQueryHandler(app),
    'document.get': new DocumentGetQueryHandler(app),
    'document.snapshot.get': new DocumentSnapshotGetQueryHandler(app),
    'document.snapshot.list': new DocumentSnapshotListQueryHandler(app),
    'document.state.get': new DocumentStateGetQueryHandler(app),
    'document.updates.list': new DocumentUpdatesListQueryHandler(app),
    'upload.list': new UploadListQueryHandler(app),
    'download.list': new DownloadListQueryHandler(app),
    'temp.file.list': new TempFileListQueryHandler(app),
    'icon.svg.get': new IconSvgGetQueryHandler(app),
    'emoji.svg.get': new EmojiSvgGetQueryHandler(app),
    'tabs.list': new TabsListQueryHandler(app),
    'server.list': new ServerListQueryHandler(app),
    'notification.list': new NotificationListQueryHandler(app),
    'notification-mute.get': new NotificationMuteGetQueryHandler(app),
    'notification.unread-count': new NotificationUnreadCountQueryHandler(app),
    'record.template.list': new RecordTemplateListQueryHandler(app),
    'page.template.list': new PageTemplateListQueryHandler(app),
    'plane.issue.get': new PlaneIssueGetQueryHandler(app),
    'presence.list': new PresenceListQueryHandler(app),
  };
};
