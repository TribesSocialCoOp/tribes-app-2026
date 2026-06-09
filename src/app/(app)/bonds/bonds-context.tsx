"use client";

import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { useKeySync } from '@/components/providers/key-sync-provider';
import { getBonds, refreshBond, revokeBond, toggleInnerCircle, saveBondSettings, fetchPendingBondRequests, respondToBondRequest, blockUser, sendBondRequest, requestReconnect, respondToReconnect } from '@/lib/actions/bond-actions';
import { getFeatureSummary } from '@/lib/actions/profile-actions';
import type { Bond, BondRequest } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SortableBondKeys = 'targetName' | 'bondType' | 'passkeyStatus' | 'expiresAt';

export interface SortConfig {
  key: SortableBondKeys | null;
  direction: 'ascending' | 'descending';
}

const DEFAULT_ITEMS_PER_PAGE = 8;

interface BondsState {
  bonds: Bond[];
  pendingIncoming: BondRequest[];
  pendingOutgoing: BondRequest[];
  isLoading: boolean;
  respondingTo: string | null;
  searchTerm: string;
  currentPage: number;
  itemsPerPage: number;
  sortConfig: SortConfig;
  settingsDialog: { open: boolean; bond: Bond | null };
  introductionDialog: { open: boolean; bond: Bond | null };
  planName: string;
  maxBondsLimit: number | null; // null = unlimited
}

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_DATA'; payload: { bonds: Bond[]; incoming: BondRequest[]; outgoing: BondRequest[]; planName?: string; maxBondsLimit?: number | null } }
  | { type: 'SET_RESPONDING'; payload: string | null }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_ITEMS_PER_PAGE'; payload: number }
  | { type: 'SET_SORT'; payload: SortConfig }
  | { type: 'UPDATE_BOND'; payload: { id: string; updates: Partial<Bond> } }
  | { type: 'OPEN_SETTINGS'; payload: Bond }
  | { type: 'CLOSE_SETTINGS' }
  | { type: 'OPEN_INTRODUCTION'; payload: Bond }
  | { type: 'CLOSE_INTRODUCTION' };

// ─── Reducer ─────────────────────────────────────────────────────────────────

const initialState: BondsState = {
  bonds: [], pendingIncoming: [], pendingOutgoing: [],
  isLoading: true, respondingTo: null,
  searchTerm: '', currentPage: 1, itemsPerPage: DEFAULT_ITEMS_PER_PAGE,
  sortConfig: { key: null, direction: 'ascending' },
  settingsDialog: { open: false, bond: null },
  introductionDialog: { open: false, bond: null },
  planName: 'Always Free',
  maxBondsLimit: 5,
};

function reducer(state: BondsState, action: Action): BondsState {
  switch (action.type) {
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_DATA': return {
      ...state,
      bonds: action.payload.bonds,
      pendingIncoming: action.payload.incoming,
      pendingOutgoing: action.payload.outgoing,
      planName: action.payload.planName ?? state.planName,
      maxBondsLimit: action.payload.maxBondsLimit !== undefined ? action.payload.maxBondsLimit : state.maxBondsLimit,
      isLoading: false,
    };
    case 'SET_RESPONDING': return { ...state, respondingTo: action.payload };
    case 'SET_SEARCH': return { ...state, searchTerm: action.payload, currentPage: 1 };
    case 'SET_PAGE': return { ...state, currentPage: action.payload };
    case 'SET_ITEMS_PER_PAGE': return { ...state, itemsPerPage: action.payload, currentPage: 1 };
    case 'SET_SORT': return { ...state, sortConfig: action.payload, currentPage: 1 };
    case 'UPDATE_BOND': return {
      ...state,
      bonds: state.bonds.map(b => b.id === action.payload.id ? { ...b, ...action.payload.updates } : b),
    };
    case 'OPEN_SETTINGS': return { ...state, settingsDialog: { open: true, bond: action.payload } };
    case 'CLOSE_SETTINGS': return { ...state, settingsDialog: { open: false, bond: null } };
    case 'OPEN_INTRODUCTION': return { ...state, introductionDialog: { open: true, bond: action.payload } };
    case 'CLOSE_INTRODUCTION': return { ...state, introductionDialog: { open: false, bond: null } };
    default: return state;
  }
}

// ─── Sort helper ─────────────────────────────────────────────────────────────

const passkeySortOrder: Record<Bond["passkeyStatus"], number> = {
  active: 1, fading: 2, dormant: 3, expired: 4,
};

// ─── Derived data ────────────────────────────────────────────────────────────

export function useBondsDerived(state: BondsState) {
  const filteredBonds = useMemo(() => {
    if (!state.bonds) return [];
    return state.bonds.filter(bond =>
      bond.targetName.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
      (bond.pseudonym && bond.pseudonym.toLowerCase().includes(state.searchTerm.toLowerCase())) ||
      (bond.targetPseudonymForMe && bond.targetPseudonymForMe.toLowerCase().includes(state.searchTerm.toLowerCase())) ||
      (bond.tribeAssignedNickname && bond.tribeAssignedNickname.toLowerCase().includes(state.searchTerm.toLowerCase()))
    );
  }, [state.bonds, state.searchTerm]);

  const sortedBonds = useMemo(() => {
    if (!filteredBonds) return [];
    let sortableBonds = [...filteredBonds];
    const { sortConfig } = state;

    if (sortConfig.key === null) {
      sortableBonds.sort((a, b) => {
        const isAEvent = a.keyType === 'event_promo' || a.keyType === 'event_attendee';
        const isBEvent = b.keyType === 'event_promo' || b.keyType === 'event_attendee';
        if (isAEvent && !isBEvent) return -1;
        if (!isAEvent && isBEvent) return 1;
        return a.targetName.localeCompare(b.targetName);
      });
    } else {
      sortableBonds.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Bond];
        const bValue = b[sortConfig.key as keyof Bond];
        let comparison = 0;
        if (aValue === null || aValue === undefined) comparison = 1;
        else if (bValue === null || bValue === undefined) comparison = -1;
        else if (sortConfig.key === 'passkeyStatus') {
          comparison = passkeySortOrder[aValue as Bond["passkeyStatus"]] - passkeySortOrder[bValue as Bond["passkeyStatus"]];
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else if (aValue instanceof Date && bValue instanceof Date) {
          comparison = aValue.getTime() - bValue.getTime();
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          comparison = aValue === bValue ? 0 : aValue ? -1 : 1;
        }
        return sortConfig.direction === 'ascending' ? comparison : comparison * -1;
      });
    }
    return sortableBonds;
  }, [filteredBonds, state.sortConfig]);

  const totalPages = Math.ceil(sortedBonds.length / state.itemsPerPage);
  const paginatedBonds = useMemo(() => {
    return sortedBonds.slice((state.currentPage - 1) * state.itemsPerPage, state.currentPage * state.itemsPerPage);
  }, [sortedBonds, state.currentPage, state.itemsPerPage]);

  return { filteredBonds, sortedBonds, totalPages, paginatedBonds };
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface BondsContextValue {
  state: BondsState;
  dispatch: React.Dispatch<Action>;
  derived: ReturnType<typeof useBondsDerived>;
  userRole: string | null | undefined;
  maxInnerCircleBonds: number;
  innerCircleCount: number;

  reloadData: () => Promise<void>;
  handleRefreshBond: (bondId: string) => Promise<void>;
  handleRevokeBond: (bondId: string) => Promise<void>;
  handleToggleInnerCircle: (bondId: string) => Promise<void>;
  handleToggleShowInIntercom: (bondId: string, checked: boolean) => void;
  handleBlockBond: (bondId: string, targetName: string) => void;
  handleSaveBondSettings: (updatedBond: Bond) => Promise<void>;
  handleConfirmIntroduction: (bondToIntroduceTo: Bond) => void;
  calculateTimeProgress: (bond: Bond) => number;
  handleSort: (key: SortableBondKeys) => void;
  handleRespondToRequest: (reqId: string, accept: boolean, fromUserName: string) => Promise<void>;
  handleRequestReconnect: (bondId: string) => Promise<void>;
  handleRespondToReconnect: (bondId: string, accept: boolean) => Promise<void>;
}

const BondsContext = createContext<BondsContextValue | null>(null);

export function useBonds() {
  const ctx = useContext(BondsContext);
  if (!ctx) throw new Error('useBonds must be used within BondsProvider');
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function BondsProvider({ children }: { children: React.ReactNode }) {
  const { role: userRole } = useUser();
  const { toast } = useToast();
  const { triggerSync } = useKeySync();
  const [state, dispatch] = useReducer(reducer, initialState);

  const derived = useBondsDerived(state);

  const maxInnerCircleBonds = state.maxBondsLimit ?? Infinity;
  const innerCircleCount = state.bonds ? state.bonds.filter(b => b.innerCircle).length : 0;

  const reloadData = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    const [fetchedBonds, pendingData, featureSummary] = await Promise.all([
      getBonds(),
      fetchPendingBondRequests(),
      getFeatureSummary(),
    ]);
    dispatch({
      type: 'SET_DATA',
      payload: {
        bonds: fetchedBonds,
        incoming: pendingData.incoming,
        outgoing: pendingData.outgoing,
        planName: featureSummary?.planName,
        maxBondsLimit: featureSummary?.bonds.limit ?? null,
      },
    });
  }, []);

  useEffect(() => { reloadData(); }, [reloadData]);

  const handleRefreshBond = useCallback(async (bondId: string) => {
    await refreshBond(bondId);
    reloadData();
    toast({ title: "Bond Refreshed", description: "The bond's passkey has been successfully refreshed." });
  }, [reloadData, toast]);

  const handleRevokeBond = useCallback(async (bondId: string) => {
    await revokeBond(bondId);
    reloadData();
    toast({ title: "Bond Revoked", description: "The bond has been removed.", variant: "destructive" });
  }, [reloadData, toast]);

  const handleToggleInnerCircle = useCallback(async (bondId: string) => {
    const result = await toggleInnerCircle(bondId);
    reloadData();
    toast({
      title: result ? "Added to Inner Circle" : "Removed from Inner Circle",
      description: result
        ? "This person is now in your Inner Circle with a 365-day bond."
        : "This person has been removed from your Inner Circle.",
    });
  }, [reloadData, toast]);

  const handleToggleShowInIntercom = useCallback((bondId: string, checked: boolean) => {
    // Optimistic update
    dispatch({ type: 'UPDATE_BOND', payload: { id: bondId, updates: { showInIntercom: checked } } });
    // Persist to DB: find the bond, update showInIntercom, and save
    const bond = state.bonds.find(b => b.id === bondId);
    if (bond) {
      saveBondSettings({ ...bond, showInIntercom: checked }).catch(() => {
        // Revert on failure
        dispatch({ type: 'UPDATE_BOND', payload: { id: bondId, updates: { showInIntercom: !checked } } });
        toast({ title: 'Error', description: 'Failed to save intercom preference.', variant: 'destructive' });
      });
    }
  }, [state.bonds, toast]);

  const handleBlockBond = useCallback(async (bondId: string, targetName: string) => {
    const bond = state.bonds.find(b => b.id === bondId);
    if (!bond || !bond.targetId || bond.targetType !== 'user') {
      toast({ title: 'Error', description: 'Cannot block this bond target.', variant: 'destructive' });
      return;
    }
    try {
      await blockUser(bond.targetId, `Blocked from bonds page`);
      toast({ title: "Bond Blocked", description: `You have blocked all communication with ${targetName}.`, variant: "destructive" });
      await reloadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Block failed';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  }, [state.bonds, toast, reloadData]);

  const handleSaveBondSettings = useCallback(async (updatedBond: Bond) => {
    await saveBondSettings(updatedBond);
    reloadData();
    toast({ title: "Settings Saved", description: `Your settings for the bond with ${updatedBond.targetName} have been updated.` });
  }, [reloadData, toast]);

  const handleConfirmIntroduction = useCallback(async (bondToIntroduceTo: Bond) => {
    const from = state.introductionDialog.bond;
    if (!from || !bondToIntroduceTo.targetId) {
      dispatch({ type: 'CLOSE_INTRODUCTION' });
      return;
    }
    try {
      await sendBondRequest(
        bondToIntroduceTo.targetId,
        `Introduction: I'd like to introduce you to ${from.targetName}.`,
        'digital_introduction'
      );
      toast({ title: "Introduction Sent", description: `An introduction request has been sent to ${bondToIntroduceTo.targetName} on behalf of ${from.targetName}.` });
      triggerSync(); // Enter fast window so we're primed when the peer accepts
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send introduction';
      toast({ variant: 'destructive', title: 'Introduction Failed', description: msg });
    }
    dispatch({ type: 'CLOSE_INTRODUCTION' });
  }, [state.introductionDialog.bond, toast, triggerSync]);

  const calculateTimeProgress = useCallback((bond: Bond): number => {
    if (bond.passkeyStatus === 'expired' || bond.passkeyStatus === 'dormant') return 0;
    if (!(bond.expiresAt instanceof Date) || !(bond.lastRefreshedAt instanceof Date) || isNaN(bond.expiresAt.getTime()) || isNaN(bond.lastRefreshedAt.getTime())) return 0;
    const now = Date.now();
    const expiresAtTime = bond.expiresAt.getTime();
    const lastRefreshedAtTime = bond.lastRefreshedAt.getTime();
    if (expiresAtTime <= now) return 0;
    const totalPlannedDuration = expiresAtTime - lastRefreshedAtTime;
    if (totalPlannedDuration <= 0) return expiresAtTime > now ? 100 : 0;
    const timeLeft = expiresAtTime - now;
    return Math.max(0, Math.min(100, (timeLeft / totalPlannedDuration) * 100));
  }, []);

  const handleSort = useCallback((keyToSort: SortableBondKeys) => {
    dispatch({
      type: 'SET_SORT', payload: state.sortConfig.key === keyToSort && state.sortConfig.direction === 'ascending'
        ? { key: keyToSort, direction: 'descending' }
        : { key: keyToSort, direction: 'ascending' }
    });
  }, [state.sortConfig]);

  const handleRespondToRequest = useCallback(async (reqId: string, accept: boolean, fromUserName: string) => {
    dispatch({ type: 'SET_RESPONDING', payload: reqId });
    try {
      await respondToBondRequest(reqId, accept);
      toast({
        title: accept ? 'Bond Accepted!' : 'Request Declined',
        description: accept ? `You are now bonded with ${fromUserName}.` : `Bond request from ${fromUserName} has been declined.`,
      });
      await reloadData();
      if (accept) {
        triggerSync(); // Kick off Phase A immediately so bond keys are ready for chat
      }
    } catch (e: unknown) {
      toast({ title: 'Error', description: ((e instanceof Error) ? e.message : 'An error occurred'), variant: 'destructive' });
    } finally {
      dispatch({ type: 'SET_RESPONDING', payload: null });
    }
  }, [reloadData, toast, triggerSync]);

  const handleRequestReconnect = useCallback(async (bondId: string) => {
    try {
      await requestReconnect(bondId);
      toast({ title: 'Reconnect Sent', description: 'A reconnect request has been sent. Waiting for their approval.' });
      await reloadData();
    } catch (e: unknown) {
      toast({ title: 'Error', description: ((e instanceof Error) ? e.message : 'Failed to send reconnect request'), variant: 'destructive' });
    }
  }, [reloadData, toast]);

  const handleRespondToReconnect = useCallback(async (bondId: string, accept: boolean) => {
    try {
      await respondToReconnect(bondId, accept);
      toast({
        title: accept ? 'Reconnected!' : 'Reconnect Declined',
        description: accept ? 'Your bond has been restored.' : 'The reconnect request has been declined.',
      });
      await reloadData();
    } catch (e: unknown) {
      toast({ title: 'Error', description: ((e instanceof Error) ? e.message : 'An error occurred'), variant: 'destructive' });
    }
  }, [reloadData, toast]);

  const value = useMemo(() => ({
    state, dispatch, derived, userRole, maxInnerCircleBonds, innerCircleCount,
    reloadData, handleRefreshBond, handleRevokeBond, handleToggleInnerCircle,
    handleToggleShowInIntercom, handleBlockBond, handleSaveBondSettings,
    handleConfirmIntroduction, calculateTimeProgress, handleSort, handleRespondToRequest,
    handleRequestReconnect, handleRespondToReconnect,
  }), [
    state, derived, userRole, maxInnerCircleBonds, innerCircleCount,
    reloadData, handleRefreshBond, handleRevokeBond, handleToggleInnerCircle,
    handleToggleShowInIntercom, handleBlockBond, handleSaveBondSettings,
    handleConfirmIntroduction, calculateTimeProgress, handleSort, handleRespondToRequest,
    handleRequestReconnect, handleRespondToReconnect,
  ]);

  return (
    <BondsContext.Provider value={value}>
      {children}
    </BondsContext.Provider>
  );
}
