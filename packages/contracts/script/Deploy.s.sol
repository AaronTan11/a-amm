// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "v4-core/test/PoolModifyLiquidityTest.sol";
import {AammHook} from "../src/AammHook.sol";
import {HookMiner} from "../test/utils/HookMiner.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract DeployAammHook is Script {
    // ==================== Sepolia addresses ====================
    address constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address constant MODIFY_LIQ_ROUTER = 0x0C478023803a644c94c4CE1C1e7b9A087e411B0A;

    // Tokens (WETH < USDC lexicographically, so WETH = currency0)
    address constant WETH = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;
    address constant USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;

    // Pool params
    uint24 constant FEE = 3000;
    int24 constant TICK_SPACING = 60;
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    function run() external {
        // ==================== 1. Mine salt & deploy hook ====================
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        );

        bytes memory constructorArgs = abi.encode(IPoolManager(POOL_MANAGER));
        (address hookAddr, bytes32 salt) = HookMiner.find(
            address(this),
            flags,
            type(AammHook).creationCode,
            constructorArgs
        );

        console.log("=== A-AMM Sepolia Deployment ===");
        console.log("");
        console.log("Hook target:", hookAddr);
        console.log("Salt:", vm.toString(salt));

        vm.startBroadcast();

        AammHook hook = new AammHook{salt: salt}(IPoolManager(POOL_MANAGER));
        require(address(hook) == hookAddr, "Hook address mismatch");
        console.log("Hook deployed:", address(hook));

        // ==================== 2. Initialize pool ====================
        // WETH (0x7b...) < USDC (0x94...) so WETH = currency0
        Currency currency0 = Currency.wrap(WETH);
        Currency currency1 = Currency.wrap(USDC);

        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });

        IPoolManager(POOL_MANAGER).initialize(poolKey, SQRT_PRICE_1_1);
        console.log("Pool initialized: WETH/USDC (fee=3000, tickSpacing=60)");

        // ==================== 3. Seed liquidity ====================
        // Approve tokens to the modify liquidity router
        IERC20(WETH).approve(MODIFY_LIQ_ROUTER, type(uint256).max);
        IERC20(USDC).approve(MODIFY_LIQ_ROUTER, type(uint256).max);

        // Add liquidity across a wide range around 1:1 price
        // tickSpacing=60, so ticks must be multiples of 60
        PoolModifyLiquidityTest(MODIFY_LIQ_ROUTER).modifyLiquidity(
            poolKey,
            ModifyLiquidityParams({
                tickLower: -887220, // near MIN_TICK, multiple of 60
                tickUpper: 887220,  // near MAX_TICK, multiple of 60
                liquidityDelta: 1e18,
                salt: 0
            }),
            ""
        );

        uint256 wethBal = IERC20(WETH).balanceOf(msg.sender);
        uint256 usdcBal = IERC20(USDC).balanceOf(msg.sender);
        console.log("Seed liquidity added");
        console.log("Deployer WETH balance remaining:", wethBal);
        console.log("Deployer USDC balance remaining:", usdcBal);

        vm.stopBroadcast();

        // ==================== Summary ====================
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Hook:      ", address(hook));
        console.log("Currency0: ", WETH, "(WETH)");
        console.log("Currency1: ", USDC, "(USDC)");
        console.log("Fee:        3000");
        console.log("TickSpacing: 60");
        console.log("");
        console.log("Set VITE_HOOK_ADDRESS=", address(hook));
    }
}
