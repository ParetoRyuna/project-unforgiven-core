#!/bin/bash
set -e

# 1. Install Solana Tools (v1.18.4 is stable for Anchor 0.29)
sh -c "$(curl -sSfL https://release.solana.com/v1.18.4/install)"
export PATH="/home/vscode/.local/share/solana/install/active_release/bin:$PATH"

# 2. Install Anchor 0.29.0
cargo install --git https://github.com/coral-xyz/anchor --tag v0.29.0 anchor-cli --locked

# 3. Apply the Downgrade Fix (The Magic Step)
# We preemptively fix the Cargo.lock before the first build
echo "Applying dependency fixes..."
cd /workspaces/$(basename "$PWD") || cd /workspaces/*
if [ -f "Cargo.lock" ]; then rm Cargo.lock; fi
cargo generate-lockfile
cargo update -p spdx --precise 0.10.6
cargo update -p wit-bindgen --precise 0.19.2
cargo update -p blake3 --precise 1.3.3
echo "Setup complete. Ready to build."
