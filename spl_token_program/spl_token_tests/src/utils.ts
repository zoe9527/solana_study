import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  sendAndConfirmTransaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  TokenInstruction,
  InitializeMintData,
  MintToData,
  TransferData,
  BurnData,
  SetMintAuthorityData,
  Mint,
  TokenAccount,
  InstructionData,
  serializeInstructionData
} from './types';

/**
 * 等待确认的工具函数
 */
export async function waitForConfirmation(connection: Connection, signature: string): Promise<void> {
  console.log(`等待交易确认: ${signature}`);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  
  await connection.confirmTransaction({
    blockhash,
    lastValidBlockHeight,
    signature,
  }, 'confirmed');
  
  console.log('交易已确认');
}

/**
 * 获取账户余额
 */
export async function getBalance(connection: Connection, publicKey: PublicKey): Promise<number> {
  const balance = await connection.getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}

/**
 * 请求空投（用于测试）
 */
export async function requestAirdrop(connection: Connection, publicKey: PublicKey, amount = 1): Promise<string> {
  console.log(`请求空投 ${amount} SOL 到 ${publicKey.toString()}...`);
  const signature = await connection.requestAirdrop(publicKey, amount * LAMPORTS_PER_SOL);
  await waitForConfirmation(connection, signature);
  console.log(`空投成功: ${signature}`);
  return signature;
}

/**
 * 创建初始化铸币账户指令
 */
export function createInitializeMintInstruction(
  mint: PublicKey,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  programId: PublicKey
): TransactionInstruction {
  const data = new InitializeMintData({
    decimals,
    mint_authority: mintAuthority.toBuffer(),
    freeze_authority: freezeAuthority ? freezeAuthority.toBuffer() : null,
  });
  
  const keys = [
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
  ];
  
  return new TransactionInstruction({
    keys,
    programId,
    data: serializeInstructionData(data),
  });
}

/**
 * 创建初始化代币账户指令
 */
export function createInitializeAccountInstruction(
  tokenAccount: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  programId: PublicKey
): TransactionInstruction {
  const data: InstructionData = { instruction: TokenInstruction.InitializeAccount };
  
  const keys = [
    { pubkey: tokenAccount, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
  ];
  
  return new TransactionInstruction({
    keys,
    programId,
    data: serializeInstructionData(data),
  });
}

/**
 * 创建铸造代币指令
 */
export function createMintToInstruction(
  mint: PublicKey,
  tokenAccount: PublicKey,
  mintAuthority: PublicKey,
  amount: bigint,
  programId: PublicKey
): TransactionInstruction {
  const data = new MintToData({ amount });
  
  const keys = [
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: tokenAccount, isSigner: false, isWritable: true },
    { pubkey: mintAuthority, isSigner: true, isWritable: false },
  ];
  
  return new TransactionInstruction({
    keys,
    programId,
    data: serializeInstructionData(data),
  });
}

/**
 * 创建转移代币指令
 */
export function createTransferInstruction(
  sourceTokenAccount: PublicKey,
  destinationTokenAccount: PublicKey,
  owner: PublicKey,
  amount: bigint,
  programId: PublicKey
): TransactionInstruction {
  const data = new TransferData({ amount });
  
  const keys = [
    { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
    { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: true, isWritable: false },
  ];
  
  return new TransactionInstruction({
    keys,
    programId,
    data: serializeInstructionData(data),
  });
}

/**
 * 创建销毁代币指令
 */
export function createBurnInstruction(
  tokenAccount: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint,
  programId: PublicKey
): TransactionInstruction {
  const data = new BurnData({ amount });
  
  const keys = [
    { pubkey: tokenAccount, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: true, isWritable: false },
  ];
  
  return new TransactionInstruction({
    keys,
    programId,
    data: serializeInstructionData(data),
  });
}

/**
 * 创建设置铸币权限指令
 */
export function createSetMintAuthorityInstruction(
  mint: PublicKey,
  currentMintAuthority: PublicKey,
  newMintAuthority: PublicKey | null,
  programId: PublicKey
): TransactionInstruction {
  // 添加运行时类型检查
  if (newMintAuthority !== null && !(newMintAuthority instanceof PublicKey)) {
    throw new Error('newMintAuthority must be a PublicKey or null');
  }
  
  const data = new SetMintAuthorityData({
    new_authority: newMintAuthority ? newMintAuthority.toBuffer() : null,
  });
  
  const keys = [
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: currentMintAuthority, isSigner: true, isWritable: false },
  ];
  
  return new TransactionInstruction({
    keys,
    programId,
    data: serializeInstructionData(data),
  });
}

/**
 * 读取并解析铸币账户数据
 */
export async function getMintData(
  connection: Connection,
  mint: PublicKey
): Promise<Mint> {
  const accountInfo = await connection.getAccountInfo(mint);
  if (!accountInfo) {
    throw new Error(`铸币账户不存在: ${mint.toString()}`);
  }
  
  return Mint.deserialize(accountInfo.data);
}

/**
 * 读取并解析代币账户数据
 */
export async function getTokenAccountData(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<TokenAccount> {
  const accountInfo = await connection.getAccountInfo(tokenAccount);
  if (!accountInfo) {
    throw new Error(`代币账户不存在: ${tokenAccount.toString()}`);
  }
  
  return TokenAccount.deserialize(accountInfo.data);
}