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

### Aggregator (packages/aggregator)

```bash
# One-time setup: create Yellow app session
HOOK_ADDRESS=0x... bun run packages/aggregator/src/setup.ts

# Run aggregator (watches intents, runs quote auctions via Yellow)
HOOK_ADDRESS=0x... APP_SESSION_ID=0x... bun run packages/aggregator/src/run.ts
```

| Env var | Required | Default |
|---------|----------|---------|
| `HOOK_ADDRESS` | Yes | — |
| `AGGREGATOR_PRIVATE_KEY` | No | Anvil account #9 |
| `RPC_URL` | No | `http://127.0.0.1:8545` |
| `CLEARNODE_URL` | No | `wss://clearnet-sandbox.yellow.com/ws` |
| `QUOTE_WINDOW_MS` | No | `5000` (5 seconds) |
| `APP_SESSION_ID` | No | Created by setup script |
| `SEPOLIA_RPC_URL` | No | Enables ERC-8004 reputation feedback |
| `AGENT_IDS` | No | Address:agentId mapping, e.g. `0xaddr:42,0xaddr:43` |

### Agents (packages/agents)

```bash
# Start agent with Yellow connection (recommended)
APP_SESSION_ID=0x... AGENT_STRATEGY=speedy HOOK_ADDRESS=0x... bun run packages/agents/src/run.ts

# Standalone mode (no Yellow, direct on-chain fill)
HOOK_ADDRESS=0x... bun run packages/agents/src/run.ts

# Run all 3 demo agents (use different keys + strategies)
APP_SESSION_ID=0x... AGENT_STRATEGY=speedy   AGENT_PRIVATE_KEY=0x59c6...690d HOOK_ADDRESS=0x... bun run packages/agents/src/run.ts
APP_SESSION_ID=0x... AGENT_STRATEGY=cautious AGENT_PRIVATE_KEY=0x5de4...365a HOOK_ADDRESS=0x... bun run packages/agents/src/run.ts
APP_SESSION_ID=0x... AGENT_STRATEGY=whale    AGENT_PRIVATE_KEY=0x7c85...07a6 HOOK_ADDRESS=0x... bun run packages/agents/src/run.ts
```

| Env var | Required | Default |
|---------|----------|---------|
| `HOOK_ADDRESS` | Yes | — |
| `RPC_URL` | No | `http://127.0.0.1:8545` |
| `AGENT_PRIVATE_KEY` | No | Anvil account #1 |
| `AGENT_STRATEGY` | No | `speedy` |
| `CLEARNODE_URL` | No | `wss://clearnet-sandbox.yellow.com/ws` |
| `APP_SESSION_ID` | No | — (standalone mode if unset) |
| `POLL_INTERVAL_MS` | No | `2000` |
| `AGENT_ID` | No | ERC-8004 agentId (from registration) |

### ERC-8004 Agent Registration

```bash
# Register a demo agent on Sepolia (one-time per agent)
SEPOLIA_RPC_URL=... AGENT_PRIVATE_KEY=0x... AGENT_NAME=Speedy AGENT_STRATEGY=speedy \
  bun run packages/agents/src/register.ts

# Smoke test: register + feedback + query on live Sepolia
SEPOLIA_RPC_URL=... PRIVATE_KEY=0x... bun run packages/agents/src/erc8004-smoke-test.ts
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
│   ├── agents/              # Yellow-connected agents with strategies (Speedy, Cautious, Whale)
│   └── aggregator/          # Yellow quote auction coordinator (@erc7824/nitrolite)
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

### Uniswap v4 Contracts
- PoolManager: `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`
- PoolSwapTest (router): `0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe`
- PoolModifyLiquidityTest: `0x0C478023803a644c94c4CE1C1e7b9A087e411B0A`
- PositionManager: `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4`
- Universal Router: `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b`
- StateView: `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c`
- Quoter: `0x61b3f2011a92d183c7dbadbda940a7555ccf9227`
- Permit2: `0x000000000022D473030F116dDEE9F6B43aC78BA3`

### A-AMM Deployment
- AammHook: `0x964453F9c597e30EB5C2f331b389FD0eA8d6c0c8`
- Active pool: Circle USDC / WETH (fee=3000, tickSpacing=60)

### Testnet ERC-20 Tokens
- USDC (Circle): `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (6 decimals) — official Circle Sepolia faucet
- WETH: `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9` (18 decimals)
- DAI: `0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357` (18 decimals)
- USDC (Aave, deprecated): `0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8` — old pool, do not use

### Other Services
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
- `beforeSwap` receives `hookData` from the swap router. We decode the swapper address and slippage tolerance: `abi.decode(hookData, (address, uint256))`.
- The frontend/router must pass `abi.encode(userAddress, minOutputAmount)` as hookData when calling swap.
- `PoolSwapTest` (the test router) passes hookData through transparently.

### Agent Fill Requirements
- The agent must `approve(hookAddress, outputAmount)` on the output token BEFORE calling `fill()`. The hook does `transferFrom(agent, poolManager, amount)` inside the unlock callback.

### Agent Package Notes
- Agent uses `viem` with `parseAbi` human-readable format — avoids importing the 44k-token Foundry JSON.
- Agent approves the **hook address** for output tokens, not the PoolManager. `CurrencySettler` is an inlined library, so `transferFrom` is called from the hook's context.
- Default private key is Anvil account #1 (index 1, `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`). Account #0 is reserved for deployer. Account #9 is reserved for aggregator.
- **Three strategies**: Speedy (offers 5% above minOutput), Cautious (offers exactly minOutput, max profit), Whale (offers 2% above minOutput). All quote based on `minOutput` (already in output token scale). Selected via `AGENT_STRATEGY` env var.
- **Dual mode**: With `APP_SESSION_ID` set, agent listens for RFQs via Yellow and submits quotes off-chain. Without it, agent falls back to direct on-chain filling (original behavior).
- Sequential intent processing (no nonce management). Fine for hackathon.
- `allowImportingTsExtensions: true` is needed in tsconfig because base config has `verbatimModuleSyntax: true` and Bun requires `.ts` extensions.

### Yellow Integration Notes
- Uses `@erc7824/nitrolite` SDK for ClearNode WebSocket communication.
- **Auth flow**: `auth_request` (public) → `auth_challenge` (server) → `auth_verify` (EIP-712 signed). Same key used as both wallet and session key for hackathon simplicity.
- **App session**: Created by aggregator's setup script. All participants (aggregator + agents) share one session for RFQ/Quote/Winner messaging.
- **Message protocol**: Three message types flow through the app session:
  - `RFQ` — aggregator broadcasts intent details to all agents
  - `Quote` — agent submits price (outputAmount) for an intent
  - `Winner` — aggregator announces the winning agent
- **Quote window**: 5 seconds (configurable via `QUOTE_WINDOW_MS`). Aggregator picks highest outputAmount.
- **yellow.ts is duplicated** in both `packages/aggregator/` and `packages/agents/` — intentional for hackathon speed (no shared package overhead).
- **Ping keepalive**: 30-second interval to prevent ClearNode from dropping the connection.
- **Sandbox auth requirements** (discovered via smoke test):
  - `application` must be `"clearnode"` — custom names like `"a-amm-quotes"` cause `"failed to generate challenge"`.
  - `allowances` must be `[]` (empty array) — non-empty allowances also cause challenge generation failure.
  - EIP-712 domain must be `{ name: "clearnode" }` — case-sensitive, `"Clearnet"` fails signature verification.
  - No pre-funding, registration, or whitelisting needed — any valid private key works.
  - Server sends `assets` and `channels` broadcasts after auth (not errors, just informational).
- **Smoke test**: `bun run packages/aggregator/src/smoke-test.ts` — standalone script that verifies WebSocket connect → auth → ping against the live sandbox.
- **`createApplicationMessage` uses method `"message"` which ClearNode does NOT support.** ClearNode's supported methods are listed in the API docs — `message` is not one of them. The correct way to send inter-participant messages is to include a `sid` (session ID) field in the JSON envelope. Any message with `sid` is automatically forwarded to all other app session participants. See `nitrolite/clearnode/docs/API.md` lines 1461-1499 and `Clearnode.protocol.md` lines 33-35.
- **Fix for `sendAppMessage`**: After `createApplicationMessage` generates the signed JSON, parse it, inject `"sid": appSessionId`, re-serialize, and send. ClearNode routes based on `sid`, not the method name.
- **`submitAppState`** is an alternative (more heavyweight) — carries `session_data` + `allocations` + `version`. Better for formal state updates, overkill for lightweight RFQ/quote messages.
- **App session `nonce` is required** — `RPCAppDefinition.nonce` must be non-zero or ClearNode returns "nonce is zero or not provided". Use `Math.floor(Date.now() / 1000)`.

### ERC-8004 Integration Notes
- **Already deployed on Sepolia** — no need to write or deploy custom registry contracts.
- **Direct viem calls** — uses `parseAbi` with human-readable ABI fragments, same pattern as `abi.ts`. No `agent0-sdk` dependency (avoids IPFS/Pinata setup). Reference ABIs at `/Users/aarontan/Developer/erc-8004-contracts/abis/`.
- **erc8004.ts is duplicated** in both `packages/agents/` and `packages/aggregator/` — same hackathon pattern as `yellow.ts`.
- **Agent registration**: One-time script `packages/agents/src/register.ts`. Calls `register(agentURI, metadata)` with name + strategy encoded as ABI parameters. Returns `agentId` (uint256, extracted from `Registered` event topic).
- **Reputation feedback**: Aggregator calls `giveFeedback()` in `closeAuction()` when a winner is picked. Score = base 50 + percentage improvement over `minOutputAmount`, capped at 100. Fire-and-forget (doesn't block auction flow).
- **Reputation tags**: `tag1 = "starred"`, `tag2 = "swap"`. On-chain only (no IPFS feedbackURI).
- **Agent ID mapping**: Aggregator needs `AGENT_IDS` env var (`address:id,...`) to map winner addresses to ERC-8004 agentIds. Frontend uses a hardcoded `AGENT_ID_MAP` in `use-agent-stats.ts` (update after registration).
- **Frontend leaderboard**: Queries `getSummary()` and `getMetadata(agentId, "name")` via wagmi `useReadContracts` multicall. Shows agent name + reputation score alongside fill count and volume.
- **`getSummary()` requires non-empty `clientAddresses`** — passing `[]` reverts with "clientAddresses required". Must call `getClients(agentId)` first to get the list of addresses that have given feedback, then pass those to `getSummary()`. The frontend hook uses a two-phase multicall for this.
- **Self-feedback is forbidden** — the Reputation Registry reverts if `msg.sender` owns the agent they're giving feedback to. The aggregator (different address) must submit feedback, not the agent itself.
- **Registration emits both `Transfer` and `Registered` events** — must use `decodeEventLog` to match the `Registered` event specifically. Matching raw `topics[1]` can pick up the ERC-721 `Transfer(address(0), owner, tokenId)` event instead, giving `agentId=0`.
- **Contracts are UUPS upgradeable proxies** — interact via the proxy addresses listed above.
- **Smoke test**: `bun run packages/agents/src/erc8004-smoke-test.ts` — registers test agent, submits feedback, queries reputation on live Sepolia. Supports `SKIP_REGISTER=1 AGENT_ID=986` to reuse existing registration and `FEEDBACK_AGENT_ID=1` to test feedback on a different agent (saves gas).

### Sepolia Deployment Notes
- **Hook was originally only on Anvil fork** — the first `Deploy.s.sol` run used Anvil account #0 (`0xf39F...`), so it never hit live Sepolia. `DeployHook.s.sol` was created to deploy just the hook without pool init/liquidity.
- **Three deploy scripts**: `DeployHook.s.sol` (hook only), `InitPool.s.sol` (Circle USDC pool init), `SeedLiquidity.s.sol` (liquidity only). `Deploy.s.sol` is the original all-in-one (uses Aave USDC, not recommended).
- **`PoolAlreadyInitialized` if you re-run InitPool** — the pool init is a one-time operation. If it succeeds but liquidity seeding fails, use `SeedLiquidity.s.sol` separately.

### Deploy Script Notes
- **Must use deterministic CREATE2 deployer** (`0x4e59b44847b379578588920cA78FbF26c0B4956C`) — Forge rejects `address(this)` in scripts because script addresses are ephemeral. Deploy via `CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode))`.
- **USDC (6 decimals) is the liquidity bottleneck** — at 1:1 sqrtPrice, `liquidityDelta: 1e9` needs ~1000 USDC. Use `1e6` for testnet (needs ~1 USDC).
- **Deployer must hold WETH + USDC** before running. On fork: wrap ETH via `cast send $WETH "deposit()" --value 10ether`, mint USDC by impersonating the USDC owner.
- **Token ordering flipped with Circle USDC**: Circle USDC (`0x1c...`) < WETH (`0x7b...`), so USDC = currency0. Old Aave USDC (`0x94...`) > WETH, so WETH was currency0. The frontend handles this correctly via lowercase address comparison.
- **Two deploy scripts**: `Deploy.s.sol` deploys the hook + old Aave pool. `InitPool.s.sol` initializes the Circle USDC pool on the existing hook.
- **RPC URL**: Stored in `packages/contracts/.env` (gitignored). Set `SEPOLIA_RPC_URL=...` there.
- Tested end-to-end on Anvil fork of Sepolia: hook deploy + pool init + seed liquidity all succeed.

### ConnectKit SSR Fix (Vercel)
- **ConnectKit's `family.mjs` accesses `window` at module load time**, crashing any Node.js serverless function. `defaultSsr: false` in TanStack Start only skips rendering, not module imports — doesn't help.
- **Solution**: Use `<ClientOnly>` from `@tanstack/react-router` to wrap all ConnectKit imports. The Babel compiler plugin strips `<ClientOnly>` children from the server bundle, so ConnectKit code is fully tree-shaken out.
- **Key files**: `connectkit-wrapper.tsx` (wraps `ConnectKitProvider`), `wallet-button-inner.tsx` (wraps `ConnectKitButton`), both wrapped by `<ClientOnly>` in their parent components.
- **wagmi config**: Replaced ConnectKit's `getDefaultConfig` with plain `createConfig({ ssr: true })` to remove the last server-side connectkit import.
- **Vercel build**: `vercel.json` uses `buildCommand: "cd apps/web && bun run build && mkdir -p ../../.vercel && cp -r .vercel/output ../../.vercel/output"` to copy the build output to the project root where Vercel expects it.

### Frontend Display Notes
- **Intent amounts must use token-aware formatting** — `formatUnits(amount, decimals)` not `formatEther`. USDC is 6 decimals; using `formatEther` (18 decimals) shows "0.0000" for valid amounts. The intent feed resolves decimals from the poolKey currency addresses via `TOKENS` config.

### Agent Output Amount Decimal Fix
- **Strategies now quote based on `minOutput`** (which the frontend computes in the correct output token scale) instead of scaling `amountIn` across decimal differences. This avoids the previous bug where USDC→WETH swaps produced wildly incorrect output amounts due to 6→18 decimal mismatch.
- **The contract itself is fine** — it stores whatever `outputAmount` the agent passes.

### Sepolia Agent Deployment
- **3 agents registered on ERC-8004**: Speedy (ID=990, `0xd94C17B860C4B0Ca8f76586803DdD07B976cA6A2`), Cautious (ID=991, `0x4210d287a6A28F96967c2424f162a0BCDd101694`), Whale (ID=992, `0x98cA02732d4646000b729292d36de6A853FF00cA`)
- **Agent wallets funded** with ETH + WETH from dev/aggregator wallets (Speedy has ~0.15 ETH + 0.1 WETH, Cautious/Whale have ~0.1 ETH + 0.05 WETH each).
- **APP_SESSION_ID**: `0xda6f82153c94ce3fe32e143fdf9caba97d494a1ec0cfce9b36a87d6ca7267722`
- **`.env` files** in `packages/agents/.env` and `packages/aggregator/.env` (gitignored) contain all keys and config.

### Current Limitations
- Only handles exact-input swaps (`amountSpecified < 0`). Exact-output swaps pass through to the standard AMM.
- Deadline is block-based (`DEFAULT_DEADLINE_BLOCKS = 30`), not timestamp-based.
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
- [x] Implement A-AMM hook with slippage protection
- [x] Simple agent (Layer 1) — monitors IntentCreated, fills on-chain
- [x] Swap UI with ConnectKit, terminal aesthetic, token selectors
- [x] Deploy script tested on Anvil fork (hook + pool init + seed liquidity)
- [x] Yellow integration — aggregator + agents communicate via ClearNode WebSocket
- [x] Demo agent strategies (Speedy, Cautious, Whale) with off-chain quote competition
- [x] Smoke test Yellow sandbox connection (auth flow verified)
- [x] Integrate ERC-8004 (direct viem + deployed Sepolia registries)
- [x] Wire frontend to contracts (approval flow, balances, cancel/fallback, event toasts)
- [x] Deploy hook + Circle USDC pool to Sepolia
- [x] Register 3 demo agents on ERC-8004 (Speedy=990, Cautious=991, Whale=992)
- [x] Fund agent wallets with ETH + WETH on Sepolia
- [x] Agent standalone fill works (on-chain watcher, Speedy filled intent #2)
- [x] Fix agent output amount decimals (strategies now quote based on minOutput)
- [x] ENS integration (agent subnames displayed in leaderboard + intent feed)
- [x] Frontend deployed on Vercel (ClientOnly wrapper for ConnectKit SSR fix)
- [x] All 3 agents running in standalone mode on Sepolia
- [ ] Fix Yellow messaging (`sid` field for message forwarding)
