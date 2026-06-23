import Link from "next/link";
import WalletConnect from "./wallet-connect";

export default function SiteHeader({ active }: { active?: "home" | "live" }) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="w-7 h-7 rounded-lg bg-[var(--success)]/10 border border-[var(--success)]/30 flex items-center justify-center text-[var(--success)] text-sm font-semibold group-hover:bg-[var(--success)]/20 transition-colors">
            K
          </span>
          <span className="text-sm font-medium text-white hidden sm:inline">
            Handshake
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink href="/" active={active === "home"}>Register</NavLink>
          <NavLink href="/live" active={active === "live"}>Live demo</NavLink>
        </nav>

        <div className="shrink-0">
          <WalletConnect compact />
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
        active
          ? "text-white bg-[var(--surface-2)]"
          : "text-[var(--muted)] hover:text-white hover:bg-[var(--surface)]"
      }`}
    >
      {children}
    </Link>
  );
}
