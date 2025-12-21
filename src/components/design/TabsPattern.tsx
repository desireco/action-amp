import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export function TabsPattern() {
    return (
        <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
                <div className="space-y-4">
                    <h4 className="text-lg font-medium">Project Overview</h4>
                    <p className="text-muted-foreground">
                        This is the main overview tab containing summary
                        information about the project.
                    </p>
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="p-4">
                            <h5 className="font-medium mb-1">Progress</h5>
                            <p className="text-2xl font-bold text-primary">
                                75%
                            </p>
                        </Card>
                        <Card className="p-4">
                            <h5 className="font-medium mb-1">Tasks</h5>
                            <p className="text-2xl font-bold text-primary">
                                24
                            </p>
                        </Card>
                        <Card className="p-4">
                            <h5 className="font-medium mb-1">Team</h5>
                            <p className="text-2xl font-bold text-primary">
                                8
                            </p>
                        </Card>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="details" className="mt-4">
                <div className="space-y-4">
                    <h4 className="text-lg font-medium">Project Details</h4>
                    <div className="grid gap-4">
                        <div className="flex justify-between py-2">
                            <span className="text-muted-foreground">Created</span>
                            <span>Dec 13, 2025</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between py-2">
                            <span className="text-muted-foreground">
                                Last Updated
                            </span>
                            <span>Dec 14, 2025</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between py-2">
                            <span className="text-muted-foreground">Status</span>
                            <Badge variant="secondary">Active</Badge>
                        </div>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-4">
                <div className="space-y-4">
                    <h4 className="text-lg font-medium">Project Settings</h4>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">
                                    Email Notifications
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Receive updates about this project
                                </p>
                            </div>
                            <Checkbox id="email-notif" defaultChecked />
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">Auto-archive</p>
                                <p className="text-sm text-muted-foreground">
                                    Archive completed tasks automatically
                                </p>
                            </div>
                            <Checkbox id="auto-archive" />
                        </div>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
                <div className="space-y-4">
                    <h4 className="text-lg font-medium">Recent Activity</h4>
                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                            <div>
                                <p className="text-sm">
                                    Task "Design system update" completed
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    2 hours ago
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-muted rounded-full mt-2"></div>
                            <div>
                                <p className="text-sm">
                                    New team member joined
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    5 hours ago
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </TabsContent>
        </Tabs>
    );
}
