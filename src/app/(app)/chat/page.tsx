
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus, Search, MessageSquare } from "lucide-react"; // Added MessageSquare, removed UserCircle
import Image from "next/image";

export default function ChatPage() {
  const chats = [
    { id: "1", name: "Design Team", lastMessage: "Let's review the new mockups.", time: "10:30 AM", unread: 2, avatar: "https://placehold.co/40x40.png?text=DT", dataAiHint: "avatar team" },
    { id: "2", name: "Alice Wonderland", lastMessage: "Sure, sounds good!", time: "9:15 AM", unread: 0, avatar: "https://placehold.co/40x40.png?text=AW", dataAiHint: "avatar person" },
    { id: "3", name: "Book Club Tribe", lastMessage: "Next meeting is on Friday.", time: "Yesterday", unread: 5, avatar: "https://placehold.co/40x40.png?text=BC", dataAiHint: "avatar group" },
    { id: "4", name: "Bob The Builder", lastMessage: "Can we fix it? Yes we can!", time: "Mon", unread: 0, avatar: "https://placehold.co/40x40.png?text=BB", dataAiHint: "avatar character" },
  ];

  // Added unique data-ai-hint for clarity
  return (
    <div className="flex h-[calc(100vh-var(--header-height,4rem)-2rem)]"> {/* Adjust height based on actual header height */}
      {/* Chat List Sidebar */}
      <Card className="w-1/3 min-w-[300px] max-w-[400px] flex flex-col border-r rounded-r-none">
        <CardHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-mono">Chats</CardTitle>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
              <MessageSquarePlus className="h-5 w-5" />
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search chats..." className="pl-8" />
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-y-auto">
          <ul className="divide-y">
            {chats.map(chat => (
              <li key={chat.id} className="p-3 hover:bg-muted/50 cursor-pointer flex items-start space-x-3">
                <Image src={chat.avatar} alt={chat.name} width={40} height={40} className="rounded-full" data-ai-hint={chat.dataAiHint}/>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-sm truncate">{chat.name}</h3>
                    <span className="text-xs text-muted-foreground">{chat.time}</span>
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">{chat.lastMessage}</p>
                    {chat.unread > 0 && (
                      <span className="bg-primary text-primary-foreground text-xs font-bold rounded-full px-1.5 py-0.5">
                        {chat.unread}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Main Chat Area (Placeholder) */}
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/30 p-6">
        <MessageSquare className="h-24 w-24 text-muted-foreground opacity-50 mb-4" />
        <h2 className="text-2xl font-semibold text-foreground font-mono">Select a chat</h2>
        <p className="text-muted-foreground mt-1">Or start a new conversation.</p>
        <Button variant="default" className="mt-6 bg-primary hover:bg-primary/90">
          New Message
        </Button>
      </div>
    </div>
  );
}

    