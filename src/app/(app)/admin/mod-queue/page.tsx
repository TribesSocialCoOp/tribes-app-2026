
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export default function ModQueuePage() {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center space-x-3">
            <ShieldAlert className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Global Moderation Queue</h1>
        </div>
        <p className="text-lg text-muted-foreground mt-2">
          Review and manage reported content from across all tribes.
        </p>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Reported Content Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            This page is currently under construction.
          </p>
          <p className="text-muted-foreground">
            Functionality to view, assess, and take action on reported posts and users from all tribes will be implemented here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
