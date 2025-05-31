
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCircle } from "lucide-react";

export default function ProfilePage() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Profile</h1>
        <p className="text-lg text-muted-foreground mt-1">
          Manage your personal information.
        </p>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <UserCircle className="h-7 w-7 text-primary" />
            <CardTitle className="text-xl">Your Profile</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-4">
            <Avatar className="h-24 w-24">
              <AvatarImage src="https://placehold.co/100x100.png" alt="User Name" data-ai-hint="profile person" />
              <AvatarFallback>UN</AvatarFallback>
            </Avatar>
            <Button variant="outline">Change Picture</Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" defaultValue="User Name" placeholder="Your full name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" type="email" defaultValue="user@example.com" disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Input id="bio" placeholder="Tell us a little about yourself" />
          </div>
           <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Save Changes</Button>
        </CardContent>
      </Card>
       <Card className="shadow-lg mt-8">
        <CardHeader>
            <CardTitle className="text-xl">Page Status</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">This page is a placeholder and under construction.</p>
            <p className="text-muted-foreground">Full functionality for profile management will be implemented soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
