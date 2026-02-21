'use client';

import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { BN, Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';

// Hardcoded Oracle Public Key (generated in Day 1)
const ORACLE_PUBKEY = new PublicKey("CTq7nqgwroe42paFBgpGdmsmZjLCXxLkmxacXvW9njMZ");

type InitializeButtonProps = {
  program: Program | null;
  programId: PublicKey;
};

export default function InitializeButton({ program, programId }: InitializeButtonProps) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    console.log('🛠️ Admin Init clicked');
    // #region agent log
    fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:initialize_click',message:'Init clicked',data:{hasPublicKey:!!publicKey,publicKey:publicKey?.toBase58(),hasProgram:!!program,programId:programId.toBase58()},timestamp:Date.now(),hypothesisId:'A,B,C'})}).catch(()=>{});
    // #endregion
    if (!publicKey) {
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:no_publickey',message:'No publicKey',data:{publicKeyNull:true},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return alert('钱包已断开，请重新连接或刷新页面后再试。');
    }
    if (!program) {
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:no_program',message:'Program is null - showing alert',data:{programNull:true,hasPublicKey:!!publicKey},timestamp:Date.now(),hypothesisId:'B,C'})}).catch(()=>{});
      // #endregion
      return alert('合约连接中，请稍等 2 秒后再试。');
    }

    setLoading(true);
    setError(null);

    try {
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:initialize_start',message:'Starting initialization',data:{programId:programId.toBase58(),publicKey:publicKey.toBase58()},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from('global')],
        programId
      );
      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault')],
        programId
      );
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:pdas_derived',message:'PDAs derived',data:{globalState:globalState.toBase58(),vault:vault.toBase58()},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // Guard: if GlobalState PDA already exists, stop and inform user
      const existing = await connection.getAccountInfo(globalState);
      if (existing) {
        alert('已初始化过，无需重复初始化。如果要重置，请在本地重启 validator（会清空本地链）。');
        return;
      }

      const targetRateBps = new BN(1000);
      const startTime = new BN(Math.floor(Date.now() / 1000));
      const basePrice = new BN(1000000000);
      
      // Use hardcoded Oracle Public Key instead of wallet publicKey
      const oracle = ORACLE_PUBKEY;
      
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:params_ready',message:'Parameters ready',data:{targetRateBps:targetRateBps.toString(),startTime:startTime.toString(),basePrice:basePrice.toString(),oracle:oracle.toBase58()},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // Prepare accounts object
      const accounts = {
        authority: publicKey,
        globalState,
        vault,
        oracle,
        systemProgram: SystemProgram.programId,
      };
      
      // Safety log before RPC call
      console.log("🛠️ Init Accounts:", { 
        oracle: oracle.toString(), 
        authority: publicKey.toString(),
        globalState: globalState.toString(),
        vault: vault.toString(),
        systemProgram: SystemProgram.programId.toString()
      });
      
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:rpc_call_start',message:'Calling program.methods.initialize.rpc()',data:{hasProgramMethods:!!program.methods,hasInitialize:!!program.methods?.initialize,accounts:Object.keys(accounts).reduce((acc,k)=>({...acc,[k]:accounts[k as keyof typeof accounts]?.toString?.()||'undefined'}),{}),targetRateBps:targetRateBps?.toString(),startTime:startTime?.toString(),basePrice:basePrice?.toString(),targetRateBpsType:typeof targetRateBps,startTimeType:typeof startTime,basePriceType:typeof basePrice},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Verify arguments before calling - ensure they are BN instances
      if (!targetRateBps || !(targetRateBps instanceof BN)) {
        throw new Error(`Invalid targetRateBps: expected BN, got ${typeof targetRateBps}`);
      }
      if (!startTime || !(startTime instanceof BN)) {
        throw new Error(`Invalid startTime: expected BN, got ${typeof startTime}`);
      }
      if (!basePrice || !(basePrice instanceof BN)) {
        throw new Error(`Invalid basePrice: expected BN, got ${typeof basePrice}`);
      }
      
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:before_rpc',message:'Before RPC call',data:{targetRateBps:targetRateBps.toString(),startTime:startTime.toString(),basePrice:basePrice.toString(),targetRateBpsIsBN:targetRateBps instanceof BN,startTimeIsBN:startTime instanceof BN,basePriceIsBN:basePrice instanceof BN,hasProgramMethods:!!program.methods,hasInitialize:!!program.methods?.initialize},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // #region agent log
      const argsArray = [targetRateBps, startTime, basePrice];
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:args_before_call',message:'Arguments array before calling initialize',data:{argsLength:argsArray.length,arg0:argsArray[0]?.toString(),arg1:argsArray[1]?.toString(),arg2:argsArray[2]?.toString(),arg0Type:typeof argsArray[0],arg1Type:typeof argsArray[1],arg2Type:typeof argsArray[2],arg0IsBN:argsArray[0] instanceof BN,arg1IsBN:argsArray[1] instanceof BN,arg2IsBN:argsArray[2] instanceof BN,arg0Undefined:argsArray[0]===undefined,arg1Undefined:argsArray[1]===undefined,arg2Undefined:argsArray[2]===undefined},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Log the program's IDL structure to check if it matches
      // #region agent log
      const programIdl = (program as any).idl;
      const initIx = programIdl?.instructions?.find((ix: any) => ix.name === 'initialize');
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:program_idl_check',message:'Checking program IDL structure',data:{hasIdl:!!programIdl,hasInstructions:!!programIdl?.instructions,initIxName:initIx?.name,initIxArgsCount:initIx?.args?.length,initIxArgs:initIx?.args?.map((a:any)=>({name:a?.name,type:a?.type}))},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Try to manually encode the instruction to debug the issue
      // #region agent log
      const coder = (program as any).coder;
      const instructionCoder = coder?.instruction;
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:coder_check',message:'Checking coder',data:{hasCoder:!!coder,hasInstructionCoder:!!instructionCoder,hasEncode:!!instructionCoder?.encode},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Check the instruction coder's internal structure
      // #region agent log
      const instructionCoderInternal = instructionCoder as any;
      const initIxDef = instructionCoderInternal?.idl?.instructions?.find((ix: any) => ix.name === 'initialize');
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:coder_internal_check',message:'Checking coder internal structure',data:{hasIdl:!!instructionCoderInternal?.idl,hasInstructions:!!instructionCoderInternal?.idl?.instructions,initIxName:initIxDef?.name,initIxArgsCount:initIxDef?.args?.length,initIxArgs:initIxDef?.args?.map((a:any)=>({name:a?.name,type:a?.type})),initIxDiscriminator:initIxDef?.discriminator},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Use the standard methods API
      // Try to intercept the encoding process to see what's happening
      const originalMethodsCall = program.methods.initialize(targetRateBps, startTime, basePrice);
      
      // #region agent log
      // Check the internal structure of the methods call
      const methodsCallInternal = originalMethodsCall as any;
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:methods_call_internal',message:'Checking methods call internal structure',data:{hasArgs:!!methodsCallInternal._args,argsLength:Array.isArray(methodsCallInternal._args)?methodsCallInternal._args.length:undefined,args:Array.isArray(methodsCallInternal._args)?methodsCallInternal._args.map((a:any,i:number)=>({index:i,value:a?.toString(),type:typeof a,isBN:a instanceof BN,isUndefined:a===undefined})):undefined,hasAccounts:!!methodsCallInternal._accounts,hasIdl:!!methodsCallInternal._idl},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      const methodsCall = originalMethodsCall;
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:methods_call_created',message:'Methods call created',data:{hasMethodsCall:!!methodsCall,hasAccounts:!!methodsCall.accounts,hasRpc:!!methodsCall.rpc},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      const accountsCall = methodsCall.accounts(accounts);
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:accounts_call_created',message:'Accounts call created',data:{hasAccountsCall:!!accountsCall,hasRpc:!!accountsCall.rpc},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      await accountsCall.rpc();
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:rpc_success',message:'RPC call succeeded',data:{success:true},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      alert('✅ 协议初始化成功！(Protocol Initialized)');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const errorStack = e instanceof Error ? e.stack : undefined;
      // #region agent log
      fetch('http://localhost:7242/ingest/4cb53e36-f6fc-451a-be89-d4a98da81fe9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitializeButton.tsx:initialize_error',message:'Initialization error',data:{error:message,errorStack:errorStack?.slice(0,500),errorName:e instanceof Error?e.name:undefined},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setError(message);
      const isNoBalance = /debit|no record of a prior credit|insufficient funds/i.test(message);
      if (isNoBalance) {
        alert('初始化失败: 钱包余额不足。请先在当前网络领取 SOL 空投（本地: solana airdrop 2 --url localhost；devnet: solana airdrop 2 --url devnet），再重试。');
      } else {
        alert('初始化失败: ' + message);
      }
    } finally {
      setLoading(false);
    }
  }, [connection, program, programId, publicKey]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={initialize}
        disabled={loading}
        className="rounded-lg bg-red-600 hover:bg-red-500 text-white px-6 py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? 'Initializing...' : 'Initialize Protocol'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
