"use client";

import React from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCheck, Loader2 } from "lucide-react";
import { cn } from '@/lib/utils';
import { useBonds } from './bonds-context';

export function BondPendingRequests() {
  const { state, handleRespondToRequest } = useBonds();
  const { pendingIncoming, pendingOutgoing, respondingTo } = state;

  if (pendingIncoming.length === 0 && pendingOutgoing.length === 0) return null;

  return (
    <Card className="shadow-lg border-primary/30">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <UserCheck className="h-6 w-6 text-primary" />
          <CardTitle className="tracking-normal">Pending Bond Requests</CardTitle>
        </div>
        <CardDescription>
          {pendingIncoming.length > 0 && `${pendingIncoming.length} incoming`}
          {pendingIncoming.length > 0 && pendingOutgoing.length > 0 && ' · '}
          {pendingOutgoing.length > 0 && `${pendingOutgoing.length} outgoing`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingIncoming.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Incoming</h3>
            {pendingIncoming.map(req => (
              <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {req.fromUserAvatar && <AvatarImage src={req.fromUserAvatar} alt={req.fromUserName} />}
                    <AvatarFallback>{req.fromUserName.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{req.fromUserName}</p>
                    <div className="flex items-center gap-2">
                      <Badge className="text-xs bg-indigo-500 text-white">
                        Bond Request
                      </Badge>
                      <span className="text-xs text-muted-foreground">{format(req.createdAt, 'MMM d, yyyy')}</span>
                    </div>
                    {req.message && <p className="text-xs text-muted-foreground mt-1 italic">"{req.message}"</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={respondingTo === req.id}
                    onClick={() => handleRespondToRequest(req.id, true, req.fromUserName)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {respondingTo === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={respondingTo === req.id}
                    onClick={() => handleRespondToRequest(req.id, false, req.fromUserName)}
                    className="border-destructive text-destructive hover:bg-destructive/10"
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {pendingOutgoing.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Outgoing</h3>
            {pendingOutgoing.map(req => (
              <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {req.toUserAvatar && <AvatarImage src={req.toUserAvatar} alt={req.toUserName} />}
                    <AvatarFallback>{req.toUserName.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{req.toUserName}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {req.bondType.charAt(0).toUpperCase() + req.bondType.slice(1)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{format(req.createdAt, 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Pending
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
