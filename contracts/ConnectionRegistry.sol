// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Records every confirmed Kuzana Connector match as a permanent on-chain event.
contract ConnectionRegistry {
    event ConnectionCreated(
        uint256 indexed id,
        address indexed userA,
        address indexed userB,
        string matchId,
        uint256 timestamp
    );

    uint256 public totalConnections;

    /// @notice Called by the Kuzana backend when both parties consent to a match.
    /// @param userA  Avalanche wallet address of participant A (zero address if none provided)
    /// @param userB  Avalanche wallet address of participant B (zero address if none provided)
    /// @param matchId  UUID of the match row in Supabase
    /// @return id  Sequential connection counter
    function recordConnection(
        address userA,
        address userB,
        string calldata matchId
    ) external returns (uint256 id) {
        id = ++totalConnections;
        emit ConnectionCreated(id, userA, userB, matchId, block.timestamp);
    }
}
