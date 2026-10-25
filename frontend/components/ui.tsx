import { CircleAlert } from "lucide-react";

export function CardHeader({ title, id, tag, children }: { title: string; id?: string; tag?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {children ?? (tag && <span className="tag">{tag}</span>)}
    </div>
  );
}

export function IconCircle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary ${className}`}
    >
      {children}
    </span>
  );
}

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[#f8cfcb] bg-[#fff4f3] px-4 py-3 text-sm font-medium text-critical"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
