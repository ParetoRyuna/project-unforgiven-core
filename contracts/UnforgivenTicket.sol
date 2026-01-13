// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SignedMath.sol";

/**
 * @title Project UNFORGIVEN - VRGDA Ticketing Protocol
 * @author Jiani Zhao
 * @notice Implements a simplified Variable Rate Gradual Dutch Auction (VRGDA) for high-frequency ticketing.
 * @dev Core logic adapted from Paradigm's VRGDA reference implementation.
 */
contract UnforgivenTicket is ERC721Enumerable, Ownable {
    using SignedMath for int256;

    // --- Protocol Parameters ---
    
    // Target Price: The intended equilibrium price for a ticket (e.g., 0.1 ETH).
    int256 public targetPrice = 0.1 ether; 
    
    // Decay Constant: The price sensitivity. 0.1 means price decays by ~10% per time unit if no sales occur.
    // In VRGDA terms, this controls the steepness of the price curve.
    int256 public decayConstant = 0.1 ether; 

    // Target Rate: The ideal number of tickets sold per unit of time.
    int256 public perTimeUnit = 10; 

    // Auction Start Timestamp
    uint256 public startTime;
    
    // Venue Capacity (Max Supply)
    uint256 public maxSupply = 5000;

    // --- State Variables ---
    
    // Token ID counter
    uint256 public nextTokenId = 1;

    constructor() ERC721("UNFORGIVEN Protocol", "UNFORGIVEN") Ownable(msg.sender) {
        startTime = block.timestamp;
    }

    /**
     * @notice Calculates the current purchase price based on sales velocity.
     * @dev Price Formula: P(t) = P0 * (1 - k)^(t - n/r)
     * Note: This implementation uses a linear approximation for MVP demonstration purposes.
     * Production version should use fixed-point math for precise exponential decay.
     */
    function getCurrentPrice() public view returns (uint256) {
        // 1. Calculate time delta since auction start (Time Unit: Minutes for demo)
        int256 timeSinceStart = int256((block.timestamp - startTime) / 60); 

        // 2. Get current inventory sold
        int256 sold = int256(totalSupply());

        // 3. Calculate Target Schedule: How many tickets *should* have been sold by now?
        int256 targetSold = timeSinceStart * perTimeUnit;

        // 4. Calculate Lag/Lead: Positive means we are ahead of schedule (High Demand -> Price Up)
        int256 productionDiff = sold - targetSold;

        // 5. Apply Pricing Adjustment
        // If sales are ahead of schedule, price increases to curb demand (Anti-Scalper).
        // If sales are behind, price decays to find equilibrium.
        
        int256 priceAdjustment = productionDiff * (targetPrice / 10); 
        
        int256 finalPrice = targetPrice + priceAdjustment;

        // Safety floor to prevent negative pricing or zero value attacks
        if (finalPrice < 0.001 ether) {
            return 0.001 ether;
        }
        
        return uint256(finalPrice);
    }

    /**
     * @notice Purchase a ticket at the current dynamic price.
     */
    function buyTicket() public payable {
        require(totalSupply() < maxSupply, "Sold Out: Venue Capacity Reached");
        
        uint256 price = getCurrentPrice();
        require(msg.value >= price, "Insufficient funds sent based on current VRGDA price");

        // Mint NFT ticket to buyer
        _safeMint(msg.sender, nextTokenId);
        nextTokenId++;

        // Refund any excess ETH sent by the user
        if (msg.value > price) {
            payable(msg.sender).transfer(msg.value - price);
        }
    }

    /**
     * @notice Withdraw protocol funds (Owner only).
     */
    function withdraw() public onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
}
