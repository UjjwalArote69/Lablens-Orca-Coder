export function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl font-bold tracking-tight">
      {children}
    </h2>
  );
}

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-6 border-l-2 border-critical pl-4 text-critical">
      {children}
    </p>
  );
}
