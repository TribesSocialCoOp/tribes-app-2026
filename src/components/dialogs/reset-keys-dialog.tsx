'use client';

/**
 * @fileoverview Destructive key reset confirmation dialog.
 *
 * Requires the user to type "RESET" to confirm, preventing accidental
 * key destruction that would permanently break past encrypted conversations.
 */

import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ResetKeysDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orphanedCount: number;
  onConfirm: () => Promise<void>;
}

export function ResetKeysDialog({ open, onOpenChange, orphanedCount, onConfirm }: ResetKeysDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const canConfirm = confirmText.trim().toUpperCase() === 'RESET';

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsResetting(true);
    try {
      await onConfirm();
    } finally {
      setIsResetting(false);
      setConfirmText('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) setConfirmText('');
      onOpenChange(v);
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reset Encryption Keys
          </DialogTitle>
          <DialogDescription className="text-left">
            This action is permanent and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Impact explanation */}
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="font-medium text-destructive mb-2">What happens:</p>
              <ul className="list-disc list-inside space-y-1.5 text-xs text-destructive/80">
                <li>
                  New encryption keys will be generated for <strong>{orphanedCount} bond{orphanedCount !== 1 ? 's' : ''}</strong>
                </li>
                <li>
                  <strong>All past encrypted messages</strong> from these bonds become permanently unreadable on every device
                </li>
                <li>
                  Future messages will work normally with the new keys
                </li>
                <li>
                  The other person will see a key change notification
                </li>
              </ul>
            </div>

            <p className="text-xs">
              <strong>On this device:</strong> Old messages from these bonds will show as &quot;encrypted content&quot; you can&apos;t read.
            </p>
            <p className="text-xs">
              <strong>On your other devices:</strong> Same effect. The old keys will no longer match.
            </p>
          </div>

          {/* Confirmation input */}
          <div className="space-y-2">
            <Label htmlFor="reset-confirm" className="text-xs font-medium">
              Type <span className="font-mono font-bold text-destructive">RESET</span> to confirm
            </Label>
            <Input
              id="reset-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type RESET"
              className="font-mono text-center tracking-wider"
              autoComplete="off"
              onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) handleConfirm(); }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isResetting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canConfirm || isResetting}
          >
            {isResetting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resetting...</>
              : 'Reset Keys Permanently'
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
