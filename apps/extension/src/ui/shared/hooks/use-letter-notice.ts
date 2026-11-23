import { useEffect, useState } from 'react';
import { dismissLetterNotice } from '@/lib/letter-notice/dismiss-letter-notice';
import { isLetterUnread } from '@/lib/letter-notice/is-letter-unread';

export function useLetterNotice(): { open: boolean; onDismiss: () => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    isLetterUnread().then(setOpen);
  }, []);

  return {
    open,
    onDismiss: () => {
      setOpen(false);
      void dismissLetterNotice();
    },
  };
}
