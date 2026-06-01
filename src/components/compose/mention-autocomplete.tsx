import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { searchMentionableUsers } from '@/lib/actions/content-actions';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MentionAutocompleteProps {
  query: string | null;
  onSelect: (alias: string) => void;
  className?: string;
  suppressRef?: React.RefObject<boolean | null>;
}

export interface MentionAutocompleteRef {
  handleKeyDown: (e: React.KeyboardEvent<any>) => boolean;
}

interface SuggestionUser {
  id: string;
  name: string;
  alias: string;
  avatar?: string;
}

export const MentionAutocomplete = forwardRef<MentionAutocompleteRef, MentionAutocompleteProps>(
  ({ query, onSelect, className, suppressRef }, ref) => {
    const [suggestions, setSuggestions] = useState<SuggestionUser[]>([]);
    const [activeIdx, setActiveIdx] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
      if (query === null) {
        setSuggestions([]);
        return;
      }

      // If user typed just '@', query is empty string.
      // We can clear or perform a blank search. Since backend requires >= 1 char, we wait.
      if (query.trim() === '') {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const timer = setTimeout(async () => {
        try {
          const res = await searchMentionableUsers(query);
          setSuggestions(res);
          setActiveIdx(0);
        } catch (err) {
          console.error('Mention autocomplete fetch error:', err);
        } finally {
          setLoading(false);
        }
      }, 200);

      return () => clearTimeout(timer);
    }, [query]);

    const handleSelect = (alias: string) => {
      if (suppressRef) suppressRef.current = true;
      onSelect(alias);
      if (suppressRef) {
        setTimeout(() => {
          suppressRef.current = false;
        }, 200);
      }
    };

    // Expose keyboard navigation helpers to the parent textarea's onKeyDown
    useImperativeHandle(ref, () => ({
      handleKeyDown(e: React.KeyboardEvent<any>) {
        if (!query || suggestions.length === 0) return false;

        switch (e.key) {
          case 'ArrowDown':
            setActiveIdx((prev) => (prev + 1) % suggestions.length);
            return true;
          case 'ArrowUp':
            setActiveIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
            return true;
          case 'Enter':
          case 'Tab':
            if (suggestions[activeIdx]) {
              handleSelect(suggestions[activeIdx].alias);
              return true;
            }
            return false;
          case 'Escape':
            setSuggestions([]);
            return true;
          default:
            return false;
        }
      },
    }));

    if (query === null || (!loading && suggestions.length === 0)) {
      return null;
    }

    return (
      <div
        className={cn(
          "absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md animate-in fade-in slide-in-from-top-2 duration-200",
          className
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Searching users...
          </div>
        ) : (
          <ul role="listbox" className="space-y-0.5">
            {suggestions.map((user, idx) => (
              <li
                key={user.id}
                role="option"
                aria-selected={idx === activeIdx}
                className={cn(
                  "flex items-center gap-3 cursor-pointer rounded-md px-3 py-2 text-sm transition-colors",
                  idx === activeIdx
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-muted"
                )}
                onPointerDown={() => {
                  if (suppressRef) suppressRef.current = true;
                }}
                onClick={() => handleSelect(user.alias)}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                <UserAvatar
                  user={{ name: user.name, avatar: user.avatar }}
                  className="h-7 w-7"
                />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{user.name}</span>
                  <span className="text-xs text-muted-foreground truncate">@{user.alias}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);

MentionAutocomplete.displayName = 'MentionAutocomplete';
