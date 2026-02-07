// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "v4-core/types/PoolKey.sol";

enum IntentStatus {
    Pending,
    Filled,
    Cancelled,
    Expired
}

struct Intent {
    uint256 intentId;
    address swapper;
    PoolKey poolKey;
    bool zeroForOne;
    int256 amountSpecified; // negative = exactInput
    uint256 deadline; // block number
    IntentStatus status;
    address filledBy;
    uint256 outputAmount;
}
