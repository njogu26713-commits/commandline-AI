import { useGetMyProfile, useGetContributions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Link as LinkIcon, Calendar, Github, Trophy, Star, GitFork, GitCommit } from "lucide-react";
import { PageTransition } from "@/components/page-transition";

export default function Profile() {
  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const { data: contributions, isLoading: contribLoading } = useGetContributions();

  if (profileLoading || contribLoading) return (
    <PageTransition className="space-y-6 max-w-5xl mx-auto">
      <Skeleton className="h-48 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-96 col-span-1 rounded-xl" />
        <Skeleton className="h-96 col-span-2 rounded-xl" />
      </div>
    </PageTransition>
  );

  if (!profile) return <PageTransition className="text-center py-20 font-medium">Profile not found</PageTransition>;

  return (
    <PageTransition className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Profile Header */}
      <div className="border rounded-2xl p-8 bg-card relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-primary/10 to-indigo-500/10"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6 mt-8">
          <div className="w-24 h-24 rounded-full border-4 border-background bg-muted flex items-center justify-center text-3xl font-bold text-muted-foreground shadow-sm">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full rounded-full object-cover" />
            ) : (
              profile.displayName.charAt(0)
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">{profile.displayName}</h1>
            <p className="text-xl text-muted-foreground">@{profile.username}</p>
            <p className="mt-2 text-foreground/80 max-w-2xl">{profile.bio || "Full-stack developer building on CodeVault."}</p>
            
            <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
              {profile.location && (
                <div className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {profile.location}</div>
              )}
              {profile.website && (
                <div className="flex items-center gap-1"><LinkIcon className="w-4 h-4" /> <a href={profile.website} className="hover:underline hover:text-primary">{profile.website.replace(/^https?:\/\//, '')}</a></div>
              )}
              <div className="flex items-center gap-1"><Calendar className="w-4 h-4" /> Joined {new Date(profile.joinedAt).toLocaleDateString(undefined, {month: 'long', year: 'numeric'})}</div>
            </div>
          </div>
          <div className="flex md:flex-col gap-2 w-full md:w-auto mt-4 md:mt-0">
            <Button className="w-full md:w-32">Edit Profile</Button>
            <Button variant="outline" className="w-full md:w-32 gap-2"><Github className="w-4 h-4" /> Connect</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="space-y-1">
                  <div className="text-3xl font-bold">{profile.followers}</div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Followers</div>
                </div>
                <div className="space-y-1">
                  <div className="text-3xl font-bold">{profile.following}</div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Following</div>
                </div>
                <div className="space-y-1 pt-4 border-t">
                  <div className="text-3xl font-bold">{profile.totalProjects}</div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Projects</div>
                </div>
                <div className="space-y-1 pt-4 border-t">
                  <div className="text-3xl font-bold">{profile.totalStars}</div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Stars</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="w-5 h-5 text-yellow-500" /> Achievements
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {profile.achievements?.length ? profile.achievements.map((ach, i) => (
                <Badge key={i} variant="secondary" className="px-3 py-1 bg-muted/50 border-muted">
                  {ach}
                </Badge>
              )) : (
                <div className="text-sm text-muted-foreground">No achievements yet.</div>
              )}
              {/* Dummy achievements if none exist to show design */}
              {!profile.achievements?.length && (
                <>
                  <Badge variant="secondary" className="px-3 py-1 bg-muted/50 border-muted">Early Adopter</Badge>
                  <Badge variant="secondary" className="px-3 py-1 bg-muted/50 border-muted">AI Pioneer</Badge>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GitCommit className="w-5 h-5" /> Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Contribution Graph Simulation */}
              <div className="overflow-x-auto pb-4">
                <div className="min-w-[700px]">
                  <div className="flex justify-between text-xs text-muted-foreground mb-2 px-6">
                    <span>Mon</span><span>Wed</span><span>Fri</span>
                  </div>
                  <div className="flex gap-1">
                    {/* Simulated 52 weeks of contributions */}
                    {Array.from({ length: 52 }).map((_, weekIdx) => (
                      <div key={weekIdx} className="flex flex-col gap-1">
                        {Array.from({ length: 7 }).map((_, dayIdx) => {
                          // Try to match actual data if available, else random for design
                          const dayData = contributions?.[weekIdx * 7 + dayIdx];
                          let level = dayData?.level ?? 0;
                          
                          // Mock data if none exists so the graph isn't blank
                          if (!contributions?.length) {
                             level = Math.random() > 0.7 ? Math.floor(Math.random() * 4) + 1 : 0;
                          }

                          const colors = [
                            'bg-muted border border-muted-foreground/10', // 0
                            'bg-primary/20', // 1
                            'bg-primary/40', // 2
                            'bg-primary/70', // 3
                            'bg-primary'     // 4
                          ];
                          
                          return (
                            <div 
                              key={dayIdx} 
                              className={`w-3 h-3 rounded-sm ${colors[level]}`}
                              title={dayData ? `${dayData.count} contributions on ${dayData.date}` : undefined}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2 px-1">
                    <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <h3 className="font-bold text-lg mb-4">Pinned Projects</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Placeholder pinned projects to show layout */}
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-bold text-primary hover:underline">nextjs-ai-saas</h4>
                    <Badge variant="outline" className="text-[10px]">Public</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 line-clamp-2">
                    A complete boilerplate for building AI-powered SaaS apps with Next.js, Stripe, and OpenAI.
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> TypeScript</span>
                    <span className="flex items-center gap-1"><Star className="w-3 h-3" /> 124</span>
                    <span className="flex items-center gap-1"><GitFork className="w-3 h-3" /> 23</span>
                  </div>
                </CardContent>
              </Card>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-bold text-primary hover:underline">trading-bot-core</h4>
                    <Badge variant="secondary" className="text-[10px]">Private</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 line-clamp-2">
                    High-frequency trading engine written in Rust with Python ML integration.
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Rust</span>
                    <span className="flex items-center gap-1"><Star className="w-3 h-3" /> 0</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}