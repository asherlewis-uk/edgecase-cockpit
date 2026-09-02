import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Sparkle } from "@/components/cockpit/Sparkle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  register,
  login,
  store,
  enterServerMode,
  copyLocalToServer,
  moveLocalToServer,
  type UserPublic,
} from "@/lib/store";
import {
  DataMigrationDialog,
  type MigrationChoice,
} from "@/components/cockpit/DataMigrationDialog";

const searchSchema = z.object({
  redirect: z.string().catch("/settings"),
  mode: z.enum(["signin", "register"]).catch("signin"),
});

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().max(128, "Display name is too long").optional(),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Cockpit" },
      { name: "description", content: "Sign in or create an Edgecase Cockpit account." },
    ],
  }),
  component: AuthPage,
  validateSearch: searchSchema,
});

function AuthPage() {
  const { redirect, mode } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"signin" | "register">(mode);
  const [globalError, setGlobalError] = useState<string | null>(null);
  // When set, a local-only user is authenticating and must choose a migration
  // behaviour before the request is sent. Holds which flow triggered it so the
  // dialog drives register and sign-in identically.
  const [pendingAuth, setPendingAuth] = useState<
    { kind: "register"; values: RegisterForm } | { kind: "signin"; values: LoginForm } | null
  >(null);
  const [migrationSubmitting, setMigrationSubmitting] = useState(false);

  useEffect(() => {
    setActiveTab(mode);
  }, [mode]);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", displayName: "" },
  });

  const handleLogin = async (values: LoginForm) => {
    setGlobalError(null);
    if (store.getState().accountMode === "local-only") {
      // Local → server sign-in: require an explicit migration choice BEFORE the
      // request so claimGuestData matches intent and no local data is eaten.
      setPendingAuth({ kind: "signin", values });
      return;
    }
    const result = await login(values.email, values.password, { claimGuestData: false });
    if (result.ok) {
      toast.success("Signed in successfully");
      navigate({ to: redirect });
      return;
    }
    setGlobalError(result.error);
  };

  const handleRegister = async (values: RegisterForm) => {
    setGlobalError(null);
    const previousMode = store.getState().accountMode;
    if (previousMode === "local-only") {
      // Local → server registration: intercept and require an explicit
      // migration choice BEFORE the register request is sent so claimGuestData
      // matches the choice and no local data silently leaks into the new account.
      setPendingAuth({ kind: "register", values });
      return;
    }
    const result = await register(values.email, values.password, values.displayName, {
      claimGuestData: false,
    });
    if (result.ok) {
      toast.success("Account created");
      navigate({ to: redirect });
      return;
    }
    setGlobalError(result.error);
  };

  const performMigrationAuth = async (
    pending: NonNullable<typeof pendingAuth>,
    choice: MigrationChoice,
  ) => {
    setGlobalError(null);
    setMigrationSubmitting(true);
    // claimGuestData is true only for Move — the one choice where the user asked
    // for their data to be relocated into the account. Copy and Keep Separate
    // leave server-side guest rows where they are.
    const claimGuestData = choice === "move";
    const opts = {
      claimGuestData,
      // Do not auto-enter server mode; run the client-side migration first, then
      // enter server mode against the correctly-populated bucket.
      onBeforeEnterServer: () => false,
    };

    const result =
      pending.kind === "register"
        ? await register(
            pending.values.email,
            pending.values.password,
            pending.values.displayName,
            opts,
          )
        : await login(pending.values.email, pending.values.password, opts);

    if (!result.ok) {
      setMigrationSubmitting(false);
      setGlobalError(result.error);
      setPendingAuth(null);
      return;
    }

    const user = result.user as UserPublic;
    const localProfileId = store.getState().localProfileId;
    if (localProfileId) {
      if (choice === "copy") {
        copyLocalToServer(user.id, localProfileId);
      } else if (choice === "move") {
        moveLocalToServer(user.id, localProfileId);
      }
      // keep-separate: local data untouched; the account bucket starts clean.
    }
    enterServerMode(user);
    setMigrationSubmitting(false);
    setPendingAuth(null);
    toast.success(pending.kind === "register" ? "Account created" : "Signed in successfully");
    navigate({ to: redirect });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-black px-4 py-8 text-white">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Sparkle size={48} />
          <h1 className="text-2xl font-light tracking-tight">Edgecase Cockpit</h1>
          <p className="text-center text-sm text-white/50">
            Sign in to save provider keys, sync settings, and keep your data secure.
          </p>
        </div>

        {globalError && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {globalError}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "signin" | "register")}>
          <TabsList className="grid w-full grid-cols-2 bg-white/5">
            <TabsTrigger
              value="signin"
              className="data-[state=active]:bg-white data-[state=active]:text-black"
            >
              Sign in
            </TabsTrigger>
            <TabsTrigger
              value="register"
              className="data-[state=active]:bg-white data-[state=active]:text-black"
            >
              Create account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          autoComplete="current-password"
                          className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-white text-black hover:bg-white/90"
                  disabled={loginForm.formState.isSubmitting}
                >
                  {loginForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="register">
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                <FormField
                  control={registerForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display name</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Optional"
                          autoComplete="name"
                          className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
                          className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-white text-black hover:bg-white/90"
                  disabled={registerForm.formState.isSubmitting}
                >
                  {registerForm.formState.isSubmitting ? "Creating account…" : "Create account"}
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>

        <p className="text-center text-xs text-white/40">
          Your session is stored in an encrypted cookie and persists for 30 days.
        </p>
      </div>

      {pendingAuth && (
        <DataMigrationDialog
          submitting={migrationSubmitting}
          onCancel={() => {
            setGlobalError(null);
            setPendingAuth(null);
          }}
          onChoose={(choice) => {
            void performMigrationAuth(pendingAuth, choice);
          }}
        />
      )}
    </div>
  );
}
