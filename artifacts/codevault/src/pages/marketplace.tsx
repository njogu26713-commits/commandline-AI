import { useState } from "react";
import { 
  useListMarketplaceItems,
  useCreateMarketplaceItem,
  getListMarketplaceItemsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Star, Plus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/page-transition";

export default function Marketplace() {
  const { data: items, isLoading } = useListMarketplaceItems();
  const createItem = useCreateMarketplaceItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newItem, setNewItem] = useState({ title: "", description: "", category: "template", price: "0" });

  const filteredItems = items?.filter(i => 
    i.title.toLowerCase().includes(search.toLowerCase()) || 
    i.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!newItem.title) return;
    createItem.mutate({ data: { 
      ...newItem, 
      price: parseFloat(newItem.price) || 0,
      tags: []
    }}, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setNewItem({ title: "", description: "", category: "template", price: "0" });
        queryClient.invalidateQueries({ queryKey: getListMarketplaceItemsQueryKey() });
        toast({ title: "Item published to marketplace" });
      }
    });
  };

  return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-primary text-primary-foreground p-8 rounded-2xl relative overflow-hidden">
        <div className="z-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Marketplace</h1>
          <p className="text-primary-foreground/80 max-w-xl">
            Discover templates, AI agents, and integrations to accelerate your workflow.
          </p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary" className="gap-2 z-10"><Plus className="w-4 h-4" /> Publish Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publish to Marketplace</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={newItem.title} onChange={e => setNewItem({...newItem, title: e.target.value})} placeholder="e.g. Next.js SaaS Starter" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} placeholder="What does this do?" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={newItem.category} onValueChange={v => setNewItem({...newItem, category: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="template">Template</SelectItem>
                      <SelectItem value="bot">AI Bot</SelectItem>
                      <SelectItem value="integration">Integration</SelectItem>
                      <SelectItem value="tool">Tool</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Price ($)</Label>
                  <Input type="number" min="0" step="0.01" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createItem.isPending || !newItem.title}>Publish</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Decorative background shapes */}
        <div className="absolute right-0 top-0 -translate-y-1/2 translate-x-1/3 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 w-64 h-64 bg-white/10 rounded-full blur-2xl"></div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search marketplace..." 
          className="pl-9 max-w-md bg-background"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : filteredItems?.length === 0 ? (
        <div className="text-center py-24 border rounded-xl border-dashed">
          <h3 className="text-lg font-semibold">No items found</h3>
          <p className="text-muted-foreground mt-1">Try adjusting your search query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredItems?.map((item) => (
            <Card key={item.id} className="h-full flex flex-col hover:shadow-md transition-shadow group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className="capitalize text-xs">{item.category}</Badge>
                  <div className="font-bold text-lg">
                    {item.price === 0 ? 'Free' : `$${item.price}`}
                  </div>
                </div>
                <CardTitle className="text-lg line-clamp-1">{item.title}</CardTitle>
                <CardDescription className="text-xs">by {item.author}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {item.description}
                </p>
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-4">
                    {item.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter className="border-t pt-4 flex flex-col gap-3">
                <div className="flex justify-between w-full text-xs text-muted-foreground font-medium">
                  <span className="flex items-center gap-1"><Download className="w-3 h-3" /> {item.downloads.toLocaleString()}</span>
                  <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-500 fill-yellow-500" /> {item.rating.toFixed(1)}</span>
                </div>
                <Button className="w-full gap-2">
                  Get Access
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  );
}