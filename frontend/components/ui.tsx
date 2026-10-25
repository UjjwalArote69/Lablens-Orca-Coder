export function CardHeader({ title, id, aside }: { title: string; id?: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 id={id} className="text-[1.375rem] leading-tight font-bold tracking-tight">
        {title}
      </h2>
      {aside}
    </div>
  );
}

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-2xl border border-[#f3c9c2] bg-[#fdf1ef] px-4 py-3 font-medium text-critical">
      {children}
    </p>
  );
}
