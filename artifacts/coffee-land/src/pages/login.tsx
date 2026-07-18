import { useState } from "react";
import { useLocation } from "wouter";
import { Coffee, Loader2 } from "lucide-react";
import { useLogin } from "@workspace/api-client-react";
import { setToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BilingualText } from "@/components/bilingual-text";
import { toast } from "sonner";

export default function Login() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useLogin();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    try {
      const res = await loginMutation.mutateAsync({ data: { username, password } });
      if (res.token) {
        setToken(res.token);
        
        // Redirect based on role
        if (res.user.role === 'kitchen') {
          setLocation('/kds');
        } else if (res.user.role === 'cashier') {
          setLocation('/pos');
        } else {
          setLocation('/');
        }
      }
    } catch (err: any) {
      toast.error("Login failed", { description: err?.data?.error || "Please check your credentials" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Decorative background elements matching the coffee aesthetic */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-3xl" />
      
      <div className="w-full max-w-md bg-card border border-border shadow-xl rounded-2xl p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4 shadow-md text-primary-foreground">
            <Coffee className="w-8 h-8" />
          </div>
          <BilingualText 
            en="Welcome to Coffee Land" 
            am="እንኳን ወደ ቡና ምድር በደህና መጡ" 
            className="text-2xl font-bold text-center text-foreground" 
          />
          <p className="text-muted-foreground mt-2 text-sm text-center">
            Sign in to your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username">Username / የተጠቃሚ ስም</Label>
            <Input
              id="username"
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loginMutation.isPending}
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password / የይለፍ ቃል</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loginMutation.isPending}
              className="bg-background"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
