// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Project UNFORGIVEN - Identity-Weighted Ticketing Protocol
 * @author Jiani Zhao
 * @notice Implements C_access = P0 + D(alpha, t)
 * @dev Replaces standard dynamic pricing with a Refundable Deposit Mechanism.
 */
contract UnforgivenTicket is ERC721, Ownable, ReentrancyGuard {

    // --- Events ---
    event TicketIssued(address indexed buyer, uint256 tokenId, uint256 depositLocked);
    event DepositRefunded(address indexed buyer, uint256 amount);
    // Critical event for frontend to display "Scalper Got Rekt"
    event FundsConfiscated(uint256 tokenId, uint256 amount); 

    // --- Protocol Parameters ---
    uint256 public constant FACE_VALUE = 0.1 ether; 
    uint256 public constant MIN_DEPOSIT = 0.01 ether; 
    
    // Confiscated Vault (Protocol Revenue from Scalper Tax)
    uint256 public confiscatedVault;

    // --- State ---
    uint256 public totalSupply = 0;
    uint256 public maxSupply = 5000;

    struct TicketInfo {
        uint256 lockedDeposit;
        bool isMalicious;      
        bool isRefunded;
    }

    mapping(uint256 => TicketInfo) public tickets;

    constructor() ERC721("UNFORGIVEN Protocol", "UNFORGIVEN") Ownable(msg.sender) {}

    /**
     * @notice J-Curve Logic: Deposit = Min + (RiskFactor * Demand^2)
     * @dev Calculates the required refundable deposit based on identity risk.
     */
    function calculateDeposit(uint256 riskScore, uint256 demandFactor) public pure returns (uint256) {
        // 1. Risk Inversion: Lower score (0) -> Higher risk factor (10)
        // riskScore 0 (Bot) -> riskFactor 10
        // riskScore 100 (Fan) -> riskFactor 0
        uint256 riskFactor = (100 - riskScore) / 10; 

        // 2. J-Curve: Exponential penalty based on Demand^2
        // True Fans (riskFactor=0) pay 0 extra. Bots face exponential costs.
        uint256 exponentialPenalty = riskFactor * (demandFactor ** 2);
        
        // Scaling factor (0.0001 ether per unit)
        uint256 dynamicDeposit = exponentialPenalty * 0.0001 ether;

        return MIN_DEPOSIT + dynamicDeposit;
    }

    /**
     * @notice Purchase ticket with Identity-Weighted Deposit
     */
    function buyTicket(
        uint256 riskScore, 
        bytes calldata signature // Mock signature for hackathon demo
    ) public payable nonReentrant {
        require(totalSupply < maxSupply, "Sold Out");
        
        // Mock Demand: varies from 1 to 50 based on block number to simulate congestion
        uint256 demandFactor = (block.number % 50) + 1; 
        
        uint256 requiredDeposit = calculateDeposit(riskScore, demandFactor);
        uint256 totalCost = FACE_VALUE + requiredDeposit;

        require(msg.value >= totalCost, "Insufficient funds: The J-Curve rejected you.");

        totalSupply++;
        uint256 tokenId = totalSupply;
        _safeMint(msg.sender, tokenId);

        tickets[tokenId] = TicketInfo({
            lockedDeposit: requiredDeposit,
            isMalicious: false,
            isRefunded: false
        });
        
        emit TicketIssued(msg.sender, tokenId, requiredDeposit);
    }

    /**
     * @notice Admin function to flag bot activity based on off-chain analysis.
     */
    function flagMaliciousActivity(uint256 tokenId, bool status) external onlyOwner {
        tickets[tokenId].isMalicious = status;
    }

    /**
     * @notice Refund logic with "Scalper Tax" implementation.
     */
    function refundDeposit(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        TicketInfo storage info = tickets[tokenId];
        
        require(!info.isRefunded, "Already refunded");
        require(info.lockedDeposit > 0, "No deposit");

        // --- Core Logic: Confiscation ---
        if (info.isMalicious) {
            // 1. Move funds to the protocol vault
            confiscatedVault += info.lockedDeposit;
            
            // 2. Record the confiscated amount
            uint256 confiscatedAmount = info.lockedDeposit;
            
            // 3. Clear state to prevent re-entrancy or double spend
            info.lockedDeposit = 0; 
            info.isRefunded = true; // Mark as processed
            
            // 4. Emit event for transparency
            emit FundsConfiscated(tokenId, confiscatedAmount);
            
            // 5. [CRITICAL] Return successfully, do NOT revert.
            // This ensures the transaction consumes gas and the state change persists.
            return;
        }

        // --- Normal Refund Logic for Real Fans ---
        uint256 amount = info.lockedDeposit;
        info.lockedDeposit = 0;
        info.isRefunded = true;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit DepositRefunded(msg.sender, amount);
    }

    /**
     * @notice Withdraw the revenue generated from confiscated scalper deposits.
     */
    function withdrawConfiscatedFunds() external onlyOwner {
        uint256 amount = confiscatedVault;
        require(amount > 0, "No funds to withdraw");
        
        confiscatedVault = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdraw failed");
    }
}
