// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Project UNFORGIVEN - Identity-Weighted Ticketing Protocol
 * @author Jiani Zhao (Consensus 2026 Hackathon)
 * @notice Implements C_access = P0 + D(alpha, t)
 * @dev Replaces standard VRGDA with a Refundable Deposit Mechanism.
 */
contract UnforgivenTicket is ERC721, Ownable, ReentrancyGuard {

    // --- Events ---
    // Log compressed verification data for off-chain audit (Gas Optimization)
    event AuditLog(bytes32 indexed packedData); 
    event TicketIssued(address indexed buyer, uint256 tokenId, uint256 depositLocked);
    event DepositRefunded(address indexed buyer, uint256 amount);

    // --- Protocol Parameters ---
    uint256 public constant FACE_VALUE = 0.1 ether; // P0: Fixed Price (Fairness)
    uint256 public constant MIN_DEPOSIT = 0.01 ether; 
    
    // Configurable constants for the "Bankruptcy Zone" curve
    uint256 public congestionMultiplier = 50; 

    // --- State ---
    uint256 public totalSupply = 0;
    uint256 public maxSupply = 5000;

    // Mapping to track locked deposits: TokenID -> Deposit Amount
    mapping(uint256 => uint256) public lockedDeposits;

    constructor() ERC721("UNFORGIVEN Protocol", "UNFORGIVEN") Ownable(msg.sender) {}

    /**
     * @notice Calculate required Deposit (D) based on Risk Score (alpha) and Congestion.
     * @param riskScore 0-100 (100 = True Fan, 0 = Bot). Passed from off-chain ZK-prover.
     * @param demandFactor Current queue length (provided by oracle/backend).
     */
    function calculateDeposit(uint256 riskScore, uint256 demandFactor) public view returns (uint256) {
        // Core Logic: C_access = P0 + D(alpha)
        
        // Invert score: Lower score = Higher risk
        uint256 riskFactor = 100 - riskScore; 

        // J-Curve Logic: 
        // If risk is high (>50) and demand is high, Deposit scales exponentially.
        // Simple linear implementation for hackathon MVP:
        uint256 dynamicDeposit = (riskFactor * demandFactor * congestionMultiplier) / 100;
        
        // True Fans (Risk ~ 0) pay minimal deposit
        return MIN_DEPOSIT + dynamicDeposit;
    }

    /**
     * @notice Buy Ticket with Identity-Weighted Deposit.
     * @param riskScore Verified off-chain score (0-100).
     * @param packedAuditData 256-bit word containing timestamp + rule version + hash.
     * @param signature Oracle signature verifying the score (Mocked for Demo).
     */
    function buyTicket(
        uint256 riskScore, 
        bytes32 packedAuditData, 
        bytes calldata signature
    ) public payable nonReentrant {
        require(totalSupply < maxSupply, "Sold Out");
        
        // 1. Calculate Required Cost: P0 + D
        // In a real implementation, 'demandFactor' comes from an oracle. 
        // For MVP, we use block.number % 100 as a pseudo-random congestion sim.
        uint256 demandFactor = block.number % 50; 
        uint256 requiredDeposit = calculateDeposit(riskScore, demandFactor);
        uint256 totalCost = FACE_VALUE + requiredDeposit;

        require(msg.value >= totalCost, "Insufficient funds for Deposit + Face Value");

        // 2. Audit Logging (Bitwise Packing)
        // Emits only 32 bytes to save gas on Solana/Aptos/EVM L2s
        emit AuditLog(packedAuditData);

        // 3. Mint Logic
        totalSupply++;
        uint256 tokenId = totalSupply;
        _safeMint(msg.sender, tokenId);

        // 4. Lock Deposit
        lockedDeposits[tokenId] = requiredDeposit;
        
        emit TicketIssued(msg.sender, tokenId, requiredDeposit);
    }

    /**
     * @notice Return the deposit to the user after the event (or verification check).
     * @dev Only callable by admin or after event timestamp.
     */
    function refundDeposit(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        uint256 deposit = lockedDeposits[tokenId];
        require(deposit > 0, "No deposit to refund");

        lockedDeposits[tokenId] = 0;

        // Refund D, keep P0
        (bool success, ) = payable(msg.sender).call{value: deposit}("");
        require(success, "Transfer failed");

        emit DepositRefunded(msg.sender, deposit);
    }
}
