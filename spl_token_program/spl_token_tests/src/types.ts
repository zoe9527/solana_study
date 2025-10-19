import { PublicKey, TransactionInstruction } from '@solana/web3.js';

/**
 * 与 Rust 程序对应的指令枚举
 * 注意：必须与后端 Rust 代码中的 TokenInstruction 完全匹配
 */
export enum TokenInstruction {
  InitializeMint = 0,
  InitializeAccount = 1,
  MintTo = 2,
  Transfer = 3,
  Burn = 4,
  SetMintAuthority = 5,
}

/**
 * 初始化铸币账户指令数据结构
 */
export class InitializeMintData {
  instruction: TokenInstruction = TokenInstruction.InitializeMint;
  decimals: number;
  mint_authority: Uint8Array;
  freeze_authority: Uint8Array | null;

  constructor(fields: {
    decimals: number;
    mint_authority: Uint8Array;
    freeze_authority: Uint8Array | null;
  }) {
    this.decimals = fields.decimals;
    this.mint_authority = fields.mint_authority;
    this.freeze_authority = fields.freeze_authority;
  }
}

/**
 * 铸造代币指令数据结构
 */
export class MintToData {
  instruction: TokenInstruction = TokenInstruction.MintTo;
  amount: bigint;

  constructor(fields: { amount: bigint }) {
    this.amount = fields.amount;
  }
}

/**
 * 转移代币指令数据结构
 */
export class TransferData {
  instruction: TokenInstruction = TokenInstruction.Transfer;
  amount: bigint;

  constructor(fields: { amount: bigint }) {
    this.amount = fields.amount;
  }
}

/**
 * 销毁代币指令数据结构
 */
export class BurnData {
  instruction: TokenInstruction = TokenInstruction.Burn;
  amount: bigint;

  constructor(fields: { amount: bigint }) {
    this.amount = fields.amount;
  }
}

/**
 * 设置铸币权限指令数据结构
 */
export class SetMintAuthorityData {
  instruction: TokenInstruction = TokenInstruction.SetMintAuthority;
  new_authority: Uint8Array | null;

  constructor(fields: { new_authority: Uint8Array | null }) {
    this.new_authority = fields.new_authority;
  }
}

/**
 * 指令数据联合类型
 */
export type InstructionData = 
  | InitializeMintData 
  | MintToData 
  | TransferData 
  | BurnData 
  | SetMintAuthorityData 
  | { instruction: TokenInstruction.InitializeAccount };

/**
 * 铸币账户数据结构（用于反序列化）
 */
export class Mint {
  is_initialized: boolean;
  decimals: number;
  mint_authority: Uint8Array | null;
  supply: bigint;
  freeze_authority: Uint8Array | null;

  constructor(fields: {
    is_initialized: boolean;
    decimals: number;
    mint_authority: Uint8Array | null;
    supply: bigint;
    freeze_authority: Uint8Array | null;
  }) {
    this.is_initialized = fields.is_initialized;
    this.decimals = fields.decimals;
    this.mint_authority = fields.mint_authority;
    this.supply = fields.supply;
    this.freeze_authority = fields.freeze_authority;
  }

  /**
   * 从字节数据反序列化 Mint 账户
   */
  static deserialize(data: Buffer): Mint {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;
    
    const is_initialized = Boolean(view.getUint8(offset)); offset += 1;
    const decimals = view.getUint8(offset); offset += 1;
    
    // 反序列化 mint_authority (33 bytes)
    const mintAuthorityOption = view.getUint8(offset); offset += 1;
    let mint_authority: Uint8Array | null = null;
    if (mintAuthorityOption !== 0) {
      mint_authority = new Uint8Array(data.subarray(offset, offset + 32));
      offset += 32;
    } else {
      offset += 32; // 跳过空数据
    }
    
    const supply = view.getBigUint64(offset, true); offset += 8;
    
    // 反序列化 freeze_authority (33 bytes)
    const freezeAuthorityOption = view.getUint8(offset); offset += 1;
    let freeze_authority: Uint8Array | null = null;
    if (freezeAuthorityOption !== 0) {
      freeze_authority = new Uint8Array(data.subarray(offset, offset + 32));
      offset += 32;
    } else {
      offset += 32; // 跳过空数据
    }
    
    return new Mint({
      is_initialized,
      decimals,
      mint_authority,
      supply,
      freeze_authority,
    });
  }
}

/**
 * 代币账户数据结构（用于反序列化）
 */
export class TokenAccount {
  is_initialized: boolean;
  mint: Uint8Array;
  owner: Uint8Array;
  amount: bigint;
  is_frozen: boolean;

  constructor(fields: {
    is_initialized: boolean;
    mint: Uint8Array;
    owner: Uint8Array;
    amount: bigint;
    is_frozen: boolean;
  }) {
    this.is_initialized = fields.is_initialized;
    this.mint = fields.mint;
    this.owner = fields.owner;
    this.amount = fields.amount;
    this.is_frozen = fields.is_frozen;
  }

  /**
   * 从字节数据反序列化 TokenAccount
   */
  static deserialize(data: Buffer): TokenAccount {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;
    
    const is_initialized = Boolean(view.getUint8(offset)); offset += 1;
    
    // mint (32 bytes)
    const mint = new Uint8Array(data.subarray(offset, offset + 32));
    offset += 32;
    
    // owner (32 bytes)
    const owner = new Uint8Array(data.subarray(offset, offset + 32));
    offset += 32;
    
    const amount = view.getBigUint64(offset, true); offset += 8;
    const is_frozen = Boolean(view.getUint8(offset));
    
    return new TokenAccount({
      is_initialized,
      mint,
      owner,
      amount,
      is_frozen,
    });
  }
}

/**
 * 测试结果类型
 */
export interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  details?: any;
}

/**
 * 程序账户结构
 */
export interface ProgramAccounts {
  mint: PublicKey;
  tokenAccount: PublicKey;
  receiverTokenAccount: PublicKey;
  newMintAuthority: PublicKey;
}

/**
 * 序列化指令数据的通用函数
 */
export function serializeInstructionData(data: InstructionData): Buffer {
  switch (data.instruction) {
    case TokenInstruction.InitializeMint:
      return serializeInitializeMintData(data as InitializeMintData);
    case TokenInstruction.InitializeAccount:
      return Buffer.from([data.instruction]);
    case TokenInstruction.MintTo:
      return serializeMintToData(data as MintToData);
    case TokenInstruction.Transfer:
      return serializeTransferData(data as TransferData);
    case TokenInstruction.Burn:
      return serializeBurnData(data as BurnData);
    case TokenInstruction.SetMintAuthority:
      return serializeSetMintAuthorityData(data as SetMintAuthorityData);
    default:
      throw new Error(`未知指令类型: ${(data as any).instruction}`);
  }
}

/**
 * 序列化初始化铸币指令数据 - 正确的 Option 处理
 */
function serializeInitializeMintData(data: InitializeMintData): Buffer {
  console.log('🔧 序列化 InitializeMint - 正确的 Option 处理');
  
  // 首先计算动态长度
  let totalLength = 1 + 1 + 32; // instruction + decimals + mint_authority
  
  if (data.freeze_authority && data.freeze_authority.length === 32) {
    totalLength += 1 + 32; // Some: option tag (1) + Pubkey (32)
  } else {
    totalLength += 1; // None: 只有 option tag (1)，没有填充！
  }
  
  console.log('计算的总长度:', totalLength, '字节');
  
  const buffer = Buffer.alloc(totalLength);
  let offset = 0;
  
  // 1. 枚举判别式 (u8)
  buffer.writeUInt8(data.instruction, offset); offset += 1;
  console.log(`  [${offset-1}] 枚举判别式:`, data.instruction);
  
  // 2. 精度 (u8)
  buffer.writeUInt8(data.decimals, offset); offset += 1;
  console.log(`  [${offset-1}] decimals:`, data.decimals);
  
  // 3. mint_authority: Pubkey (32 bytes) - 直接写入，不是 Option！
  if (data.mint_authority && data.mint_authority.length === 32) {
    buffer.set(data.mint_authority, offset); offset += 32;
    const mintAuthPubkey = new PublicKey(data.mint_authority);
    console.log(`  [${offset-32}-${offset-1}] mint_authority:`, mintAuthPubkey.toString());
    console.log(`    mint_authority 十六进制:`, Buffer.from(data.mint_authority).toString('hex'));
  } else {
    throw new Error('mint_authority 必须是 32 字节的 Buffer');
  }
  
  // 4. freeze_authority: Option<Pubkey> - 正确的 Borsh 处理
  if (data.freeze_authority && data.freeze_authority.length === 32) {
    // Some 情况: 写入 1 (tag) + 32 bytes (Pubkey)
    buffer.writeUInt8(1, offset); offset += 1;
    console.log(`  [${offset-1}] freeze_authority option: 1 (Some)`);
    
    buffer.set(data.freeze_authority, offset); offset += 32;
    const freezeAuthPubkey = new PublicKey(data.freeze_authority);
    console.log(`  [${offset-32}-${offset-1}] freeze_authority:`, freezeAuthPubkey.toString());
    console.log(`    freeze_authority 十六进制:`, Buffer.from(data.freeze_authority).toString('hex'));
  } else {
    // None 情况: 只写入 0 (tag)，没有后续数据！
    buffer.writeUInt8(0, offset); offset += 1;
    console.log(`  [${offset-1}] freeze_authority option: 0 (None)`);
    console.log(`    ✅ 注意: None 情况只写入 1 个字节，没有 32 字节填充！`);
  }
  
  // 验证长度
  if (offset !== totalLength) {
    throw new Error(`序列化长度错误: 期望 ${totalLength} 字节，实际 ${offset} 字节`);
  }
  
  console.log('✅ 序列化完成:');
  console.log('  总长度:', buffer.length, '字节');
  console.log('  十六进制:', buffer.toString('hex'));
  console.log('  字节数组:', Array.from(buffer));
  
  return buffer;
}

/**
 * 序列化铸造指令数据 - 修复版本
 */
function serializeMintToData(data: MintToData): Buffer {
  const buffer = Buffer.alloc(1 + 8); // instruction + amount
  let offset = 0;
  
  buffer.writeUInt8(data.instruction, offset); offset += 1;
  
  // 写入 8 字节的 amount (小端序)
  const amountBytes = new BigUint64Array([data.amount]);
  const amountBuffer = Buffer.from(amountBytes.buffer);
  buffer.set(amountBuffer, offset);
  
  console.log(`🔧 序列化 MintTo 数据:`, {
    instruction: data.instruction,
    amount: data.amount.toString(),
    buffer: buffer.toString('hex')
  });
  
  return buffer;
}

/**
 * 序列化转账指令数据
 */
function serializeTransferData(data: TransferData): Buffer {
  // 与 MintTo 相同结构：1字节指令 + 8字节amount
  const buffer = Buffer.alloc(1 + 8);
  let offset = 0;
  
  buffer.writeUInt8(data.instruction, offset); offset += 1;
  
  // 写入 8 字节的 amount (小端序)
  const amountBytes = new BigUint64Array([data.amount]);
  const amountBuffer = Buffer.from(amountBytes.buffer);
  buffer.set(amountBuffer, offset);
  
  console.log(`🔧 序列化 Transfer 数据:`, {
    instruction: data.instruction,
    amount: data.amount.toString(),
    buffer: buffer.toString('hex')
  });
  
  return buffer;
}

/**
 * 序列化销毁指令数据
 */
function serializeBurnData(data: BurnData): Buffer {
  // 与 MintTo 相同结构：1字节指令 + 8字节amount
  const buffer = Buffer.alloc(1 + 8);
  let offset = 0;
  
  buffer.writeUInt8(data.instruction, offset); offset += 1;
  
  // 写入 8 字节的 amount (小端序)
  const amountBytes = new BigUint64Array([data.amount]);
  const amountBuffer = Buffer.from(amountBytes.buffer);
  buffer.set(amountBuffer, offset);
  
  console.log(`🔧 序列化 Burn 数据:`, {
    instruction: data.instruction,
    amount: data.amount.toString(),
    buffer: buffer.toString('hex')
  });
  
  return buffer;
}

/**
 * 序列化设置铸币权限指令数据 - 修复版本
 */
function serializeSetMintAuthorityData(data: SetMintAuthorityData): Buffer {
  const buffer = Buffer.alloc(1 + 33); // instruction + new_authority
  let offset = 0;
  
  buffer.writeUInt8(data.instruction, offset); offset += 1;
  
  // new_authority
  if (data.new_authority && data.new_authority.length === 32) {
    buffer.writeUInt8(1, offset); offset += 1; // Some variant
    buffer.set(data.new_authority, offset);
  } else {
    buffer.writeUInt8(0, offset); offset += 1; // None variant
    // 剩余部分已经是0
  }
  
  console.log(`🔧 序列化 SetMintAuthority 数据:`, {
    instruction: data.instruction,
    new_authority: data.new_authority ? Buffer.from(data.new_authority).toString('hex') : 'null',
    buffer: buffer.toString('hex')
  });
  
  return buffer;
}

/**
 * 验证指令数据格式
 */
export function validateInstructionFormat(): void {
  console.log('🔍 验证指令数据格式匹配:');
  
  // 测试 InitializeMint 数据格式
  const testMintData = new InitializeMintData({
    decimals: 9,
    mint_authority: Buffer.alloc(32, 1), // 32字节的测试数据
    freeze_authority: null,
  });
  
  const serialized = serializeInitializeMintData(testMintData);
  console.log('   InitializeMint 数据长度:', serialized.length);
  console.log('   期望长度: 68 bytes (1 + 1 + 33 + 33)');
  console.log('   实际长度:', serialized.length, serialized.length === 68 ? '✅' : '❌');
  
  // 测试 MintTo 数据格式
  const testMintToData = new MintToData({
    amount: BigInt(1000),
  });
  
  const serializedMintTo = serializeMintToData(testMintToData);
  console.log('   MintTo 数据长度:', serializedMintTo.length);
  console.log('   期望长度: 9 bytes (1 + 8)');
  console.log('   实际长度:', serializedMintTo.length, serializedMintTo.length === 9 ? '✅' : '❌');
  
  // 测试 Transfer 数据格式
  const testTransferData = new TransferData({
    amount: BigInt(500),
  });
  
  const serializedTransfer = serializeTransferData(testTransferData);
  console.log('   Transfer 数据长度:', serializedTransfer.length);
  console.log('   期望长度: 9 bytes (1 + 8)');
  console.log('   实际长度:', serializedTransfer.length, serializedTransfer.length === 9 ? '✅' : '❌');
  
  // 测试 Burn 数据格式
  const testBurnData = new BurnData({
    amount: BigInt(100),
  });
  
  const serializedBurn = serializeBurnData(testBurnData);
  console.log('   Burn 数据长度:', serializedBurn.length);
  console.log('   期望长度: 9 bytes (1 + 8)');
  console.log('   实际长度:', serializedBurn.length, serializedBurn.length === 9 ? '✅' : '❌');
}