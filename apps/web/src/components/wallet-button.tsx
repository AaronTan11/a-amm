import { ClientOnly } from "@tanstack/react-router";
import WalletButtonInner from "./wallet-button-inner";

const Fallback = () => (
  <button className="font-mono text-xs border border-border px-3 py-1.5 bg-card flex items-center gap-2">
    <span className="inline-block h-1.5 w-1.5 rounded-full bg-terminal-dim" />
    <span className="text-muted-foreground">Connect</span>
  </button>
);

export default function WalletButton() {
  return (
    <ClientOnly fallback={<Fallback />}>
      <WalletButtonInner />
    </ClientOnly>
  );
}
