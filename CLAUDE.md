# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Conventions

- Do NOT add `Co-Authored-By` lines to commits.
- Use **Conventional Commits**: `type(scope): description`
  - `feat` — new feature
  - `fix` — bug fix
  - `chore` — maintenance, config, deps
  - `refactor` — code restructuring (no behavior change)
  - `test` — adding/updating tests
  - `docs` — documentation only
  - Scope is optional but encouraged (e.g., `feat(contracts): ...`, `chore(root): ...`)

## Project Overview

**A-AMM (Agentic Automated Market Maker)** - A Uniswap v4 hook where AI agents compete to fill trades at the best price, with on-chain reputation via ERC-8004.

This is a HackMoney 2026 hackathon project targeting Yellow Network, Uniswap Foundation, and ENS prizes.

### How A-AMM Works

1. User submits swap intent → v4 hook holds funds, emits event
2. AI agents compete off-chain via Yellow state channels (gasless quotes)
3. Best quote wins → agent fills on-chain
4. ERC-8004 reputation updates based on execution quality
5. Fallback to standard v4 AMM if no agent fills within deadline

## Commands

```bash
# Install dependencies
bun install

# Development (all apps)
bun run dev

# Development (web only)
bun run dev:web

# Build all
bun run build

# Type checking
bun run check-types
```

### Contracts (packages/contracts)

```bash
# Build contracts (run from packages/contracts/)
forge build

# Run tests
forge test

# Run single test with traces
forge test --match-test testFunctionName -vvv

# Fork Sepolia for testing
anvil --fork-url https://sepolia.infura.io/v3/<KEY>

# Deploy script
forge script script/Deploy.s.sol --rpc-url <RPC> --broadcast
```

## Architecture

```
a-amm/
├── apps/
│   └── web/                 # Vite 7 + React 19 + TanStack Start
│                            # Port 3001, shadcn/ui, Tailwind 4, dark mode
│                            # Swap UI, agent leaderboard, intent tracker
├── packages/
│   ├── config/              # Shared TypeScript config (@a-amm/config)
│   ├── env/                 # Environment variables (t3-env, @a-amm/env)
│   ├── contracts/           # Foundry - AammHook, ERC-8004 (v4-core submodule in lib/)
│   ├── agents/              # [TO ADD] Demo agents (Speedy, Cautious, Whale)
│   └── aggregator/          # [TO ADD] Yellow quote channel coordinator
```

### Key Components to Build

| Component | Tech | Purpose |
|-----------|------|---------|
| A-AMM Hook | Solidity/Foundry | v4 hook with NoOp pattern for async intents |
| Yellow Integration | TypeScript | Quote coordination via @erc7824/nitrolite |
| ERC-8004 | TypeScript (agent0-sdk) | Integrate with deployed registries on Sepolia |
| Demo Agents | TypeScript | AI agents with different trading strategies |

## Uniswap v4 Hook Technical Details

### NoOp Async Pattern

The hook uses the **NoOp async pattern** to intercept swaps and let agents fill them:

**Hook address bits required** (determined by CREATE2 deployment address):
- `BEFORE_SWAP_FLAG` (1 << 7)
- `AFTER_SWAP_FLAG` (1 << 6)
- `BEFORE_SWAP_RETURNS_DELTA_FLAG` (1 << 3)

**beforeSwap() implementation:**
```
- Receives: sender, PoolKey, SwapParams (zeroForOne, amountSpecified, sqrtPriceLimitX96), hookData
- Returns: (bytes4 selector, BeforeSwapDelta, uint24 lpFeeOverride)
- NoOp signal: return toBeforeSwapDelta(-amountSpecified, 0) to skip AMM
- Must: store intent, hold input tokens, emit IntentCreated event
```

**fill() — custom function:**
```
- Called by winning agent after off-chain competition
- Uses manager.unlock() → unlockCallback pattern
- Inside callback: manager.take() to withdraw, manager.settle() to pay
- Verifies agent signature, transfers tokens
```

**fallbackToAMM() — custom function:**
```
- Callable by anyone after deadline passes
- Executes standard v4 AMM swap for the stored intent
- Ensures user always gets their trade
```

### Key v4 Types

| Type | Description |
|------|-------------|
| `PoolKey` | {currency0, currency1, fee, tickSpacing, hooks} — identifies a pool |
| `PoolId` | keccak256(PoolKey) — pool hash |
| `Currency` | address wrapper for ERC20/native ETH |
| `BeforeSwapDelta` | int256 packed: upper 128 = specifiedDelta, lower 128 = unspecifiedDelta |
| `BalanceDelta` | int256 packed: upper 128 = amount0, lower 128 = amount1 |
| `SwapParams` | {zeroForOne, amountSpecified (neg=exactInput), sqrtPriceLimitX96} |

### v4 Settlement Model

All interactions use the **lock/unlock callback pattern**:
1. Call `manager.unlock(data)`
2. PoolManager calls back `unlockCallback(data)`
3. Inside callback: execute swaps, settle currency deltas
4. `manager.take(currency, to, amount)` — withdraw from pool
5. `manager.settle()` — pay what's owed to pool
6. `manager.sync(currency)` — record balance before transfer in

### Contract Interface Design

```
A-AMM Hook:
├── beforeSwap()          - Capture intent, skip AMM (NoOp)
├── afterSwap()           - Handle post-swap logic
├── fill()                - Agent fills with signed quote
├── fallbackToAMM()       - Execute via v4 if no agent fill after deadline
├── cancelIntent()        - User cancels pending intent
└── getIntent()           - View intent details

ERC-8004 Integration:
├── registerAgent()       - Register new agent identity
├── getAgentReputation()  - Fetch agent score
├── submitFeedback()      - User rates agent after fill
└── getAgentsByScore()    - Leaderboard query
```

### ERC-8004 Technical Reference

Three registries:

**Identity Registry:**
- `register(string agentURI, MetadataEntry[] metadata) → uint256 agentId`
- `setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)`
- `getAgentWallet(uint256 agentId) → address`
- `setMetadata(uint256 agentId, string key, bytes value)`

**Reputation Registry:**
- `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`
- `revokeFeedback(uint256 agentId, uint64 feedbackIndex)`
- `getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) → (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)`

**Validation Registry:**
- `validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)`
- `validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)`

### Demo Agents

| Agent | ENS | Strategy |
|-------|-----|----------|
| Speedy | speedy.aamm.eth | Always quotes fast, competitive pricing |
| Cautious | cautious.aamm.eth | Only quotes when spread is good, premium pricing |
| Whale | whale.aamm.eth | Handles large orders, slight premium |

### Key Dependencies

- **v4-core, v4-periphery**: Uniswap v4 contracts
- **@erc7824/nitrolite**: Yellow Network state channel SDK
- **wagmi, viem**: Ethereum interaction (frontend)

## Local Reference Repos

These are cloned locally for reference (not part of the monorepo):

- **v4-core**: `/Users/aarontan/Developer/v4-core`
  - Key files: `src/interfaces/IHooks.sol`, `src/libraries/Hooks.sol`, `src/types/BeforeSwapDelta.sol`
  - Example hooks: `src/test/DeltaReturningHook.sol`, `src/test/FeeTakingHook.sol`
- **v4-periphery**: `/Users/aarontan/Developer/v4-periphery`
- **universal-router**: `/Users/aarontan/Developer/universal-router`
- **trustless-agents-erc-ri**: `/Users/aarontan/Developer/trustless-agents-erc-ri` — Foundry reference impl (74/74 tests)
- **erc-8004-contracts**: `/Users/aarontan/Developer/erc-8004-contracts` — Hardhat impl with ABIs at `abis/`
- **agent0-ts**: `/Users/aarontan/Developer/agent0-ts` — TypeScript SDK (agent0-sdk v1.5.2)
- **best-practices**: `/Users/aarontan/Developer/best-practices` — ERC-8004 registration & reputation best practices
- **awesome-8004**: `/Users/aarontan/Developer/awesome-8004` — Curated resource list

Primary dependency is v4-core. The others are available if needed.

## Existing Code Reference

- [Lime Hook (RFQ pattern on v4)](https://github.com/0xbuild3r/univ4-offchain-pricing) — closest prior art
- [Nitrolite SDK (Yellow)](https://github.com/erc7824/nitrolite)

## External Resources

- [Project Spec](../a-amm-project-spec.md): Full technical specification with user flows and architecture diagrams
- [Brainstorm Notes](../hackmoney-2026-brainstorm.md): Design decisions, rejected ideas, and ERC-8004 details
- [v4 Async Swap Docs](https://docs.uniswap.org/contracts/v4/quickstart/hooks/async-swap)
- [Yellow SDK](https://docs.yellow.org/docs/build/quick-start/)
- [ERC-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004)
- [HowTo8004](https://howto8004.com/) — Integration guide and best practices

## Testnet Addresses (Sepolia)

- PoolManager: `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`
- PositionManager: `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4`
- Universal Router: `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b`
- Yellow Sandbox: `wss://clearnet-sandbox.yellow.com/ws`
- ERC-8004 Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- ERC-8004 Reputation Registry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- ERC-8004 Validation Registry: `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`
- ERC-8004 Mainnet: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`

## MCP Servers Available

- **OpenZeppelinSolidityContracts**: Solidity patterns and best practices
- **OpenZeppelinUniswapHooks**: Uniswap v4 hook documentation

## Gotchas & Implementation Notes

### Foundry Config
- **Must use `optimizer_runs = 44444444`** to match v4-core. Lower values cause "Yul stack too deep" errors when compiling PoolManager.sol through test imports.
- `via_ir = true` and `evm_version = "cancun"` are required by v4-core.
- v4-core is a git submodule at `packages/contracts/lib/v4-core`. Its transitive submodules (forge-std, solmate, openzeppelin) are referenced via remappings — no need to add them separately.
- The `v4-core-test/` remapping points to `lib/v4-core/test/` for importing test utilities like `CurrencySettler` and `Deployers`.

### v4 Delta Accounting (critical to understand)
- **ALL deltas across ALL addresses must be zero** before `unlock()` returns, or the tx reverts with `CurrencyNotSettled()`.
- The hook gets deltas from TWO sources: (1) explicit `take()`/`settle()`/`mint()`/`burn()` calls during hook execution, and (2) the `hookDelta` computed from `BeforeSwapDelta` return values, applied by PoolManager after `beforeSwap` returns.
- In our NoOp: `mint()` in beforeSwap creates -amountIn on hook, then hookDelta adds +amountIn → net 0.
- `CurrencySettler.settle(currency, pm, payer, amount, burn=true)` calls `manager.burn()` (adjusts delta +amount). `burn=false` does ERC20 transferFrom + settle (also +amount).
- `CurrencySettler.take(currency, pm, recipient, amount, claims=true)` calls `manager.mint()` (adjusts delta -amount). `claims=false` calls `manager.take()` (real transfer, also -amount).

### Hook Self-Call Skip
- When the hook calls `poolManager.swap()` (e.g., in fallbackToAMM), Hooks.sol automatically **skips all hook callbacks** because `msg.sender == address(hook)`. This is built into v4-core at `Hooks.sol:253`. No special handling needed.

### Fallback Partial Fills
- The AMM may not consume all input tokens (e.g., hits price limit with low liquidity). `_executeFallback` must handle this by returning unconsumed input to the swapper. Without this, you get `CurrencyNotSettled()`.

### Test Pattern for Hooks
- Hook addresses encode permissions in their lower 14 bits. Tests use `vm.etch(flagAddress, impl.code)` to deploy at the correct address.
- Since `poolManager` is `immutable`, it's embedded in bytecode and survives `vm.etch()`.
- No `Hooks.validateHookPermissions()` in constructor — v4-core test hooks don't use it either. Validation happens via address bits at runtime.
- Tests extend `Test` + `Deployers` from v4-core. Key helpers: `deployFreshManagerAndRouters()`, `deployMintAndApprove2Currencies()`, `initPoolAndAddLiquidity()`.

### hookData Convention
- `beforeSwap` receives `hookData` from the swap router. We decode the original swapper address from it: `abi.decode(hookData, (address))`.
- The frontend/router must pass `abi.encode(userAddress)` as hookData when calling swap.
- `PoolSwapTest` (the test router) passes hookData through transparently.

### Agent Fill Requirements
- The agent must `approve(hookAddress, outputAmount)` on the output token BEFORE calling `fill()`. The hook does `transferFrom(agent, poolManager, amount)` inside the unlock callback.

### ERC-8004 Integration Notes
- **Already deployed on Sepolia** — no need to write or deploy custom registry contracts.
- **TypeScript SDK**: `agent0-sdk` (v1.5.2) — use for agent registration, feedback submission, and querying.
- **ABIs available** at `/Users/aarontan/Developer/erc-8004-contracts/abis/` — IdentityRegistry.json, ReputationRegistry.json, ValidationRegistry.json. Can also be used directly with viem/wagmi.
- **Integration is off-chain**: The hook emits `IntentFilled` events. A keeper or the frontend calls `giveFeedback()` on the Reputation Registry after fills. No ERC-8004 imports needed in Solidity.
- **Agent registration flow**: Each demo agent calls `register()` on the Identity Registry with metadata (name, strategy, ENS). This is a one-time setup.
- **Reputation tags**: Use `tag1 = "aamm"`, `tag2 = "fill-quality"` for A-AMM-specific reputation scoring.
- **Contracts are UUPS upgradeable proxies** — interact via the proxy addresses listed above.

### Current Limitations
- Only handles exact-input swaps (`amountSpecified < 0`). Exact-output swaps pass through to the standard AMM.
- Deadline is block-based (`DEFAULT_DEADLINE_BLOCKS = 30`), not timestamp-based.
- No minimum output enforcement on `fill()` — agent can provide any outputAmount. Should add slippage protection.
- No agent signature verification yet — any address can call `fill()`.
- Intent stores full `PoolKey` struct (gas-expensive). Production should store `PoolId` and pass `PoolKey` as calldata.

## Open Design Decisions

1. **Quote window duration** — 10 seconds vs 30 seconds
2. **Who submits winning quote on-chain** — Agent vs keeper vs user
3. **Agent inventory** — How do agents source liquidity for fills

## Current Status

- [x] Monorepo scaffolded (Turborepo + Bun)
- [x] Frontend scaffolded (Vite + React + TanStack)
- [x] MCP servers configured (OpenZeppelin Solidity + Uniswap Hooks)
- [x] Initialize Foundry in packages/contracts
- [x] Implement A-AMM hook skeleton
- [ ] Integrate ERC-8004 (already deployed on Sepolia — use agent0-sdk)
- [ ] Connect to Yellow sandbox
- [ ] Build demo agents
- [ ] Wire frontend to contracts
