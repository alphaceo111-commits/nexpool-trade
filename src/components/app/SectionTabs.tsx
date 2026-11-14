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
      className="flex gap-2 overflow-x-auto rounded-full border border-border/60 bg-card/60 p-1 no-scrollbar"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              "shrink-0 rounded-full px-4 py-2 text-[11px] font-semibold tracking-[0.005em] transition-all",
              isActive
                ? "bg-primary text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.18)_inset]"
                : "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
