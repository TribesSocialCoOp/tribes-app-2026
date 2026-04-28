"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useBonds } from './bonds-context';

export function BondFamilyCapacity() {
  const { maxInnerCircleBonds, innerCircleCount, state } = useBonds();

  const isUnlimited = maxInnerCircleBonds === Infinity || maxInnerCircleBonds === null;
  const progressValue = isUnlimited ? 0 : (innerCircleCount / maxInnerCircleBonds) * 100;
  const planName = state.planName;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <ShieldCheck className="h-6 w-6 text-emerald-500" />
          <CardTitle className="tracking-normal">Inner Circle</CardTitle>
        </div>
        <CardDescription>
          {isUnlimited
            ? `Your ${planName} plan includes unlimited Inner Circle bonds. You currently have ${innerCircleCount}.`
            : `Your ${planName} plan allows for ${maxInnerCircleBonds} Inner Circle bonds. You are currently using ${innerCircleCount}.`
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
