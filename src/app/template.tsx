/** Re-mounted on every navigation (unlike layout.tsx), so each page eases in. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
