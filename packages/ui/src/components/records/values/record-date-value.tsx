import { DateFieldAttributes, StringFieldValue } from '@colanode/core';
import { DatePicker } from '@colanode/ui/components/ui/date-picker';
import { DateRangePicker } from '@colanode/ui/components/ui/date-range-picker';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useRecord } from '@colanode/ui/contexts/record';
import { useRecordField } from '@colanode/ui/hooks/use-record-field';

interface RecordDateValueProps {
  field: DateFieldAttributes;
  readOnly?: boolean;
}

const CELL_CLASS =
  'flex h-full w-full cursor-pointer flex-row items-center gap-1 border-none text-sm focus-visible:cursor-text p-0';

// When the field links a second date field as its range end, pick a start + due
// range in one calendar and write both fields; otherwise a single date.
export const RecordDateValue = ({ field, readOnly }: RecordDateValueProps) => {
  const database = useDatabase();
  const endField =
    field.endFieldId != null
      ? database.fields.find((f) => f.id === field.endFieldId)
      : undefined;

  if (endField && endField.type === 'date') {
    return (
      <RecordDateRangeValue
        field={field}
        endField={endField}
        readOnly={readOnly}
      />
    );
  }

  return <RecordDateSingleValue field={field} readOnly={readOnly} />;
};

const RecordDateSingleValue = ({ field, readOnly }: RecordDateValueProps) => {
  const record = useRecord();
  const { value, setValue, clearValue } = useRecordField<StringFieldValue>({
    field,
  });

  return (
    <div data-testid={`record-date-value-${field.id}`} className="h-full w-full">
      <DatePicker
        value={value ? new Date(value.value) : null}
        readonly={!record.canEdit || readOnly}
        onChange={(newValue) => {
          if (!record.canEdit || readOnly) return;
          if (newValue === null || newValue === undefined) {
            clearValue();
          } else {
            setValue({ type: 'string', value: newValue.toISOString() });
          }
        }}
        className={CELL_CLASS}
      />
    </div>
  );
};

const RecordDateRangeValue = ({
  field,
  endField,
  readOnly,
}: RecordDateValueProps & { endField: DateFieldAttributes }) => {
  const record = useRecord();
  const start = useRecordField<StringFieldValue>({ field });
  const end = useRecordField<StringFieldValue>({ field: endField });
  const editable = record.canEdit && !readOnly;

  return (
    <div data-testid={`record-date-value-${field.id}`} className="h-full w-full">
      <DateRangePicker
        start={start.value ? new Date(start.value.value) : null}
        end={end.value ? new Date(end.value.value) : null}
        readonly={!editable}
        onChange={(startDate, endDate) => {
          if (!editable) return;
          if (startDate === null) {
            start.clearValue();
          } else {
            start.setValue({ type: 'string', value: startDate.toISOString() });
          }
          if (endDate === null) {
            end.clearValue();
          } else {
            end.setValue({ type: 'string', value: endDate.toISOString() });
          }
        }}
        className={CELL_CLASS}
      />
    </div>
  );
};
