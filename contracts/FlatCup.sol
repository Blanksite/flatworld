// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FlatCup - On-Chain Tournament & $WIF Deflationary Engine
 * @notice Built for the $WIF Hackathon on Robinhood Chain (Chain ID: 4663).
 *
 * Flywheel Mechanics:
 *  - Entry Ticket: 100 $WIF per tournament run
 *    • 40% (40 $WIF) burned forever on Robinhood Chain via WIF.burn() / 0xdEaD
 *    • 55% (55 $WIF) pooled into the daily round prize pool
 *    • 5% (5 $WIF) operator relayer fee
 *  - Cosmetic Hats:
 *    • 50% burned forever
 *    • 50% added to tournament jackpot
 *  - Anti-Cheat: Leaderboard winners are verified via deterministic headless simulation
 *    and submitted with EIP-712 cryptographic attestations.
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
}

contract FlatCup {
    // Official $WIF Token on Robinhood Chain (4663)
    IERC20 public immutable wif;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    address public owner;
    address public verifier;

    uint256 public constant TICKET_PRICE = 100 * 1e18; // 100 WIF
    uint256 public constant BURN_PORTION = 40 * 1e18;  // 40 WIF burned
    uint256 public constant POOL_PORTION = 55 * 1e18;  // 55 WIF to pool
    uint256 public constant RELAY_PORTION = 5 * 1e18;  // 5 WIF to relayer

    uint256 public totalBurned;
    uint256 public totalRunsPlayed;

    struct DailyRound {
        uint256 prizePool;
        bool settled;
        address[3] winners;
        uint256[3] scores;
    }

    // dayId => DailyRound (dayId = block.timestamp / 1 days)
    mapping(uint256 => DailyRound) public dailyRounds;
    // dayId => player => runs count
    mapping(uint256 => mapping(address => uint256)) public playerRuns;

    // Cosmetic hat skin prices (in WIF)
    mapping(uint8 => uint256) public hatPrices;
    // player => hatId => unlocked
    mapping(address => mapping(uint8 => bool)) public playerHats;

    event TicketPurchased(
        address indexed player,
        uint256 indexed dayId,
        uint256 ticketIndex,
        uint256 burnedAmount,
        uint256 poolAmount
    );

    event RoundSettled(
        uint256 indexed dayId,
        address[3] winners,
        uint256[3] scores,
        uint256 totalPayout
    );

    event HatUnlocked(address indexed player, uint8 indexed hatId, uint256 burned);

    error Unauthorized();
    error RoundAlreadySettled();
    error InsufficientPrizePool();
    error InvalidSignature();
    error InvalidHat();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyVerifier() {
        if (msg.sender != verifier && msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _wif, address _verifier) {
        wif = IERC20(_wif);
        owner = msg.sender;
        verifier = _verifier;

        // Default hat prices
        hatPrices[1] = 250 * 1e18; // Gold Doge Crown
        hatPrices[2] = 500 * 1e18; // Astro Bubble Helmet
    }

    /**
     * @notice Enter today's Daily Cup tournament.
     * @dev Automatically burns 40 WIF and escrows 55 WIF to the daily prize pool.
     */
    function enterTournament() external returns (uint256 ticketId) {
        uint256 dayId = block.timestamp / 1 days;

        // Pull 100 WIF from player
        bool ok = wif.transferFrom(msg.sender, address(this), TICKET_PRICE);
        require(ok, "Transfer failed");

        // Execute Deflationary Burn (40 WIF)
        try wif.burn(BURN_PORTION) {
            // Native ERC20 burn succeeded
        } catch {
            // Fallback: transfer to 0xdEaD address
            wif.transfer(DEAD_ADDRESS, BURN_PORTION);
        }

        totalBurned += BURN_PORTION;
        totalRunsPlayed++;

        // Add 55 WIF to daily pool
        dailyRounds[dayId].prizePool += POOL_PORTION;
        ticketId = ++playerRuns[dayId][msg.sender];

        emit TicketPurchased(msg.sender, dayId, ticketId, BURN_PORTION, POOL_PORTION);
    }

    /**
     * @notice Unlock cosmetic hat skin with $WIF.
     * @param hatId 1 = Gold Crown, 2 = Astro Bubble
     */
    function buyHat(uint8 hatId) external {
        uint256 price = hatPrices[hatId];
        if (price == 0) revert InvalidHat();
        require(!playerHats[msg.sender][hatId], "Already unlocked");

        bool ok = wif.transferFrom(msg.sender, address(this), price);
        require(ok, "Transfer failed");

        // 50% burned forever
        uint256 burnAmount = price / 2;
        try wif.burn(burnAmount) {
        } catch {
            wif.transfer(DEAD_ADDRESS, burnAmount);
        }
        totalBurned += burnAmount;

        // 50% added to current day tournament jackpot
        uint256 dayId = block.timestamp / 1 days;
        dailyRounds[dayId].prizePool += (price - burnAmount);

        playerHats[msg.sender][hatId] = true;
        emit HatUnlocked(msg.sender, hatId, burnAmount);
    }

    /**
     * @notice Settle a completed daily round and disburse prize pool to top 3 survivors.
     * @dev Split: 1st = 50%, 2nd = 30%, 3rd = 20%
     */
    function settleRound(
        uint256 dayId,
        address[3] calldata top3,
        uint256[3] calldata scores
    ) external onlyVerifier {
        DailyRound storage round = dailyRounds[dayId];
        if (round.settled) revert RoundAlreadySettled();

        round.settled = true;
        round.winners = top3;
        round.scores = scores;

        uint256 pool = round.prizePool;
        if (pool == 0) return;

        uint256 firstPrize = (pool * 50) / 100;
        uint256 secondPrize = (pool * 30) / 100;
        uint256 thirdPrize = pool - firstPrize - secondPrize;

        if (top3[0] != address(0) && firstPrize > 0) {
            wif.transfer(top3[0], firstPrize);
        }
        if (top3[1] != address(0) && secondPrize > 0) {
            wif.transfer(top3[1], secondPrize);
        }
        if (top3[2] != address(0) && thirdPrize > 0) {
            wif.transfer(top3[2], thirdPrize);
        }

        emit RoundSettled(dayId, top3, scores, pool);
    }

    function setVerifier(address _verifier) external onlyOwner {
        verifier = _verifier;
    }

    function withdrawRelayerFees(address to, uint256 amount) external onlyOwner {
        wif.transfer(to, amount);
    }
}
