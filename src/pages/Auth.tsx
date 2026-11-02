import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { ArrowRight, ArrowUpRight, Loader2, Mail } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/app") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (submitError) {
      console.error("Email sign-in error:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (verifyError) {
      console.error("OTP verification error:", verifyError);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 terminal-grid opacity-30" />
      <header className="relative z-10 border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="transition-opacity hover:opacity-80"
            aria-label="NEXPOOL home"
          >
            <Brand subtitle="REWARDS DESK" />
          </button>
          <span className="flex items-center gap-1.5 border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="size-1.5 animate-signal-pulse rounded-full bg-up" /> secure session
          </span>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-1 gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-16">
        <div className="hidden lg:block">
          <p className="label-xs">Mining account access</p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tight">
            Mine NEX.
            <br />
            <span className="text-gold">Verified only.</span>
          </h1>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            The account, balance and mining clock are created on the backend. No
            welcome bonus, no simulated balances — accrual starts from the server
            timestamp.
          </p>

          <div className="mt-8 max-w-md border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="label-xs">Published rules</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                v1 · live backend
              </span>
            </div>
            <ul>
              {[
                ["NEX target value", "$2.50 / NEX"],
                ["Daily mining cap", "2.00 NEX"],
                ["Minimum withdrawal", "1.00 NEX"],
                ["Withdrawal gate", "10 qualified refs"],
                ["Tasks per referral", "3 verified"],
              ].map(([label, value]) => (
                <li
                  key={label}
                  className="flex items-center justify-between border-b border-border/60 px-3 py-2 font-mono text-[11px] last:border-0"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="tabular-nums">{value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[400px]">
          <div className="border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="label-xs">
                {step === "signIn" ? "Account sign in" : "Verification"}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-primary">
                <span className="size-1 bg-primary" /> nexpool v1
              </span>
            </div>

            {step === "signIn" ? (
              <div className="px-5 py-6">
                <h2 className="text-lg font-bold tracking-tight">
                  Open your NEXPOOL account
                </h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Email OTP — the account and balance are created on the backend.
                </p>

                <form onSubmit={handleEmailSubmit} className="mt-5 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="label-xs">
                      Email address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        placeholder="owner@nexpool.io"
                        type="email"
                        className="pl-9"
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>
                  {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
                  <Button
                    type="submit"
                    className="w-full gap-2 font-mono text-[11px] uppercase tracking-[0.12em]"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        Send access code <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                </form>

                <p className="mt-3 font-mono text-[9px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
                  Telegram identity is validated separately with Mini App initData
                  when the bot token is configured.
                </p>
              </div>
            ) : (
              <form onSubmit={handleOtpSubmit} className="px-5 py-6">
                <h2 className="text-lg font-bold tracking-tight">Check your inbox</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Access code sent to <span className="text-foreground">{step.email}</span>
                </p>
                <input type="hidden" name="email" value={step.email} />
                <input type="hidden" name="code" value={otp} />

                <div className="mt-5 flex justify-center">
                  <InputOTP
                    value={otp}
                    onChange={setOtp}
                    maxLength={6}
                    disabled={isLoading}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && otp.length === 6 && !isLoading) {
                        const form = (event.target as HTMLElement).closest("form");
                        if (form) form.requestSubmit();
                      }
                    }}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {error ? (
                  <p className="mt-3 text-center text-[12px] text-destructive">{error}</p>
                ) : null}
                <Button
                  type="submit"
                  className="mt-5 w-full gap-2 font-mono text-[11px] uppercase tracking-[0.12em]"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Verifying
                    </>
                  ) : (
                    <>
                      Verify & enter <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
                <div className="mt-2 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep("signIn")}
                    className={cn("font-mono text-[10px] uppercase tracking-[0.1em]")}
                  >
                    Use another email
                  </Button>
                  <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    <ArrowUpRight className="size-3" /> encrypted
                  </span>
                </div>
              </form>
            )}

            <div className="border-t border-border bg-panel px-5 py-2.5 font-mono text-[9px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
              Secured by convex auth · withdrawals require server approval
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
