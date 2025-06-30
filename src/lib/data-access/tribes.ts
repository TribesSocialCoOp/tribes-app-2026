/**
 * @fileoverview Data access layer for Tribes.
 * This file centralizes all logic for fetching and manipulating tribe data,
 * acting as an abstraction layer between the UI and the data source.
 *
 * In this prototype, it returns mock data. In a production app, this is where
 * you would interact with your chosen database (e.g., Firestore, Supabase, etc.).
 */

import { tribesData, type Tribe } from '@/lib/data';

/**
 * Fetches all tribes.
 * @returns A promise that resolves to an array of all tribes.
 */
export async function getTribes(): Promise<Tribe[]> {
  // In a real app, this would be a database query.
  // For now, we simulate an async operation with the mock data.
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(tribesData);
    }, 250); // Simulate network latency
  });
}

/**
 * Fetches a single tribe by its ID.
 * @param tribeId The ID of the tribe to fetch.
 * @returns A promise that resolves to the tribe, or null if not found.
 */
export async function getTribeById(tribeId: string): Promise<Tribe | null> {
    // In a real app, this would be a specific document/row lookup.
    return new Promise(resolve => {
        setTimeout(() => {
            const tribe = tribesData.find(t => t.id === tribeId);
            resolve(tribe || null);
        }, 250); // Simulate network latency
    });
}

/**
 * Finds a single tribe by its name (case-insensitive).
 * Note: In a real backend, you'd want an index on the name field for performance.
 * @param name The name of the tribe to find.
 * @returns A promise that resolves to the tribe, or null if not found.
 */
export async function findTribeByName(name: string): Promise<Tribe | null> {
    return new Promise(resolve => {
        setTimeout(() => {
            const tribe = tribesData.find(t => t.name.toLowerCase() === name.toLowerCase());
            resolve(tribe || null);
        }, 250);
    });
}


// Future functions could include:
// export async function createTribe(tribeData: Omit<Tribe, 'id'>): Promise<Tribe> { ... }
// export async function updateTribe(tribeId: string, updates: Partial<Tribe>): Promise<Tribe> { ... }
