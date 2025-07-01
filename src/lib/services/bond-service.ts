
/**
 * @fileoverview Service layer for bond management actions.
 * This abstracts the logic for modifying bond data, preparing for a real backend.
 */

import { bondsData } from '@/lib/data';
import type { Bond } from '@/lib/types';

const MOCK_CURRENT_DATE_MS = new Date("2025-06-08T10:00:00.000Z").getTime();

/**
 * Simulates refreshing a bond's passkey.
 * @param bondId The ID of the bond to refresh.
 */
export async function refreshBond(bondId: string): Promise<void> {
  console.log(`Service: Refreshing bond ${bondId}`);
  return new Promise(resolve => {
    setTimeout(() => {
      const bondIndex = bondsData.findIndex(b => b.id === bondId);
      if (bondIndex !== -1) {
        const bond = bondsData[bondIndex];
        bondsData[bondIndex] = {
          ...bond,
          passkeyStatus: "active",
          lastRefreshedAt: new Date(MOCK_CURRENT_DATE_MS),
          expiresAt: new Date(MOCK_CURRENT_DATE_MS + (bond.bondType === 'family' ? 365 : 30) * 86400000),
          reconnectsCount: (bond.reconnectsCount || 0) + 1,
        };
      }
      resolve();
    }, 300);
  });
}

/**
 * Simulates revoking a bond.
 * @param bondId The ID of the bond to revoke.
 */
export async function revokeBond(bondId: string): Promise<void> {
  console.log(`Service: Revoking bond ${bondId}`);
  return new Promise(resolve => {
    setTimeout(() => {
      const bondIndex = bondsData.findIndex(b => b.id === bondId);
      if (bondIndex !== -1) {
        bondsData.splice(bondIndex, 1);
      }
      resolve();
    }, 300);
  });
}

/**
 * Simulates upgrading a user bond to a family bond.
 * @param bondId The ID of the bond to upgrade.
 */
export async function upgradeToFamilyBond(bondId: string): Promise<void> {
  console.log(`Service: Upgrading bond ${bondId} to family`);
  return new Promise(resolve => {
    setTimeout(() => {
      const bondIndex = bondsData.findIndex(b => b.id === bondId);
      if (bondIndex !== -1) {
        const bond = bondsData[bondIndex];
        if (bond.targetType === 'user') { // Can only upgrade user bonds
          bondsData[bondIndex] = {
            ...bond,
            bondType: "family",
            passkeyStatus: "active",
            lastRefreshedAt: new Date(MOCK_CURRENT_DATE_MS),
            expiresAt: new Date(MOCK_CURRENT_DATE_MS + 365 * 86400000), // Family bonds last longer
            reconnectsCount: (bond.reconnectsCount || 0) + 1,
          };
        }
      }
      resolve();
    }, 300);
  });
}

/**
 * Simulates saving updated settings for a bond.
 * @param updatedBond The bond object with the new settings.
 */
export async function saveBondSettings(updatedBond: Bond): Promise<void> {
    console.log(`Service: Saving settings for bond ${updatedBond.id}`, updatedBond);
    return new Promise(resolve => {
        setTimeout(() => {
            const bondIndex = bondsData.findIndex(b => b.id === updatedBond.id);
            if (bondIndex !== -1) {
                bondsData[bondIndex] = updatedBond;
            }
            resolve();
        }, 300);
    });
}
