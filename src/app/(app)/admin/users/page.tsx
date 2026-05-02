
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  ShieldCheck, 
  ShieldAlert, 
  Ban, 
  UserCog, 
  ChevronLeft, 
  ChevronRight,
  Loader2,
  AlertTriangle,
  History,
  Mail,
  User as UserIcon,
  CheckCircle2
} from "lucide-react";
import { format } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { getGlobalUsers, updateGlobalUserRole, banUserProactively, revokeGlobalBan } from '@/lib/actions/admin-actions';
import type { UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';

const ROLES: UserRole[] = ["Human_Free", "Human_Paid", "Human_Member", "Creator", "Org_Base", "Org_Pro", "Org_Enterprise", "Admin", "Bot", "System"];

export default function AdminUsersPage() {
  const { toast } = useToast();
  
  // Data state
  const [users, setUsers] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  // Search & Filter state
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [page, setPage] = useState(1);
  const limit = 15;

  // Dialog states
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isBanDialogOpen, setIsBanDialogOpen] = useState(false);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
  
  // Form states
  const [newRole, setNewRole] = useState<UserRole>("Human_Free");
  const [banDuration, setBanDuration] = useState<any>("7_days");
  const [banReason, setBanReason] = useState("");
  const [forceLogout, setForceLogout] = useState(true);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getGlobalUsers({
        page,
        limit,
        search: search.trim() || undefined,
        roleFilter: roleFilter === "all" ? undefined : roleFilter,
      });
      setUsers(result.users);
      setTotalCount(result.totalCount);
    } catch (error: any) {
      toast({
        title: "Error fetching users",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, roleFilter, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    setIsActionSubmitting(true);
    try {
      await updateGlobalUserRole(selectedUser.id, newRole);
      toast({
        title: "Role updated",
        description: `User ${selectedUser.name} is now a ${newRole}.`,
      });
      setIsRoleDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleIssueBan = async () => {
    if (!selectedUser) return;
    setIsActionSubmitting(true);
    try {
      await banUserProactively({
        userId: selectedUser.id,
        duration: banDuration,
        reason: banReason,
        forceLogout,
      });
      toast({
        title: "Ban issued",
        description: `User ${selectedUser.name} has been suspended.`,
      });
      setIsBanDialogOpen(false);
      setBanReason("");
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleRevokeBan = async () => {
    if (!selectedUser) return;
    setIsActionSubmitting(true);
    try {
      await revokeGlobalBan(selectedUser.id);
      toast({
        title: "Ban revoked",
        description: `Access restored for ${selectedUser.name}.`,
      });
      setIsRevokeDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Select value={roleFilter} onValueChange={(v: any) => { setRoleFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {ROLES.map(role => (
                <SelectItem key={role} value={role}>{role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="icon" onClick={() => fetchUsers()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">Loading user directory...</p>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No users found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} className={user.activeBan ? "bg-destructive/5" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar user={{ name: user.name, avatar: user.avatar }} className="h-9 w-9" />
                        <div className="flex flex-col">
                          <span className="font-medium text-sm leading-tight">{user.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{user.id}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'Admin' ? 'default' : 'outline'} className="font-mono text-[10px]">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.activeBan ? (
                        <Badge variant="destructive" className="flex w-fit items-center gap-1">
                          <Ban className="h-3 w-3" />
                          Suspended
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex w-fit items-center gap-1 bg-green-500/10 text-green-600 border-green-200 dark:text-green-400 dark:border-green-900">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>User Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setNewRole(user.role);
                            setIsRoleDialogOpen(true);
                          }}>
                            <UserCog className="mr-2 h-4 w-4" />
                            Change Role
                          </DropdownMenuItem>
                          
                          <DropdownMenuSeparator />
                          
                          {user.activeBan ? (
                            <DropdownMenuItem 
                              className="text-green-600 dark:text-green-400"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsRevokeDialogOpen(true);
                              }}
                            >
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Revoke Suspension
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsBanDialogOpen(true);
                              }}
                            >
                              <Ban className="mr-2 h-4 w-4" />
                              Suspend User
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <div className="text-sm text-muted-foreground px-2">
            Page {page} of {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || isLoading}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Role Update Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Platform Role</DialogTitle>
            <DialogDescription>
              Modify the global permissions and billing tier for <strong>{selectedUser?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <RadioGroup value={newRole} onValueChange={(v: any) => setNewRole(v)} className="grid grid-cols-2 gap-4">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center space-x-2">
                  <RadioGroupItem value={role} id={`role-${role}`} />
                  <Label htmlFor={`role-${role}`} className="text-sm cursor-pointer">{role}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateRole} disabled={isActionSubmitting}>
              {isActionSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban User Dialog */}
      <Dialog open={isBanDialogOpen} onOpenChange={setIsBanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Suspend Platform Access
            </DialogTitle>
            <DialogDescription>
              Issuing a global ban will prevent <strong>{selectedUser?.name}</strong> from logging in or interacting with any tribes.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Suspension Duration</Label>
              <Select value={banDuration} onValueChange={setBanDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1_day">24 Hours</SelectItem>
                  <SelectItem value="7_days">7 Days</SelectItem>
                  <SelectItem value="30_days">30 Days</SelectItem>
                  <SelectItem value="permanent">Permanent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Reason for Suspension</Label>
              <Textarea 
                placeholder="Briefly describe the violation..."
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="force-logout" 
                checked={forceLogout} 
                onCheckedChange={(v: any) => setForceLogout(v)} 
              />
              <Label htmlFor="force-logout" className="text-sm cursor-pointer">
                Invalidate all active sessions (Force logout)
              </Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBanDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleIssueBan} disabled={isActionSubmitting}>
              {isActionSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Suspension
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Ban Dialog */}
      <Dialog open={isRevokeDialogOpen} onOpenChange={setIsRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Access</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke the suspension for <strong>{selectedUser?.name}</strong>? 
              They will be able to log in immediately.
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-muted p-4 rounded-lg flex items-start gap-3 my-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-900 dark:text-yellow-100">Audit Notice</p>
              <p className="text-yellow-800/80 dark:text-yellow-100/70">This action will be logged in the admin audit trail.</p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRevokeDialogOpen(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleRevokeBan} disabled={isActionSubmitting}>
              {isActionSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Restoration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
