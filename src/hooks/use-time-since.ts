'use client';

import { useState, useEffect } from 'react';
import { timeSince } from '@/lib/utils';

/**
 * Hook that returns a human-readable relative time string for a given date.
 * Eliminates the repeated useState + useEffect + timeSince pattern
 * across mood stream, tribe posts, intercom feed, and event stream components.
 */
export function useTimeSince(date: Date): string {
  const [displayTime, setDisplayTime] = useState<string>(' ');

  useEffect(() => {
    setDisplayTime(timeSince(date));
  }, [date]);

  return displayTime;
}
