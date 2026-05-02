"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Copy, Check, Trash2, Ticket, Crown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  getAllInviteCodes,
  createFoundingCode,
  revokeInviteCode,
} from "@/lib/actions/profile-actions";

type InviteCode = {
  id: string;
  createdBy: string | null;
  grantsPlanId: string;
  maxUses: number | null;
  usedCount: number | null;
  createdAt: Date | null;
  expiresAt: Date | null;
};

const PLAN_LABELS: Record<string, string> = {
  free: "Always Free",
  individual_coop: "Individual Co-Op",
  creator: "Creator",
  org_base: "Organization Base",
  org_pro: "Organization Pro",
  org_enterprise: "Enterprise",
};

export default function InviteCodesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState("individual_coop");
  const [newMaxUses, setNewMaxUses] = useState("10");
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadCodes = useCallback(async () => {
    try {
      const result = await getAllInviteCodes();
      setCodes(result);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const result = await createFoundingCode(newPlanId, parseInt(newMaxUses) || 10);
      toast({ title: "Code Created", description: `New code: ${result.code}` });
      setIsCreateOpen(false);
      await loadCodes();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(code);
    toast({ title: "Copied", description: `${code} copied to clipboard` });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (codeId: string) => {
    try {
      await revokeInviteCode(codeId);
      toast({ title: "Revoked", description: `Code ${codeId} has been revoked.` });
      await loadCodes();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeCodes = codes.filter(c => (c.usedCount ?? 0) < (c.maxUses ?? 1));
  const exhaustedCodes = codes.filter(c => (c.usedCount ?? 0) >= (c.maxUses ?? 1));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" />
            Invite Codes
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage platform invite codes. Founding codes grant paid-tier access.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Create Code
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Ticket className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCodes.length}</p>
                <p className="text-xs text-muted-foreground">Active Codes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{codes.reduce((sum, c) => sum + (c.usedCount ?? 0), 0)}</p>
                <p className="text-xs text-muted-foreground">Total Redemptions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Crown className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{codes.filter(c => c.grantsPlanId !== 'free').length}</p>
                <p className="text-xs text-muted-foreground">Founding Codes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active codes table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Codes</CardTitle>
          <CardDescription>Codes that still have remaining uses.</CardDescription>
        </CardHeader>
        <CardContent>
          {activeCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No active codes. Create one to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeCodes.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono font-semibold text-sm">{code.id}</TableCell>
                      <TableCell>
                        <Badge variant={code.grantsPlanId === 'free' ? 'secondary' : 'default'} className="text-xs">
                          {PLAN_LABELS[code.grantsPlanId] || code.grantsPlanId}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{code.usedCount ?? 0}</span>
                        <span className="text-muted-foreground"> / {code.maxUses ?? '∞'}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {code.createdBy ? code.createdBy.slice(0, 8) + '…' : 'System'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {code.createdAt ? new Date(code.createdAt).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopy(code.id)}
                            className="h-8 w-8 p-0"
                          >
                            {copiedId === code.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevoke(code.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exhausted codes */}
      {exhaustedCodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">Exhausted / Revoked</CardTitle>
            <CardDescription>Codes that have been fully used or revoked.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exhaustedCodes.map((code) => (
                    <TableRow key={code.id} className="opacity-60">
                      <TableCell className="font-mono text-sm">{code.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {PLAN_LABELS[code.grantsPlanId] || code.grantsPlanId}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {code.usedCount ?? 0} / {code.maxUses ?? '∞'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {code.createdAt ? new Date(code.createdAt).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Code Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Invite Code</DialogTitle>
            <DialogDescription>
              Create a new founding invite code that grants paid-tier platform access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Plan to Grant</Label>
              <Select value={newPlanId} onValueChange={setNewPlanId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Always Free</SelectItem>
                  <SelectItem value="individual_coop">Individual Co-Op Member</SelectItem>
                  <SelectItem value="creator">Creator</SelectItem>
                  <SelectItem value="org_base">Organization Base</SelectItem>
                  <SelectItem value="org_pro">Organization Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max Uses</Label>
              <Input
                type="number"
                value={newMaxUses}
                onChange={(e) => setNewMaxUses(e.target.value)}
                min={1}
                max={1000}
              />
              <p className="text-xs text-muted-foreground">How many times this code can be redeemed.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
