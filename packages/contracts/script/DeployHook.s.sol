// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {AammHook} from "../src/AammHook.sol";
import {HookMiner} from "../test/utils/HookMiner.sol";

/// @notice Deploy ONLY the AammHook via CREATE2 (no pool init, no liquidity)
contract DeployHookOnly is Script {
    address constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        );

        bytes memory constructorArgs = abi.encode(IPoolManager(POOL_MANAGER));
        (address hookAddr, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER, flags, type(AammHook).creationCode, constructorArgs
        );

        console.log("Hook target:", hookAddr);

        vm.startBroadcast();

        bytes memory initCode = abi.encodePacked(type(AammHook).creationCode, constructorArgs);
        (bool success,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode));
        require(success, "CREATE2 deploy failed");
        require(hookAddr.code.length > 0, "Hook not deployed");

        vm.stopBroadcast();

        console.log("Hook deployed:", hookAddr);
    }
}
