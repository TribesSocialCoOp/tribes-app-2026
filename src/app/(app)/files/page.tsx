import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Search, UploadCloud, Filter, MoreVertical, Folder } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Image from "next/image";

const filesData = [
  { name: "Project Alpha Specs.pdf", type: "PDF", size: "2.5 MB", tribe: "Coders Connect", sharedBy: "Alice", lastModified: "2024-07-20", icon: <FileText className="text-red-500 h-6 w-6" />, preview: "https://placehold.co/50x50.png?text=PDF" , dataAiHint: "document file" },
  { name: "Marketing Campaign Q3.pptx", type: "PPTX", size: "10.1 MB", tribe: "Marketing Mavens", sharedBy: "Bob", lastModified: "2024-07-19", icon: <FileText className="text-orange-500 h-6 w-6" />, preview: "https://placehold.co/50x50.png?text=PPTX", dataAiHint: "presentation slide" },
  { name: "User Persona Images", type: "Folder", size: "35 MB", tribe: "Design Team", sharedBy: "Charlie", lastModified: "2024-07-18", icon: <Folder className="text-yellow-500 h-6 w-6" />, preview: "https://placehold.co/50x50.png?text=Folder" , dataAiHint: "folder directory" },
  { name: "Event Photoshoot RAW", type: "Folder", size: "2.1 GB", tribe: "Photography Club", sharedBy: "Diana", lastModified: "2024-07-17", icon: <Folder className="text-yellow-500 h-6 w-6" />, preview: "https://placehold.co/50x50.png?text=Photos" , dataAiHint: "images photography" },
  { name: "Client Onboarding Video.mp4", type: "MP4", size: "150 MB", tribe: "Client Success", sharedBy: "Eve", lastModified: "2024-07-16", icon: <FileText className="text-blue-500 h-6 w-6" />, preview: "https://placehold.co/50x50.png?text=MP4" , dataAiHint: "video film" },
];

export default function FilesPage() {
  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Shared Files</h1>
          <p className="text-lg text-muted-foreground mt-1">
            Access and manage all files shared within your tribes.
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <UploadCloud className="mr-2 h-5 w-5" /> Upload File
        </Button>
      </header>

      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle>All Files</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search files..." className="pl-8" />
              </div>
              <Button variant="outline">
                <Filter className="mr-2 h-4 w-4" /> Filter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] hidden sm:table-cell"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Size</TableHead>
                <TableHead>Tribe</TableHead>
                <TableHead className="hidden lg:table-cell">Shared By</TableHead>
                <TableHead className="hidden md:table-cell">Last Modified</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filesData.map((file) => (
                <TableRow key={file.name} className="hover:bg-muted/50">
                  <TableCell className="hidden sm:table-cell">
                    <Image src={file.preview} alt={file.type} width={40} height={40} className="rounded-sm object-cover" data-ai-hint={file.dataAiHint}/>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                        <span className="sm:hidden">{file.icon}</span>
                        {file.name}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{file.type}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{file.size}</TableCell>
                  <TableCell><span className="bg-secondary text-secondary-foreground px-2 py-1 rounded-full text-xs">{file.tribe}</span></TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{file.sharedBy}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{file.lastModified}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                        <DropdownMenuItem>Download</DropdownMenuItem>
                        <DropdownMenuItem>Share</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive hover:!bg-destructive/10 hover:!text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
