// ABOUTME: The text of an inline record mention: "<project> · <key>" when the record
// ABOUTME: has them (full name in the tooltip), otherwise the record name as before.
import { LocalRecordNode } from '@colanode/client/types';
import { useRecordMentionContext } from '@colanode/ui/hooks/use-record-mention-context';
import {
  formatRecordMentionChip,
  formatRecordMentionLabel,
} from '@colanode/ui/lib/record-mention';

export const RecordMentionName = ({
  record,
  name,
}: {
  record: LocalRecordNode;
  name: string;
}) => {
  const ctx = useRecordMentionContext(record);
  const chip = formatRecordMentionChip(ctx);

  if (!chip) {
    return <span role="presentation">{name}</span>;
  }

  return (
    <span role="presentation" title={formatRecordMentionLabel(name, ctx)}>
      {chip}
    </span>
  );
};
