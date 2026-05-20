"use client";

/**
 * Bond Detail & Chat Page
 * E2E encrypted messaging using the existing bond crypto infrastructure.
 * Messages are encrypted client-side with AES-256-GCM via the shared ECDH secret.
 */

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Lock, Send, Loader2, AlertTriangle, RefreshCw, Wifi, WifiOff, Search, X, ChevronUp, ChevronDown, User as UserIcon, Paperclip, FileIcon, ImageIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useBondCrypto } from "@/hooks/use-bond-crypto";
import { getBonds } from '@/lib/actions/bond-actions';
import { sendMessage, getMessagesForBond, markMessagesRead } from '@/lib/actions/content-actions';
import { getWsToken } from '@/lib/actions/auth-actions';
import { TribesWebSocket } from "@/lib/ws-client";
import type { Bond } from "@/lib/types";
import { profilePath } from '@/lib/utils/paths';
import { useMessageSearch, type DateRangePreset } from "@/hooks/use-message-search";

import { AuthGuard } from '@/components/providers/auth-guard';

export default function BondChatPage() {
  return (
    <AuthGuard message="Sign in to access your end-to-end encrypted chats.">
      <BondChatContent />
    </AuthGuard>
  );
}

function BondChatContent() {
  const params = useParams();
  const bondId = params.bondId as string;
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();

  const [bond, setBond] = useState<Bond | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<Array<{
    id: string;
    senderId: string;
    plaintext: string;
    sentAt: Date;
    isMine: boolean;
    attachmentName?: string;
    attachmentType?: string;
    attachmentSize?: number;
    attachmentFileId?: string;
    attachmentEncryptionMeta?: string;
  }>>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [loadingMore, setLoadingMore] = useState(false);

  // File attachment state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bond crypto hook — handles ECDH key exchange automatically
  const { sharedSecret, isExchangeComplete, isReady, isLoading: cryptoLoading, error: cryptoError } = useBondCrypto(bondId);

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

  // Load and decrypt messages
  useEffect(() => {
    async function loadMessages() {
      if (!sharedSecret || !user?.id) return;
      try {
        const rawMessages = await getMessagesForBond(bondId, 50);
        const decrypted = [];

        for (const msg of rawMessages) {
          try {
            if (msg.ciphertext) {
              // Import encrypt/decrypt dynamically (browser only)
              const { decrypt } = await import('@/lib/crypto');
              const ciphertextBuffer = Uint8Array.from(
                Buffer.from(msg.ciphertext as unknown as string, 'base64')
              ).buffer;
              const plaintextBuffer = await decrypt(sharedSecret, ciphertextBuffer);
              const plaintext = new TextDecoder().decode(plaintextBuffer);
              decrypted.push({
                id: msg.id,
                senderId: msg.senderId,
                plaintext,
                sentAt: msg.sentAt ?? new Date(),
                isMine: msg.senderId === user.id,
              });
            }
          } catch (err) {
            // Decryption failure — might be a key mismatch
            decrypted.push({
              id: msg.id,
              senderId: msg.senderId,
              plaintext: '🔒 Unable to decrypt (key mismatch)',
              sentAt: msg.sentAt ?? new Date(),
              isMine: msg.senderId === user.id,
            });
          }
        }

        // Sort oldest first for display
        decrypted.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
        setMessages(decrypted);

        // Mark as read
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
  }, [bondId, sharedSecret, user?.id, wsConnected]);

  // WebSocket connection
  useEffect(() => {
    if (!isExchangeComplete || !sharedSecret || !user?.id) return;

    let cancelled = false;
    const ws = TribesWebSocket.getInstance();

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
        ws.subscribe('message', async (data: any) => {
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
              }];
            });
          } catch (err) {
            console.error('[ws] decrypt error:', err);
          }
        });

        // Typing indicator
        ws.subscribe('typing', (data: any) => {
          if (data.userId === user?.id) return;
          setPeerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000);
        });

        // Read receipts
        ws.subscribe('read', (data: any) => {
          if (data.bondId !== bondId) return;
          // Could update message read status UI here
        });
      } catch (err) {
        console.error('[ws] connect error:', err);
        if (!cancelled) setWsConnected(false);
      }
    }

    connectWs();

    return () => {
      cancelled = true;
      ws.setPresence(bondId, 'leave');
      // Don't disconnect — singleton shared across pages
    };
  }, [bondId, isExchangeComplete, sharedSecret, user?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send typing indicator
  const handleTyping = useCallback(() => {
    if (!wsConnected || !bond?.targetId) return;
    const ws = TribesWebSocket.getInstance();
    ws.sendTyping(bondId, bond.targetId);
  }, [bondId, bond?.targetId, wsConnected]);

  // Send message (with optional file attachment)
  const handleSend = useCallback(async () => {
    if ((!newMessage.trim() && !pendingFile) || !sharedSecret || isSending) return;

    setIsSending(true);
    try {
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

      // Persist via server action (with attachment metadata)
      await sendMessage(bondId, ciphertextBase64, attachmentData);

      // Relay via WebSocket for real-time delivery
      if (wsConnected && bond?.targetId) {
        const ws = TribesWebSocket.getInstance();
        ws.sendEncryptedMessage(bondId, ciphertextBase64, bond.targetId);
      }

      // Optimistic update
      setMessages(prev => [...prev, {
        id: `local-${Date.now()}`,
        senderId: user?.id ?? '',
        plaintext: messageText,
        sentAt: new Date(),
        isMine: true,
        attachmentName: pendingFile?.name,
        attachmentType: pendingFile?.type,
        attachmentSize: pendingFile?.size,
        attachmentFileId: attachmentData?.fileId,
        attachmentEncryptionMeta: attachmentData?.encryptionMeta,
      }]);

      setNewMessage("");
      setPendingFile(null);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Send Failed', description: ((err instanceof Error) ? err.message : 'An error occurred') });
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  }, [newMessage, pendingFile, sharedSecret, bondId, user?.id, toast, isSending, wsConnected]);

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
        <Button variant="outline" onClick={() => router.push('/bonds')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bonds
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 max-w-2xl mx-auto min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-background/95 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => router.push('/bonds')}>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Load More button */}
        {messages.length > 0 && isExchangeComplete && (
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
                  const rawMessages = await getMessagesForBond(bondId, 50, oldest?.sentAt);
                  const { decrypt: decryptFn } = await import('@/lib/crypto');
                  const older: Array<{ id: string; senderId: string; plaintext: string; sentAt: Date; isMine: boolean }> = [];
                  for (const msg of rawMessages) {
                    try {
                      if (msg.ciphertext) {
                        const buf = Uint8Array.from(Buffer.from(msg.ciphertext as unknown as string, 'base64')).buffer;
                        const pt = await decryptFn(sharedSecret, buf);
                        older.push({
                          id: msg.id,
                          senderId: msg.senderId,
                          plaintext: new TextDecoder().decode(pt),
                          sentAt: msg.sentAt ?? new Date(),
                          isMine: msg.senderId === user.id,
                        });
                      }
                    } catch {
                      older.push({
                        id: msg.id,
                        senderId: msg.senderId,
                        plaintext: '🔒 Unable to decrypt',
                        sentAt: msg.sentAt ?? new Date(),
                        isMine: msg.senderId === user.id,
                      });
                    }
                  }
                  if (older.length > 0) {
                    older.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
                    setMessages(prev => [...older, ...prev]);
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

        {messages.map((msg) => {
          const isSearchMatch = messageSearch.currentResult?.id === msg.id;
          return (
          <div
            key={msg.id}
            ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
            className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 transition-all ${
                msg.isMine
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-muted rounded-bl-md'
              } ${isSearchMatch ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
            >
              <p className="text-sm whitespace-pre-wrap break-words">{msg.plaintext}</p>
              <p className={`text-xs mt-1 ${
                msg.isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'
              }`}>
                {msg.sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          );
        })}
        <div ref={messagesEndRef} />
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
        <div className="border-t p-3 bg-background/95 backdrop-blur-sm">
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
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={pendingFile ? "Add a message (optional)..." : "Type a message..."}
              disabled={isSending}
              className="flex-1"
              autoFocus
            />
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
      )}
    </div>
  );
}
