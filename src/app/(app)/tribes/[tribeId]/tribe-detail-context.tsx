"use client";

import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { getTribeById, getTribeMembers, leaveTribe, getMyTribeIds, requestToJoinTribe, checkTribeAccess } from '@/lib/actions/tribe-actions';
import { getEventsForTribe } from '@/lib/actions/event-actions';
import { getPostsForTribe, promotePostToMoods, repost, createTribePost, getActiveReportedPostIds, getActiveReportsForTribe, reportPost, reportComment, toggleVibe, createComment, deleteOwnPost } from '@/lib/actions/content-actions';
import type { Tribe, Event, TribePost, ReportedPost, TribeMember, DiscussionComment } from '@/lib/types';
import type { PostFormValues } from '@/components/dialogs/create-post-dialog';
import type { TribeAccessLevel } from '@/lib/services/tribe-auth';
import { TRIBE_0_ID } from '@/lib/constants';
import { uploadFile } from '@/lib/upload';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CommentContext {
  postId: string;
  postTitle?: string;
  parentCommentId?: string;
  parentAuthorName?: string;
}

interface DialogState<T> {
  open: boolean;
  target: T;
}

interface TribeDetailState {
  tribe: Tribe | null;
  posts: TribePost[];
  events: Event[];
  members: TribeMember[];
  reportedPostIds: Set<string>;
  reportedPosts: ReportedPost[];
  promotedPostIds: Set<string>;
  isMember: boolean;
  isLoading: boolean;
  isJoining: boolean;
  reportReason: string;

  promoteDialog: DialogState<TribePost | null>;
  reportPostDialog: DialogState<TribePost | null>;
  reportCommentDialog: DialogState<DiscussionComment | null>;
  commentDialog: DialogState<CommentContext | null>;
  repostDialog: DialogState<TribePost | null>;
  createPostDialog: { open: boolean };
}

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_JOINING'; payload: boolean }
  | { type: 'SET_TRIBE_DATA'; payload: {
      tribe: Tribe; members: TribeMember[]; posts: TribePost[];
      reportedPostIds: Set<string>; reportedPosts: ReportedPost[];
      events: Event[]; isMember: boolean;
    }}
  | { type: 'SET_POSTS'; payload: TribePost[] }
  | { type: 'ADD_PROMOTED_POST'; payload: string }
  | { type: 'SET_REPORT_REASON'; payload: string }
  | { type: 'OPEN_PROMOTE'; payload: TribePost }
  | { type: 'CLOSE_PROMOTE' }
  | { type: 'OPEN_REPORT_POST'; payload: TribePost }
  | { type: 'CLOSE_REPORT_POST' }
  | { type: 'OPEN_REPORT_COMMENT'; payload: DiscussionComment }
  | { type: 'CLOSE_REPORT_COMMENT' }
  | { type: 'OPEN_COMMENT'; payload: CommentContext }
  | { type: 'CLOSE_COMMENT' }
  | { type: 'OPEN_REPOST'; payload: TribePost }
  | { type: 'CLOSE_REPOST' }
  | { type: 'OPEN_CREATE_POST' }
  | { type: 'CLOSE_CREATE_POST' };

// ─── Reducer ─────────────────────────────────────────────────────────────────

const initialState: TribeDetailState = {
  tribe: null, posts: [], events: [], members: [],
  reportedPostIds: new Set(), reportedPosts: [], promotedPostIds: new Set(),
  isMember: false, isLoading: true, isJoining: false, reportReason: '',
  promoteDialog: { open: false, target: null },
  reportPostDialog: { open: false, target: null },
  reportCommentDialog: { open: false, target: null },
  commentDialog: { open: false, target: null },
  repostDialog: { open: false, target: null },
  createPostDialog: { open: false },
};

function reducer(state: TribeDetailState, action: Action): TribeDetailState {
  switch (action.type) {
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_JOINING': return { ...state, isJoining: action.payload };
    case 'SET_TRIBE_DATA': return { ...state, ...action.payload, isLoading: false };
    case 'SET_POSTS': return { ...state, posts: action.payload };
    case 'ADD_PROMOTED_POST':
      return { ...state, promotedPostIds: new Set(state.promotedPostIds).add(action.payload) };
    case 'SET_REPORT_REASON': return { ...state, reportReason: action.payload };
    case 'OPEN_PROMOTE': return { ...state, promoteDialog: { open: true, target: action.payload } };
    case 'CLOSE_PROMOTE': return { ...state, promoteDialog: { open: false, target: null } };
    case 'OPEN_REPORT_POST': return { ...state, reportPostDialog: { open: true, target: action.payload }, reportReason: '' };
    case 'CLOSE_REPORT_POST': return { ...state, reportPostDialog: { open: false, target: null }, reportReason: '' };
    case 'OPEN_REPORT_COMMENT': return { ...state, reportCommentDialog: { open: true, target: action.payload }, reportReason: '' };
    case 'CLOSE_REPORT_COMMENT': return { ...state, reportCommentDialog: { open: false, target: null }, reportReason: '' };
    case 'OPEN_COMMENT': return { ...state, commentDialog: { open: true, target: action.payload } };
    case 'CLOSE_COMMENT': return { ...state, commentDialog: { open: false, target: null } };
    case 'OPEN_REPOST': return { ...state, repostDialog: { open: true, target: action.payload } };
    case 'CLOSE_REPOST': return { ...state, repostDialog: { open: false, target: null } };
    case 'OPEN_CREATE_POST': return { ...state, createPostDialog: { open: true } };
    case 'CLOSE_CREATE_POST': return { ...state, createPostDialog: { open: false } };
    default: return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface TribeDetailContextValue {
  state: TribeDetailState;
  dispatch: React.Dispatch<Action>;
  tribeId: string;
  isLoggedIn: boolean;
  currentUserId: string | undefined;
  isTribeAdmin: boolean;
  isTribeSpeaker: boolean;

  // Actions
  syncAllData: () => Promise<void>;
  handleJoinTribe: () => Promise<void>;
  handleOpenPromoteDialog: (post: TribePost) => void;
  handleConfirmPromotion: (postId: string, selectedMoodSlugs: string[]) => Promise<void>;
  handleOpenReportPostDialog: (post: TribePost) => void;
  handleConfirmReportPost: () => Promise<void>;
  handleOpenReportCommentDialog: (comment: DiscussionComment) => void;
  handleConfirmReportComment: () => Promise<void>;
  handleOpenRepostDialog: (post: TribePost) => void;
  handleConfirmRepost: (editedContent: string) => Promise<void>;
  handleOpenCommentDialog: (context: CommentContext) => void;
  handleConfirmComment: (content: string) => Promise<void>;
  handleCreatePost: (values: PostFormValues) => Promise<void>;
  handleDeletePost: (postId: string) => Promise<void>;
  handleLeaveTribe: () => Promise<void>;
}

const TribeDetailContext = createContext<TribeDetailContextValue | null>(null);

export function useTribeDetail() {
  const ctx = useContext(TribeDetailContext);
  if (!ctx) throw new Error('useTribeDetail must be used within TribeDetailProvider');
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function TribeDetailProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const tribeId = params.tribeId as string;
  const { toast } = useToast();
  const { role, user } = useUser();
  const isLoggedIn = !!role;
  const currentUserId = user?.id;

  // Tribe access level — derived from server-side check, NOT global role
  const [tribeAccessLevel, setTribeAccessLevel] = React.useState<TribeAccessLevel>('guest');
  const isTribeAdmin = tribeAccessLevel === 'platform_admin' || tribeAccessLevel === 'founder';
  const isTribeSpeaker = isTribeAdmin || tribeAccessLevel === 'speaker';

  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Data Sync ──
  const syncAllData = useCallback(async () => {
    if (!tribeId) return;
    dispatch({ type: 'SET_LOADING', payload: true });

    const myTribeIds = await getMyTribeIds();
    const memberOfTribe = myTribeIds.includes(tribeId) || tribeId === TRIBE_0_ID;

    // Resolve tribe access level from server
    const accessLevel = await checkTribeAccess(tribeId);
    setTribeAccessLevel(accessLevel);

    const [tribeData, membersData, postsData, reportedIds, tribeReports] = await Promise.all([
      getTribeById(tribeId),
      getTribeMembers(tribeId),
      getPostsForTribe(tribeId),
      getActiveReportedPostIds(),
      getActiveReportsForTribe(tribeId),
    ]);

    if (tribeData) {
      const eventsData = await getEventsForTribe(tribeData.name);
      dispatch({
        type: 'SET_TRIBE_DATA',
        payload: {
          tribe: tribeData,
          members: membersData,
          posts: postsData.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
          reportedPostIds: reportedIds,
          reportedPosts: tribeReports.reports,
          events: eventsData.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime()),
          isMember: memberOfTribe,
        },
      });
    } else {
      router.push('/tribes');
    }
  }, [tribeId, router]);

  useEffect(() => { syncAllData(); }, [tribeId, syncAllData]);
  useEffect(() => {
    window.addEventListener('focus', syncAllData);
    return () => window.removeEventListener('focus', syncAllData);
  }, [syncAllData]);

  // ── Handlers ──
  const handleJoinTribe = useCallback(async () => {
    if (!state.tribe) return;
    if (!isLoggedIn) { router.push('/signup'); return; }
    dispatch({ type: 'SET_JOINING', payload: true });
    try {
      const result = await requestToJoinTribe(state.tribe.id);
      if (result === 'pending') {
        toast({ title: 'Request Sent', description: `Your request to join ${state.tribe.name} is pending approval.` });
      } else if (result === 'joined') {
        await syncAllData();
        toast({ title: 'Welcome!', description: `You have successfully joined ${state.tribe.name}.` });
      } else {
        toast({ title: 'Cannot Join', description: `Your request to join ${state.tribe.name} was rejected.`, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to join tribe. Please try again.', variant: 'destructive' });
    } finally {
      dispatch({ type: 'SET_JOINING', payload: false });
    }
  }, [state.tribe, isLoggedIn, router, toast, syncAllData]);

  const handleOpenPromoteDialog = useCallback((post: TribePost) => {
    if (state.promotedPostIds.has(post.id)) {
      toast({ title: 'Already Promoted', description: `"${post.title || 'This post'}" is already in a mood stream.` });
      return;
    }
    dispatch({ type: 'OPEN_PROMOTE', payload: post });
  }, [state.promotedPostIds, toast]);

  const handleConfirmPromotion = useCallback(async (postId: string, selectedMoodSlugs: string[]) => {
    if (!state.promoteDialog.target) return;
    await promotePostToMoods(postId, selectedMoodSlugs);
    dispatch({ type: 'ADD_PROMOTED_POST', payload: postId });
    toast({
      title: 'Post Promoted',
      description: `Post "${state.promoteDialog.target.title || postId}" has been promoted to ${selectedMoodSlugs.length} mood stream(s).`,
    });
    dispatch({ type: 'CLOSE_PROMOTE' });
  }, [state.promoteDialog.target, toast]);

  const handleOpenReportPostDialog = useCallback((post: TribePost) => {
    if (state.reportedPostIds.has(post.id) && !post.isRemoved) {
      toast({ title: 'Already Reported', description: `You or someone else has already reported "${post.title || 'this post'}". An admin will review it.` });
      return;
    }
    dispatch({ type: 'OPEN_REPORT_POST', payload: post });
  }, [state.reportedPostIds, toast]);

  const handleConfirmReportPost = useCallback(async () => {
    if (!state.reportPostDialog.target) return;
    await reportPost({
      postId: state.reportPostDialog.target.id,
      postTitle: state.reportPostDialog.target.title,
      reporterName: user?.name || 'Anonymous',
      reason: state.reportReason.trim() || 'No reason provided.',
    });
    await syncAllData();
    toast({ title: 'Post Reported', description: `Thank you for reporting "${state.reportPostDialog.target.title || 'this post'}". An admin will review it.` });
    dispatch({ type: 'CLOSE_REPORT_POST' });
  }, [state.reportPostDialog.target, state.reportReason, user, toast, syncAllData]);

  const handleOpenReportCommentDialog = useCallback((comment: DiscussionComment) => {
    dispatch({ type: 'OPEN_REPORT_COMMENT', payload: comment });
  }, []);

  const handleConfirmReportComment = useCallback(async () => {
    if (!state.reportCommentDialog.target) return;
    await reportComment({
      commentId: state.reportCommentDialog.target.id,
      commentAuthor: state.reportCommentDialog.target.authorName,
      reason: state.reportReason,
    });
    toast({ title: 'Comment Reported', description: `Thank you for reporting the comment by ${state.reportCommentDialog.target.authorName}. An admin will review it.` });
    dispatch({ type: 'CLOSE_REPORT_COMMENT' });
  }, [state.reportCommentDialog.target, state.reportReason, toast]);

  const handleOpenRepostDialog = useCallback((post: TribePost) => {
    dispatch({ type: 'OPEN_REPOST', payload: post });
  }, []);

  const handleConfirmRepost = useCallback(async (editedContent: string) => {
    if (!state.repostDialog.target || !state.tribe) return;
    await repost(state.repostDialog.target, editedContent);
    syncAllData();
    toast({ title: 'Post Reposted', description: `Your post has been successfully reposted to ${state.tribe.name}.` });
    dispatch({ type: 'CLOSE_REPOST' });
  }, [state.repostDialog.target, state.tribe, toast, syncAllData]);

  const handleOpenCommentDialog = useCallback((context: CommentContext) => {
    dispatch({ type: 'OPEN_COMMENT', payload: context });
  }, []);

  const handleConfirmComment = useCallback(async (content: string) => {
    if (!state.commentDialog.target) return;
    try {
      await createComment(state.commentDialog.target.postId, content, state.commentDialog.target.parentCommentId);
      toast({ title: 'Comment Posted!', description: 'Your comment has been added.' });
      await syncAllData();
    } catch (e: unknown) {
      toast({ title: 'Error', description: ((e instanceof Error) ? e.message : 'An error occurred'), variant: 'destructive' });
    }
  }, [state.commentDialog.target, toast, syncAllData]);

  const handleCreatePost = useCallback(async (values: PostFormValues) => {
    if (!state.tribe) return;
    try {
      // Upload image client-side first (File objects can't be serialized to server actions)
      let imageUrl: string | undefined;
      if (values.image) {
        imageUrl = await uploadFile(values.image, 'posts');
      }
      await createTribePost(state.tribe.id, {
        title: values.title,
        content: values.content,
        imageUrl,
      });
      dispatch({ type: 'CLOSE_CREATE_POST' });
      toast({ title: 'Post Created', description: 'Your post has been published to the tribe feed.' });
      const refreshedPosts = await getPostsForTribe(state.tribe.id);
      dispatch({ type: 'SET_POSTS', payload: refreshedPosts });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') || 'Failed to create post.' });
    }
  }, [state.tribe, toast]);

  const handleLeaveTribe = useCallback(async () => {
    try {
      await leaveTribe(tribeId);
      toast({ title: 'Left Tribe', description: `You have left ${state.tribe?.name}.` });
      router.push('/tribes');
    } catch (e: unknown) {
      toast({ title: 'Error', description: ((e instanceof Error) ? e.message : 'An error occurred'), variant: 'destructive' });
    }
  }, [tribeId, state.tribe, toast, router]);

  const handleDeletePost = useCallback(async (postId: string) => {
    try {
      await deleteOwnPost(postId);
      toast({ title: 'Post Deleted', description: 'Your post has been removed.' });
      const refreshedPosts = await getPostsForTribe(state.tribe!.id);
      dispatch({ type: 'SET_POSTS', payload: refreshedPosts });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') || 'Failed to delete post.' });
    }
  }, [state.tribe, toast]);

  const value = useMemo(() => ({
    state, dispatch, tribeId, isLoggedIn, currentUserId, isTribeAdmin, isTribeSpeaker,
    syncAllData, handleJoinTribe,
    handleOpenPromoteDialog, handleConfirmPromotion,
    handleOpenReportPostDialog, handleConfirmReportPost,
    handleOpenReportCommentDialog, handleConfirmReportComment,
    handleOpenRepostDialog, handleConfirmRepost,
    handleOpenCommentDialog, handleConfirmComment,
    handleCreatePost, handleDeletePost, handleLeaveTribe,
  }), [
    state, tribeId, isLoggedIn, currentUserId, isTribeAdmin, isTribeSpeaker,
    syncAllData, handleJoinTribe,
    handleOpenPromoteDialog, handleConfirmPromotion,
    handleOpenReportPostDialog, handleConfirmReportPost,
    handleOpenReportCommentDialog, handleConfirmReportComment,
    handleOpenRepostDialog, handleConfirmRepost,
    handleOpenCommentDialog, handleConfirmComment,
    handleCreatePost, handleDeletePost, handleLeaveTribe,
  ]);

  return (
    <TribeDetailContext.Provider value={value}>
      {children}
    </TribeDetailContext.Provider>
  );
}
