export default function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-lg border border-[#F3C1BC] bg-[#FDECEA] px-4 py-3 text-critical">
      {children}
    </p>
  );
}
