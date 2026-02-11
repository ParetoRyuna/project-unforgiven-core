# Anchor build 说明（Solana 链上部署）

## 1. 恢复的配置

- **`.cargo/config.toml`**：已恢复 `build-bpf = "build-sbf"` 别名（避免 Cargo 警告）。

## 2. 为什么必须用 Rust 1.85+

当前依赖链：

```
unforgiven → solana-program 1.18.20 → cc → jobserver → getrandom 0.3 → wasip2 → wit-bindgen ^0.51.0
```

`wit-bindgen 0.51.0` 需要 Cargo 的 **edition2024**，该特性在 **Rust 1.85** 才稳定。  
因此无法通过“只降级某一个包”绕过，必须使用 **Rust 1.85 或更新** 才能通过 `anchor build`。

## 3. 推荐做法（本地 / Mac）

1. **安装/升级 Rust 到 1.85+**（用 rustup）：
   ```bash
   rustup update stable
   # 或只安装 1.85
   rustup install 1.85
   rustup default 1.85
   ```

2. **使用项目里的 Rust 版本**（已加 `rust-toolchain.toml`）：
   - 在项目根目录执行 `anchor build` 时，若已安装 1.85，会自动用 1.85。
   - 若未安装：`rustup install 1.85` 后再执行 `anchor build`。

3. **Solana 链上部署**：
   - 链上跑的是 **Anchor 编译出的 BPF 程序**，和本机 Rust 版本是两回事。
   - 本机用 Rust 1.85 只是满足 **构建环境** 的要求，不会改变链上程序的兼容性。
   - 项目里已锁 `solana-program = 1.18.20`，部署到链上的仍是与 Solana 1.18.x 兼容的版本。

## 4. 可选：Dev Container

`.devcontainer/setup.sh` 里曾有 `cargo update -p wit-bindgen --precise 0.19.2`，  
在当前依赖下会失败（wasip2 强制要求 wit-bindgen ^0.51）。  
若用 Dev Container，请在容器内同样安装 Rust 1.85+ 再执行 `anchor build`。

## 5. 小结

| 项目           | 说明 |
|----------------|------|
| `.cargo/config.toml` | 已恢复 `build-bpf` 别名 |
| Rust 版本      | 本机需 **1.85+** 才能通过 `anchor build` |
| 链上兼容性     | 由 `solana-program = 1.18.20` 决定，与本地 Rust 1.85 无关 |
