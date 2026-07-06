"use client";

import type { UseFormReturn } from "react-hook-form";
import { ShieldAlert } from "lucide-react";
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";

interface NsfwTribeFieldsProps {
  /**
   * The tribe form. Typed as `any` because this shared control is used by both the
   * create and settings forms, whose full schemas differ; the only fields it touches
   * (`isNsfw`, `isListed`) exist in both.
   */
  form: UseFormReturn<any>;
  /**
   * True once the tribe is ALREADY flagged NSFW. The flag is permanent (issue #32), so
   * lock the toggle on and show the "cannot be removed" copy. Create passes false.
   */
  locked?: boolean;
}

/**
 * Shared NSFW tribe controls (issue #32): the "Adult (18+) Tribe" toggle plus the
 * conditional "List in discovery" toggle. Extracted so the create and settings forms
 * can't drift apart. The isPublic-lock effect stays in each page (each also needs the
 * local `isNsfw` watch to disable its own visibility switch).
 */
export function NsfwTribeFields({ form, locked = false }: NsfwTribeFieldsProps) {
  const isNsfw = form.watch("isNsfw");

  return (
    <>
      <FormField
        control={form.control}
        name="isNsfw"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border border-destructive/40 p-4 shadow-sm">
            <div className="space-y-0.5 pr-4">
              <FormLabel className="text-base font-semibold">
                <ShieldAlert className="inline-block mr-1 h-4 w-4 text-destructive" />
                Adult (18+) Tribe
              </FormLabel>
              <FormDescription>
                {locked ? (
                  <>This Tribe is flagged NSFW. It is permanently Private, end-to-end
                  encrypted, hidden from feeds/search, and limited to age-verified (18+)
                  members. This flag is permanent and cannot be removed.</>
                ) : (
                  <>Mark this Tribe as NSFW. It will become permanently <strong>Private</strong>{" "}
                  and end-to-end encrypted, hidden from feeds and search, and joinable only
                  by age-verified (18+) members. <strong>This cannot be undone.</strong></>
                )}
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
                disabled={locked}
              />
            </FormControl>
          </FormItem>
        )}
      />

      {isNsfw && (
        <FormField
          control={form.control}
          name="isListed"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
              <div className="space-y-0.5 pr-4">
                <FormLabel className="text-base font-semibold">
                  List in discovery
                </FormLabel>
                <FormDescription>
                  {field.value
                    ? "Listed: people can find this Tribe in search and Discover (name only — content stays private)."
                    : "Unlisted: only people with a direct invite link can find this Tribe."}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value ?? true}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      )}
    </>
  );
}
