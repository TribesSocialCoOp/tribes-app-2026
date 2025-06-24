"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Send, User, HelpCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { askAssistant } from '@/ai/flows/assistant-flow';

// Genkit history expects a specific format. `role` is 'user' or 'model'.
interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: Date;
}

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when new messages are added
    const viewport = scrollAreaRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (query?: string) => {
    const textToSend = (query || inputValue).trim();
    if (textToSend === "") return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: textToSend,
      role: "user",
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputValue("");
    setIsLoading(true);

    try {
      // Prepare history for Genkit, which expects role: 'user' or 'model'
      const historyForGenkit = newMessages.slice(0, -1).map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));

      const aiResponseText = await askAssistant({
        message: textToSend,
        history: historyForGenkit,
      });

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: aiResponseText,
        role: "model",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);

    } catch (error) {
      console.error("AI flow error:", error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I encountered an error. Please try again.",
        role: "model",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
  };

  const quickActions = [
    { label: "How do I create a tribe?", query: "How do I create a new tribe?" },
    { label: "Tell me about the AI Innovators tribe", query: "Tell me about the AI Innovators tribe" },
    { label: "What can I do on the Bonds page?", query: "What can I do on the Bonds page?" },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)] items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-3xl h-full flex flex-col shadow-2xl">
        <CardHeader className="border-b p-4">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10 border-2 border-primary">
              <AvatarImage src="https://placehold.co/100x100.png?text=AI" alt="AI Assistant" data-ai-hint="robot bot" />
              <AvatarFallback><Bot className="h-5 w-5" /></AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-xl font-mono text-foreground">AI Assistant</CardTitle>
              <p className="text-sm text-muted-foreground">Your friendly helper for Tribes.app</p>
            </div>
          </div>
        </CardHeader>
        <ScrollArea className="flex-1 p-2 sm:p-4" ref={scrollAreaRef}>
          <CardContent className="space-y-4 ">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-10">
                <HelpCircle className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p className="font-semibold">Welcome to your AI Assistant!</p>
                <p>Ask me anything about Tribes.app, or try one of the suggestions below.</p>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex items-end space-x-2 max-w-[85%]",
                  message.role === "user" ? "ml-auto justify-end" : "mr-auto justify-start"
                )}
              >
                {message.role === "model" && (
                  <Avatar className="h-8 w-8 self-start">
                    <AvatarImage src="https://placehold.co/40x40.png?text=AI" alt="AI" data-ai-hint="robot bot" />
                    <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    "rounded-xl p-3 shadow-md text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-card text-card-foreground border rounded-bl-none"
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.text}</p>
                </div>
                {message.role === "user" && (
                  <Avatar className="h-8 w-8 self-start">
                    <AvatarImage src="https://placehold.co/40x40.png" alt="User" data-ai-hint="person user" />
                    <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isLoading && (
                <div className="flex items-end space-x-2 mr-auto justify-start max-w-[85%]">
                    <Avatar className="h-8 w-8 self-start">
                        <AvatarImage src="https://placehold.co/40x40.png?text=AI" alt="AI" data-ai-hint="robot bot" />
                        <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                    <div className="rounded-xl p-3 shadow-md text-sm bg-card text-card-foreground border rounded-bl-none">
                        <div className="flex items-center space-x-1.5">
                            <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-pulse delay-0"></span>
                            <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-pulse delay-150"></span>
                            <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-pulse delay-300"></span>
                        </div>
                    </div>
                </div>
            )}
          </CardContent>
        </ScrollArea>
         {messages.length === 0 && (
            <CardFooter className="border-t p-2 sm:p-4 flex flex-wrap gap-2 justify-center">
                 {quickActions.map(action => (
                    <Button key={action.label} variant="outline" size="sm" onClick={() => handleSendMessage(action.query)} disabled={isLoading}>
                        <Zap className="mr-2 h-3 w-3"/> {action.label}
                    </Button>
                 ))}
            </CardFooter>
        )}
        <CardFooter className="border-t p-2 sm:p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex w-full items-center space-x-2"
          >
            <Input
              type="text"
              placeholder="Type your message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1 text-base"
              disabled={isLoading}
            />
            <Button type="submit" size="icon" disabled={isLoading || inputValue.trim() === ""} className="bg-primary hover:bg-primary/90">
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
