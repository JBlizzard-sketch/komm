import { useState } from "react";
import {
  Settings2,
  MessageSquare,
  Mail,
  Smartphone,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Info,
  Webhook,
  RefreshCw,
  FlaskConical,
  Copy,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

function WebhookPanel({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const fullUrl = `${window.location.origin}/api${path}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex items-start gap-2 p-3 bg-muted/40 border border-border rounded-lg">
      <Webhook className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground mb-0.5">Webhook endpoint</p>
        <code className="text-xs font-mono text-muted-foreground break-all">{fullUrl}</code>
      </div>
      <button
        onClick={handleCopy}
        title="Copy webhook URL"
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

type ProviderStatus = "active" | "simulated";
interface StatusResponse { sms: ProviderStatus; whatsapp: ProviderStatus; email: ProviderStatus }

function useProviderStatus() {
  return useQuery<StatusResponse>({
    queryKey: ["settings-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

interface TestResult { success: boolean; simulated: boolean; messageId: string | null; error: string | null }

interface IntegrationCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  status: ProviderStatus | "loading";
  channel: "sms" | "whatsapp" | "email";
  envVars: { name: string; description: string; example: string }[];
  docsUrl: string;
  webhookPath?: string;
}

function IntegrationCard({
  title, description, icon: Icon, iconColor, status, channel, envVars, docsUrl, webhookPath,
}: IntegrationCardProps) {
  const [showVars, setShowVars] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/settings/test/${channel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data: TestResult = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, simulated: false, messageId: null, error: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  const statusConfig = {
    active: { label: "Active", class: "bg-green-100 text-green-800 border-green-200", dot: "bg-green-500" },
    simulated: { label: "Simulated", class: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" },
    loading: { label: "Checking…", class: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground/40" },
  }[status];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor}`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={`shrink-0 flex items-center gap-1.5 text-xs ${statusConfig.class}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "simulated" && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Running in simulation mode. Messages are logged but not actually sent. Configure the
              environment variables below to enable real sending.
            </span>
          </div>
        )}
        {status === "active" && (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Credentials detected. Messages will be sent via the live provider.</span>
          </div>
        )}

        {testResult && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${testResult.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
            {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
            <span>
              {testResult.success
                ? testResult.simulated
                  ? "Connection test simulated successfully (no real provider configured)."
                  : `Connection test sent via live provider.${testResult.messageId ? ` Message ID: ${testResult.messageId}` : ""}`
                : `Test failed: ${testResult.error ?? "Unknown error"}`}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowVars((v) => !v)}
              className="text-xs text-primary hover:underline font-medium"
            >
              {showVars ? "Hide" : "Show"} required environment variables
            </button>
            <button
              onClick={handleTest}
              disabled={testing || status === "loading"}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              data-testid={`test-${channel}`}
            >
              <FlaskConical className={`w-3 h-3 ${testing ? "animate-pulse" : ""}`} />
              {testing ? "Testing…" : "Test connection"}
            </button>
          </div>
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {showVars && (
          <div className="space-y-2">
            {envVars.map((v) => (
              <div key={v.name} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-xs font-mono font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                    {v.name}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">{v.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Example: <code className="text-xs font-mono">{v.example}</code>
                </p>
              </div>
            ))}

            <div className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-lg p-3">
              <p className="font-medium text-foreground mb-1">How to set environment variables on Replit</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open the Secrets tab (lock icon in the sidebar)</li>
                <li>Add each variable with its key and value</li>
                <li>Restart the API Server workflow to apply changes</li>
              </ol>
            </div>
          </div>
        )}

        {webhookPath && (
          <WebhookPanel path={webhookPath} />
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { data: status, isLoading, refetch, isFetching } = useProviderStatus();

  const getStatus = (provider: keyof StatusResponse): ProviderStatus | "loading" => {
    if (isLoading) return "loading";
    return status?.[provider] ?? "simulated";
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-muted-foreground" />
            Settings & Integrations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure your messaging channels. All providers fall back to simulation mode when
            credentials are not set.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs h-8"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh Status
        </Button>
      </div>

      <div className="grid gap-5">
        <IntegrationCard
          title="Africa's Talking — SMS"
          description="Bulk SMS delivery across Kenya, Uganda, Tanzania, Ghana and more via USSD/GSM."
          icon={Smartphone}
          iconColor="bg-[#e53e00]"
          channel="sms"
          status={getStatus("sms")}
          docsUrl="https://developers.africastalking.com/docs/sms/sending"
          webhookPath="/webhooks/at/delivery"
          envVars={[
            { name: "AT_API_KEY", description: "Your Africa's Talking API key (found in the AT dashboard under API Key).", example: "atsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
            { name: "AT_USERNAME", description: 'Your Africa\'s Talking username (use "sandbox" for testing).', example: "MyOrgName" },
            { name: "AT_SENDER_ID", description: "Alphanumeric sender ID (optional — must be approved by AT). Leave blank to use a short code.", example: "KOMM" },
          ]}
        />

        <IntegrationCard
          title="WhatsApp Cloud API"
          description="Send WhatsApp messages via the Meta / WhatsApp Business Cloud API."
          icon={MessageSquare}
          iconColor="bg-[#25d366]"
          channel="whatsapp"
          status={getStatus("whatsapp")}
          docsUrl="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
          webhookPath="/webhooks/whatsapp"
          envVars={[
            { name: "WHATSAPP_TOKEN", description: "Permanent access token from your Meta App's WhatsApp product.", example: "EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
            { name: "WHATSAPP_PHONE_ID", description: "Phone Number ID from Meta's WhatsApp Business Manager.", example: "123456789012345" },
            { name: "WHATSAPP_VERIFY_TOKEN", description: "Any secret string you choose. Used to verify the webhook with Meta.", example: "komm-webhook-verify" },
          ]}
        />

        <IntegrationCard
          title="Email — SMTP"
          description="Send transactional and bulk emails via any SMTP provider (Gmail, SendGrid, Mailgun, Resend…)."
          icon={Mail}
          iconColor="bg-indigo-600"
          channel="email"
          status={getStatus("email")}
          docsUrl="https://nodemailer.com/smtp/"
          envVars={[
            { name: "SMTP_HOST", description: "SMTP server hostname.", example: "smtp.sendgrid.net" },
            { name: "SMTP_PORT", description: "SMTP port. Use 587 for TLS (STARTTLS) or 465 for SSL.", example: "587" },
            { name: "SMTP_USER", description: "SMTP authentication username.", example: "apikey" },
            { name: "SMTP_PASS", description: "SMTP authentication password or API key.", example: "SG.xxxxxxxxxxxx" },
            { name: "SMTP_FROM", description: "From address shown to recipients. Defaults to SMTP_USER if not set.", example: "Komm <noreply@yourorg.co.ke>" },
          ]}
        />
      </div>

      <Card className="mt-5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">System Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              {[
                { label: "Campaign Scheduler", value: "Running", ok: true },
                { label: "Delivery Webhooks", value: "Ready", ok: true },
                { label: "SMS Provider", value: getStatus("sms") === "active" ? "Active" : "Simulated", ok: getStatus("sms") === "active" },
                { label: "WhatsApp Provider", value: getStatus("whatsapp") === "active" ? "Active" : "Simulated", ok: getStatus("whatsapp") === "active" },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-center gap-1.5">
                    {item.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-amber-500" />
                    )}
                    <span className="text-xs font-medium">{item.value}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 text-xs text-muted-foreground text-center">
        Komm v1.0 · Built for Kenyan SACCOs, churches, and member-based organisations
      </div>
    </div>
  );
}
