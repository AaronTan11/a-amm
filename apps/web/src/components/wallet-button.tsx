import { lazy, Suspense } from "react";

// Lazy-load ConnectKit only on client — family.mjs crashes during SSR
const WalletButtonInner = import.meta.env.SSR
  ? () => (
      <button className="font-mono text-xs border border-border px-3 py-1.5 bg-card flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-terminal-dim" />
        <span className="text-muted-foreground">Connect</span>
      </button>
    )
  : lazy(() =>
      import("connectkit").then((mod) => ({
        default: () => (
          <mod.ConnectKitButton.Custom>
            {({ isConnected, show, truncatedAddress, ensName }) => (
              <button
                onClick={show}
                className="font-mono text-xs border border-border px-3 py-1.5 bg-card hover:bg-accent transition-colors flex items-center gap-2"
              >
                {isConnected ? (
                  <>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-terminal-green animate-pulse" />
                    <span className="text-terminal-green">
                      {ensName ?? truncatedAddress}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-terminal-dim" />
                    <span className="text-muted-foreground">Connect</span>
                  </>
                )}
              </button>
            )}
          </mod.ConnectKitButton.Custom>
        ),
      })),
    );

export default function WalletButton() {
  return (
    <Suspense
      fallback={
        <button className="font-mono text-xs border border-border px-3 py-1.5 bg-card flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-terminal-dim" />
          <span className="text-muted-foreground">Connect</span>
        </button>
      }
    >
      <WalletButtonInner />
    </Suspense>
  );
}
