"use client";

/**
 * Bond Detail & Chat Page
 * E2E encrypted messaging using the existing bond crypto infrastructure.
 * Messages are encrypted client-side with AES-256-GCM via the shared ECDH secret.
 */

import { useParams, useRouter } from 'next/navigation';
import { useGoBack } from '@/hooks/use-go-back';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Lock, Send, Loader2, AlertTriangle, RefreshCw, Search, X, ChevronUp, ChevronDown, User as UserIcon, Paperclip, FileIcon, ImageIcon, Pencil } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useBondCrypto } from "@/hooks/use-bond-crypto";
import { getBonds } from '@/lib/actions/bond-actions';
import { sendMessage, getMessagesForBond, markMessagesRead, getNotificationPreferences, editMessage, deleteMessage } from '@/lib/actions/content-actions';
import { toggleReaction, getReactionsForMessages, type MessageReactionSummary } from '@/lib/actions/message-reaction-actions';
import { getWsToken } from '@/lib/actions/auth-actions';
import { TribesWebSocket } from "@/lib/ws-client";
import type { Bond } from "@/lib/types";
import { profilePath } from '@/lib/utils/paths';
import { useMessageSearch, type DateRangePreset } from "@/hooks/use-message-search";
import { useEmojiAutocomplete } from '@/hooks/use-emoji-autocomplete';
import { EmojiAutocomplete } from '@/components/compose/emoji-autocomplete';
import { MessageBubble, type ChatMessage } from './message-bubble';
import { ComposerReplyBar } from './reply-preview';
import { ComposerEmojiButton } from './composer-emoji-button';

import { AuthGuard } from '@/components/providers/auth-guard';

/** Messages fetched per page (initial load + each "load older" click). */
const PAGE_SIZE = 50;

export default function BondChatPage() {
  return (
    <AuthGuard message="Sign in to access your end-to-end encrypted chats.">
      <BondChatContent />
    </AuthGuard>
  );
}

/** Maps the nullable attachment columns from a loaded message row onto the
 *  optional ChatMessage fields (null → undefined). */
function attachmentFields(msg: {
  attachmentFileId?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  attachmentEncryptionMeta?: string | null;
}) {
  return {
    attachmentFileId: msg.attachmentFileId ?? undefined,
    attachmentName: msg.attachmentName ?? undefined,
    attachmentType: msg.attachmentType ?? undefined,
    attachmentSize: msg.attachmentSize ?? undefined,
    attachmentEncryptionMeta: msg.attachmentEncryptionMeta ?? undefined,
  };
}

function BondChatContent() {
  const params = useParams();
  const bondId = params.bondId as string;
  const router = useRouter();
  const goBack = useGoBack();
  const { toast } = useToast();
  const { user } = useUser();

  const [bond, setBond] = useState<Bond | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [loadingMore, setLoadingMore] = useState(false);
  // Whether older messages remain to be paged in. A full first page (=== PAGE_SIZE)
  // means there *might* be more; anything less means we already have everything,
  // so the "Load older messages" button stays hidden.
  const [hasMoreMessages, setHasMoreMessages] = useState(false);

  // Reactions, replies, and chat preferences
  const [reactions, setReactions] = useState<Record<string, MessageReactionSummary[]>>({});
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  // Current user's chat prefs — defaults match the server defaults.
  // Kept in a ref too so long-lived WS handlers see the latest values.
  const [chatPrefs, setChatPrefs] = useState({ readReceiptsEnabled: true, typingIndicatorsEnabled: true });
  const chatPrefsRef = useRef(chatPrefs);
  chatPrefsRef.current = chatPrefs;

  // Keep bond.targetId in a ref so WS handlers always see the latest value
  // without needing bond?.targetId in the WS effect dep array (which would
  // cause a double WebSocket connection when bond loads after initial connect).
  const bondTargetIdRef = useRef<string | null | undefined>(null);
  bondTargetIdRef.current = bond?.targetId;

  // Typing throttle — ref tracks last send time to avoid N WS sends per keystroke
  const lastTypingSentRef = useRef<number>(0);

  // File attachment state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  // ::shortcode:: emoji autocomplete in the composer
  const { emojiQuery, emojiRef, checkEmoji, handleSelectEmoji, handleEmojiKeyDown } =
    useEmojiAutocomplete(messageInputRef, newMessage, setNewMessage);

  // Bond crypto hook — handles ECDH key exchange automatically
  const { sharedSecret, isExchangeComplete, isLoading: cryptoLoading, error: cryptoError } = useBondCrypto(bondId);

  // Message search
  const messageSearch = useMessageSearch({
    bondId,
    sharedSecret: sharedSecret as CryptoKey | null,
    loadedMessages: messages,
  });

  // Load bond data
  useEffect(() => {
    async function loadBond() {
      setIsLoading(true);
      try {
        const bonds = await getBonds();
        const found = bonds.find((b: Bond) => b.id === bondId);
        if (found) setBond(found);
      } catch (err: unknown) {
        toast({ variant: 'destructive', title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') });
      } finally {
        setIsLoading(false);
      }
    }
    if (bondId) loadBond();
  }, [bondId, toast]);

  // Load the current user's chat preferences (read receipts / typing indicators)
  useEffect(() => {
    let cancelled = false;
    getNotificationPreferences().then((prefs) => {
      if (prefs && !cancelled) {
        setChatPrefs({
          readReceiptsEnabled: prefs.readReceiptsEnabled ?? true,
          typingIndicatorsEnabled: prefs.typingIndicatorsEnabled ?? true,
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Batch-fetch reactions for a set of messages and merge into state
  const loadReactions = useCallback(async (messageIds: string[]) => {
    const realIds = messageIds.filter(id => !id.startsWith('local-') && !id.startsWith('ws-'));
    if (realIds.length === 0) return;
    try {
      const fetched = await getReactionsForMessages(realIds);
      setReactions(prev => {
        const next = { ...prev };
        for (const id of realIds) {
          if (fetched[id]) next[id] = fetched[id];
          else delete next[id];
        }
        return next;
      });
    } catch (err) {
      console.error('[bond-chat] Load reactions error:', err);
    }
  }, []);

  // Decode one raw message row into a ChatMessage: handles deleted tombstones,
  // decryption, and the edited/read/reply/attachment metadata.
  const decodeMessage = useCallback(async (msg: any): Promise<ChatMessage> => {
    const base = {
      id: msg.id,
      senderId: msg.senderId,
      sentAt: msg.sentAt ?? new Date(),
      isMine: msg.senderId === user?.id,
      readAt: msg.readAt,
      replyToId: msg.replyToId,
      editedAt: msg.editedAt,
      deletedAt: msg.deletedAt,
      ...attachmentFields(msg),
    };
    if (msg.deletedAt || !msg.ciphertext) return { ...base, plaintext: '' };
    try {
      const { decrypt } = await import('@/lib/crypto');
      const buf = Uint8Array.from(Buffer.from(msg.ciphertext as unknown as string, 'base64')).buffer;
      const pt = await decrypt(sharedSecret!, buf);
      return { ...base, plaintext: new TextDecoder().decode(pt) };
    } catch {
      return { ...base, plaintext: '🔒 Unable to decrypt (key mismatch)' };
    }
  }, [sharedSecret, user?.id]);

  // Load and decrypt messages
  useEffect(() => {
    async function loadMessages() {
      if (!sharedSecret || !user?.id) return;
      try {
        const rawMessages = await getMessagesForBond(bondId, PAGE_SIZE);
        const decrypted: ChatMessage[] = [];
        for (const msg of rawMessages) {
          decrypted.push(await decodeMessage(msg));
        }

        // A short first page means there's nothing older to page in.
        setHasMoreMessages(rawMessages.length >= PAGE_SIZE);

        // Sort oldest first for display
        decrypted.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
        // Clear stale ref entries from previous load before re-populating
        messageRefs.current.clear();
        setMessages(decrypted);
        loadReactions(decrypted.map(m => m.id));

        // Always mark read so our own unread badge clears. Whether the read
        // receipt is shared with the sender is decided server-side from the
        // user's preference (see markMessagesRead).
        await markMessagesRead(bondId);
      } catch (err) {
        console.error('[bond-chat] Load messages error:', err);
      }
    }

    loadMessages();
    // Poll as fallback — only when WS not connected
    const interval = setInterval(() => {
      if (!wsConnected) loadMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [bondId, sharedSecret, user?.id, wsConnected, loadReactions, decodeMessage]);

  // WebSocket connection
  useEffect(() => {
    if (!isExchangeComplete || !sharedSecret || !user?.id) return;

    let cancelled = false;
    const ws = TribesWebSocket.getInstance();
    const unsubscribers: Array<() => void> = [];

    async function connectWs() {
      try {
        const token = await getWsToken();
        ws.connect(token);
        if (!cancelled) setWsConnected(true);

        // Join the bond room
        ws.setPresence(bondId, 'join');

        // Listen for incoming messages
        // Accept from any bondId — the peer sends under their own bondId
        // which is different from ours. The relay routes by targetUserId.
        unsubscribers.push(ws.subscribe('message', async (data: any) => {
          if (data.senderId === user?.id) return;
          try {
            const { decrypt: decryptFn } = await import('@/lib/crypto');
            const ciphertextBuffer = Uint8Array.from(
              Buffer.from(data.ciphertext, 'base64')
            ).buffer;
            const plaintextBuffer = await decryptFn(sharedSecret!, ciphertextBuffer);
            const plaintext = new TextDecoder().decode(plaintextBuffer);
            setMessages(prev => {
              // Avoid duplicates: check by messageId, or by content+sender proximity
              const isDuplicate = prev.some(m => {
                if (data.messageId && m.id === data.messageId) return true;
                // Check if same sender sent the same text within 5 seconds
                if (m.senderId === data.senderId && m.plaintext === plaintext) {
                  const timeDiff = Math.abs(new Date().getTime() - m.sentAt.getTime());
                  if (timeDiff < 5000) return true;
                }
                return false;
              });
              if (isDuplicate) return prev;
              return [...prev, {
                id: data.messageId || `ws-${Date.now()}`,
                senderId: data.senderId,
                plaintext,
                sentAt: new Date(),
                isMine: false,
                replyToId: data.replyToId ?? null,
              }];
            });
            // We're viewing the chat, so the message is read immediately.
            // Always persist (clears our badge); only push the live receipt to
            // the peer when read receipts are enabled.
            markMessagesRead(bondId).catch(() => {});
            if (chatPrefsRef.current.readReceiptsEnabled) {
              const tid = bondTargetIdRef.current;
              if (tid) ws.sendReadReceipt(bondId, tid);
            }
          } catch (err) {
            console.error('[ws] decrypt error:', err);
          }
        }));

        // Typing indicator
        unsubscribers.push(ws.subscribe('typing', (data: any) => {
          if (data.userId === user?.id) return;
          setPeerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000);
        }));

        // Read receipts — the peer opened the chat; all our messages are now read.
        // The event arrives under the PEER's bondId (different from ours), so
        // filter by sender identity (bondTargetIdRef) instead of bondId.
        unsubscribers.push(ws.subscribe('read', (data: any) => {
          if (!bondTargetIdRef.current || data.userId !== bondTargetIdRef.current) return;
          setMessages(prev => prev.map(m =>
            m.isMine && !m.readAt ? { ...m, readAt: new Date() } : m
          ));
        }));

        // Real-time reaction updates — re-fetch the affected message's reactions
        unsubscribers.push(ws.subscribe('reaction', (data: any) => {
          if (!bondTargetIdRef.current || data.userId !== bondTargetIdRef.current || !data.messageId) return;
          loadReactions([data.messageId]);
        }));

        // Real-time edit — decrypt the new ciphertext and update the message.
        unsubscribers.push(ws.subscribe('edit', async (data: any) => {
          if (data.senderId === user?.id || !data.messageId || !data.ciphertext) return;
          try {
            const { decrypt: decryptFn } = await import('@/lib/crypto');
            const buf = Uint8Array.from(Buffer.from(data.ciphertext, 'base64')).buffer;
            const plaintext = new TextDecoder().decode(await decryptFn(sharedSecret!, buf));
            setMessages(prev => prev.map(m =>
              m.id === data.messageId ? { ...m, plaintext, editedAt: new Date() } : m
            ));
          } catch (err) {
            console.error('[ws] edit decrypt error:', err);
          }
        }));

        // Real-time delete — replace the message with a tombstone.
        unsubscribers.push(ws.subscribe('delete', (data: any) => {
          if (data.senderId === user?.id || !data.messageId) return;
          setMessages(prev => prev.map(m =>
            m.id === data.messageId
              ? { ...m, deletedAt: new Date(), plaintext: '', attachmentFileId: undefined }
              : m
          ));
        }));
      } catch (err) {
        console.error('[ws] connect error:', err);
        if (!cancelled) setWsConnected(false);
      }
    }

    connectWs();

    return () => {
      cancelled = true;
      ws.setPresence(bondId, 'leave');
      unsubscribers.forEach(fn => fn());
      // Don't disconnect — singleton shared across pages
    };
  // bond?.targetId is intentionally NOT in this dep array — it's read via
  // bondTargetIdRef to avoid re-running (and double-connecting) when bond loads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bondId, isExchangeComplete, sharedSecret, user?.id, loadReactions]);

  // Send read receipt once both WS is connected and bond.targetId is known.
  // The WS effect fires before bond loads (bond=null), so we fire it here instead.
  useEffect(() => {
    if (!wsConnected || !bond?.targetId || !chatPrefs.readReceiptsEnabled) return;
    TribesWebSocket.getInstance().sendReadReceipt(bondId, bond.targetId);
  }, [wsConnected, bond?.targetId, chatPrefs.readReceiptsEnabled, bondId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send typing indicator — throttled to 1 send per 2 seconds, respects preference
  const handleTyping = useCallback(() => {
    if (!wsConnected || !bondTargetIdRef.current || !chatPrefsRef.current.typingIndicatorsEnabled) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    TribesWebSocket.getInstance().sendTyping(bondId, bondTargetIdRef.current);
  }, [bondId, wsConnected]);

  // Toggle an emoji reaction on a message (optimistic, then reconciled)
  const handleToggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (messageId.startsWith('local-') || messageId.startsWith('ws-')) return;
    try {
      const { reactions: updated } = await toggleReaction(messageId, emoji);
      setReactions(prev => {
        const next = { ...prev };
        if (updated.length > 0) next[messageId] = updated;
        else delete next[messageId];
        return next;
      });
      // Relay the update to the peer in real-time
      const tid = bondTargetIdRef.current;
      if (wsConnected && tid) {
        const myEmoji = updated.find(r => r.userReacted)?.emoji ?? null;
        TribesWebSocket.getInstance().sendReaction(bondId, messageId, myEmoji, tid);
      }
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Reaction Failed', description: ((err instanceof Error) ? err.message : 'An error occurred') });
    }
  }, [bondId, wsConnected, toast]);

  // Start a reply to a message and focus the composer
  const handleReply = useCallback((msg: ChatMessage) => {
    setEditing(null);
    setReplyTo(msg);
    messageInputRef.current?.focus();
  }, []);

  // Start editing a message — prefill the composer with its current text
  const handleEdit = useCallback((msg: ChatMessage) => {
    setReplyTo(null);
    setPendingFile(null);
    setEditing(msg);
    setNewMessage(msg.plaintext);
    messageInputRef.current?.focus();
  }, []);

  // Delete one of your own messages (after confirmation)
  const handleDelete = useCallback(async (msg: ChatMessage) => {
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    // Optimistic tombstone
    setMessages(prev => prev.map(m =>
      m.id === msg.id ? { ...m, deletedAt: new Date(), plaintext: '', attachmentFileId: undefined } : m
    ));
    if (editing?.id === msg.id) { setEditing(null); setNewMessage(''); }
    try {
      await deleteMessage(msg.id);
      const tid = bondTargetIdRef.current;
      if (wsConnected && tid) TribesWebSocket.getInstance().sendDelete(bondId, msg.id, tid);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: ((err instanceof Error) ? err.message : 'An error occurred') });
    }
  }, [bondId, wsConnected, toast, editing?.id]);

  // Scroll to (and briefly highlight) the quoted original message
  const handleQuoteClick = useCallback((messageId: string) => {
    const el = messageRefs.current.get(messageId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('animate-pulse');
      setTimeout(() => el.classList.remove('animate-pulse'), 1500);
    }
  }, []);

  // Resolve a reply preview from the loaded (decrypted) message list
  const getReplyPreview = useCallback((replyToId: string | null | undefined) => {
    if (!replyToId) return null;
    const original = messages.find(m => m.id === replyToId);
    if (!original) return { senderName: 'Original message', text: '🔒 Encrypted message' };
    return {
      senderName: original.isMine ? 'You' : (bond?.targetName ?? 'Them'),
      text: original.deletedAt ? 'This message was deleted' : original.plaintext,
    };
  }, [messages, bond?.targetName]);

  // Send message (with optional file attachment)
  const handleSend = useCallback(async () => {
    if ((!newMessage.trim() && !pendingFile) || !sharedSecret || isSending) return;

    setIsSending(true);
    try {
      // ── Edit mode: re-encrypt the new text and update the existing message ──
      if (editing) {
        const text = newMessage.trim();
        if (!text) { setIsSending(false); return; }
        const { encrypt } = await import('@/lib/crypto');
        const ctBuf = await encrypt(sharedSecret, new TextEncoder().encode(text).buffer as ArrayBuffer);
        const ctB64 = Buffer.from(new Uint8Array(ctBuf)).toString('base64');
        await editMessage(editing.id, ctB64);
        setMessages(prev => prev.map(m =>
          m.id === editing.id ? { ...m, plaintext: text, editedAt: new Date() } : m
        ));
        const tid = bondTargetIdRef.current;
        if (wsConnected && tid) TribesWebSocket.getInstance().sendEdit(bondId, editing.id, ctB64, tid);
        setEditing(null);
        setNewMessage('');
        setIsSending(false);
        return;
      }

      // Handle file attachment encryption + upload
      let attachmentData: { fileId: string; fileName: string; fileType: string; fileSize: number; encryptionMeta: string } | undefined;
      if (pendingFile) {
        setIsUploading(true);

        // Use the shared upload helper — handles compression + encryption
        const { uploadFile } = await import('@/lib/upload');
        const result = await uploadFile(pendingFile, 'bond-attachments', {
          context: 'bond-attachment',
          encryptionKey: sharedSecret as CryptoKey,
        });

        attachmentData = {
          fileId: result.fileId,
          fileName: pendingFile.name,
          fileType: pendingFile.type,
          fileSize: pendingFile.size,
          encryptionMeta: result.encryptionMeta ? JSON.stringify(result.encryptionMeta) : '{}',
        };
        setIsUploading(false);
      }

      // Encrypt the message text
      const messageText = newMessage.trim() || (pendingFile ? `📎 ${pendingFile.name}` : '');
      const { encrypt } = await import('@/lib/crypto');
      const plaintextBuffer = new TextEncoder().encode(messageText);
      const ciphertextBuffer = await encrypt(sharedSecret, plaintextBuffer.buffer as ArrayBuffer);
      const ciphertextBase64 = Buffer.from(new Uint8Array(ciphertextBuffer)).toString('base64');

      // Persist via server action (with attachment metadata + reply reference)
      const row = await sendMessage(bondId, ciphertextBase64, attachmentData, replyTo?.id);

      // Relay via WebSocket for real-time delivery
      const tid = bondTargetIdRef.current;
      if (wsConnected && tid) {
        const ws = TribesWebSocket.getInstance();
        ws.sendEncryptedMessage(bondId, ciphertextBase64, tid, row.id, replyTo?.id);
      }

      // Optimistic update — use the persisted row id so reactions/replies
      // work on the message immediately
      setMessages(prev => [...prev, {
        id: row.id,
        senderId: user?.id ?? '',
        plaintext: messageText,
        sentAt: new Date(),
        isMine: true,
        replyToId: replyTo?.id ?? null,
        attachmentName: pendingFile?.name,
        attachmentType: pendingFile?.type,
        attachmentSize: pendingFile?.size,
        attachmentFileId: attachmentData?.fileId,
        attachmentEncryptionMeta: attachmentData?.encryptionMeta,
      }]);

      setNewMessage("");
      setPendingFile(null);
      setReplyTo(null);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Send Failed', description: ((err instanceof Error) ? err.message : 'An error occurred') });
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  }, [newMessage, pendingFile, sharedSecret, bondId, user?.id, toast, isSending, wsConnected, replyTo, editing]);

  if (isLoading || cryptoLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">
            {cryptoLoading ? 'Establishing encrypted connection...' : 'Loading bond...'}
          </p>
        </div>
      </div>
    );
  }

  if (!bond) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Bond Not Found</h2>
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bonds
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-background/95 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 text-primary font-bold">
            {bond.targetName.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate">{bond.targetName}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs capitalize">{bond.bondType}</Badge>
            {isExchangeComplete ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Lock className="h-3 w-3" /> E2E Encrypted
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <AlertTriangle className="h-3 w-3" /> Awaiting key exchange
              </span>
            )}
          </div>
        </div>
        {bond.targetId && (
          <Button variant="ghost" size="icon" onClick={() => router.push(profilePath(bond.targetId!, bond.targetSlug))} title="View Wall">
            <UserIcon className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => messageSearch.setIsOpen(!messageSearch.isOpen)}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Search Bar */}
      {messageSearch.isOpen && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={messageSearch.query}
            onChange={(e) => messageSearch.setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') messageSearch.search(messageSearch.query);
              if (e.key === 'Escape') messageSearch.clearSearch();
            }}
            placeholder="Search messages..."
            className="h-8 text-sm flex-1"
            autoFocus
          />
          <Select value={messageSearch.dateRange} onValueChange={(v) => messageSearch.setDateRange(v as DateRangePreset)}>
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => messageSearch.search(messageSearch.query)}>
            <Search className="h-3.5 w-3.5" />
          </Button>
          {messageSearch.totalResults > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <span>{messageSearch.currentIndex + 1}/{messageSearch.totalResults}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => messageSearch.navigateResult('prev')}>
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => messageSearch.navigateResult('next')}>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={messageSearch.clearSearch}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-4 space-y-3">
        {/* Load More button — only when older messages actually remain */}
        {messages.length > 0 && isExchangeComplete && hasMoreMessages && (
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              disabled={loadingMore}
              onClick={async () => {
                if (!sharedSecret || !user?.id) return;
                setLoadingMore(true);
                try {
                  const oldest = messages[0];
                  const rawMessages = await getMessagesForBond(bondId, PAGE_SIZE, oldest?.sentAt);
                  // A short page means we've reached the start of the thread.
                  setHasMoreMessages(rawMessages.length >= PAGE_SIZE);
                  const older: ChatMessage[] = [];
                  for (const msg of rawMessages) {
                    older.push(await decodeMessage(msg));
                  }
                  if (older.length > 0) {
                    older.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
                    setMessages(prev => [...older, ...prev]);
                    loadReactions(older.map(m => m.id));
                  }
                } catch (err) {
                  console.error('[bond-chat] Load more error:', err);
                } finally {
                  setLoadingMore(false);
                }
              }}
            >
              {loadingMore ? 'Loading...' : '↑ Load older messages'}
            </Button>
          </div>
        )}

        {!isExchangeComplete && (
          <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
            <CardContent className="p-4 text-center space-y-2">
              <Lock className="h-8 w-8 mx-auto text-amber-500" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Encrypted chat will be available once both parties have exchanged keys.
                Your partner needs to open the app to complete the key exchange.
              </p>
              <Button variant="outline" size="sm" className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" /> Check Again
              </Button>
            </CardContent>
          </Card>
        )}

        {cryptoError && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-destructive">{cryptoError}</p>
            </CardContent>
          </Card>
        )}

        {messages.length === 0 && isExchangeComplete && (
          <div className="text-center py-16 text-muted-foreground">
            <Lock className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No messages yet. Start the conversation!</p>
            <p className="text-xs mt-1 opacity-60">Messages are end-to-end encrypted</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isSearchMatch={messageSearch.currentResult?.id === msg.id}
            reactions={reactions[msg.id] ?? []}
            replyPreview={getReplyPreview(msg.replyToId)}
            showReadTicks={msg.isMine}
            sharedSecret={sharedSecret as CryptoKey | null}
            onToggleReaction={handleToggleReaction}
            onReply={handleReply}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onQuoteClick={handleQuoteClick}
            registerRef={(id, el) => { if (el) messageRefs.current.set(id, el); }}
          />
        ))}

        {/* Peer typing indicator */}
        {peerTyping && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Dormant/Expired bond warning */}
      {bond && (bond.passkeyStatus === 'dormant' || bond.passkeyStatus === 'expired') && (
        <div className="border-t p-3 bg-amber-50 dark:bg-amber-950/30 text-center">
          <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
            {bond.passkeyStatus === 'dormant'
              ? '💤 This bond is dormant. Send a reconnect request to resume messaging.'
              : '❌ This bond has expired. You can no longer send messages.'}
          </p>
        </div>
      )}

      {/* Input Area */}
      {isExchangeComplete && bond?.passkeyStatus !== 'dormant' && bond?.passkeyStatus !== 'expired' && (
        <div className="border-t bg-background/95 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-3xl pt-3 px-3 pb-3">
          {/* Editing bar */}
          {editing && (
            <div className="flex items-center gap-2 mb-2 p-2 rounded-md bg-muted/50 border-l-2 border-primary">
              <Pencil className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-primary">Editing message</p>
                <p className="text-xs text-muted-foreground truncate">{editing.plaintext}</p>
              </div>
              <button
                type="button"
                onClick={() => { setEditing(null); setNewMessage(''); }}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Cancel edit"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* Reply preview bar */}
          {replyTo && !editing && (
            <ComposerReplyBar
              senderName={replyTo.isMine ? 'You' : (bond?.targetName ?? 'Them')}
              text={replyTo.plaintext}
              onCancel={() => setReplyTo(null)}
            />
          )}
          {/* Pending attachment preview */}
          {pendingFile && (
            <div className="flex items-center gap-2 mb-2 p-2 rounded-md bg-muted/50 border">
              {pendingFile.type.startsWith('image/') ? (
                <ImageIcon className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <FileIcon className="h-4 w-4 text-primary shrink-0" />
              )}
              <span className="text-sm truncate flex-1">{pendingFile.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {(pendingFile.size / 1024).toFixed(0)}KB
              </span>
              <button
                onClick={() => setPendingFile(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPendingFile(file);
              e.target.value = ''; // Reset so same file can be re-selected
            }}
          />
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              title="Attach a file (encrypted)"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <ComposerEmojiButton
              disabled={isSending}
              onSelect={(emoji) => {
                // Insert at cursor position
                const input = messageInputRef.current;
                const pos = input?.selectionStart ?? newMessage.length;
                const next = newMessage.slice(0, pos) + emoji + newMessage.slice(pos);
                setNewMessage(next);
                setTimeout(() => {
                  input?.focus();
                  input?.setSelectionRange(pos + emoji.length, pos + emoji.length);
                }, 10);
              }}
            />
            <div className="relative flex-1">
              {/* Emoji autocomplete opens UPWARD — positioned above the input */}
              <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
                <EmojiAutocomplete
                  ref={emojiRef}
                  query={emojiQuery}
                  onSelect={handleSelectEmoji}
                />
              </div>
              <Input
                ref={messageInputRef}
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  checkEmoji(e.target.value, e.target.selectionStart ?? e.target.value.length);
                  handleTyping();
                }}
                onKeyDown={handleEmojiKeyDown}
                placeholder={editing ? "Edit message..." : pendingFile ? "Add a message (optional)..." : "Type a message..."}
                disabled={isSending}
                className="w-full"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              disabled={(!newMessage.trim() && !pendingFile) || isSending}
              size="icon"
              className="shrink-0"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
            <Lock className="h-3 w-3" />
            {isUploading ? 'Encrypting and uploading...' : 'Messages and files are end-to-end encrypted'}
          </p>
          </div>
        </div>
      )}
    </div>
  );
}
