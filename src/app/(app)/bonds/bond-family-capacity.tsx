"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HeartHandshake } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useBonds } from './bonds-context';

export function BondFamilyCapacity() {
  const { maxFamilyBonds, familyBondsCount, state } = useBonds();

  const isUnlimited = maxFamilyBonds === Infinity || maxFamilyBonds === null;
  const progressValue = isUnlimited ? 0 : (familyBondsCount / maxFamilyBonds) * 100;
  const planName = state.planName;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <HeartHandshake className="h-6 w-6 text-pink-500" />
          <CardTitle className="tracking-normal">Family Bond Capacity</CardTitle>
        </div>
        <CardDescription>
          {isUnlimited
            ? `Your ${planName} plan includes unlimited Family Bonds. You currently have ${familyBondsCount}.`
            : `Your ${planName} plan allows for ${maxFamilyBonds} Family Bonds. You are currently using ${familyBondsCount}.`
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isUnlimited && (
          <Progress value={progressValue} className="w-full" />
        )}
      </CardContent>
    </Card>
  );
}
