
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Bell, UserCircle, Shield, Palette, LogOut, Trash2, CreditCard, Loader2, PlusCircle, AtSign, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from '@/lib/types';
import { getUserProfile, updateUserProfile } from '@/lib/services/user-service';
import { MOCK_CURRENT_USER_ID } from '@/lib/data';

export default function SettingsPage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Local state for form fields to allow editing before saving
  const [givenName, setGivenName] = useState("");
  const [bio, setBio] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState("");


  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      const userProfile = await getUserProfile(MOCK_CURRENT_USER_ID);
      if (userProfile) {
        setProfile(userProfile);
        setGivenName(userProfile.name);
        setBio(userProfile.bio || "");
        setAliases(userProfile.aliases || []);
      }
      setIsLoading(false);
    };
    fetchProfile();
  }, []);
  
  const handleAddAlias = () => {
    if (newAlias.trim() && !aliases.includes(newAlias.trim())) {
      setAliases([...aliases, newAlias.trim()]);
      setNewAlias("");
    }
  };

  const handleRemoveAlias = (aliasToRemove: string) => {
    setAliases(aliases.filter(alias => alias !== aliasToRemove));
  };

  const handleSaveChanges = async () => {
    if (!profile) return;
    setIsSaving(true);
    
    try {
      await updateUserProfile(profile.id, {
        name: givenName,
        bio: bio,
        aliases: aliases,
      });
      toast({
        title: "Profile Saved",
        description: "Your identity and profile information has been updated.",
      });
    } catch (error) {
       toast({
        variant: "destructive",
        title: "Save Failed",
        description: "There was an error saving your profile. Please try again."
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (isLoading) {
    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  if (!profile) {
     return (
        <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
            <p className="text-muted-foreground">Could not load user profile.</p>
        </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Settings</h1>
        <p className="text-lg text-muted-foreground mt-1">
          Manage your account, identity, preferences, and privacy.
        </p>
      </header>

      {/* Identity & Profile Settings */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <UserCircle className="h-7 w-7 text-primary" />
            <CardTitle className="text-xl">Identity & Profile</CardTitle>
          </div>
          <CardDescription>Update your personal details, profile picture, and manage your aliases.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile.avatar} alt={profile.name} data-ai-hint="profile person" />
              <AvatarFallback>{profile.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
            </Avatar>
            <Button variant="outline">Change Picture</Button>
          </div>
           <div className="space-y-1.5">
              <Label htmlFor="givenName">Given Name</Label>
              <Input id="givenName" value={givenName} onChange={(e) => setGivenName(e.target.value)} />
              <p className="text-xs text-muted-foreground">This is your main profile name.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" value={profile.email} disabled />
            </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Input id="bio" placeholder="Tell us a little about yourself" value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
           <Separator />
            <div className="space-y-4">
                <div>
                    <h3 className="text-base font-semibold">Your Aliases</h3>
                    <p className="text-sm text-muted-foreground">Manage alternate names you can use within tribes.</p>
                </div>
                {aliases.length > 0 && (
                    <div className="space-y-2">
                        {aliases.map((alias, index) => (
                            <div key={index} className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
                                <p className="text-sm font-medium flex items-center">
                                  <AtSign className="mr-2 h-4 w-4 text-muted-foreground"/> {alias}
                                </p>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveAlias(alias)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex items-center space-x-2">
                    <Input 
                        id="new-alias" 
                        placeholder="Add a new alias..." 
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddAlias(); } }}
                    />
                    <Button type="button" onClick={handleAddAlias} disabled={!newAlias.trim()}>
                        <PlusCircle className="h-4 w-4 mr-2"/> Add
                    </Button>
                </div>
            </div>
        </CardContent>
        <CardFooter>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleSaveChanges} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
            {isSaving ? "Saving..." : "Save Profile Changes"}
          </Button>
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
          <p className="text-muted-foreground">Current Plan: <span className="font-semibold text-foreground">{profile.role.replace(/_/g, ' ')}</span></p>
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
