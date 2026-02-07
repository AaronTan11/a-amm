// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Intent} from "../types/Intent.sol";

interface IAammHook {
    // --- Events ---
    event IntentCreated(
        uint256 indexed intentId,
        address indexed swapper,
        bool zeroForOne,
        int256 amountSpecified,
        uint256 deadline
    );
    event IntentFilled(uint256 indexed intentId, address indexed agent, uint256 outputAmount);
    event IntentCancelled(uint256 indexed intentId);
    event IntentFallback(uint256 indexed intentId);

    // --- Errors ---
    error IntentNotPending();
    error DeadlineNotPassed();
    error DeadlineAlreadyPassed();
    error OnlySwapper();
    error OnlyPoolManager();

    // --- External functions ---
    function fill(uint256 intentId, uint256 outputAmount) external;
    function fallbackToAMM(uint256 intentId) external;
    function cancelIntent(uint256 intentId) external;
    function getIntent(uint256 intentId) external view returns (Intent memory);
    function nextIntentId() external view returns (uint256);
}
