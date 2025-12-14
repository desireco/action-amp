"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy } from "lucide-react";

interface ComponentExample {
  title: string;
  description: string;
  code: string;
  preview: React.ReactNode;
}

interface ComponentGalleryProps {
  className?: string;
}

const buttonExamples: ComponentExample[] = [
  {
    title: "Default Button",
    description: "Standard button with hover effects",
    code: `<Button>Click me</Button>`,
    preview: <Button>Click me</Button>
  },
  {
    title: "Button with Variants",
    description: "Different button styles for various actions",
    code: `<Button variant="secondary">Secondary</Button>\n<Button variant="outline">Outline</Button>\n<Button variant="ghost">Ghost</Button>\n<Button variant="destructive">Destructive</Button>`,
    preview: (
      <div className="flex gap-2 flex-wrap">
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
      </div>
    )
  },
  {
    title: "Button Sizes",
    description: "Different button sizes for hierarchy",
    code: `<Button size="sm">Small</Button>\n<Button size="default">Default</Button>\n<Button size="lg">Large</Button>`,
    preview: (
      <div className="flex gap-2 items-center">
        <Button size="sm">Small</Button>
        <Button size="default">Default</Button>
        <Button size="lg">Large</Button>
      </div>
    )
  },
];

const formExamples: ComponentExample[] = [
  {
    title: "Input Field",
    description: "Text input with label",
    code: `<div className="space-y-2">\n  <Label htmlFor="email">Email</Label>\n  <Input id="email" placeholder="Enter your email" />\n</div>`,
    preview: (
      <div className="space-y-2 w-64">
        <Label htmlFor="email-demo">Email</Label>
        <Input id="email-demo" placeholder="Enter your email" />
      </div>
    )
  },
  {
    title: "Textarea",
    description: "Multi-line text input",
    code: `<div className="space-y-2">\n  <Label htmlFor="message">Message</Label>\n  <Textarea id="message" placeholder="Type your message here" />\n</div>`,
    preview: (
      <div className="space-y-2 w-64">
        <Label htmlFor="message-demo">Message</Label>
        <Textarea id="message-demo" placeholder="Type your message here" rows={4} />
      </div>
    )
  },
  {
    title: "Checkbox",
    description: "Toggle selection state",
    code: `<div className="flex items-center space-x-2">\n  <Checkbox id="terms" />\n  <Label htmlFor="terms">Accept terms</Label>\n</div>`,
    preview: (
      <div className="flex items-center space-x-2">
        <Checkbox id="terms-demo" />
        <Label htmlFor="terms-demo">Accept terms</Label>
      </div>
    )
  },
  {
    title: "Switch",
    description: "Toggle between on/off states",
    code: `<div className="flex items-center space-x-2">\n  <Switch id="notifications" />\n  <Label htmlFor="notifications">Notifications</Label>\n</div>`,
    preview: (
      <div className="flex items-center space-x-2">
        <Switch id="notifications-demo" />
        <Label htmlFor="notifications-demo">Notifications</Label>
      </div>
    )
  },
  {
    title: "Select",
    description: "Dropdown selection from predefined options",
    code: `<Select defaultValue="option1">\\n  <SelectTrigger className="w-[180px]">\\n    <SelectValue placeholder="Select an option" />\\n  </SelectTrigger>\\n  <SelectContent>\\n    <SelectItem value="option1">Option 1</SelectItem>\\n    <SelectItem value="option2">Option 2</SelectItem>\\n    <SelectItem value="option3">Option 3</SelectItem>\\n  </SelectContent>\\n</Select>`,
    preview: (
      <Select defaultValue="option1">
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
          <SelectItem value="option3">Option 3</SelectItem>
        </SelectContent>
      </Select>
    )
  },
];

const feedbackExamples: ComponentExample[] = [
  {
    title: "Badge",
    description: "Status and category indicators",
    code: `<Badge>Default</Badge>\n<Badge variant="secondary">Secondary</Badge>\n<Badge variant="outline">Outline</Badge>\n<Badge variant="destructive">Destructive</Badge>`,
    preview: (
      <div className="flex gap-2 flex-wrap">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
      </div>
    )
  },
  {
    title: "Alert",
    description: "Important messages and notifications",
    code: `<Alert>\n  <AlertTitle>Information</AlertTitle>\n  <AlertDescription>\n    This is an informational alert message.\n  </AlertDescription>\n</Alert>`,
    preview: (
      <Alert className="w-96">
        <AlertTitle>Information</AlertTitle>
        <AlertDescription>
          This is an informational alert message.
        </AlertDescription>
      </Alert>
    )
  },
  {
    title: "Tabs",
    description: "Organize content in tabbed interface",
    code: `<Tabs defaultValue="account" className="w-[400px]">\n  <TabsList>\n    <TabsTrigger value="account">Account</TabsTrigger>\n    <TabsTrigger value="password">Password</TabsTrigger>\n  </TabsList>\n  <TabsContent value="account">\n    Make changes to your account here.\n  </TabsContent>\n  <TabsContent value="password">\n    Change your password here.\n  </TabsContent>\n</Tabs>`,
    preview: (
      <Tabs defaultValue="account" className="w-[400px]">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          Make changes to your account here.
        </TabsContent>
        <TabsContent value="password">
          Change your password here.
        </TabsContent>
      </Tabs>
    )
  },
  {
    title: "Dialog",
    description: "Modal overlay for important actions",
    code: `<Dialog>\n  <DialogTrigger asChild>\n    <Button variant="outline">Open Dialog</Button>\n  </DialogTrigger>\n  <DialogContent>\n    <DialogHeader>\n      <DialogTitle>Edit Profile</DialogTitle>\n      <DialogDescription>\n        Make changes to your profile here.\n      </DialogDescription>\n    </DialogHeader>\n    <div className="py-4">\n      {/* Form content here */}\n    </div>\n    <DialogFooter>\n      <Button variant="outline">Cancel</Button>\n      <Button>Save Changes</Button>\n    </DialogFooter>\n  </DialogContent>\n</Dialog>`,
    preview: (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Open Dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Make changes to your profile here.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p>Dialog content goes here.</p>
          </div>
          <DialogFooter>
            <Button variant="outline">Cancel</Button>
            <Button>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  },
];

const CodeExample: React.FC<{ code: string; language?: string }> = ({ code, language = "tsx" }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-surface p-4 text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="outline"
        size="sm"
        className="absolute top-2 right-2"
        onClick={copyToClipboard}
      >
        <Copy className="h-4 w-4" />
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
};

export function ComponentGallery({ className }: ComponentGalleryProps) {
    const [activeSection, setActiveSection] = useState("buttons");

  const sections = [
    { id: "buttons", label: "Buttons", examples: buttonExamples },
    { id: "forms", label: "Forms", examples: formExamples },
    { id: "feedback", label: "Feedback", examples: feedbackExamples },
  ];

  return (
    <div className={`w-full space-y-8 ${className || ""}`}>
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Component Gallery</h1>
        <p className="text-text-muted">
          Interactive showcase of ActionAmp's UI components with live previews and code examples
        </p>
      </div>

      {/* Section Navigation */}
      <Tabs value={activeSection} onValueChange={setActiveSection} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          {sections.map((section) => (
            <TabsTrigger key={section.id} value={section.id}>
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {sections.map((section) => (
          <TabsContent key={section.id} value={section.id} className="space-y-6">
            {section.examples.map((example, index) => (
              <Card key={index} className="overflow-hidden">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{example.title}</CardTitle>
                      <CardDescription>{example.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Preview */}
                  <div className="p-6 bg-surface/50 rounded-lg border border-border">
                    {example.preview}
                  </div>

                  <Separator />

                  {/* Code Example */}
                  <div className="px-6 pb-6">
                    <CodeExample code={example.code} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}