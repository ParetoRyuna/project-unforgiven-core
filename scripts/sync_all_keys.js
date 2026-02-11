const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

// 1. 生成全新密钥对
const kp = Keypair.generate();
const secretVal = JSON.stringify(Array.from(kp.secretKey));
const publicVal = kp.publicKey.toBase58();

console.log("🔐 Generated New Oracle Key:", publicVal);

// 2. 更新 .env.local (后端私钥)
try {
    let envContent = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
    // 如果存在旧配置则替换，不存在则追加
    if (envContent.includes('ADMIN_SECRET_KEY=')) {
        envContent = envContent.replace(/ADMIN_SECRET_KEY=.*/g, `ADMIN_SECRET_KEY=${secretVal}`);
    } else {
        envContent += `\nADMIN_SECRET_KEY=${secretVal}`;
    }
    fs.writeFileSync('.env.local', envContent);
    console.log("✅ Updated .env.local");
} catch(e) { console.error("Error updating .env", e); }

// 3. 更新 lib.rs (合约公钥)
try {
    const libPath = 'programs/unforgiven/src/lib.rs';
    let libContent = fs.readFileSync(libPath, 'utf8');
    // 替换 Rust 常量
    libContent = libContent.replace(/const ORACLE_PUBKEY: &str = ".*";/, `const ORACLE_PUBKEY: &str = "${publicVal}";`);
    fs.writeFileSync(libPath, libContent);
    console.log("✅ Updated lib.rs");
} catch(e) { console.error("Error updating lib.rs", e); }

// 4. 更新 InitializeButton.tsx (前端初始化公钥)
try {
    const btnPath = 'components/InitializeButton.tsx';
    let btnContent = fs.readFileSync(btnPath, 'utf8');
    // 替换 JS 常量
    btnContent = btnContent.replace(/const ORACLE_PUBKEY = new PublicKey\(".*"\);/, `const ORACLE_PUBKEY = new PublicKey("${publicVal}");`);
    fs.writeFileSync(btnPath, btnContent);
    console.log("✅ Updated InitializeButton.tsx");
} catch(e) { console.error("Error updating component", e); }
