// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "v4-core/test/PoolModifyLiquidityTest.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Seed liquidity into an already-initialized pool
contract SeedLiquidity is Script {
    address constant MODIFY_LIQ_ROUTER = 0x0C478023803a644c94c4CE1C1e7b9A087e411B0A;
    address constant HOOK = 0x964453F9c597e30EB5C2f331b389FD0eA8d6c0c8;

    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant WETH = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;

    uint24 constant FEE = 3000;
    int24 constant TICK_SPACING = 60;

    function run() external {
        vm.startBroadcast();

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(USDC),
            currency1: Currency.wrap(WETH),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(HOOK)
        });

        IERC20(USDC).approve(MODIFY_LIQ_ROUTER, type(uint256).max);
        IERC20(WETH).approve(MODIFY_LIQ_ROUTER, type(uint256).max);

        PoolModifyLiquidityTest(MODIFY_LIQ_ROUTER).modifyLiquidity(
            poolKey,
            ModifyLiquidityParams({
                tickLower: -887220,
                tickUpper: 887220,
                liquidityDelta: 1e6,
                salt: 0
            }),
            ""
        );

        console.log("Liquidity seeded");
        console.log("USDC remaining:", IERC20(USDC).balanceOf(msg.sender));
        console.log("WETH remaining:", IERC20(WETH).balanceOf(msg.sender));

        vm.stopBroadcast();
    }
}
