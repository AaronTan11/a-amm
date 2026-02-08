import { useBlockNumber } from "wagmi";

export function useCurrentBlock() {
  const { data: blockNumber, isLoading } = useBlockNumber({ watch: true });
  return { blockNumber, isLoading };
}
