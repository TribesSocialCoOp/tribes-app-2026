
"use client";

import { useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, Edit } from "lucide-react";
import { Button } from "../ui/button";

interface HtmlBlockProps {
  content: {
    html: string;
    title?: string;
    showTitle?: boolean;
  };
  onEdit?: () => void;
}

export default function HtmlBlock({ content, onEdit }: HtmlBlockProps) {
  const sanitizedHtml = useMemo(
    () => DOMPurify.sanitize(content.html, { USE_PROFILES: { html: true } }),
    [content.html]
  );
  const showTitle = content?.showTitle !== false;
  const displayTitle = content?.title || "Custom Block";

  return (
    <Card>
      {(showTitle || onEdit) && (
        <CardHeader className={!showTitle ? "pb-0" : ""}>
          <div className={`flex items-center ${showTitle ? "justify-between" : "justify-end"}`}>
              {showTitle && (
                <CardTitle className="flex items-center text-2xl">
                    <Code className="mr-3 h-6 w-6 text-primary"/>
                    {displayTitle}
                </CardTitle>
              )}
              {onEdit && (
                <Button variant="ghost" size="icon" onClick={onEdit} className={!showTitle ? "-mt-4 -mr-2" : ""}>
                    <Edit className="h-4 w-4"/>
                </Button>
              )}
          </div>
        </CardHeader>
      )}
      <CardContent>
        <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
      </CardContent>
    </Card>
  );
}
