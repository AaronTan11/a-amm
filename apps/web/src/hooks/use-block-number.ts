import { useBlockNumber } from "wagmi";

export function useCurrentBlock() {
  const { data: blockNumber, isLoading } = useBlockNumber({ watch: true, query: { refetchInterval: 30_000 } });
  return { blockNumber, isLoading };
}
