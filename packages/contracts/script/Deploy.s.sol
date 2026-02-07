// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {AammHook} from "../src/AammHook.sol";
import {HookMiner} from "../test/utils/HookMiner.sol";

contract DeployAammHook is Script {
    // Sepolia PoolManager
    address constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;

    function run() external {
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        );

        // Mine CREATE2 salt for correct address bits
        bytes memory constructorArgs = abi.encode(IPoolManager(POOL_MANAGER));
        (address hookAddr, bytes32 salt) = HookMiner.find(
            address(this),
            flags,
            type(AammHook).creationCode,
            constructorArgs
        );

        console.log("Deploying AammHook to:", hookAddr);
        console.log("Salt:", vm.toString(salt));

        vm.startBroadcast();
        AammHook hook = new AammHook{salt: salt}(IPoolManager(POOL_MANAGER));
        require(address(hook) == hookAddr, "Hook address mismatch");
        vm.stopBroadcast();

        console.log("AammHook deployed to:", address(hook));
    }
}
