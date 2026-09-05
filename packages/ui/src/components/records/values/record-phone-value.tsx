import { PhoneFieldAttributes, StringFieldValue } from '@colanode/core';
import { Input } from '@colanode/ui/components/ui/input';
import { useRecord } from '@colanode/ui/contexts/record';
import { useRecordField } from '@colanode/ui/hooks/use-record-field';
import {
  PHONE_COUNTRIES,
  findCountryByDial,
  isValidPhone,
} from '@colanode/ui/lib/phone-countries';
import { cn } from '@colanode/ui/lib/utils';

interface RecordPhoneValueProps {
  field: PhoneFieldAttributes;
  readOnly?: boolean;
}

export const RecordPhoneValue = ({
  field,
  readOnly,
}: RecordPhoneValueProps) => {
  const record = useRecord();
  const { value, setValue, clearValue } = useRecordField<StringFieldValue>({
    field,
  });

  const raw = value?.value ?? '';
  const editable = record.canEdit && !readOnly;
  const country = findCountryByDial(raw);
  const invalid = !isValidPhone(raw);

  const commit = (next: string) => {
    if (!editable) {
      return;
    }
    const trimmed = next.trim();
    if (trimmed === (value?.value ?? '')) {
      return;
    }
    if (trimmed === '') {
      clearValue();
    } else {
      setValue({ type: 'string', value: trimmed });
    }
  };

  // Selecting a country rebuilds the value as "+<dial> <national digits>",
  // stripping whatever dial code was previously in front.
  const handleCountry = (dial: string) => {
    const allDigits = raw.replace(/\D/g, '');
    let national = allDigits;
    if (country && allDigits.startsWith(country.dial)) {
      national = allDigits.slice(country.dial.length);
    }
    commit(dial ? `+${dial}${national ? ` ${national}` : ''}` : national);
  };

  if (!editable) {
    return (
      <div className="flex h-full w-full items-center p-1 text-sm">
        {raw ? (
          <span>
            {country ? `${country.flag} ` : ''}
            {raw}
          </span>
        ) : (
          <span className="text-muted-foreground"> </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-row items-center gap-1">
      <select
        aria-label={`${field.name} country code`}
        value={country?.dial ?? ''}
        onChange={(e) => handleCountry(e.target.value)}
        className="h-full max-w-[6.5rem] shrink-0 cursor-pointer border-none bg-transparent text-sm outline-none"
      >
        <option value="">🌐 —</option>
        {PHONE_COUNTRIES.map((c) => (
          <option key={c.iso} value={c.dial}>
            {c.flag} {c.name} (+{c.dial})
          </option>
        ))}
      </select>
      <Input
        aria-label={field.name}
        value={raw}
        placeholder="+33 6 12 34 56 78"
        onChange={(e) => commit(e.target.value)}
        className={cn(
          'flex h-full w-full cursor-pointer flex-row items-center gap-1 border-none p-0 text-sm focus-visible:cursor-text',
          invalid && 'text-destructive'
        )}
      />
    </div>
  );
};
