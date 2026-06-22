import { useState } from "react";
import { useParams } from "wouter";
import { 
  useGetProject, getGetProjectQueryKey,
  useListProjectFiles,
  useListCommits,
  useListBranches,
  useListIssues,
  useCreateIssue,
  getListIssuesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  FileCode, Folder, Github, Globe, Star, GitFork, 
  GitCommit, GitBranch, CircleDot, Clock, CheckCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/page-transition";

export default function ProjectDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading: projectLoading } = useGetProject(id, { query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) } });
  const { data: files, isLoading: filesLoading } = useListProjectFiles(id, { query: { enabled: !!id } });
  const { data: commits, isLoading: commitsLoading } = useListCommits(id, { query: { enabled: !!id } });
  const { data: branches, isLoading: branchesLoading } = useListBranches(id, { query: { enabled: !!id } });
  const { data: issues, isLoading: issuesLoading } = useListIssues(id, { query: { enabled: !!id } });

  const createIssue = useCreateIssue();
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [newIssue, setNewIssue] = useState({ title: "", description: "", priority: "medium" });

  if (projectLoading) return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto">
      <Skeleton className="h-12 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-[400px] w-full" />
    </PageTransition>
  );

  if (!project) return <PageTransition className="text-center py-20 font-medium">Project not found</PageTransition>;

  const handleCreateIssue = () => {
    if (!newIssue.title) return;
    createIssue.mutate({ id, data: newIssue }, {
      onSuccess: () => {
        setIsIssueOpen(false);
        setNewIssue({ title: "", description: "", priority: "medium" });
        queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(id) });
        toast({ title: "Issue created" });
      }
    });
  };

  return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant={project.isPrivate ? "secondary" : "outline"}>
              {project.isPrivate ? "Private" : "Public"}
            </Badge>
          </div>
          <p className="text-muted-foreground">{project.description || "No description provided."}</p>
        </div>
        <div className="flex gap-2">
          {project.githubUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
                <Github className="w-4 h-4 mr-2" /> GitHub
              </a>
            </Button>
          )}
          {project.deploymentUrl && (
            <Button size="sm" asChild>
              <a href={project.deploymentUrl} target="_blank" rel="noopener noreferrer">
                <Globe className="w-4 h-4 mr-2" /> Visit App
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-6 overflow-x-auto text-sm text-muted-foreground pb-2">
        <span className="flex items-center gap-1.5"><Badge variant="secondary">{project.language}</Badge></span>
        <span className="flex items-center gap-1.5"><Star className="w-4 h-4" /> {project.stars} stars</span>
        <span className="flex items-center gap-1.5"><GitFork className="w-4 h-4" /> {project.forks} forks</span>
        <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
      </div>

      <Tabs defaultValue="code" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
          <TabsTrigger value="code" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 shadow-none">
            <FileCode className="w-4 h-4 mr-2" /> Code
          </TabsTrigger>
          <TabsTrigger value="commits" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 shadow-none">
            <GitCommit className="w-4 h-4 mr-2" /> Commits
          </TabsTrigger>
          <TabsTrigger value="branches" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 shadow-none">
            <GitBranch className="w-4 h-4 mr-2" /> Branches
          </TabsTrigger>
          <TabsTrigger value="issues" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 shadow-none">
            <CircleDot className="w-4 h-4 mr-2" /> Issues {issues?.length ? <Badge variant="secondary" className="ml-2">{issues.length}</Badge> : null}
          </TabsTrigger>
        </TabsList>

        <div className="mt-6 border rounded-lg overflow-hidden bg-card">
          <TabsContent value="code" className="m-0 border-0 p-0">
            <div className="bg-muted px-4 py-3 flex items-center justify-between border-b text-sm font-medium">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4" /> main
              </div>
              <div className="text-muted-foreground flex gap-4">
                <span>{commits?.[0]?.message || 'Initial commit'}</span>
                <span>{commits?.[0] ? new Date(commits[0].date).toLocaleDateString() : ''}</span>
              </div>
            </div>
            {filesLoading ? (
              <div className="p-4 space-y-3">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : files?.length ? (
              <ul className="divide-y text-sm">
                {files.map((file, i) => (
                  <li key={i} className="px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {file.type === 'directory' ? 
                        <Folder className="w-4 h-4 text-blue-500 fill-blue-500/20" /> : 
                        <FileCode className="w-4 h-4 text-muted-foreground" />
                      }
                      <span className="font-medium cursor-pointer hover:text-primary transition-colors hover:underline">
                        {file.name}
                      </span>
                    </div>
                    <div className="flex gap-4 text-muted-foreground text-xs w-1/2 justify-between">
                      <span className="truncate flex-1">{file.lastCommit}</span>
                      <span>{file.lastCommitDate ? new Date(file.lastCommitDate).toLocaleDateString() : ''}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-12 text-center text-muted-foreground">Repository is empty</div>
            )}
          </TabsContent>

          <TabsContent value="commits" className="m-0 border-0 p-0">
            {commitsLoading ? (
              <div className="p-4 space-y-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : commits?.length ? (
              <ul className="divide-y text-sm">
                {commits.map((commit) => (
                  <li key={commit.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-medium text-base">{commit.message}</p>
                      <Button variant="outline" size="sm" className="font-mono text-xs h-7">{commit.sha.substring(0, 7)}</Button>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <span className="font-medium text-foreground">{commit.author}</span>
                      <span>committed on {new Date(commit.date).toLocaleDateString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-12 text-center text-muted-foreground">No commits yet</div>
            )}
          </TabsContent>

          <TabsContent value="branches" className="m-0 border-0 p-0">
             {branchesLoading ? (
              <div className="p-4 space-y-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : branches?.length ? (
              <ul className="divide-y text-sm">
                {branches.map((branch, i) => (
                  <li key={i} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <GitBranch className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{branch.name}</span>
                      {branch.isDefault && <Badge variant="secondary" className="text-[10px] h-5">Default</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Updated {new Date(branch.updatedAt).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-12 text-center text-muted-foreground">No branches</div>
            )}
          </TabsContent>

          <TabsContent value="issues" className="m-0 border-0 p-0">
            <div className="p-4 border-b flex justify-between items-center bg-muted/30">
              <div className="flex items-center gap-4 text-sm font-medium">
                <span className="flex items-center gap-1"><CircleDot className="w-4 h-4 text-green-500" /> {issues?.filter(i => i.status === 'open').length || 0} Open</span>
                <span className="flex items-center gap-1 text-muted-foreground"><CheckCircle className="w-4 h-4" /> {issues?.filter(i => i.status === 'closed').length || 0} Closed</span>
              </div>
              <Dialog open={isIssueOpen} onOpenChange={setIsIssueOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">New Issue</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Issue</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input value={newIssue.title} onChange={e => setNewIssue({...newIssue, title: e.target.value})} placeholder="Issue title" />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea value={newIssue.description} onChange={e => setNewIssue({...newIssue, description: e.target.value})} placeholder="Describe the issue..." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsIssueOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateIssue} disabled={createIssue.isPending || !newIssue.title}>Create</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {issuesLoading ? (
               <div className="p-4 space-y-4">
                {[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : issues?.length ? (
              <ul className="divide-y text-sm">
                {issues.map((issue) => (
                  <li key={issue.id} className="p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors">
                    <CircleDot className={`w-4 h-4 mt-1 ${issue.status === 'open' ? 'text-green-500' : 'text-muted-foreground'}`} />
                    <div className="flex-1">
                      <div className="font-medium text-base mb-1">{issue.title}</div>
                      <div className="text-xs text-muted-foreground flex gap-2 items-center">
                        <span>#{issue.id} opened {new Date(issue.createdAt).toLocaleDateString()}</span>
                        {issue.labels?.map(l => <Badge key={l} variant="outline" className="text-[10px] h-4 py-0">{l}</Badge>)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-12 text-center text-muted-foreground">No issues found</div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </PageTransition>
  );
}