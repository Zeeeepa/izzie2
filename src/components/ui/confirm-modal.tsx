'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface ConfirmModalOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmModalContextValue {
  showConfirmation: (options: ConfirmModalOptions) => Promise<boolean>;
}

const ConfirmModalContext = React.createContext<ConfirmModalContextValue | null>(null);

export function useConfirmModal() {
  const context = React.useContext(ConfirmModalContext);
  if (!context) {
    throw new Error('useConfirmModal must be used within a ConfirmModalProvider');
  }
  return context;
}

export function ConfirmModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [options, setOptions] = React.useState<ConfirmModalOptions | null>(null);
  const resolveRef = React.useRef<((value: boolean) => void) | null>(null);

  const showConfirmation = React.useCallback((opts: ConfirmModalOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = React.useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = React.useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const value = React.useMemo(() => ({ showConfirmation }), [showConfirmation]);

  return (
    <ConfirmModalContext.Provider value={value}>
      {children}
      <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
              'bg-background rounded-lg border shadow-lg p-6',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
              'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
              'duration-200'
            )}
          >
            {options && (
              <>
                <Dialog.Title className="text-lg font-semibold text-foreground mb-2">
                  {options.title}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground mb-6">
                  {options.message}
                </Dialog.Description>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handleCancel}>
                    {options.cancelText || 'Cancel'}
                  </Button>
                  <Button
                    variant={options.variant === 'destructive' ? 'destructive' : 'default'}
                    onClick={handleConfirm}
                  >
                    {options.confirmText || 'Confirm'}
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmModalContext.Provider>
  );
}
