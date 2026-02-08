// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Intent} from "../types/Intent.sol";

interface IAammHook {
    // --- Events ---
    event IntentCreated(
        uint256 indexed intentId,
        address indexed swapper,
        bytes32 indexed poolId,
        bool zeroForOne,
        uint256 amountIn,
        uint256 minOutputAmount,
        uint256 deadline
    );
    event IntentFilled(uint256 indexed intentId, address indexed agent, uint256 outputAmount);
    event IntentCancelled(uint256 indexed intentId);
    event IntentFallback(uint256 indexed intentId);

    // --- Errors ---
    error IntentNotPending();
    error DeadlineNotPassed();
    error DeadlineAlreadyPassed();
    error InsufficientOutput();
    error OnlySwapper();
    error OnlyPoolManager();

    // --- External functions ---
    function fill(uint256 intentId, uint256 outputAmount) external;
    function fallbackToAMM(uint256 intentId) external;
    function cancelIntent(uint256 intentId) external;
    function getIntent(uint256 intentId) external view returns (Intent memory);
    function nextIntentId() external view returns (uint256);
}
