import { ConnectKitButton } from "connectkit";

export default function WalletButtonInner() {
  return (
    <ConnectKitButton.Custom>
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
    </ConnectKitButton.Custom>
  );
}
