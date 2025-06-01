
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Link2, RefreshCw, Trash2, Users, User, HeartHandshake, Rss, CheckCircle2, AlertTriangle, XCircle, Info, MoreVertical, Heart, Meh, Smile, SmilePlus, Ghost as GhostIcon, Ban, MessageSquare, Settings, Share2, Search, ChevronLeft, ChevronRight, Filter as FilterIcon, X as XIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from '@/lib/utils';
import { BondSettingsDialog } from '@/components/dialogs/bond-settings-dialog';
import { IntroductionDialog } from '@/components/dialogs/introduction-dialog';

type BondType = "family" | "friend" | "professional" | "collaborator" | "follower" | "supporter";
type FormationMethod = "rfid_tap" | "digital_introduction" | "virtual_request";

export interface Bond {
  id: string;
  targetName: string;
  targetType: "user" | "tribe";
  bondType: BondType;
  formationMethod: FormationMethod;
  passkeyStatus: "active" | "expires_soon" | "expired" | "needs_refresh";
  expiresAt: Date;
  lastRefreshedAt: Date;
  reconnectsCount: number;
  showInIntercom?: boolean;
  allowChatInitiation?: boolean;
}

const generateInitialBondsData = (): Bond[] => [
  { id: "1", targetName: "AI Innovators Tribe", targetType: "tribe", bondType: "follower", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 30), expiresAt: new Date(Date.now() + 86400000 * (30)), reconnectsCount: 2, showInIntercom: true, allowChatInitiation: false },
  { id: "2", targetName: "Alice Wonderland", targetType: "user", bondType: "friend", formationMethod: "rfid_tap", passkeyStatus: "expires_soon", expiresAt: new Date(Date.now() + 86400000 * 5), lastRefreshedAt: new Date(Date.now() - 86400000 * 25), reconnectsCount: 1, showInIntercom: true, allowChatInitiation: true },
  { id: "3", targetName: "Weekend Hikers", targetType: "tribe", bondType: "follower", formationMethod: "rfid_tap", passkeyStatus: "active", expiresAt: new Date(Date.now() + 86400000 * 80), lastRefreshedAt: new Date(Date.now() - 86400000 * 10), reconnectsCount: 0, showInIntercom: false, allowChatInitiation: false },
  { id: "4", targetName: "Bob The Builder", targetType: "user", bondType: "professional", formationMethod: "rfid_tap", passkeyStatus: "expired", expiresAt: new Date(Date.now() - 86400000 * 2), lastRefreshedAt: new Date(Date.now() - 86400000 * 62), reconnectsCount: 3, showInIntercom: true, allowChatInitiation: false },
  { id: "5", targetName: "Mom", targetType: "user", bondType: "family", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 10), expiresAt: new Date(Date.now() + 365 * 86400000), reconnectsCount: 5, showInIntercom: true, allowChatInitiation: true },
  { id: "6", targetName: "Design Masters", targetType: "tribe", bondType: "professional", formationMethod: "rfid_tap", passkeyStatus: "needs_refresh", lastRefreshedAt: new Date(Date.now() - 86400000 * 180), expiresAt: new Date(Date.now() + 86400000 * (30)), reconnectsCount: 1, showInIntercom: true, allowChatInitiation: false },
  { id: "7", targetName: "Project Collab", targetType: "tribe", bondType: "collaborator", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 15), expiresAt: new Date(Date.now() + 86400000 * 15), reconnectsCount: 7, showInIntercom: true, allowChatInitiation: false },
  { id: "8", targetName: "Art Patronage Inc.", targetType: "tribe", bondType: "supporter", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 15), expiresAt: new Date(Date.now() + 86400000 * (45)), reconnectsCount: 4, showInIntercom: true, allowChatInitiation: false },
  { id: "9", targetName: "Book Club Collective", targetType: "tribe", bondType: "follower", formationMethod: "rfid_tap", passkeyStatus: "expires_soon", expiresAt: new Date(Date.now() + 86400000 * 12), lastRefreshedAt: new Date(Date.now() - 86400000 * 18), reconnectsCount: 1, showInIntercom: true, allowChatInitiation: true },
  { id: "10", targetName: "John Doe (Dev)", targetType: "user", bondType: "collaborator", formationMethod: "rfid_tap", passkeyStatus: "needs_refresh", lastRefreshedAt: new Date(Date.now() - 86400000 * 90), expiresAt: new Date(Date.now() + 86400000 * (30)), reconnectsCount: 10, showInIntercom: false, allowChatInitiation: false },
  { id: "11", targetName: "Charlie Chaplin", targetType: "user", bondType: "friend", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 5), expiresAt: new Date(Date.now() + 86400000 * (25)), reconnectsCount: 2, showInIntercom: true, allowChatInitiation: true },
  { id: "12", targetName: "David Copperfield", targetType: "user", bondType: "collaborator", formationMethod: "digital_introduction", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 2), expiresAt: new Date(Date.now() + 86400000 * (28)), reconnectsCount: 0, showInIntercom: true, allowChatInitiation: true },
  { id: "13", targetName: "Emily Elephant", targetType: "user", bondType: "professional", formationMethod: "rfid_tap", passkeyStatus: "expires_soon", expiresAt: new Date(Date.now() + 86400000 * 3), lastRefreshedAt: new Date(Date.now() - 86400000 * 27), reconnectsCount: 1, showInIntercom: false, allowChatInitiation: true },
  { id: "14", targetName: "Fiona Fox", targetType: "user", bondType: "follower", formationMethod: "virtual_request", passkeyStatus: "active", lastRefreshedAt: new Date(Date.now() - 86400000 * 10), expiresAt: new Date(Date.now() + 86400000 * (20)), reconnectsCount: 0, showInIntercom: true, allowChatInitiation: true },
  { id: "15", targetName: "George Gorilla", targetType: "user", bondType: "friend", formationMethod: "rfid_tap", passkeyStatus: "expired", expiresAt: new Date(Date.now() - 86400000 * 5), lastRefreshedAt: new Date(Date.now() - 86400000 * 35), reconnectsCount: 5, showInIntercom: true, allowChatInitiation: false },
];


const MAX_FAMILY_BONDS = 25;
const DEFAULT_ITEMS_PER_PAGE = 8;

const getBondTypeDisplay = (bondType: BondType): string => {
  switch (bondType) {
    case "family": return "Family";
    case "friend": return "Friend";
    case "professional": return "Professional";
    case "collaborator": return "Collaborator";
    case "follower": return "Follower";
    case "supporter": return "Supporter";
    default:
      const exhaustiveCheck: never = bondType;
      return exhaustiveCheck;
  }
};

const getBondTypeBadgeClasses = (bondType: BondType): string => {
  switch (bondType) {
    case "family": return "border-transparent bg-pink-500 text-white hover:bg-pink-600";
    case "friend": return "border-transparent bg-orange-500 text-white hover:bg-orange-600";
    case "professional": return "border-transparent bg-sky-600 text-white hover:bg-sky-700";
    case "collaborator": return "border-transparent bg-indigo-500 text-white hover:bg-indigo-600";
    case "follower": return "border-transparent bg-teal-500 text-white hover:bg-teal-600";
    case "supporter": return "border-transparent bg-emerald-500 text-white hover:bg-emerald-600";
    default:
      const _exhaustiveCheck: never = bondType;
      return "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80";
  }
};

const PasskeyStatusIcon: React.FC<{ status: Bond["passkeyStatus"] }> = ({ status }) => {
  let icon, tooltipText;

  switch (status) {
    case "active":
      icon = <CheckCircle2 className="h-5 w-5 text-accent" />;
      tooltipText = "Passkey is active and secure.";
      break;
    case "expires_soon":
      icon = <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      tooltipText = "Passkey is expiring soon. Consider refreshing.";
      break;
    case "expired":
      icon = <XCircle className="h-5 w-5 text-destructive" />;
      tooltipText = "Passkey has expired. Please refresh.";
      break;
    case "needs_refresh":
      icon = <Info className="h-5 w-5 text-primary" />;
      tooltipText = "Passkey needs to be refreshed for optimal security.";
      break;
    default:
      icon = <Info className="h-5 w-5 text-muted-foreground" />;
      tooltipText = "Unknown passkey status.";
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center justify-center">{icon}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const ConnectVibeIcon: React.FC<{ bond: Bond }> = ({ bond }) => {
  let iconElement: React.ReactNode;
  let tooltipText: string;

  if (bond.passkeyStatus === "expired") {
    iconElement = <GhostIcon className="h-6 w-6 text-muted-foreground" />;
    tooltipText = "Bond expired";
  } else if (bond.bondType === "family") {
    iconElement = <Heart className="h-6 w-6 text-pink-500 fill-pink-500" />;
    tooltipText = "Family Bond Vibe";
  } else {
    if (bond.reconnectsCount <= 2) {
      iconElement = <Meh className="h-6 w-6 text-muted-foreground" />;
      tooltipText = "Connection active";
    } else if (bond.reconnectsCount <= 6) {
      iconElement = <Smile className="h-6 w-6 text-primary" />;
      tooltipText = "Good connection vibe";
    } else {
      iconElement = <SmilePlus className="h-6 w-6 text-accent" />;
      tooltipText = "Strong connection vibe";
    }
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center justify-center">{iconElement}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};


export default function BondsPage() {
  const [bonds, setBonds] = useState<Bond[] | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedBondForSettings, setSelectedBondForSettings] = useState<Bond | null>(null);
  const [isIntroductionDialogOpen, setIsIntroductionDialogOpen] = useState(false);
  const [bondToIntroduceFrom, setBondToIntroduceFrom] = useState<Bond | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);


  useEffect(() => {
    setBonds(generateInitialBondsData());
  }, []);

  const familyBondsCount = bonds ? bonds.filter(b => b.bondType === "family").length : 0;

  const formatDate = (date: Date) => {
    if (!date) return "N/A";
    return date.toLocaleDateString();
  };

  const handleRefreshBond = (bondId: string) => {
    setBonds(prevBonds => prevBonds ? prevBonds.map(bond =>
      bond.id === bondId ? {
        ...bond,
        passkeyStatus: "active",
        lastRefreshedAt: new Date(),
        expiresAt: new Date(Date.now() + (bond.bondType === 'family' ? 365 : 30) * 86400000),
        reconnectsCount: (bond.reconnectsCount || 0) + 1,
      } : bond
    ) : null);
  };

  const handleRevokeBond = (bondId: string) => {
    setBonds(prevBonds => prevBonds ? prevBonds.filter(bond => bond.id !== bondId) : null);
  };

  const handleUpgradeToFamilyBond = (bondId: string) => {
    if (familyBondsCount >= MAX_FAMILY_BONDS) {
      alert("Maximum number of family bonds reached.");
      return;
    }
    setBonds(prevBonds => prevBonds ? prevBonds.map(bond =>
      (bond.id === bondId && bond.targetType === 'user') ? {
        ...bond,
        bondType: "family",
        passkeyStatus: "active",
        lastRefreshedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 86400000),
        reconnectsCount: (bond.reconnectsCount || 0) + 1,
      } : bond
    ) : null);
  };

  const handleToggleShowInIntercom = (bondId: string, checked: boolean) => {
    setBonds(prevBonds => prevBonds ? prevBonds.map(bond =>
      bond.id === bondId ? { ...bond, showInIntercom: checked } : bond
    ) : null);
  };

  const handleBlockBond = (bondId: string, targetName: string) => {
    console.log(`Block action initiated for bond ID: ${bondId}, Target: ${targetName}`);
    alert(`Simulating block for ${targetName}. In a real app, this bond might be hidden or marked as blocked.`);
  };

  const handleStartChat = (bondId: string, targetName: string) => {
    console.log(`Start chat action initiated for bond ID: ${bondId}, Target: ${targetName}`);
    alert(`Simulating start chat with ${targetName}. In a real app, this would navigate to the chat interface.`);
  };

  const handleOpenBondSettings = (bond: Bond) => {
    setSelectedBondForSettings(bond);
    setIsSettingsModalOpen(true);
  };

  const handleSaveBondSettings = (updatedBond: Bond) => {
    setBonds(prevBonds => prevBonds ? prevBonds.map(b => b.id === updatedBond.id ? updatedBond : b) : null);
  };

  const handleInitiateIntroduction = (bond: Bond) => {
    setBondToIntroduceFrom(bond);
    setIsIntroductionDialogOpen(true);
  };

  const handleConfirmIntroduction = (bondToIntroduceTo: Bond) => {
    if (bondToIntroduceFrom) {
        console.log(`User confirmed introduction: ${bondToIntroduceFrom.targetName} to ${bondToIntroduceTo.targetName}`);
        alert(`Simulating introduction of ${bondToIntroduceFrom.targetName} to ${bondToIntroduceTo.targetName}.`);
    }
    setIsIntroductionDialogOpen(false);
    setBondToIntroduceFrom(null);
  };

  const calculateTimeProgress = (bond: Bond): number => {
    if (bond.passkeyStatus === 'expired') return 0;
    if (!(bond.expiresAt instanceof Date) || !(bond.lastRefreshedAt instanceof Date) || isNaN(bond.expiresAt.getTime()) || isNaN(bond.lastRefreshedAt.getTime())) {
        return 0;
    }

    const now = Date.now();
    const expiresAtTime = bond.expiresAt.getTime();
    const lastRefreshedAtTime = bond.lastRefreshedAt.getTime();

    if (expiresAtTime <= now) return 0;

    const totalPlannedDuration = expiresAtTime - lastRefreshedAtTime;

    if (totalPlannedDuration <= 0) {
        return expiresAtTime > now ? 100 : 0;
    }

    const timeLeft = expiresAtTime - now;
    const progressPercent = (timeLeft / totalPlannedDuration) * 100;

    return Math.max(0, Math.min(100, progressPercent));
  };

  const filteredBonds = useMemo(() => {
    if (!bonds) return [];
    return bonds.filter(bond =>
      bond.targetName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [bonds, searchTerm]);

  const totalPages = Math.ceil(filteredBonds.length / itemsPerPage);
  const paginatedBonds = useMemo(() => {
    return filteredBonds.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredBonds, currentPage, itemsPerPage]);
  

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setCurrentPage(1); 
  };
  
  const handleClearSearch = () => {
    setSearchTerm("");
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };


  return (
    <div className="space-y-8">
      <header className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
            <Link2 className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Manage Bonds</h1>
        </div>
        <p className="text-lg text-muted-foreground mt-1">
          Oversee your connections, manage passkey status, and utilize your family bonds.
        </p>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <HeartHandshake className="h-6 w-6 text-pink-500" />
            <CardTitle className="tracking-normal">Family Bond Capacity</CardTitle>
          </div>
          <CardDescription>
            You have {familyBondsCount} out of {MAX_FAMILY_BONDS} family bonds currently active. Family bonds are for user-to-user connections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={(familyBondsCount / MAX_FAMILY_BONDS) * 100} className="w-full" />
        </CardContent>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="tracking-normal">Current Bonds</CardTitle>
              <CardDescription>A list of your active and expired bonds. Toggle visibility in your Intercom feed.</CardDescription>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={searchTerm ? "secondary" : "outline"}>
                  <FilterIcon className="mr-2 h-4 w-4" /> Filter & View Options
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 space-y-4 p-4">
                <div className="space-y-2">
                  <Label htmlFor="bond-search-input">Search by Name</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="bond-search-input"
                        type="search"
                        placeholder="Search bonds..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                        className="pl-8 w-full"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="items-per-page-select">Items per Page</Label>
                  <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
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
              <Button variant="ghost" size="icon" className="ml-1 h-5 w-5 hover:bg-transparent" onClick={handleClearSearch}>
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
                  <TableHead className="w-[50px] hidden sm:table-cell"></TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Passkey Status</TableHead>
                  <TableHead className="text-center hidden md:table-cell">Connect Vibe</TableHead>
                  <TableHead className="hidden lg:table-cell">Expires</TableHead>
                  <TableHead>Intercom Feed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedBonds.map((bond) => {
                  const timeBasedProgress = calculateTimeProgress(bond);
                  const canUpgradeToFamily = bond.bondType !== "family" && bond.targetType === "user" && familyBondsCount < MAX_FAMILY_BONDS;
                  const canStartChat = bond.targetType === 'user' && bond.allowChatInitiation !== false;

                  return (
                  <TableRow key={bond.id} className="hover:bg-muted/50">
                    <TableCell className="hidden sm:table-cell">
                      {bond.targetType === 'user' ? <User className="h-6 w-6 text-muted-foreground" /> : <Users className="h-6 w-6 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="font-medium">{bond.targetName}</TableCell>
                    <TableCell>
                      <Badge className={cn(getBondTypeBadgeClasses(bond.bondType), "whitespace-nowrap")}>
                        {getBondTypeDisplay(bond.bondType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <PasskeyStatusIcon status={bond.passkeyStatus} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center">
                       <ConnectVibeIcon bond={bond} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {bond.passkeyStatus === "expired" ? `Expired: ${formatDate(bond.expiresAt)}` :
                       `Expires: ${formatDate(bond.expiresAt)}`}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`intercom-switch-${bond.id}`}
                          checked={!!bond.showInIntercom}
                          onCheckedChange={(checked) => handleToggleShowInIntercom(bond.id, checked)}
                          aria-label="Show in Intercom feed"
                        />
                         <Rss className={`h-4 w-4 ${bond.showInIntercom ? 'text-accent' : 'text-muted-foreground'}`} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                              onClick={() => handleRefreshBond(bond.id)}
                              disabled={bond.passkeyStatus === 'active' && timeBasedProgress > 90 && bond.bondType !== 'family'}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                          </DropdownMenuItem>

                          {bond.targetType === 'tribe' ? (
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <DropdownMenuItem
                                      onClick={() => { /* This onClick won't be called due to disabled */ }}
                                      disabled={true}
                                      className="cursor-not-allowed"
                                    >
                                      <MessageSquare className="mr-2 h-4 w-4" /> Start Chat
                                    </DropdownMenuItem>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Tribes cannot be chatted with directly.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleStartChat(bond.id, bond.targetName)}
                              disabled={!canStartChat}
                            >
                              <MessageSquare className="mr-2 h-4 w-4" /> Start Chat
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem
                            onClick={() => handleInitiateIntroduction(bond)}
                            disabled={bond.targetType !== 'user'}
                          >
                            <Share2 className="mr-2 h-4 w-4" /> Introduce To...
                          </DropdownMenuItem>

                          <DropdownMenuItem
                              onClick={() => { if(canUpgradeToFamily) handleUpgradeToFamilyBond(bond.id);}}
                              disabled={!canUpgradeToFamily}
                          >
                              <HeartHandshake className="mr-2 h-4 w-4 text-pink-500" /> Upgrade to Family
                          </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => handleOpenBondSettings(bond)}>
                              <Settings className="mr-2 h-4 w-4" /> Bond Settings
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleBlockBond(bond.id, bond.targetName)}
                            className="text-destructive hover:!bg-destructive/10 hover:!text-destructive"
                          >
                            <Ban className="mr-2 h-4 w-4" /> Block
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRevokeBond(bond.id)} className="text-destructive hover:!bg-destructive/10 hover:!text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Revoke Bond
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          )}
        </CardContent>
         <CardFooter className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t">
            <p className="text-xs text-muted-foreground flex-1 text-center sm:text-left mb-4 sm:mb-0">
                The "Connect Vibe" column shows an icon representing the bond's current state. Hover for details. Use the <Rss className="inline h-3 w-3 text-accent"/> toggle to control Intercom feed updates.
            </p>
            {totalPages > 1 && (
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreviousPage}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages}
                    >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            )}
        </CardFooter>
      </Card>
      {selectedBondForSettings && (
        <BondSettingsDialog
          isOpen={isSettingsModalOpen}
          onOpenChange={setIsSettingsModalOpen}
          bond={selectedBondForSettings}
          onSave={handleSaveBondSettings}
        />
      )}
      {bondToIntroduceFrom && bonds && (
         <IntroductionDialog
            isOpen={isIntroductionDialogOpen}
            onOpenChange={setIsIntroductionDialogOpen}
            introducingBond={bondToIntroduceFrom}
            allBonds={bonds}
            onConfirmIntroduction={handleConfirmIntroduction}
        />
      )}
    </div>
  );
}
