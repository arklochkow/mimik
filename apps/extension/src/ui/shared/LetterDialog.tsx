import { Dialog, DialogContent, DialogTitle, LetterStep } from '@mimik/ui';
import { i18n } from '#imports';

export function LetterDialog({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent showCloseButton={false} className="gap-3.5 p-4 sm:max-w-[760px]">
        <DialogTitle className="sr-only">{i18n.t('onboarding.letterNote')}</DialogTitle>
        <LetterStep
          onFinish={onDismiss}
          heading={i18n.t('onboarding.letterNote')}
          finishLabel={i18n.t('common.close')}
        />
      </DialogContent>
    </Dialog>
  );
}
