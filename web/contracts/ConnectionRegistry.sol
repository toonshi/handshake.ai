// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ConnectionRegistry
 * @notice Records Kuzana Connector handshakes on Avalanche.
 *         Every confirmed introduction is stored permanently and emits
 *         a ConnectionRecorded event that the frontend can surface.
 *
 *         The contract is owned by the server-side deployer wallet, which is
 *         the only address authorised to write new connections. Read access
 *         is fully public.
 */
contract ConnectionRegistry {
    // ─── Storage ────────────────────────────────────────────────────────────────

    struct Connection {
        address userA;
        address userB;
        string  matchId;
        uint256 timestamp;
    }

    Connection[] public connections;

    mapping(string => uint256) public matchIdToIndex;
    mapping(string => bool)    public matchExists;

    /// wallet → number of confirmed connections
    mapping(address => uint256) public connectionCount;

    address public owner;

    // ─── Events ─────────────────────────────────────────────────────────────────

    event ConnectionRecorded(
        uint256 indexed id,
        address indexed userA,
        address indexed userB,
        string  matchId,
        uint256 timestamp
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // ─── Errors ─────────────────────────────────────────────────────────────────

    error NotAuthorized();
    error MatchAlreadyRecorded(string matchId);
    error MatchNotFound(string matchId);

    // ─── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    // ─── Constructor ────────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Write ──────────────────────────────────────────────────────────────────

    /**
     * @notice Records a confirmed connection between two users.
     * @dev    Callable only by the owner (server-side deployer wallet).
     *         The function signature must match what avalanche.ts expects:
     *         `function recordConnection(address userA, address userB, string matchId) returns (uint256 id)`
     * @param  userA    Wallet of person A (or 0x0 if they haven't connected a wallet)
     * @param  userB    Wallet of person B (or 0x0 if they haven't connected a wallet)
     * @param  matchId  The UUID of the match from Supabase
     * @return id       The index of this connection in the array
     */
    function recordConnection(
        address userA,
        address userB,
        string calldata matchId
    ) external onlyOwner returns (uint256 id) {
        if (matchExists[matchId]) revert MatchAlreadyRecorded(matchId);

        id = connections.length;
        connections.push(Connection({
            userA:     userA,
            userB:     userB,
            matchId:   matchId,
            timestamp: block.timestamp
        }));

        matchIdToIndex[matchId] = id;
        matchExists[matchId]    = true;

        // Track per-wallet stats (skip zero-address placeholders)
        if (userA != address(0)) connectionCount[userA]++;
        if (userB != address(0)) connectionCount[userB]++;

        emit ConnectionRecorded(id, userA, userB, matchId, block.timestamp);
    }

    /**
     * @notice Transfer ownership to a new address.
     * @param  newOwner  The address to transfer ownership to.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─── Read ───────────────────────────────────────────────────────────────────

    /**
     * @notice  Get a connection by its array index.
     */
    function getConnection(uint256 id) external view returns (Connection memory) {
        return connections[id];
    }

    /**
     * @notice  Look up a connection by the match UUID from Supabase.
     */
    function getConnectionByMatchId(
        string calldata matchId
    ) external view returns (Connection memory) {
        if (!matchExists[matchId]) revert MatchNotFound(matchId);
        return connections[matchIdToIndex[matchId]];
    }

    /**
     * @notice  Total number of connections ever recorded.
     */
    function totalConnections() external view returns (uint256) {
        return connections.length;
    }
}
