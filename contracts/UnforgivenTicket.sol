// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Optimized: Removing Enumerable to save Gas. We will track supply manually.
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SignedMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // Security: Prevents re-entrancy attacks

/**
 * @title Project UNFORGIVEN - VRGDA Ticketing Protocol
 * @author Jiani Zhao
 * @notice Implements a simplified Variable Rate Gradual Dutch Auction (VRGDA).
 * @dev Optimized for gas efficiency and security (ReentrancyGuard, call vs transfer).
 */
contract UnforgivenTicket is ERC721, Ownable, ReentrancyGuard {
    using SignedMath for int256;

    // --- Events (Critical for Frontend Dashboard) ---
    event TicketPurchased(address indexed buyer, uint256 tokenId, uint256 price, uint256 timestamp);
    event AuctionConfigUpdated(uint256 newStartTime, int256 newMinPrice);
    // Added Lifecycle Event: Signals when the owner cashes out/ends the protocol loop
    event AuctionEnded(uint256 timestamp, uint256 totalAmountRaised);

    // --- Protocol Parameters ---
    
    // Target Price: 0.1 ETH
    int256 public targetPrice = 0.1 ether; 
    
    // Decay Constant: Price sensitivity
    int256 public decayConstant = 0.1 ether; 
    
    // Minimum Price floor (adjustable)
    int256 public minPrice = 0.001 ether;

    // Target Rate: Tickets to sell per minute
    int256 public perTimeUnit = 10; 

    // Auction Start Timestamp (can be updated by owner)
    uint256 public startTime;
    
    // Venue Capacity
    uint256 public maxSupply = 5000;

    // --- State Variables ---
    
    // Manual counter is cheaper than ERC721Enumerable
    uint256 public totalSupply = 0;

    constructor() ERC721("UNFORGIVEN Protocol", "UNFORGIVEN") Ownable(msg.sender) {
        // Sanity check parameters
        require(targetPrice > 0, "Target price must be positive");
        require(decayConstant > 0, "Decay constant must be positive");
        
        // Default start time is now
        startTime = block.timestamp;
    }

    // --- Admin Functions ---

    /**
     * @notice Allows the owner to set the auction start time explicitly.
     */
    function setAuctionConfig(uint256 _startTime, int256 _minPrice) external onlyOwner {
        // Safety check: Prevent setting price dangerously low (e.g. 0)
        require(_minPrice >= 0.0001 ether, "Min price too low");
        
        startTime = _startTime;
        minPrice = _minPrice;
        emit AuctionConfigUpdated(_startTime, _minPrice);
    }

    /**
     * @notice Calculates the current purchase price based on sales velocity.
     * @dev Uses int256 to allow for negative price adjustments (when lagging).
     */
    function getCurrentPrice() public view returns (uint256) {
        // If auction hasn't started, return 2x target price as a placeholder high price.
        // Logic: No need for gradual transition here as buying is disabled before start.
        if (block.timestamp < startTime) {
            return uint256(targetPrice * 2); 
        }

        // 1. Calculate time delta (Minutes)
        int256 timeSinceStart = int256((block.timestamp - startTime) / 60); 

        // 2. Get current inventory sold (cast to int for math)
        int256 sold = int256(totalSupply);

        // 3. Calculate Target Schedule
        int256 targetSold = timeSinceStart * perTimeUnit;

        // 4. Calculate Lag/Lead
        // Negative value = We are selling too slow -> Price should drop
        // Positive value = We are selling too fast -> Price should spike
        int256 productionDiff = sold - targetSold;

        // 5. Apply Pricing Adjustment
        // Note: Using standard integer math which is safe from overflow in Solidity 0.8+
        // for reasonable ticket volume (maxSupply = 5000).
        int256 priceAdjustment = productionDiff * (targetPrice / 10); 
        
        int256 finalPrice = targetPrice + priceAdjustment;

        // Safety floor: never go below minPrice or zero
        if (finalPrice < minPrice) {
            return uint256(minPrice);
        }
        
        return uint256(finalPrice);
    }

    /**
     * @notice Purchase a ticket.
     * @dev Protected by nonReentrant to prevent re-entrancy attacks during refunds.
     */
    function buyTicket() public payable nonReentrant {
        require(totalSupply < maxSupply, "Sold Out: Venue Capacity Reached");
        require(block.timestamp >= startTime, "Auction not started");
        
        uint256 price = getCurrentPrice();
        require(msg.value >= price, "Insufficient funds sent based on current VRGDA price");

        // Increment supply FIRST (Checks-Effects-Interactions pattern)
        totalSupply++;
        uint256 tokenId = totalSupply;

        // Mint NFT
        _safeMint(msg.sender, tokenId);
        
        // Emit Event (Critical for Frontend)
        emit TicketPurchased(msg.sender, tokenId, price, block.timestamp);

        // Refund excess ETH
        uint256 refund = msg.value - price;
        if (refund > 0) {
            // Secure refund method using call
            (bool success, ) = payable(msg.sender).call{value: refund}("");
            require(success, "Refund failed");
        }
    }

    /**
     * @notice Withdraw protocol funds and signal auction end.
     */
    function withdraw() public onlyOwner {
        uint256 amount = address(this).balance;
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdraw failed");
        
        // Emitting this event marks the "Exit" of the project lifecycle on-chain
        emit AuctionEnded(block.timestamp, amount);
    }
}
