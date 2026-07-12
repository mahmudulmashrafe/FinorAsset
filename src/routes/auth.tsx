import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — FinorAsset" }] }),
  component: AuthPage,
});

// ─── Zod Schemas ────────────────────────────────────────────────────────────
const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signUpSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

type FieldErrors = Record<string, string>;

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">("signin");

  // OTP passwordless states
  const [useOtp, setUseOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  useEffect(() => {
    // Check if recovery link was clicked
    if (window.location.search.includes("recovery=true")) {
      setMode("reset");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const result = signInSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrs: FieldErrors = {};
      result.error.errors.forEach((err) => {
        const key = err.path[0] as string;
        fieldErrs[key] = err.message;
      });
      setErrors(fieldErrs);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const result = signUpSchema.safeParse({ name, email, password });
    if (!result.success) {
      const fieldErrs: FieldErrors = {};
      result.error.errors.forEach((err) => {
        const key = err.path[0] as string;
        fieldErrs[key] = err.message;
      });
      setErrors(fieldErrs);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome! Check your inbox if email confirmation is required.");
    navigate({ to: "/dashboard" });
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) toast.error("Google sign-in failed: " + error.message);
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?recovery=true`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password reset link sent! Check your inbox.");
      setMode("signin");
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully!");
      navigate({ to: "/dashboard" });
    }
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("OTP code sent to your email!");
      setOtpSent(true);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otpCode) {
      toast.error("Please enter the verification code");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Signed in successfully!");
      navigate({ to: "/dashboard" });
    }
  }

  return (
    <div className="h-screen w-full bg-background text-foreground flex flex-col justify-between overflow-hidden relative">
      {/* Premium subtle background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,oklch(0.72_0.16_55_/_8%),transparent_50%)] pointer-events-none" />

      {/* Header navbar - Large logo and navigation */}
      <header className="w-full border-b bg-background/50 backdrop-blur-sm sticky top-0 z-50 h-28 flex items-center">
        <div className="flex w-full items-center justify-between px-6 md:px-12 lg:px-20 py-4">
          <Link to="/" className="flex items-center gap-4 font-serif text-2xl md:text-3xl font-black select-none hover:opacity-90 transition-opacity">
            <span className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-accent shadow-[0_0_12px_rgba(217,119,6,0.5)]" />
            </span>
            <span>FinorAsset</span>
          </Link>
          <nav className="flex items-center gap-6 text-lg md:text-xl font-bold">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">Back to home</Link>
          </nav>
        </div>
      </header>

      {/* Main content - Centered Card */}
      <main className="flex-1 flex flex-col items-center justify-center w-full px-6 py-4 relative z-10 overflow-y-auto thin-scroll">
        <div className="w-full max-w-sm bg-card border rounded-2xl p-6 md:p-8 shadow-sm">
          <div className="text-center mb-6">
            <h1 className="font-serif text-3xl font-bold">
              {mode === "signin" && (useOtp ? "OTP Login" : "Welcome")}
              {mode === "signup" && "Create FinorAsset"}
              {mode === "forgot" && "Reset Password"}
              {mode === "reset" && "Update Password"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin" && (useOtp ? (otpSent ? "Verify verification code" : "Sign in using a one-time code") : "Sign in to your FinorAsset or create one.")}
              {mode === "signup" && "Start your personal finance compass."}
              {mode === "forgot" && "Enter your email to receive a recovery link."}
              {mode === "reset" && "Enter your new password below."}
            </p>
          </div>

          {(mode === "signin" || mode === "signup") && (
            <>
              <Button variant="outline" className="w-full font-semibold rounded-xl h-11" onClick={signInWithGoogle} id="google-signin-btn">
                Continue with Google
              </Button>
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          {mode === "signin" || mode === "signup" ? (
            <Tabs value={mode} onValueChange={(v) => { setMode(v as any); setUseOtp(false); setOtpSent(false); setOtpCode(""); }}>
              <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/30 p-1 rounded-lg">
                <TabsTrigger value="signin" id="tab-signin" className="rounded-md font-medium">Sign in</TabsTrigger>
                <TabsTrigger value="signup" id="tab-signup" className="rounded-md font-medium">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-0">
                {useOtp ? (
                  !otpSent ? (
                    <form onSubmit={sendOtp} className="space-y-4" noValidate>
                      <div className="space-y-1.5">
                        <Label htmlFor="otp-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
                        <Input
                          id="otp-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your@email.com"
                          className="rounded-xl h-11"
                        />
                      </div>
                      <Button type="submit" className="w-full rounded-xl h-11 font-semibold" disabled={loading}>
                        {loading ? "Sending..." : "Send Life Line"}
                      </Button>
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setUseOtp(false);
                            setErrors({});
                          }}
                          className="text-xs text-accent hover:underline font-medium cursor-pointer"
                        >
                          Sign in with password instead
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={verifyOtp} className="space-y-4" noValidate>
                      <div className="space-y-1.5">
                        <Label htmlFor="otp-code" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">One-Time Code (OTP)</Label>
                        <Input
                          id="otp-code"
                          type="text"
                          required
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          placeholder="Enter 6-digit code"
                          className="rounded-xl h-11 text-center tracking-[0.2em] font-mono text-lg font-bold"
                          maxLength={6}
                        />
                        <p className="text-[11px] text-muted-foreground leading-normal mt-1.5 text-center">
                          We sent a sign-in email to <strong>{email}</strong>.<br />
                          Click the <strong>"Sign in"</strong> link in the email to log in directly, or enter the code if your template is configured with one.
                        </p>
                      </div>
                      <Button type="submit" className="w-full rounded-xl h-11 font-semibold" disabled={loading}>
                        {loading ? "Verifying..." : "Verify & Sign In"}
                      </Button>
                      <div className="text-center pt-2 flex justify-between px-1">
                        <button
                          type="button"
                          onClick={sendOtp}
                          className="text-xs text-accent hover:underline font-medium cursor-pointer"
                          disabled={loading}
                        >
                          Resend code
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setOtpCode("");
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
                        >
                          Change email
                        </button>
                      </div>
                    </form>
                  )
                ) : (
                  <form onSubmit={signIn} className="space-y-4" noValidate id="signin-form">
                    <div className="space-y-1.5">
                      <Label htmlFor="signin-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
                      <Input
                        id="signin-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        aria-invalid={!!errors.email}
                        className="rounded-xl h-11"
                      />
                      {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="signin-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</Label>
                        <button
                          type="button"
                          onClick={() => setMode("forgot")}
                          className="text-xs text-accent hover:underline font-medium cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <Input
                        id="signin-password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={!!errors.password}
                        className="rounded-xl h-11"
                      />
                      {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
                    </div>
                    <Button type="submit" className="w-full rounded-xl h-11 font-semibold" disabled={loading} id="signin-submit">
                      {loading ? "Signing in…" : "Sign in"}
                    </Button>
                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setUseOtp(true);
                          setErrors({});
                        }}
                        className="text-xs text-accent hover:underline font-medium cursor-pointer"
                      >
                        Passwordless Sign in
                      </button>
                    </div>
                  </form>
                )}
              </TabsContent>
              <TabsContent value="signup" className="mt-0">
                <form onSubmit={signUp} className="space-y-3" noValidate id="signup-form">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name (optional)</Label>
                    <Input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={!!errors.email}
                      className="rounded-xl h-11"
                    />
                    {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={!!errors.password}
                      className="rounded-xl h-11"
                    />
                    {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
                    <p className="text-[10px] text-muted-foreground leading-tight">Min 8 chars, one uppercase, one number</p>
                  </div>
                  <Button type="submit" className="w-full rounded-xl h-11 font-semibold mt-2" disabled={loading} id="signup-submit">
                    {loading ? "Creating account…" : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          ) : mode === "forgot" ? (
            <form onSubmit={handleForgotPassword} className="space-y-4" noValidate id="forgot-form">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Address</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="rounded-xl h-11"
                />
              </div>
              <Button type="submit" className="w-full rounded-xl h-11 font-semibold" disabled={loading} id="forgot-submit">
                {loading ? "Sending..." : "Send recovery link"}
              </Button>
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="text-sm text-accent hover:underline font-medium cursor-pointer"
                >
                  Back to Sign in
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-4" noValidate id="reset-form">
              <div className="space-y-1.5">
                <Label htmlFor="reset-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New Password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="rounded-xl h-11"
                />
              </div>
              <Button type="submit" className="w-full rounded-xl h-11 font-semibold" disabled={loading} id="reset-submit">
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/5 w-full relative z-10 h-16 flex items-center justify-center">
        <div className="text-center text-xs text-muted-foreground font-serif tracking-wider">
          © {new Date().getFullYear()} FINORASSET &middot; Personal Finance Compass &middot; Designed by Mahmudul Mashrafe
        </div>
      </footer>
    </div>
  );
}
