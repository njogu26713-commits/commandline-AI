import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { PageTransition } from "@/components/page-transition";

export default function Settings() {
  return (
    <PageTransition className="space-y-6 max-w-5xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences.</p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent mb-6">
          <TabsTrigger value="general" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 shadow-none">
            General
          </TabsTrigger>
          <TabsTrigger value="billing" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 shadow-none">
            Billing & Plans
          </TabsTrigger>
          <TabsTrigger value="integrations" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 shadow-none">
            Integrations
          </TabsTrigger>
          <TabsTrigger value="ai" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 shadow-none">
            AI Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your public profile details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input id="name" defaultValue="Demo User" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" defaultValue="demouser" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" defaultValue="Full-stack developer building on CodeVault." />
              </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4 flex justify-between items-center bg-muted/20">
              <span className="text-sm text-muted-foreground">Please use 32 characters at maximum.</span>
              <Button>Save Changes</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>Manage what emails you receive from us.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Build Status</Label>
                  <div className="text-sm text-muted-foreground">Receive emails when deployments fail or succeed.</div>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Marketplace Sales</Label>
                  <div className="text-sm text-muted-foreground">Get notified when someone buys your templates or tools.</div>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Trading Signals</Label>
                  <div className="text-sm text-muted-foreground">Alerts for critical trading bot errors.</div>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions for your account.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="font-bold">Delete Account</Label>
                  <div className="text-sm text-muted-foreground">Permanently delete your account and all projects.</div>
                </div>
                <Button variant="destructive">Delete Account</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Current Plan: Pro</CardTitle>
              <CardDescription>You are on the Pro plan ($20/mo).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium mb-2">Compute Usage</div>
                  <div className="text-2xl font-bold">45.2 <span className="text-sm font-normal text-muted-foreground">/ 100 hrs</span></div>
                  <div className="w-full bg-secondary h-2 rounded-full mt-3 overflow-hidden">
                    <div className="bg-primary h-full w-[45%]"></div>
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium mb-2">AI Tokens</div>
                  <div className="text-2xl font-bold">1.2M <span className="text-sm font-normal text-muted-foreground">/ 5M</span></div>
                  <div className="w-full bg-secondary h-2 rounded-full mt-3 overflow-hidden">
                    <div className="bg-primary h-full w-[24%]"></div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4 flex justify-end">
              <Button variant="outline">Manage Subscription</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Connected Accounts</CardTitle>
              <CardDescription>Link third-party services to CodeVault.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-black text-white rounded-md flex items-center justify-center font-bold text-xl">G</div>
                  <div>
                    <div className="font-bold">GitHub</div>
                    <div className="text-sm text-muted-foreground">Connected as @demouser</div>
                  </div>
                </div>
                <Button variant="outline" size="sm">Disconnect</Button>
              </div>
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-md flex items-center justify-center font-bold text-xl">S</div>
                  <div>
                    <div className="font-bold">Stripe</div>
                    <div className="text-sm text-muted-foreground">For Marketplace & Trading revenue</div>
                  </div>
                </div>
                <Button variant="outline" size="sm">Connect</Button>
              </div>
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-500 text-white rounded-md flex items-center justify-center font-bold text-xl">D</div>
                  <div>
                    <div className="font-bold">Discord</div>
                    <div className="text-sm text-muted-foreground">Send notifications to your server</div>
                  </div>
                </div>
                <Button variant="outline" size="sm">Connect</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Builder Settings</CardTitle>
              <CardDescription>Configure how the CodeVault AI assists you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Default Model</Label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="border border-primary bg-primary/5 rounded-md p-3 text-center cursor-pointer">
                    <div className="font-bold">GPT-4o</div>
                    <div className="text-xs text-muted-foreground mt-1">Default • Fast</div>
                  </div>
                  <div className="border rounded-md p-3 text-center cursor-pointer hover:border-primary/50 transition-colors">
                    <div className="font-bold">Claude 3.5</div>
                    <div className="text-xs text-muted-foreground mt-1">Excellent coding</div>
                  </div>
                  <div className="border rounded-md p-3 text-center cursor-pointer hover:border-primary/50 transition-colors">
                    <div className="font-bold">DeepSeek</div>
                    <div className="text-xs text-muted-foreground mt-1">Large context</div>
                  </div>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-apply code</Label>
                  <div className="text-sm text-muted-foreground">Allow AI to directly modify files without manual review.</div>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageTransition>
  );
}