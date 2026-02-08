// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// v4-core imports
import {BaseTestHooks} from "v4-core/test/BaseTestHooks.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/types/BeforeSwapDelta.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {CurrencySettler} from "v4-core-test/utils/CurrencySettler.sol";

// Local imports
import {Intent, IntentStatus} from "./types/Intent.sol";
import {IAammHook} from "./interfaces/IAammHook.sol";

/// @title AammHook — Agentic Automated Market Maker
/// @notice A Uniswap v4 hook that captures swap intents and lets AI agents compete to fill them.
///         Falls back to standard v4 AMM if no agent fills within the deadline.
contract AammHook is BaseTestHooks, IUnlockCallback, IAammHook {
    using CurrencySettler for Currency;
    using CurrencyLibrary for Currency;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;

    uint256 private _nextIntentId;
    uint256 public constant DEFAULT_DEADLINE_BLOCKS = 30;

    mapping(uint256 => Intent) public intents;

    enum CallbackAction {
        Fill,
        Fallback,
        Cancel
    }

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        _;
    }

    // ==================== HOOK CALLBACKS ====================

    /// @notice Intercepts swaps to create intents instead of executing through the AMM.
    /// @dev Returns a BeforeSwapDelta that NoOps the AMM swap. Input tokens are held as ERC-6909 claims.
    ///      The hookData must encode the swapper's address: abi.encode(swapperAddress).
    function beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        // Only handle exact-input swaps (amountSpecified < 0).
        // For exact-output or other cases, pass through to standard AMM.
        if (params.amountSpecified >= 0) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        // Decode the original swapper address and slippage tolerance from hookData
        (address swapper, uint256 minOutputAmount) = abi.decode(hookData, (address, uint256));

        // Determine input currency and amount
        Currency inputCurrency = params.zeroForOne ? key.currency0 : key.currency1;
        uint256 amountIn = uint256(-params.amountSpecified);

        // Mint ERC-6909 claims to the hook for input tokens.
        // This creates a -amountIn delta on the hook, which is offset by the hookDelta
        // returned below (+amountIn on specified side).
        inputCurrency.take(poolManager, address(this), amountIn, true);

        // Store the intent
        uint256 intentId = _nextIntentId++;
        intents[intentId] = Intent({
            intentId: intentId,
            swapper: swapper,
            poolKey: key,
            zeroForOne: params.zeroForOne,
            amountSpecified: params.amountSpecified,
            minOutputAmount: minOutputAmount,
            deadline: block.number + DEFAULT_DEADLINE_BLOCKS,
            status: IntentStatus.Pending,
            filledBy: address(0),
            outputAmount: 0
        });

        emit IntentCreated(intentId, swapper, PoolId.unwrap(key.toId()), params.zeroForOne, amountIn, minOutputAmount, block.number + DEFAULT_DEADLINE_BLOCKS);

        // NoOp: return -amountSpecified as specified delta to skip the AMM.
        // amountSpecified is negative (exact input), so -amountSpecified is positive.
        return (
            IHooks.beforeSwap.selector,
            toBeforeSwapDelta(int128(-params.amountSpecified), 0),
            0
        );
    }

    /// @notice Post-swap hook — no-op for async pattern.
    function afterSwap(
        address,
        PoolKey calldata,
        SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) external override onlyPoolManager returns (bytes4, int128) {
        return (IHooks.afterSwap.selector, 0);
    }

    // ==================== AGENT FILL ====================

    /// @notice Called by the winning agent to fill a pending intent.
    /// @dev Agent must have approved this contract for the output token.
    /// @param intentId The intent to fill
    /// @param outputAmount The amount of output tokens the agent will provide
    function fill(uint256 intentId, uint256 outputAmount) external {
        Intent storage intent = intents[intentId];
        if (intent.status != IntentStatus.Pending) revert IntentNotPending();
        if (block.number > intent.deadline) revert DeadlineAlreadyPassed();
        if (outputAmount < intent.minOutputAmount) revert InsufficientOutput();

        intent.status = IntentStatus.Filled;
        intent.filledBy = msg.sender;
        intent.outputAmount = outputAmount;

        poolManager.unlock(abi.encode(CallbackAction.Fill, intentId, msg.sender, outputAmount));

        emit IntentFilled(intentId, msg.sender, outputAmount);
    }

    // ==================== FALLBACK TO AMM ====================

    /// @notice Executes the intent through the standard v4 AMM after the deadline passes.
    /// @dev Callable by anyone. The hook self-calls poolManager.swap(), which automatically
    ///      skips hook callbacks (Hooks.sol returns defaults when msg.sender == hook).
    function fallbackToAMM(uint256 intentId) external {
        Intent storage intent = intents[intentId];
        if (intent.status != IntentStatus.Pending) revert IntentNotPending();
        if (block.number <= intent.deadline) revert DeadlineNotPassed();

        intent.status = IntentStatus.Expired;

        poolManager.unlock(abi.encode(CallbackAction.Fallback, intentId, address(0), uint256(0)));

        emit IntentFallback(intentId);
    }

    // ==================== CANCEL ====================

    /// @notice Allows the original swapper to cancel their pending intent and reclaim input tokens.
    function cancelIntent(uint256 intentId) external {
        Intent storage intent = intents[intentId];
        if (intent.swapper != msg.sender) revert OnlySwapper();
        if (intent.status != IntentStatus.Pending) revert IntentNotPending();

        intent.status = IntentStatus.Cancelled;

        poolManager.unlock(abi.encode(CallbackAction.Cancel, intentId, address(0), uint256(0)));

        emit IntentCancelled(intentId);
    }

    // ==================== UNLOCK CALLBACK ====================

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();

        (CallbackAction action, uint256 intentId, address agent, uint256 outputAmount) =
            abi.decode(data, (CallbackAction, uint256, address, uint256));

        Intent memory intent = intents[intentId];

        if (action == CallbackAction.Fill) {
            _executeFill(intent, agent, outputAmount);
        } else if (action == CallbackAction.Fallback) {
            _executeFallback(intent);
        } else {
            _executeCancel(intent);
        }

        return "";
    }

    // ==================== INTERNAL SETTLEMENT ====================

    /// @dev Settles a fill: burns hook's ERC-6909 claims, sends input to agent, sends output to swapper.
    ///      Agent must have approved this contract for the output token.
    function _executeFill(Intent memory intent, address agent, uint256 outputAmount) internal {
        Currency inputCurrency = intent.zeroForOne ? intent.poolKey.currency0 : intent.poolKey.currency1;
        Currency outputCurrency = intent.zeroForOne ? intent.poolKey.currency1 : intent.poolKey.currency0;
        uint256 amountIn = uint256(-intent.amountSpecified);

        // Burn ERC-6909 claims (creates +amountIn delta on hook)
        // Then send real input tokens to agent (creates -amountIn delta on hook → net 0)
        inputCurrency.settle(poolManager, address(this), amountIn, true);
        inputCurrency.take(poolManager, agent, amountIn, false);

        // Pull output tokens from agent (creates +outputAmount delta on hook)
        // Then send output tokens to swapper (creates -outputAmount delta on hook → net 0)
        outputCurrency.settle(poolManager, agent, outputAmount, false);
        outputCurrency.take(poolManager, intent.swapper, outputAmount, false);
    }

    /// @dev Executes the intent through the standard v4 AMM.
    ///      When hook calls poolManager.swap(), Hooks.sol auto-skips callbacks (msg.sender == hook).
    function _executeFallback(Intent memory intent) internal {
        Currency inputCurrency = intent.zeroForOne ? intent.poolKey.currency0 : intent.poolKey.currency1;
        Currency outputCurrency = intent.zeroForOne ? intent.poolKey.currency1 : intent.poolKey.currency0;
        uint256 amountIn = uint256(-intent.amountSpecified);

        // Burn ERC-6909 claims → hook's inputCurrency delta = +amountIn
        inputCurrency.settle(poolManager, address(this), amountIn, true);

        // Execute standard AMM swap. The swap delta is applied to the hook (msg.sender).
        // The AMM may not consume all input (e.g., hits price limit with low liquidity).
        BalanceDelta delta = poolManager.swap(
            intent.poolKey,
            SwapParams({
                zeroForOne: intent.zeroForOne,
                amountSpecified: intent.amountSpecified,
                sqrtPriceLimitX96: intent.zeroForOne
                    ? TickMath.MIN_SQRT_PRICE + 1
                    : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        // Extract actual input consumed and output produced
        int128 rawInput = intent.zeroForOne ? delta.amount0() : delta.amount1();
        int128 rawOutput = intent.zeroForOne ? delta.amount1() : delta.amount0();

        // Return any unconsumed input to the swapper.
        // After burn (+amountIn) and swap (rawInput, which is negative), the remaining
        // hook delta on inputCurrency is: amountIn + rawInput = amountIn - consumed.
        // We take this remaining amount to zero out the delta.
        uint256 inputConsumed = uint256(uint128(-rawInput));
        uint256 inputRemaining = amountIn - inputConsumed;
        if (inputRemaining > 0) {
            inputCurrency.take(poolManager, intent.swapper, inputRemaining, false);
        }

        // Send output to swapper
        if (rawOutput > 0) {
            outputCurrency.take(poolManager, intent.swapper, uint128(rawOutput), false);
        }

        // Update intent with actual output amount
        intents[intent.intentId].outputAmount = rawOutput > 0 ? uint128(rawOutput) : 0;
    }

    /// @dev Returns input tokens to the swapper by burning ERC-6909 claims.
    function _executeCancel(Intent memory intent) internal {
        Currency inputCurrency = intent.zeroForOne ? intent.poolKey.currency0 : intent.poolKey.currency1;
        uint256 amountIn = uint256(-intent.amountSpecified);

        // Burn ERC-6909 claims → +amountIn delta
        // Send tokens to swapper → -amountIn delta → net 0
        inputCurrency.settle(poolManager, address(this), amountIn, true);
        inputCurrency.take(poolManager, intent.swapper, amountIn, false);
    }

    // ==================== VIEW FUNCTIONS ====================

    function getIntent(uint256 intentId) external view returns (Intent memory) {
        return intents[intentId];
    }

    function nextIntentId() external view returns (uint256) {
        return _nextIntentId;
    }
}
