import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Bell, UserCircle, Shield, Palette, LogOut, Trash2, CreditCard } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Settings</h1>
        <p className="text-lg text-muted-foreground mt-1">
          Manage your account, preferences, and privacy.
        </p>
      </header>

      {/* Profile Settings */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <UserCircle className="h-7 w-7 text-primary" />
            <CardTitle className="text-xl">Profile Information</CardTitle>
          </div>
          <CardDescription>Update your personal details and profile picture.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src="https://placehold.co/100x100.png" alt="User Name" data-ai-hint="profile person" />
              <AvatarFallback>UN</AvatarFallback>
            </Avatar>
            <Button variant="outline">Change Picture</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" defaultValue="User Name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" defaultValue="user@example.com" disabled />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Input id="bio" placeholder="Tell us a little about yourself" />
          </div>
        </CardContent>
        <CardFooter>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Save Profile Changes</Button>
        </CardFooter>
      </Card>

      <Separator />

      {/* Notification Settings */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Bell className="h-7 w-7 text-primary" />
            <CardTitle className="text-xl">Notifications</CardTitle>
          </div>
          <CardDescription>Manage how you receive notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50">
            <Label htmlFor="emailNotifications" className="flex-grow cursor-pointer">Email Notifications</Label>
            <Switch id="emailNotifications" defaultChecked />
          </div>
          <div className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50">
            <Label htmlFor="pushNotifications" className="flex-grow cursor-pointer">Push Notifications</Label>
            <Switch id="pushNotifications" defaultChecked />
          </div>
          <div className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50">
            <Label htmlFor="tribeMentions" className="flex-grow cursor-pointer">Tribe Mentions</Label>
            <Switch id="tribeMentions" defaultChecked />
          </div>
        </CardContent>
         <CardFooter>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Save Notification Preferences</Button>
        </CardFooter>
      </Card>
      
      <Separator />

      {/* Security Settings */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Shield className="h-7 w-7 text-primary" />
            <CardTitle className="text-xl">Security & Privacy</CardTitle>
          </div>
          <CardDescription>Manage your password, two-factor authentication, and privacy settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full md:w-auto">Change Password</Button>
          <Button variant="outline" className="w-full md:w-auto">Setup Two-Factor Authentication</Button>
          <div className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50">
            <div>
              <Label htmlFor="dataSharing" className="font-medium">Allow AI Assistant Access to My Data</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Let the AI assistant use your public tribe information to provide more personalized help. Private data is never used.
              </p>
            </div>
            <Switch id="dataSharing" />
          </div>
        </CardContent>
      </Card>

      <Separator />
      
      {/* Appearance Settings */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Palette className="h-7 w-7 text-primary" />
            <CardTitle className="text-xl">Appearance</CardTitle>
          </div>
          <CardDescription>Customize the look and feel of Tribes.app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50">
            <Label htmlFor="darkMode" className="flex-grow cursor-pointer">Dark Mode</Label>
            <Switch id="darkMode" />
          </div>
          {/* More appearance options can be added here */}
        </CardContent>
      </Card>

      <Separator />

      {/* Billing Information */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <CreditCard className="h-7 w-7 text-primary" />
            <CardTitle className="text-xl">Billing & Subscription</CardTitle>
          </div>
          <CardDescription>Manage your subscription plan and payment methods.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">Current Plan: <span className="font-semibold text-foreground">Free Tier</span></p>
          <Button variant="default" className="bg-accent text-accent-foreground hover:bg-accent/90">Upgrade to Pro</Button>
          <Button variant="outline" className="w-full md:w-auto">Manage Payment Methods</Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Account Actions */}
      <Card className="shadow-lg border-destructive">
        <CardHeader>
          <CardTitle className="text-xl text-destructive">Account Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full text-destructive border-destructive hover:bg-destructive/10">
            <LogOut className="mr-2 h-5 w-5" /> Log Out
          </Button>
          <Button variant="destructive" className="w-full">
            <Trash2 className="mr-2 h-5 w-5" /> Delete Account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
