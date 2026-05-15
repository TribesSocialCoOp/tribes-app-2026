"use client";

import React from 'react';
import { PromotePostDialog } from '@/components/dialogs/boost-post-dialog';
import { ReportPostDialog } from '@/components/dialogs/report-post-dialog';
import { RepostDialog } from '@/components/dialogs/repost-dialog';
import { ReportCommentDialog } from '@/components/dialogs/report-comment-dialog';
import { CommentDialog } from '@/components/dialogs/comment-dialog';
import { CreatePostDialog } from '@/components/dialogs/create-post-dialog';
import { JoinTribeDialog } from '@/components/dialogs/join-tribe-dialog';
import { EditPostDialog } from '@/components/dialogs/edit-post-dialog';
import { ModRemovalDialog } from '@/components/dialogs/mod-removal-dialog';
import { useTribeDetail } from './tribe-detail-context';

export function TribeDialogOrchestrator() {
  const {
    state, dispatch,
    handleConfirmPromotion, handleConfirmReportPost,
    handleConfirmReportComment, handleConfirmRepost,
    handleConfirmComment, handleCreatePost, handleConfirmJoinTribe,
    handleConfirmModRemove,
    syncAllData,
  } = useTribeDetail();

  const { tribe, promoteDialog, reportPostDialog, reportCommentDialog, repostDialog, editPostDialog, modRemoveDialog, commentDialog, createPostDialog, joinTribeDialog, reportReason, isJoining } = state;

  return (
    <>
      {promoteDialog.target && tribe && (
        <PromotePostDialog
          isOpen={promoteDialog.open}
          onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_PROMOTE' })}
          post={promoteDialog.target}
          onConfirmPromotion={handleConfirmPromotion}
          tribeMoodSlugs={tribe.moods || []}
        />
      )}
      {reportPostDialog.target && (
        <ReportPostDialog
          isOpen={reportPostDialog.open}
          onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_REPORT_POST' })}
          post={reportPostDialog.target}
          reportReason={reportReason}
          setReportReason={(reason: string) => dispatch({ type: 'SET_REPORT_REASON', payload: reason })}
          onConfirmReport={handleConfirmReportPost}
        />
      )}
      {reportCommentDialog.target && (
        <ReportCommentDialog
          isOpen={reportCommentDialog.open}
          onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_REPORT_COMMENT' })}
          comment={reportCommentDialog.target}
          reportReason={reportReason}
          setReportReason={(reason: string) => dispatch({ type: 'SET_REPORT_REASON', payload: reason })}
          onConfirmReport={handleConfirmReportComment}
        />
      )}
      {repostDialog.target && tribe && (
        <RepostDialog
          isOpen={repostDialog.open}
          onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_REPOST' })}
          postToRepost={repostDialog.target}
          onConfirmRepost={handleConfirmRepost}
        />
      )}
      <CommentDialog
        isOpen={commentDialog.open}
        onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_COMMENT' })}
        onConfirmComment={handleConfirmComment}
        postTitle={commentDialog.target?.postTitle}
        parentAuthorName={commentDialog.target?.parentAuthorName}
      />
      <CreatePostDialog
        isOpen={createPostDialog.open}
        onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_CREATE_POST' })}
        onPostCreated={handleCreatePost}
      />
      <JoinTribeDialog
        isOpen={joinTribeDialog.open}
        onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_JOIN_TRIBE' })}
        tribe={tribe}
        onConfirmJoin={handleConfirmJoinTribe}
        isJoining={isJoining}
      />
      <EditPostDialog
        open={editPostDialog.open}
        onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_EDIT_POST' })}
        post={editPostDialog.target}
        onSuccess={syncAllData}
      />
      {modRemoveDialog.target && (
        <ModRemovalDialog
          open={modRemoveDialog.open}
          onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_MOD_REMOVE' })}
          onConfirm={handleConfirmModRemove}
          postTitle={modRemoveDialog.target.title || undefined}
        />
      )}
    </>
  );
}
