// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "v4-core-test/utils/Deployers.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";

import {AammHook} from "../src/AammHook.sol";
import {IAammHook} from "../src/interfaces/IAammHook.sol";
import {Intent, IntentStatus} from "../src/types/Intent.sol";

contract AammHookTest is Test, Deployers {
    AammHook hook;
    address hookAddr;

    address alice = makeAddr("alice");
    address agent = makeAddr("agent");

    function setUp() public {
        // Deploy PoolManager + all test routers
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        // Deploy hook at address with correct permission bits
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        );
        hookAddr = address(flags);

        // Deploy implementation (constructor sets immutable poolManager in bytecode)
        // then etch bytecode to the correct address
        AammHook impl = new AammHook(manager);
        vm.etch(hookAddr, address(impl).code);
        hook = AammHook(hookAddr);

        // Initialize pool with hook + add liquidity for fallback tests
        (key,) = initPoolAndAddLiquidity(currency0, currency1, IHooks(hookAddr), 3000, SQRT_PRICE_1_1);

        // Give alice some tokens for swapping
        MockERC20(Currency.unwrap(currency0)).mint(alice, 10 ether);
        MockERC20(Currency.unwrap(currency1)).mint(alice, 10 ether);

        // Alice approves the swap router
        vm.startPrank(alice);
        MockERC20(Currency.unwrap(currency0)).approve(address(swapRouter), type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(address(swapRouter), type(uint256).max);
        vm.stopPrank();

        // Give agent some tokens for filling
        MockERC20(Currency.unwrap(currency0)).mint(agent, 10 ether);
        MockERC20(Currency.unwrap(currency1)).mint(agent, 10 ether);

        // Agent approves the hook for output tokens
        vm.startPrank(agent);
        MockERC20(Currency.unwrap(currency0)).approve(hookAddr, type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(hookAddr, type(uint256).max);
        vm.stopPrank();
    }

    // ==================== HELPERS ====================

    function _doSwap(address swapper, int256 amountSpecified) internal returns (BalanceDelta) {
        PoolSwapTest.TestSettings memory settings =
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false});

        // hookData encodes the original swapper address
        bytes memory hookData = abi.encode(swapper);

        vm.prank(swapper);
        return swapRouter.swap(
            key,
            SwapParams({
                zeroForOne: true,
                amountSpecified: amountSpecified,
                sqrtPriceLimitX96: MIN_PRICE_LIMIT
            }),
            settings,
            hookData
        );
    }

    // ==================== TESTS ====================

    function test_beforeSwap_createsIntent() public {
        uint256 amountIn = 1 ether;
        uint256 balanceBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(alice);

        _doSwap(alice, -int256(amountIn));

        // Check intent was created
        Intent memory intent = hook.getIntent(0);
        assertEq(intent.intentId, 0);
        assertEq(intent.swapper, alice);
        assertTrue(intent.zeroForOne);
        assertEq(intent.amountSpecified, -int256(amountIn));
        assertEq(uint8(intent.status), uint8(IntentStatus.Pending));
        assertEq(intent.deadline, block.number + hook.DEFAULT_DEADLINE_BLOCKS());

        // Check alice's balance decreased (input tokens taken)
        uint256 balanceAfter = MockERC20(Currency.unwrap(currency0)).balanceOf(alice);
        assertEq(balanceBefore - balanceAfter, amountIn);

        // Check nextIntentId incremented
        assertEq(hook.nextIntentId(), 1);
    }

    function test_fill_byAgent() public {
        uint256 amountIn = 1 ether;
        uint256 outputAmount = 0.95 ether;

        _doSwap(alice, -int256(amountIn));

        uint256 aliceToken1Before = MockERC20(Currency.unwrap(currency1)).balanceOf(alice);
        uint256 agentToken0Before = MockERC20(Currency.unwrap(currency0)).balanceOf(agent);
        uint256 agentToken1Before = MockERC20(Currency.unwrap(currency1)).balanceOf(agent);

        // Agent fills the intent
        vm.prank(agent);
        hook.fill(0, outputAmount);

        // Alice received output tokens
        uint256 aliceToken1After = MockERC20(Currency.unwrap(currency1)).balanceOf(alice);
        assertEq(aliceToken1After - aliceToken1Before, outputAmount);

        // Agent received input tokens
        uint256 agentToken0After = MockERC20(Currency.unwrap(currency0)).balanceOf(agent);
        assertEq(agentToken0After - agentToken0Before, amountIn);

        // Agent paid output tokens
        uint256 agentToken1After = MockERC20(Currency.unwrap(currency1)).balanceOf(agent);
        assertEq(agentToken1Before - agentToken1After, outputAmount);

        // Intent marked as filled
        Intent memory intent = hook.getIntent(0);
        assertEq(uint8(intent.status), uint8(IntentStatus.Filled));
        assertEq(intent.filledBy, agent);
        assertEq(intent.outputAmount, outputAmount);
    }

    function test_fallbackToAMM_afterDeadline() public {
        uint256 amountIn = 1 ether;

        _doSwap(alice, -int256(amountIn));

        uint256 aliceToken1Before = MockERC20(Currency.unwrap(currency1)).balanceOf(alice);

        // Advance past deadline
        vm.roll(block.number + hook.DEFAULT_DEADLINE_BLOCKS() + 1);

        // Anyone can trigger fallback
        hook.fallbackToAMM(0);

        // Alice received output tokens from AMM (should be > 0)
        uint256 aliceToken1After = MockERC20(Currency.unwrap(currency1)).balanceOf(alice);
        assertGt(aliceToken1After - aliceToken1Before, 0);

        // Intent marked as expired
        Intent memory intent = hook.getIntent(0);
        assertEq(uint8(intent.status), uint8(IntentStatus.Expired));
        assertGt(intent.outputAmount, 0);
    }

    function test_cancelIntent_bySwapper() public {
        uint256 amountIn = 1 ether;
        uint256 balanceBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(alice);

        _doSwap(alice, -int256(amountIn));

        // Alice cancels
        vm.prank(alice);
        hook.cancelIntent(0);

        // Alice got her tokens back
        uint256 balanceAfter = MockERC20(Currency.unwrap(currency0)).balanceOf(alice);
        assertEq(balanceAfter, balanceBefore);

        // Intent marked as cancelled
        Intent memory intent = hook.getIntent(0);
        assertEq(uint8(intent.status), uint8(IntentStatus.Cancelled));
    }

    function test_fill_revertsWhenExpired() public {
        _doSwap(alice, -1 ether);

        // Advance past deadline
        vm.roll(block.number + hook.DEFAULT_DEADLINE_BLOCKS() + 1);

        vm.prank(agent);
        vm.expectRevert(IAammHook.DeadlineAlreadyPassed.selector);
        hook.fill(0, 0.95 ether);
    }

    function test_fallback_revertsBeforeDeadline() public {
        _doSwap(alice, -1 ether);

        vm.expectRevert(IAammHook.DeadlineNotPassed.selector);
        hook.fallbackToAMM(0);
    }

    function test_cancel_revertsWhenNotSwapper() public {
        _doSwap(alice, -1 ether);

        vm.prank(agent);
        vm.expectRevert(IAammHook.OnlySwapper.selector);
        hook.cancelIntent(0);
    }

    function test_fill_revertsWhenAlreadyFilled() public {
        _doSwap(alice, -1 ether);

        vm.prank(agent);
        hook.fill(0, 0.95 ether);

        // Second fill should revert
        vm.prank(agent);
        vm.expectRevert(IAammHook.IntentNotPending.selector);
        hook.fill(0, 0.95 ether);
    }

    function test_multipleIntents() public {
        _doSwap(alice, -1 ether);
        _doSwap(alice, -0.5 ether);

        assertEq(hook.nextIntentId(), 2);

        Intent memory intent0 = hook.getIntent(0);
        Intent memory intent1 = hook.getIntent(1);

        assertEq(intent0.amountSpecified, -1 ether);
        assertEq(intent1.amountSpecified, -0.5 ether);
    }
}
