import { useMemo } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, Idl, setProvider } from "@coral-xyz/anchor";
import type { Wallet as AnchorWallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "@noble/hashes/utils";
import idlImport from "@/app/idl/unforgiven.json";

// 1. 获取 Program ID：与 programs/unforgiven 中 declare_id! 一致，优先读环境变量
const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID
  ? new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID)
  : new PublicKey("D8mRR6zRJSqB1LQ8GPBbHNZdBkMnPhz5LBd6JWCpnXuP");

/** Anchor 0.32 期望：类型名 "pubkey"、指令账户用 writable/signer（非 isMut/isSigner），此处统一规范化 */
function normalizeIdlTypes(idl: Record<string, unknown>): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(idl)) as Record<string, unknown>;
  const replace = (obj: unknown): unknown => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(replace);
    const o = obj as Record<string, unknown>;
    if (typeof o.type === "string" && o.type === "publicKey") {
      o.type = "pubkey";
    }
    for (const k of Object.keys(o)) o[k] = replace(o[k]);
    return o;
  };
  replace(out);
  // Anchor 0.32 指令账户用 writable/signer，旧 IDL 用 isMut/isSigner，需映射
  const instructions = out.instructions as Array<{ accounts?: Array<Record<string, unknown>>; name?: string; discriminator?: unknown }> | undefined;
  if (instructions) {
    for (const ix of instructions) {
      if (ix.accounts) {
        for (const acc of ix.accounts) {
          if (acc.isMut !== undefined && acc.writable === undefined) acc.writable = !!acc.isMut;
          if (acc.isSigner !== undefined && acc.signer === undefined) acc.signer = !!acc.isSigner;
        }
      }
      // ✅ Anchor 编码需要 discriminator。缺失时根据指令名补齐（snake_case）
      if (!Array.isArray(ix.discriminator) && ix.name) {
        const preimage = `global:${ix.name.replace(/([A-Z])/g, "_$1").toLowerCase()}`;
        const hash = sha256(utf8ToBytes(preimage));
        ix.discriminator = Array.from(hash.slice(0, 8));
      }
    }
  }
  return out;
}

export const useUnforgivenProgram = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const wallet = useWallet();

  const providerWallet = useMemo<AnchorWallet | null>(() => {
    // #region agent log
    fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:providerWallet_start',message:'providerWallet computation start',data:{hasAnchorWallet:!!anchorWallet,hasPublicKey:!!wallet.publicKey,hasSignTransaction:!!wallet.signTransaction,hasSignAllTransactions:!!wallet.signAllTransactions},timestamp:Date.now(),hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion
    if (anchorWallet) {
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:providerWallet_anchor',message:'Using anchorWallet',data:{publicKey:anchorWallet.publicKey?.toBase58()},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return {
        publicKey: anchorWallet.publicKey,
        signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> =>
          anchorWallet.signTransaction(tx as Transaction) as Promise<T>,
        signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> =>
          anchorWallet.signAllTransactions(txs as Transaction[]) as Promise<T[]>,
      };
    }
    if (!wallet.publicKey || !wallet.signTransaction) {
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:providerWallet_null',message:'providerWallet is null',data:{hasPublicKey:!!wallet.publicKey,hasSignTransaction:!!wallet.signTransaction},timestamp:Date.now(),hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion
      return null;
    }
    const signAllTransactions =
      wallet.signAllTransactions ??
      (async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> =>
        Promise.all(
          txs.map((tx) => wallet.signTransaction!(tx as Transaction | VersionedTransaction) as Promise<T>),
        ));
    // #region agent log
    fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:providerWallet_created',message:'providerWallet created from wallet',data:{publicKey:wallet.publicKey.toBase58()},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return {
      publicKey: wallet.publicKey,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> =>
        wallet.signTransaction!(tx as Transaction | VersionedTransaction) as Promise<T>,
      signAllTransactions,
    };
  }, [anchorWallet, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);

  const program = useMemo(() => {
    // #region agent log
    if (!providerWallet) {
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:program_null_wallet',message:'program is null because providerWallet is null',data:{providerWalletNull:true},timestamp:Date.now(),hypothesisId:'A,B'})}).catch(()=>{});
      return null;
    }
    // #endregion
    try {
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:program_start',message:'Starting program creation',data:{hasConnection:!!connection,connectionEndpoint:connection?.rpcEndpoint,programId:PROGRAM_ID.toBase58()},timestamp:Date.now(),hypothesisId:'C,D'})}).catch(()=>{});
      // #endregion
      const provider = new AnchorProvider(
        connection,
        providerWallet,
        AnchorProvider.defaultOptions()
      );
      setProvider(provider);
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:provider_created',message:'AnchorProvider created',data:{hasProvider:true},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});

      // #endregion

      // 2. 处理 IDL 格式 (Next.js 模块兼容)
      const rawIdl = (idlImport as any).default ? (idlImport as any).default : idlImport;
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:idl_load',message:'IDL loaded',data:{hasRawIdl:!!rawIdl,hasInstructions:!!rawIdl?.instructions,hasAccounts:!!rawIdl?.accounts,hasTypes:!!rawIdl?.types,instructionsCount:Array.isArray(rawIdl?.instructions)?rawIdl.instructions.length:0,accountsCount:Array.isArray(rawIdl?.accounts)?rawIdl.accounts.length:0},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      // 验证原始 IDL 中的 accounts 数组，确保每个账户都有 name 字段
      const rawAccounts = rawIdl?.accounts as Array<{ name?: string; [key: string]: unknown }> | undefined;
      if (rawAccounts) {
        for (let i = 0; i < rawAccounts.length; i++) {
          const acc = rawAccounts[i];
          if (!acc || !acc.name || typeof acc.name !== 'string') {
            // #region agent log
            fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:raw_account_missing_name',message:'Raw account missing name field',data:{index:i,account:JSON.stringify(acc)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            throw new Error(`Raw account definition at index ${i} missing 'name' field: ${JSON.stringify(acc)}`);
          }
        }
      }
      
      // 规范化 IDL：转换 publicKey -> pubkey，isMut/isSigner -> writable/signer
      const validIdl = normalizeIdlTypes(rawIdl as Record<string, unknown>);
      
      // 验证规范化后的 instructions 中的 args
      const normalizedInstructions = validIdl.instructions as Array<{ name?: string; args?: Array<{ name?: string; type?: unknown }> }> | undefined;
      if (normalizedInstructions) {
        for (const ix of normalizedInstructions) {
          if (ix.name === 'initialize') {
            // #region agent log
            fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:normalized_init_ix',message:'Normalized initialize instruction',data:{hasArgs:!!ix.args,argsCount:Array.isArray(ix.args)?ix.args.length:0,args:Array.isArray(ix.args)?ix.args.map((a:any)=>({name:a?.name,type:a?.type,typeString:typeof a?.type})):undefined},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
            // #endregion
          }
          if (ix.args && Array.isArray(ix.args)) {
            for (let i = 0; i < ix.args.length; i++) {
              const arg = ix.args[i];
              if (!arg || !arg.name || arg.type === undefined || arg.type === null) {
                // #region agent log
                fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:normalized_arg_missing',message:'Normalized instruction arg missing name or type',data:{ixName:ix.name,argIndex:i,arg:JSON.stringify(arg),argKeys:arg?Object.keys(arg):undefined},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                throw new Error(`Instruction ${ix.name} arg at index ${i} missing name or type after normalization: ${JSON.stringify(arg)}`);
              }
            }
          }
        }
      }
      
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:idl_normalized',message:'IDL normalized',data:{hasValidIdl:!!validIdl,hasTypes:!!validIdl?.types,hasAccounts:!!validIdl?.accounts,accountsCount:Array.isArray(validIdl?.accounts)?validIdl.accounts.length:0,instructionsCount:Array.isArray(normalizedInstructions)?normalizedInstructions.length:0},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      // 验证规范化后的 accounts 数组
      const accountsArray = validIdl.accounts as Array<{ name?: string; [key: string]: unknown }> | undefined;
      if (accountsArray) {
        for (let i = 0; i < accountsArray.length; i++) {
          const acc = accountsArray[i];
          if (!acc || !acc.name || typeof acc.name !== 'string') {
            // #region agent log
            fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:account_missing_name_after_normalize',message:'Account missing name field after normalization',data:{index:i,account:JSON.stringify(acc)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            throw new Error(`Account definition at index ${i} missing 'name' field after normalization: ${JSON.stringify(acc)}`);
          }
        }
      }

      // 3. 🚨 强制修补 IDL 地址 (Anchor 0.30 必须从 IDL.address 读取)
      // Anchor 需要 idl.types 字段，如果不存在则从 accounts 转换
      const typesArray = validIdl.types as Array<{ name?: string; [key: string]: unknown }> | undefined;
      const sourceTypes = typesArray || accountsArray;
      
      if (!sourceTypes || !Array.isArray(sourceTypes) || sourceTypes.length === 0) {
        // #region agent log
        fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:no_types_or_accounts',message:'No types or accounts found in IDL',data:{hasTypes:!!typesArray,hasAccounts:!!accountsArray,typesIsArray:Array.isArray(typesArray),accountsIsArray:Array.isArray(accountsArray)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        throw new Error('IDL must have either "types" or "accounts" field');
      }
      
      // 创建深拷贝，确保每个类型都有完整的结构
      const finalTypes = JSON.parse(JSON.stringify(sourceTypes)) as Array<{ name?: string; [key: string]: unknown }>;
      
      // 确保 finalTypes 中的每个元素都有 name 字段
      for (let i = 0; i < finalTypes.length; i++) {
        const type = finalTypes[i];
        if (!type || !type.name || typeof type.name !== 'string') {
          // #region agent log
          fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:final_type_missing_name',message:'Final type missing name field',data:{index:i,type:JSON.stringify(type)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          throw new Error(`Type definition at index ${i} missing 'name' field: ${JSON.stringify(type)}`);
        }
      }
      
      // 创建新的 IDL 对象，明确设置 types 字段（覆盖任何现有的 types）
      // 先创建基础对象，然后明确设置 types 和 address
      const idlWithAddress: Record<string, unknown> = {
        ...validIdl,
      };
      
      // 明确设置 address 和 types（覆盖任何现有值）
      idlWithAddress.address = PROGRAM_ID.toBase58();
      idlWithAddress.types = finalTypes; // Anchor 0.30+ 需要 types 字段
      
      // 删除 accounts 字段，避免 Anchor 解析冲突（Anchor 使用 types 字段）
      if (idlWithAddress.accounts) {
        delete idlWithAddress.accounts;
      }
      
      // 验证 idlWithAddress.types 确实存在且是数组
      if (!idlWithAddress.types || !Array.isArray(idlWithAddress.types) || idlWithAddress.types.length === 0) {
        // #region agent log
        fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:types_not_set',message:'Types not properly set in idlWithAddress',data:{hasTypes:!!idlWithAddress.types,isArray:Array.isArray(idlWithAddress.types),length:idlWithAddress.types?Array.isArray(idlWithAddress.types)?idlWithAddress.types.length:'not array':undefined},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        throw new Error('Failed to set types field in IDL');
      }
      
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:idl_address_patched',message:'IDL address patched',data:{address:idlWithAddress.address,hasTypes:!!idlWithAddress.types,typesIsArray:Array.isArray(idlWithAddress.types),typesCount:Array.isArray(idlWithAddress.types)?idlWithAddress.types.length:0,hasAccounts:!!idlWithAddress.accounts,accountsCount:Array.isArray(accountsArray)?accountsArray.length:0,typeNames:Array.isArray(finalTypes)?finalTypes.map((t:any)=>t?.name).filter(Boolean):[]},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      // 4. 实例化 (Strict 2-argument signature for Anchor 0.30)
      // 最终验证 types 字段存在且每个类型都有 name 字段
      if (!idlWithAddress.types || !Array.isArray(idlWithAddress.types)) {
        // #region agent log
        fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:types_missing_before_program',message:'Types missing before Program creation',data:{hasTypes:!!idlWithAddress.types,isArray:Array.isArray(idlWithAddress.types),idlKeys:Object.keys(idlWithAddress)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        throw new Error('IDL types field is missing or invalid before Program creation');
      }
      
      // 验证每个 type 都有 name 字段
      const finalTypesArray = idlWithAddress.types as Array<{ name?: string; [key: string]: unknown }>;
      for (let i = 0; i < finalTypesArray.length; i++) {
        const type = finalTypesArray[i];
        if (!type || !type.name || typeof type.name !== 'string') {
          // #region agent log
          fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:type_missing_name_final',message:'Type missing name field in final IDL',data:{index:i,type:JSON.stringify(type),typeKeys:type?Object.keys(type):undefined},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          throw new Error(`Type at index ${i} missing 'name' field in final IDL: ${JSON.stringify(type)}`);
        }
      }
      
      // Verify instructions structure
      const instructions = idlWithAddress.instructions as Array<{ name?: string; args?: Array<{ name?: string; type?: unknown }> }> | undefined;
      if (instructions) {
        const initIx = instructions.find(ix => ix.name === 'initialize');
        if (initIx) {
          // #region agent log
          fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:init_ix_check',message:'Checking initialize instruction args',data:{hasArgs:!!initIx.args,argsCount:Array.isArray(initIx.args)?initIx.args.length:0,args:Array.isArray(initIx.args)?initIx.args.map((a:any)=>({name:a?.name,type:a?.type,typeString:typeof a?.type,typeIsString:typeof a?.type==='string',typeIsObject:typeof a?.type==='object',typeIsNull:a?.type===null,typeIsUndefined:a?.type===undefined})):undefined},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          if (!initIx.args || !Array.isArray(initIx.args) || initIx.args.length === 0) {
            throw new Error('Initialize instruction missing args in IDL');
          }
          for (let i = 0; i < initIx.args.length; i++) {
            const arg = initIx.args[i];
            // #region agent log
            fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:init_arg_detail',message:'Detailed arg check',data:{index:i,argName:arg?.name,argType:arg?.type,argTypeString:typeof arg?.type,argTypeIsString:typeof arg?.type==='string',argTypeValue:typeof arg?.type==='string'?arg.type:JSON.stringify(arg?.type),argKeys:arg?Object.keys(arg):undefined,fullArg:JSON.stringify(arg)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            if (!arg || !arg.name || !arg.type) {
              // #region agent log
              fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:init_arg_missing',message:'Initialize arg missing name or type',data:{index:i,arg:JSON.stringify(arg)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              throw new Error(`Initialize instruction arg at index ${i} missing name or type: ${JSON.stringify(arg)}`);
            }
            // Ensure type is a string (Anchor expects string types)
            if (typeof arg.type !== 'string') {
              // #region agent log
              fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:init_arg_type_not_string',message:'Arg type is not a string, fixing',data:{index:i,argName:arg.name,originalType:JSON.stringify(arg.type),originalTypeString:typeof arg.type},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              // If type is an object, try to extract the actual type
              if (typeof arg.type === 'object' && arg.type !== null) {
                const typeObj = arg.type as Record<string, unknown>;
                // Try common Anchor type structures
                if (typeObj.array) {
                  arg.type = `[${typeObj.array[0]},${typeObj.array[1]}]`;
                } else if (typeObj.option) {
                  arg.type = `Option<${typeObj.option}>`;
                } else if (typeObj.vec) {
                  arg.type = `Vec<${typeObj.vec}>`;
                } else {
                  // Fallback: stringify the type object
                  arg.type = JSON.stringify(arg.type);
                }
              } else {
                // Convert to string
                arg.type = String(arg.type);
              }
            }
          }
        }
      }
      
      // #region agent log
      // Log the complete IDL structure before creating Program
      const initIxBeforeProgram = instructions?.find(ix => ix.name === 'initialize');
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:before_program_creation',message:'About to create Program',data:{hasTypes:!!idlWithAddress.types,typesCount:finalTypesArray.length,typeNames:finalTypesArray.map(t=>t.name),hasAddress:!!idlWithAddress.address,hasInstructions:!!idlWithAddress.instructions,instructionsCount:Array.isArray(instructions)?instructions.length:0,firstTypeStructure:JSON.stringify(finalTypesArray[0]).slice(0,200),initIxArgs:initIxBeforeProgram?.args?.map((a:any)=>({name:a?.name,type:a?.type,typeString:typeof a?.type,typeValue:typeof a?.type==='string'?a.type:JSON.stringify(a.type)}))},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Ensure IDL structure is correct before creating Program
      // Double-check that instructions array exists and initialize instruction has args
      if (!idlWithAddress.instructions || !Array.isArray(idlWithAddress.instructions)) {
        throw new Error('IDL instructions array is missing or invalid');
      }
      const finalInitIx = (idlWithAddress.instructions as Array<any>).find((ix: any) => ix.name === 'initialize');
      if (!finalInitIx || !finalInitIx.args || !Array.isArray(finalInitIx.args) || finalInitIx.args.length === 0) {
        throw new Error('Initialize instruction missing or has no args in final IDL');
      }
      // Verify each arg has name and type as strings
      for (let i = 0; i < finalInitIx.args.length; i++) {
        const arg = finalInitIx.args[i];
        if (!arg || typeof arg.name !== 'string' || typeof arg.type !== 'string') {
          // #region agent log
          fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:final_arg_invalid',message:'Final IDL arg is invalid',data:{index:i,arg:JSON.stringify(arg),argName:arg?.name,argNameType:typeof arg?.name,argType:arg?.type,argTypeType:typeof arg?.type},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          throw new Error(`Final IDL initialize arg at index ${i} is invalid: ${JSON.stringify(arg)}`);
        }
      }
      
      const p = new Program(idlWithAddress as Idl, provider);
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:program_created',message:'Program created successfully',data:{hasProgram:true,programId:p.programId.toBase58()},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return p;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUnforgivenProgram.ts:program_error',message:'Program creation failed',data:{error:msg,errorStack:errorStack?.slice(0,500),errorName:error instanceof Error?error.name:undefined},timestamp:Date.now(),hypothesisId:'C,D,E'})}).catch(()=>{});
      // #endregion
      console.error("❌ Program Init Failed:", error);
      return null;
    }
  }, [connection, providerWallet]);

  return { program, programId: PROGRAM_ID };
};
