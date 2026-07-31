import { ImagePlay } from 'lucide-react';
import { useState } from 'react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';

export const MessageGifPicker = () => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Insert GIF"
          className="cursor-pointer border-0 bg-transparent p-0"
        >
          <ImagePlay size={20} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="mr-6 h-128 w-128 overflow-hidden p-2"
        side="bottom"
      >
        <p>coming soon.</p>
      </PopoverContent>
    </Popover>
  );
};
