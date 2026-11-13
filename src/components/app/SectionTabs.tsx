import { cn } from "@/lib/utils";
import { NavLink } from "react-router";

export type SectionTab = {
  to: string;
  label: string;
  end?: boolean;
};

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <nav
      aria-label="Section navigation"
      className="flex gap-1 overflow-x-auto border-b border-border/70 pb-2"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              "shrink-0 border px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors",
              isActive
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
