import { requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { PageShell, PageTitle, SectionCard } from "@/components/layout-bits";
import { listApiKeys } from "@/lib/api-keys";
import { RATE_PER_MIN } from "@/lib/api-keys";
import { integrationStatus } from "@/lib/integration";
import KeyManager from "./KeyManager";
import WebhookPanel from "./WebhookPanel";

export const dynamic = "force-dynamic";

/**
 * หน้าเชื่อมต่อระบบภายนอก
 *
 * รวมสามเรื่องที่ต้องดูคู่กันไว้ที่เดียว: กุญแจของใครบ้าง · ส่งออกไปที่ไหน ·
 * และวิธีเรียก — คนที่มาตั้ง integration ต้องการทั้งสามอย่างพร้อมกัน
 * ไม่ใช่ต้องเปิดเอกสารคนละที่กับหน้าตั้งค่า
 */
export default async function ApiPage() {
  await requireAdmin();
  const t = await getT();
  const keys = await listApiKeys();
  const hook = await integrationStatus();

  const base = process.env.APP_BASE_URL || "https://<โดเมนของระบบ>";

  return (
    <PageShell>
      <div className="space-y-5">
        <PageTitle title={t("api.title")} subtitle={t("api.subtitle")} />

        <SectionCard title={t("api.keys")} hint={t("api.keysHint")}>
          <KeyManager keys={keys} />
        </SectionCard>

        <SectionCard title={t("api.howto")} hint={t("api.howtoHint", { n: String(RATE_PER_MIN) })}>
          <div className="space-y-4 text-sm">
            <Endpoint
              method="GET"
              path="/api/v1/templates"
              desc={t("api.epTemplates")}
              sample={`curl -H "X-API-Key: $KEY" ${base}/api/v1/templates`}
            />
            <Endpoint
              method="GET"
              path="/api/v1/users"
              desc={t("api.epUsers")}
              sample={`curl -H "X-API-Key: $KEY" ${base}/api/v1/users`}
            />
            <Endpoint
              method="GET"
              path="/api/v1/requests"
              desc={t("api.epList")}
              sample={`curl -H "X-API-Key: $KEY" \\\n  "${base}/api/v1/requests?status=APPROVED&since=2026-09-01&limit=100"`}
            />
            <Endpoint
              method="GET"
              path="/api/v1/requests/{id | เลขที่เอกสาร}"
              desc={t("api.epOne")}
              sample={`curl -H "X-API-Key: $KEY" ${base}/api/v1/requests/AP-PUR-202609-0007`}
            />
            <Endpoint
              method="GET"
              path="/api/v1/ping"
              desc={t("api.epPing")}
              sample={`curl -H "X-API-Key: $KEY" ${base}/api/v1/ping`}
            />
            <Endpoint
              method="GET"
              path="/api/v1/files/{id}"
              desc={t("api.epFile")}
              sample={`curl -H "X-API-Key: $KEY" ${base}/api/v1/files/9 -o เอกสารแนบ.pdf`}
            />
            <Endpoint
              method="POST"
              path="/api/v1/requests/{id | เลขที่เอกสาร}/accounting"
              desc={t("api.epAccounting")}
              write
              sample={`curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \\\n  -d '{"state":"PAID","external_ref":"OB-PV-2026-00871"}' \\\n  ${base}/api/v1/requests/AP-PUR-202609-0007/accounting`}
            />
            <Endpoint
              method="POST"
              path="/api/v1/requests"
              desc={t("api.epCreate")}
              write
              sample={`curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \\\n  -d '{"template":"PURCHASE","requester":"somchai@shd-technology.co.th",\n       "submit":true,\n       "fields":{"subject":"ซื้อโน้ตบุ๊ก","amount":45000}}' \\\n  ${base}/api/v1/requests`}
            />
          </div>
        </SectionCard>

        <SectionCard title={t("api.webhook")} hint={t("api.webhookHint")}>
          {hook.webhookReady ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted">{t("api.hookUrl")}</dt>
              <dd className="break-all font-mono text-xs text-text">{hook.url}</dd>
              <dt className="text-muted">{t("api.hookEvents")}</dt>
              <dd className="text-text">{hook.events.join(" · ")}</dd>
              <dt className="text-muted">{t("api.hookSigned")}</dt>
              <dd className="text-text">{hook.hasSecret ? t("api.hookSignedYes") : t("api.hookSignedNo")}</dd>
              <dt className="text-muted">{t("api.hookQueue")}</dt>
              <dd className="text-text">
                {Object.entries(hook.counts).map(([k, n]) => `${k}: ${n}`).join(" · ") || "—"}
              </dd>
            </dl>
          ) : (
            <p className="text-sm text-muted">{t("api.hookOff")}</p>
          )}
          <div className="mt-4">
            <WebhookPanel ready={hook.webhookReady} rows={hook.recent} />
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}

function Endpoint({
  method,
  path,
  desc,
  sample,
  write = false,
}: {
  method: string;
  path: string;
  desc: string;
  sample: string;
  write?: boolean;
}) {
  return (
    <div className="rounded-md ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className={`badge ${write ? "tone-amber" : "tone-primary"} font-mono`}>{method}</span>
        <code className="font-mono text-xs text-text">{path}</code>
        <span className="text-xs text-muted">{desc}</span>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-text-soft">
{sample}
      </pre>
    </div>
  );
}
