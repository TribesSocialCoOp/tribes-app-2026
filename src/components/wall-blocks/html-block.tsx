
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, Edit } from "lucide-react";
import { Button } from "../ui/button";

interface HtmlBlockProps {
  content: {
    html: string;
  };
}

export default function HtmlBlock({ content }: HtmlBlockProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle className="flex items-center text-2xl">
                <Code className="mr-3 h-6 w-6 text-primary"/>
                Custom Block
            </CardTitle>
            <Button variant="ghost" size="icon">
                <Edit className="h-4 w-4"/>
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* WARNING: In a real app, this MUST be sanitized to prevent XSS attacks */}
        <div dangerouslySetInnerHTML={{ __html: content.html }} />
      </CardContent>
    </Card>
  );
}
