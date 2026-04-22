"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Filter as FilterIcon, X as XIcon, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown, Rss } from "lucide-react";
import { cn } from '@/lib/utils';
import { useBonds, type SortableBondKeys } from './bonds-context';
import { BondTableRow } from './bond-table-row';

// ─── SortableHeaderCell ──────────────────────────────────────────────────────

const SortableHeaderCell: React.FC<{
  columnKey: SortableBondKeys;
  title: string;
  className?: string;
}> = ({ columnKey, title, className }) => {
  const { state, handleSort } = useBonds();
  const isSorted = state.sortConfig.key === columnKey;
  const Icon = isSorted
    ? (state.sortConfig.direction === 'ascending' ? ArrowUp : ArrowDown)
    : ChevronsUpDown;

  return (
    <TableHead className={cn("cursor-pointer hover:bg-muted/80", className)} onClick={() => handleSort(columnKey)}>
      <div className="flex items-center space-x-1">
        <span>{title}</span>
        <Icon className={cn("h-3.5 w-3.5", isSorted ? "text-foreground" : "text-muted-foreground/70")} />
      </div>
    </TableHead>
  );
};

// ─── BondTable ───────────────────────────────────────────────────────────────

export function BondTable() {
  const { state, dispatch, derived } = useBonds();
  const { searchTerm, bonds } = state;
  const { paginatedBonds, totalPages } = derived;

  return (
    <Card className="shadow-xl">
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="tracking-normal">Current Bonds ({bonds.length})</CardTitle>
            <CardDescription>View and manage your bonds. Use pseudonyms for specific interactions.</CardDescription>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={searchTerm ? "secondary" : "outline"}>
                <FilterIcon className="mr-2 h-4 w-4" /> Filter & View Options
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="bond-search-input">Search by Name or Alias</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="bond-search-input"
                    type="search"
                    placeholder="Search bonds..."
                    value={searchTerm}
                    onChange={(e) => dispatch({ type: 'SET_SEARCH', payload: e.target.value })}
                    className="pl-8 w-full"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="items-per-page-select">Items per Page</Label>
                <Select value={String(state.itemsPerPage)} onValueChange={(v) => dispatch({ type: 'SET_ITEMS_PER_PAGE', payload: Number(v) })}>
                  <SelectTrigger id="items-per-page-select" className="w-full">
                    <SelectValue placeholder="Select items per page" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="8">8</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      {searchTerm && (
        <div className="px-6 pt-0 pb-4">
          <Badge variant="secondary" className="flex items-center justify-between max-w-max">
            Search: "{searchTerm}"
            <Button variant="ghost" size="icon" className="ml-1 h-5 w-5 hover:bg-transparent" onClick={() => dispatch({ type: 'SET_SEARCH', payload: '' })}>
              <XIcon className="h-3 w-3" />
            </Button>
          </Badge>
        </div>
      )}
      <CardContent className={cn(searchTerm && "pt-0")}>
        {!bonds ? (
          <p className="text-center text-muted-foreground py-8">Loading bonds...</p>
        ) : paginatedBonds.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {searchTerm ? "No bonds match your search." : "You have no active bonds. Start connecting!"}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeaderCell columnKey="targetName" title="Target" />
                <TableHead className="hidden md:table-cell w-[80px]" />
                <SortableHeaderCell columnKey="bondType" title="Type" className="hidden sm:table-cell" />
                <SortableHeaderCell columnKey="passkeyStatus" title="Passkey Status" className="text-center" />
                <TableHead className="text-center hidden md:table-cell">Connect Vibe</TableHead>
                <SortableHeaderCell columnKey="expiresAt" title="Expires" className="hidden md:table-cell" />
                <TableHead className="hidden sm:table-cell">Intercom Feed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedBonds.map((bond) => (
                <BondTableRow key={bond.id} bond={bond} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t">
        <p className="text-xs text-muted-foreground flex-1 text-center sm:text-left mb-4 sm:mb-0">
          The "Connect Vibe" column shows an icon representing the bond's current state. Hover for details. Use the <Rss className="inline h-3 w-3 text-accent" /> toggle to control Intercom feed updates.
        </p>
        {totalPages > 1 && (
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'SET_PAGE', payload: Math.max(state.currentPage - 1, 1) })} disabled={state.currentPage === 1}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {state.currentPage} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'SET_PAGE', payload: Math.min(state.currentPage + 1, totalPages) })} disabled={state.currentPage === totalPages}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
