import { Link } from "@tanstack/react-router";

import WalletButton from "./wallet-button";

export default function Header() {
  return (
    <div>
      <div className="flex flex-row items-center justify-between px-3 py-2">
        <Link to="/" className="flex items-center gap-2 no-underline">
          <span className="font-mono text-sm font-bold text-terminal-green tracking-wider">
            A-AMM
          </span>
          <span className="font-mono text-[10px] text-terminal-dim uppercase tracking-widest">
            Agentic AMM
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <WalletButton />
        </div>
      </div>
      <hr className="border-terminal-dim/30" />
    </div>
  );
}
