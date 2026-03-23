import { expect } from 'chai';
import {
  calculateShieldQuote,
  findTicketListingPda,
  findTicketMintPda,
  normalizeSignedProofPayload,
  parseTicketListingAccount,
  parseTicketReceiptAccount,
} from '../lib/unforgiven-v2-client';
import { PublicKey } from '@solana/web3.js';

describe('unforgiven v2 client helpers', () => {
  it('matches Rust fixture vectors for shield quote math', () => {
    const v0 = calculateShieldQuote({
      initialPriceLamports: 1_000_000_000n,
      salesVelocityBps: 5_000n,
      timeElapsedSecs: 12n,
      dignityScore: 0,
    });
    const v50 = calculateShieldQuote({
      initialPriceLamports: 1_000_000_000n,
      salesVelocityBps: 5_000n,
      timeElapsedSecs: 12n,
      dignityScore: 50,
    });
    const v90 = calculateShieldQuote({
      initialPriceLamports: 1_000_000_000n,
      salesVelocityBps: 5_000n,
      timeElapsedSecs: 12n,
      dignityScore: 90,
    });

    expect(v0.finalPriceLamports.toString()).to.equal('120000000000');
    expect(v0.blocked).to.equal(true);
    expect(v50.finalPriceLamports.toString()).to.equal('4109890666');
    expect(v50.blocked).to.equal(false);
    expect(v90.finalPriceLamports.toString()).to.equal('997977140');
    expect(v90.blocked).to.equal(false);
  });

  it('keeps only signed reclaim proofs for verified mode', () => {
    const proofs = normalizeSignedProofPayload([
      { claimData: { owner: 'wallet-a' } },
      { claimData: { owner: 'wallet-b' }, signatures: [] },
      { claimData: { owner: 'wallet-c' }, signatures: ['sig'] },
    ]);

    expect(proofs).to.have.length(1);
    expect((proofs[0] as { claimData?: { owner?: string } }).claimData?.owner).to.equal('wallet-c');
  });

  it('derives deterministic ticket PDAs from payload bytes', () => {
    const programId = new PublicKey('5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW');
    const payload = new Uint8Array(141);
    payload.set(new Uint8Array(32).fill(7), 1);
    payload.set(new Uint8Array(32).fill(9), 61);
    payload.set(new Uint8Array([99, 0, 0, 0, 0, 0, 0, 0]), 133);

    const ticketMint = findTicketMintPda(programId, payload);
    const listing = findTicketListingPda(programId, ticketMint);

    expect(ticketMint.toBase58()).to.equal('5h5hmzTuE6Q9PNxJ2Jrjd9wY4wC9kHtN5B9CDnUwnt5E');
    expect(listing.toBase58()).to.equal('CkyuZ5xVbq1BaNYPfHgUHSKdt3B3gM7YNRse1zoKYdft');
  });

  it('parses ticket receipt and listing account layouts', () => {
    const receiptAddress = new PublicKey('2w3egz8EG6phP3AwqMeBiM9pjpStY3YteS2R9xQLD8Wr');
    const mint = new PublicKey('6WJrWpqTaRHz6m4Y7A1Crw4QScqEmJhbZJ5zH6L7Gv7c');
    const eventKey = new PublicKey('Qfv2aF3NpH3mhJ6x47TxHgtYPo62e3GuEDR8KQbf8fu');
    const buyer = new PublicKey('EhTPPwYGDW1KEn1jepHArxGzvVtfo5KBEBfBEFc66gBo');
    const data = new Uint8Array(218);
    data.set(new Uint8Array(8).fill(1), 0);
    data.set(mint.toBytes(), 8);
    data.set(eventKey.toBytes(), 40);
    data.set(buyer.toBytes(), 72);
    data.set(buyer.toBytes(), 104);
    data.set(new Uint8Array([0, 202, 154, 59, 0, 0, 0, 0]), 136);
    data.set(new Uint8Array([0, 202, 154, 59, 0, 0, 0, 0]), 144);
    data.set(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]), 152);
    data.set(new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0]), 160);
    data.set(new Uint8Array([99, 0, 0, 0, 0, 0, 0, 0]), 168);
    data.set(new Uint8Array(32).fill(5), 176);
    data[208] = 1;
    data[209] = 2;
    data[217] = 254;

    const receipt = parseTicketReceiptAccount(receiptAddress, data);
    expect(receipt?.mint.toBase58()).to.equal(mint.toBase58());
    expect(receipt?.currentHolder.toBase58()).to.equal(buyer.toBase58());
    expect(receipt?.listed).to.equal(true);
    expect(receipt?.resaleCount.toString()).to.equal('2');
    expect(receipt?.bump).to.equal(254);

    const listingAddress = new PublicKey('5aMB8x1vWfJfKxi2ycg5R75RP2rswW5o2j5UeM8pGqKB');
    const listingData = new Uint8Array(89);
    listingData.set(new Uint8Array(8).fill(2), 0);
    listingData.set(buyer.toBytes(), 8);
    listingData.set(mint.toBytes(), 40);
    listingData.set(new Uint8Array([0, 148, 53, 119, 0, 0, 0, 0]), 72);
    listingData.set(new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0]), 80);
    listingData[88] = 12;

    const listing = parseTicketListingAccount(listingAddress, listingData);
    expect(listing?.seller.toBase58()).to.equal(buyer.toBase58());
    expect(listing?.askPriceLamports.toString()).to.equal('2000000000');
    expect(listing?.bump).to.equal(12);
  });
});
