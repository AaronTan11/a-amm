// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "v4-core/test/PoolModifyLiquidityTest.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Initialize a Circle USDC / WETH pool on the existing A-AMM hook
contract InitPoolCircleUSDC is Script {
    // ==================== Sepolia addresses ====================
    address constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address constant MODIFY_LIQ_ROUTER = 0x0C478023803a644c94c4CE1C1e7b9A087e411B0A;
    address constant HOOK = 0x964453F9c597e30EB5C2f331b389FD0eA8d6c0c8;

    // Circle USDC (0x1c...) < WETH (0x7b...) → USDC = currency0
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant WETH = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;

    // Pool params (same as original deployment)
    uint24 constant FEE = 3000;
    int24 constant TICK_SPACING = 60;
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    function run() external {
        console.log("=== Init Circle USDC / WETH Pool ===");
        console.log("Hook:     ", HOOK);
        console.log("Currency0:", USDC, "(Circle USDC)");
        console.log("Currency1:", WETH, "(WETH)");

        vm.startBroadcast();

        // 1. Initialize pool
        Currency currency0 = Currency.wrap(USDC);
        Currency currency1 = Currency.wrap(WETH);

        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(HOOK)
        });

        IPoolManager(POOL_MANAGER).initialize(poolKey, SQRT_PRICE_1_1);
        console.log("Pool initialized");

        // 2. Seed liquidity
        IERC20(USDC).approve(MODIFY_LIQ_ROUTER, type(uint256).max);
        IERC20(WETH).approve(MODIFY_LIQ_ROUTER, type(uint256).max);

        PoolModifyLiquidityTest(MODIFY_LIQ_ROUTER).modifyLiquidity(
            poolKey,
            ModifyLiquidityParams({
                tickLower: -887220,
                tickUpper: 887220,
                liquidityDelta: 1e6, // ~1 USDC worth (wallet has 2.4)
                salt: 0
            }),
            ""
        );

        uint256 usdcBal = IERC20(USDC).balanceOf(msg.sender);
        uint256 wethBal = IERC20(WETH).balanceOf(msg.sender);
        console.log("Liquidity seeded");
        console.log("USDC remaining:", usdcBal);
        console.log("WETH remaining:", wethBal);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Done ===");
    }
}
