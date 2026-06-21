import { useState } from "react";
import { 
  useListDeployments, 
  useCreateDeployment, 
  useGetDeploymentLogs,
  getListDeploymentsQueryKey,
  getGetDeploymentLogsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cloud, ExternalLink, Terminal, Plus, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/page-transition";

export default function Deployments() {
  const { data: deployments, isLoading } = useListDeployments();
  const createDeployment = useCreateDeployment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newDep, setNewDep] = useState({ projectId: "", environment: "production", provider: "vercel" });
  
  const [selectedLogsId, setSelectedLogsId] = useState<number | null>(null);

  const { data: logs, isLoading: logsLoading } = useGetDeploymentLogs(selectedLogsId || 0, {
    query: { enabled: !!selectedLogsId, queryKey: getGetDeploymentLogsQueryKey(selectedLogsId || 0) }
  });

  const handleDeploy = () => {
    if (!newDep.projectId) return;
    createDeployment.mutate({ data: { 
      projectId: parseInt(newDep.projectId, 10), 
      environment: newDep.environment, 
      provider: newDep.provider 
    }}, {
      onSuccess: () => {
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getListDeploymentsQueryKey() });
        toast({ title: "Bot deployed successfully" });
      }
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'building':
      case 'pending': return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bot Deployments</h1>
          <p className="text-muted-foreground">Monitor and manage your live trading bots.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Deploy Bot</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deploy Trading Bot</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Strategy ID</Label>
                <Input value={newDep.projectId} onChange={e => setNewDep({...newDep, projectId: e.target.value})} placeholder="e.g. 1" type="number" />
              </div>
              <div className="space-y-2">
                <Label>Environment</Label>
                <Select value={newDep.environment} onValueChange={v => setNewDep({...newDep, environment: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="preview">Preview</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={newDep.provider} onValueChange={v => setNewDep({...newDep, provider: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vercel">AWS</SelectItem>
                    <SelectItem value="railway">Railway</SelectItem>
                    <SelectItem value="netlify">DigitalOcean</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleDeploy} disabled={createDeployment.isPending || !newDep.projectId}>
                Deploy Bot
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-xl bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Strategy</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : deployments?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No bots deployed yet.
                </TableCell>
              </TableRow>
            ) : (
              deployments?.map((dep) => (
                <TableRow key={dep.id}>
                  <TableCell className="font-medium">{dep.projectName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{dep.environment}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 capitalize text-sm">
                      {getStatusIcon(dep.status)} {dep.status}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm capitalize">
                      <Cloud className="w-4 h-4 text-muted-foreground" />
                      {dep.provider}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {dep.duration ? `${dep.duration}s` : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(dep.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Dialog open={selectedLogsId === dep.id} onOpenChange={(open) => !open && setSelectedLogsId(null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedLogsId(dep.id)}>
                            <Terminal className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>Bot Logs: {dep.projectName}</DialogTitle>
                          </DialogHeader>
                          <div className="bg-black text-gray-300 p-4 rounded-md h-[400px] overflow-y-auto font-mono text-xs">
                            {logsLoading ? (
                              <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-6 h-6 animate-spin text-white" />
                              </div>
                            ) : logs?.length ? (
                              logs.map((log) => (
                                <div key={log.id} className={`mb-1 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : ''}`}>
                                  <span className="text-gray-500 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                  {log.message}
                                </div>
                              ))
                            ) : (
                              <div className="text-gray-500">No logs available for this bot.</div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                      
                      <Button variant="ghost" size="sm" asChild disabled={!dep.url}>
                        {dep.url ? (
                          <a href={dep.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        ) : (
                          <span><ExternalLink className="w-4 h-4 opacity-50" /></span>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageTransition>
  );
}