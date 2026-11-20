import {
  LoadingBlock,
  Metric,
  Panel,
  StatusPill,
} from "@/components/app/parts";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const DESTINATIONS = [
  { key: "channel", label: "Channel posts" },
  { key: "group", label: "Group posts" },
  { key: "bot", label: "Private bot messages" },
] as const;

/**
 * Read-only view of the backend post library. A template is only schedulable
 * when its copy has no dynamic placeholder and no missing feature; everything
 * else shows exactly what blocks it. Rendering is server-side, so the preview
 * here is the same text the delivery engine would send.
 */
export function PostLibraryPanel() {
  const catalog = useQuery(api.telegramLibrary.catalog);
  const [selected, setSelected] = useState<string | null>(null);
  const preview = useQuery(
    api.telegramLibrary.preview,
    selected ? { id: selected } : "skip",
  );

  if (!catalog) return <LoadingBlock rows={4} />;

  return (
    <div className="space-y-3">
      <Panel
        eyebrow="Automated posts"
        title="Post library"
        bodyClassName="space-y-3"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Metric label="Templates" value={catalog.counts.total} />
          <Metric label="Channel" value={catalog.counts.channel} />
          <Metric label="Group" value={catalog.counts.group} />
          <Metric label="Bot" value={catalog.counts.bot} />
          <Metric
            label="Schedulable"
            value={catalog.counts.schedulable}
            sub={`${catalog.counts.blocked} blocked`}
            tone={catalog.counts.schedulable > 0 ? "up" : "warn"}
          />
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          A template is schedulable only when its copy is static and every
          dynamic value comes from verified backend records. Blocked templates
          stay visible so the missing feature is explicit, and the renderer
          refuses to publish them rather than printing a guess.
        </p>
      </Panel>

      {DESTINATIONS.map((destination) => {
        const rows = catalog.templates.filter(
          (template) => template.destination === destination.key,
        );
        return (
          <Panel
            key={destination.key}
            eyebrow={destination.label}
            title={`${rows.length} templates`}
            bodyClassName="p-0"
          >
            <ul className="divide-y divide-border/60">
              {rows.map((template) => {
                const active = selected === template.id;
                return (
                  <li key={template.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(active ? null : template.id)}
                      aria-expanded={active}
                      className={cn(
                        "flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors",
                        active ? "bg-white/[0.04]" : "hover:bg-white/[0.025]",
                      )}
                    >
                      <span className="mt-0.5 w-8 shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-primary">
                        {template.id}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] font-medium">
                          {template.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {template.trigger}
                        </span>
                      </span>
                      <StatusPill
                        tone={
                          template.blockedBy
                            ? "warn"
                            : template.schedulable
                              ? "up"
                              : "muted"
                        }
                      >
                        {template.blockedBy
                          ? "Blocked"
                          : template.schedulable
                            ? "Schedulable"
                            : "Event"}
                      </StatusPill>
                    </button>
                    {active ? (
                      <div className="space-y-2 border-t border-border/60 bg-secondary/20 px-3.5 py-3">
                        {template.blockedBy ? (
                          <p className="text-[10.5px] leading-relaxed text-warn">
                            {template.blockedBy}
                          </p>
                        ) : null}
                        {template.placeholders.length > 0 ? (
                          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                            Values · {template.placeholders.join(", ")}
                          </p>
                        ) : null}
                        {preview?.text ? (
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-background/60 p-3 font-sans text-[11px] leading-relaxed text-foreground/90">
                            {preview.text}
                          </pre>
                        ) : (
                          <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                            {preview?.reason ??
                              (template.blockedBy
                                ? "No preview while the trigger is missing."
                                : "Loading preview…")}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
