// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Utility for mining CREATE2 addresses with specific hook permission bits.
library HookMiner {
    /// @notice Find a salt that produces a CREATE2 address with the desired flag bits.
    /// @param deployer The CREATE2 deployer address
    /// @param flags The required permission bits (lower 14 bits of the address)
    /// @param creationCode The contract creation code (type(Contract).creationCode)
    /// @param constructorArgs The ABI-encoded constructor arguments
    /// @return hookAddress The computed address with correct flag bits
    /// @return salt The salt that produces the address
    function find(address deployer, uint160 flags, bytes memory creationCode, bytes memory constructorArgs)
        internal
        pure
        returns (address hookAddress, bytes32 salt)
    {
        bytes memory initCode = abi.encodePacked(creationCode, constructorArgs);
        bytes32 initCodeHash = keccak256(initCode);
        uint160 flagMask = uint160(0x3FFF); // lower 14 bits

        for (uint256 i = 0; i < 100_000; i++) {
            salt = bytes32(i);
            hookAddress = computeAddress(deployer, salt, initCodeHash);
            if (uint160(hookAddress) & flagMask == flags) {
                return (hookAddress, salt);
            }
        }
        revert("HookMiner: could not find salt");
    }

    function computeAddress(address deployer, bytes32 salt, bytes32 initCodeHash)
        internal
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }
}
