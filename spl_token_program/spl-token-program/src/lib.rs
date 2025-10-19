//! 原生 SPL 代币程序（不使用 Anchor 框架）

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{rent::Rent, Sysvar},
    msg,
    program::invoke,
    system_instruction,
};
use std::collections::BTreeMap;

// 错误类型定义
#[derive(Debug, Clone)]
pub enum TokenError {
    InvalidInstruction,
    NotRentExempt,
    InsufficientFunds,
    Unauthorized,
    MintMismatch,
    AccountFrozen,
}
impl From<TokenError> for ProgramError {
    fn from(e: TokenError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

// 指令枚举
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub enum TokenInstruction {
    /// 初始化铸币账户
    /// 账户列表:
    /// [0] 铸币账户 (可写)
    /// [1] 租金系统账户
    InitializeMint {
        decimals: u8,           // 1 byte
        mint_authority: Pubkey, // 32 bytes - 注意：不是 Option！
        freeze_authority: Option<Pubkey>, // 33 bytes (1 + 32)
    },
    
    /// 初始化代币账户
    /// 账户列表:
    /// [0] 代币账户 (可写)
    /// [1] 铸币账户
    /// [2] 账户所有者
    /// [3] 租金系统账户
    InitializeAccount,
    
    /// 铸造代币
    /// 账户列表:
    /// [0] 铸币账户 (可写)
    /// [1] 目标代币账户 (可写)
    /// [2] 铸币权限账户 (签名者)
    MintTo {
        amount: u64,
    },
    
    /// 转移代币
    /// 账户列表:
    /// [0] 源代币账户 (可写)
    /// [1] 目标代币账户 (可写)
    /// [2] 账户所有者 (签名者)
    Transfer {
        amount: u64,
    },
    
    /// 销毁代币
    /// 账户列表:
    /// [0] 代币账户 (可写)
    /// [1] 铸币账户 (可写)
    /// [2] 账户所有者 (签名者)
    Burn {
        amount: u64,
    },
    
    /// 设置铸币权限
    /// 账户列表:
    /// [0] 铸币账户 (可写)
    /// [1] 当前铸币权限 (签名者)
    SetMintAuthority {
        new_authority: Option<Pubkey>,
    },
}

// 铸币账户状态
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct Mint {
    pub is_initialized: bool,
    pub decimals: u8,
    pub mint_authority: Option<Pubkey>,
    pub supply: u64,
    pub freeze_authority: Option<Pubkey>,
}

impl Mint {
    pub const LEN: usize = 1 + 1 + 33 + 8 + 33; // 序列化后的大小
    
    pub fn new(
        decimals: u8,
        mint_authority: Pubkey,
        freeze_authority: Option<Pubkey>,
    ) -> Self {
        Self {
            is_initialized: true,
            decimals,
            mint_authority: Some(mint_authority),
            supply: 0,
            freeze_authority,
        }
    }
}

// 代币账户状态
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct TokenAccount {
    pub is_initialized: bool,
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub is_frozen: bool,
}

impl TokenAccount {
    pub const LEN: usize = 1 + 32 + 32 + 8 + 1; // 序列化后的大小
    
    pub fn new(mint: Pubkey, owner: Pubkey) -> Self {
        Self {
            is_initialized: true,
            mint,
            owner,
            amount: 0,
            is_frozen: false,
        }
    }
}

// 程序入口点
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("====================SPL Token Program: Processing instruction");
    msg!("指令数据长度: {}", instruction_data.len());
    
    // 精确的字节分析
    msg!("=== 精确字节分析 ===");
    
    if instruction_data.len() >= 1 {
        msg!("[0] 指令类型: {}", instruction_data[0]);
    }
    
    if instruction_data.len() >= 2 {
        msg!("[1] decimals: {}", instruction_data[1]);
    }
    
    if instruction_data.len() >= 3 {
        msg!("[2] 字段A (期望: mint_authority option): {}", instruction_data[2]);
    }
    
    if instruction_data.len() > 35 {
        msg!("[35] 字段B (期望: freeze_authority option): {}", instruction_data[35]);
    }
    
    if instruction_data.len() >= 68 {
        msg!("数据总长度: 68 字节 - 符合期望");
    } else {
        msg!("数据总长度: {} 字节 - 不符合期望(68)", instruction_data.len());
    }
    
    // 尝试手动解析来理解数据结构
    msg!("=== 手动解析尝试 ===");
    
    if instruction_data.len() >= 68 {
        // 假设结构是: u8, u8, Option<Pubkey>, Option<Pubkey>
        let instruction_type = instruction_data[0];
        let decimals = instruction_data[1];
        
        let mint_auth_option = instruction_data[2];
        let mint_auth_bytes = &instruction_data[3..35];
        
        let freeze_auth_option = instruction_data[35];
        let freeze_auth_bytes = &instruction_data[36..68];
        
        msg!("手动解析结果:");
        msg!("  指令类型: {}", instruction_type);
        msg!("  decimals: {}", decimals);
        msg!("  mint_authority option: {}", mint_auth_option);
        msg!("  freeze_authority option: {}", freeze_auth_option);
        
        // 尝试构造公钥
        if let Ok(mint_pubkey) = Pubkey::try_from(mint_auth_bytes) {
            msg!("  mint_authority: {}", mint_pubkey);
        }
        
        if freeze_auth_option == 1 {
            if let Ok(freeze_pubkey) = Pubkey::try_from(freeze_auth_bytes) {
                msg!("  freeze_authority: {}", freeze_pubkey);
            }
        } else {
            msg!("  freeze_authority: None");
        }
    }
    {

       // serialize_token_instruction();


    }





    
    // 现在尝试 Borsh 反序列化
    let instruction = TokenInstruction::try_from_slice(instruction_data)
        .map_err(|e| {
            msg!("❌ Borsh 反序列化失败!");
            msg!("❌ 详细错误: {:?}", e);
            
            // 提供更具体的调试信息
            msg!("=== 调试建议 ===");
            msg!("当前假设的数据结构:");
            msg!("  TokenInstruction::InitializeMint {{");
            msg!("    decimals: u8 (1 byte)");
            msg!("    mint_authority: Pubkey (32 bytes)");
            msg!("    freeze_authority: Option<Pubkey> (33 bytes)");
            msg!("  }}");
            msg!("总大小: 1 + 1 + 32 + 33 = 67 字节");
            msg!("但实际数据长度: {} 字节", instruction_data.len());
            
            TokenError::InvalidInstruction
        })?;
    
    msg!("✅ Borsh 反序列化成功");



    msg!("follow1");
    match instruction {
        TokenInstruction::InitializeMint { decimals, mint_authority, freeze_authority } => {
            process_initialize_mint(program_id, accounts, decimals, mint_authority, freeze_authority)
        }
        TokenInstruction::InitializeAccount => {
            process_initialize_account(program_id, accounts)
        }
        TokenInstruction::MintTo { amount } => {
            process_mint_to(program_id, accounts, amount)
        }
        TokenInstruction::Transfer { amount } => {
            process_transfer(program_id, accounts, amount)
        }
        TokenInstruction::Burn { amount } => {
            process_burn(program_id, accounts, amount)
        }
        TokenInstruction::SetMintAuthority { new_authority } => {
            process_set_mint_authority(program_id, accounts, new_authority)
        }
    }
}

/// 初始化铸币账户
fn process_initialize_mint(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    decimals: u8,
    mint_authority: Pubkey,
    freeze_authority: Option<Pubkey>,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let mint_account = next_account_info(account_info_iter)?;
    let rent_sysvar_account = next_account_info(account_info_iter)?;
    msg!("follow2");
    // 验证账户所有权
    if mint_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }
    
    // 检查租金豁免
    let rent = &Rent::from_account_info(rent_sysvar_account)?;
    if !rent.is_exempt(mint_account.lamports(), mint_account.data_len()) {
        return Err(TokenError::NotRentExempt.into());
    }
    msg!("follow3");
    // 初始化铸币账户
    let mut mint_data = mint_account.data.borrow_mut();
    // let mint = Mint::new(decimals, mint_authority, freeze_authority);
    // mint.serialize(&mut &mut mint_data[..])?;
    
    // msg!("Mint initialized with authority: {}", mint_authority);
    Ok(())
}

fn serialize_token_instruction(){
    msg!("🔧 Rust 序列化测试");

    
    // 你的数据
    let decimals = 9;
    let mint_authority: Pubkey = "5higFJ6xCuganUCvFFLDnZhL4Jb28KYEfBrVzCDGpGt8".parse().unwrap();
    //let freeze_authority: Option<Pubkey> = None;
     let freeze_authority: Option<Pubkey> = Some("GjphYQcbP1m3SYTXkHC1E3MJrCEeH8vL6f3HuoZ9fJ2x".parse().unwrap());
    
    msg!("输入数据:");
    msg!("  decimals: {}", decimals);
    msg!("  mint_authority: {}", mint_authority);
    msg!("  freeze_authority: {:?}", freeze_authority);
    
    // 创建指令
    let instruction = TokenInstruction::InitializeMint {
        decimals,
        mint_authority,
        freeze_authority,
    };
    
    // 序列化
    match instruction.try_to_vec() {
        Ok(serialized) => {
            msg!("\n✅ 序列化成功!");
            msg!("序列化结果:");
            msg!("  长度: {} 字节", serialized.len());
            msg!("  十六进制: {:?}", serialized.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>());
            msg!("  字节数组: {:?}", serialized);
            
            // 详细字节分析
            msg!("\n🔬 详细字节分析:");
            msg!("  [0] 枚举判别式: {} (InitializeMint)", serialized[0]);
            msg!("  [1] decimals: {}", serialized[1]);
            msg!("  [2-33] mint_authority: 32 bytes");
            
            // 检查 mint_authority 是否正确
            let mint_auth_bytes = &serialized[2..34];
            if let Ok(reconstructed_mint) = Pubkey::try_from(mint_auth_bytes) {
                msg!("     重建的 mint_authority: {}", reconstructed_mint);
                msg!("     匹配: {}", reconstructed_mint == mint_authority);
            }
            
            msg!("  [34] freeze_authority option: {} (0 = None)", serialized[34]);
            msg!("  [35-66] freeze_authority data: 32 bytes of zeros");
            
            // 验证总长度
            let expected_length = 1 + 1 + 32 + 1 + 32; // 67 bytes
            msg!("\n📏 长度验证:");
            msg!("  期望: {} 字节", expected_length);
            msg!("  实际: {} 字节", serialized.len());
            msg!("  匹配: {}", serialized.len() == expected_length);
            
            // 反序列化验证
            msg!("\n🔄 反序列化验证:");
            match TokenInstruction::try_from_slice(&serialized) {
                Ok(deserialized) => {
                    msg!("  ✅ 反序列化成功!");
                    if let TokenInstruction::InitializeMint { decimals: d, mint_authority: ma, freeze_authority: fa } = deserialized {
                        msg!("     decimals: {} (匹配: {})", d, d == decimals);
                        msg!("     mint_authority: {} (匹配: {})", ma, ma == mint_authority);
                        msg!("     freeze_authority: {:?} (匹配: {})", fa, fa == freeze_authority);
                    }
                }
                Err(e) => {
                    msg!("  ❌ 反序列化失败: {:?}", e);
                }
            }
        }
        Err(e) => {
            msg!("❌ 序列化失败: {:?}", e);
        }
    }
}


/// 初始化代币账户
fn process_initialize_account(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let token_account = next_account_info(account_info_iter)?;
    let mint_account = next_account_info(account_info_iter)?;
    let owner_account = next_account_info(account_info_iter)?;
    let rent_sysvar_account = next_account_info(account_info_iter)?;
    
    // 验证账户所有权
    if token_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }
    
    // 检查租金豁免
    let rent = &Rent::from_account_info(rent_sysvar_account)?;
    if !rent.is_exempt(token_account.lamports(), token_account.data_len()) {
        return Err(TokenError::NotRentExempt.into());
    }
    
    // 初始化代币账户
    let mut token_data = token_account.data.borrow_mut();
    let token_acc = TokenAccount::new(*mint_account.key, *owner_account.key);
    token_acc.serialize(&mut &mut token_data[..])?;
    
    msg!("Token account initialized for owner: {}", owner_account.key);
    Ok(())
}

/// 铸造代币
fn process_mint_to(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let mint_account = next_account_info(account_info_iter)?;
    let token_account = next_account_info(account_info_iter)?;
    let mint_authority_account = next_account_info(account_info_iter)?;
    
    // 验证铸币权限
    let mint_data = mint_account.data.borrow();
    let mut mint = Mint::deserialize(&mut &mint_data[..])?;
    
    if !mint_authority_account.is_signer {
        return Err(TokenError::Unauthorized.into());
    }
    
    if let Some(auth) = mint.mint_authority {
        if auth != *mint_authority_account.key {
            return Err(TokenError::Unauthorized.into());
        }
    } else {
        return Err(TokenError::Unauthorized.into());
    }
    
    // 更新铸币账户
    mint.supply += amount;
    drop(mint_data);
    mint.serialize(&mut &mut mint_account.data.borrow_mut()[..])?;
    
    // 更新代币账户
    let mut token_data = token_account.data.borrow_mut();
    let mut token_acc = TokenAccount::deserialize(&mut &token_data[..])?;
    token_acc.amount += amount;
    token_acc.serialize(&mut &mut token_data[..])?;
    
    msg!("Minted {} tokens to {}", amount, token_account.key);
    Ok(())
}

/// 转移代币
fn process_transfer(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let source_account = next_account_info(account_info_iter)?;
    let dest_account = next_account_info(account_info_iter)?;
    let owner_account = next_account_info(account_info_iter)?;
    
    // 验证所有者权限
    if !owner_account.is_signer {
        return Err(TokenError::Unauthorized.into());
    }
    
    // 更新源账户
    let mut source_data = source_account.data.borrow_mut();
    let mut source_acc = TokenAccount::deserialize(&mut &source_data[..])?;
    
    if source_acc.owner != *owner_account.key {
        return Err(TokenError::Unauthorized.into());
    }
    
    if source_acc.amount < amount {
        return Err(TokenError::InsufficientFunds.into());
    }
    
    source_acc.amount -= amount;
    source_acc.serialize(&mut &mut source_data[..])?;
    
    // 更新目标账户
    let mut dest_data = dest_account.data.borrow_mut();
    let mut dest_acc = TokenAccount::deserialize(&mut &dest_data[..])?;
    dest_acc.amount += amount;
    dest_acc.serialize(&mut &mut dest_data[..])?;
    
    msg!("Transferred {} tokens from {} to {}", amount, source_account.key, dest_account.key);
    Ok(())
}

/// 销毁代币
fn process_burn(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let token_account = next_account_info(account_info_iter)?;
    let mint_account = next_account_info(account_info_iter)?;
    let owner_account = next_account_info(account_info_iter)?;
    
    // 验证所有者权限
    if !owner_account.is_signer {
        return Err(TokenError::Unauthorized.into());
    }
    
    // 更新代币账户
    let mut token_data = token_account.data.borrow_mut();
    let mut token_acc = TokenAccount::deserialize(&mut &token_data[..])?;
    
    if token_acc.owner != *owner_account.key {
        return Err(TokenError::Unauthorized.into());
    }
    
    if token_acc.amount < amount {
        return Err(TokenError::InsufficientFunds.into());
    }
    
    token_acc.amount -= amount;
    token_acc.serialize(&mut &mut token_data[..])?;
    
    // 更新铸币账户
    let mut mint_data = mint_account.data.borrow_mut();
    let mut mint = Mint::deserialize(&mut &mint_data[..])?;
    mint.supply -= amount;
    mint.serialize(&mut &mut mint_data[..])?;
    
    msg!("Burned {} tokens from {}", amount, token_account.key);
    Ok(())
}

/// 设置铸币权限
fn process_set_mint_authority(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    new_authority: Option<Pubkey>,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let mint_account = next_account_info(account_info_iter)?;
    let current_authority_account = next_account_info(account_info_iter)?;
    
    // 验证当前铸币权限
    let mut mint_data = mint_account.data.borrow_mut();
    let mut mint = Mint::deserialize(&mut &mint_data[..])?;
    
    if !current_authority_account.is_signer {
        return Err(TokenError::Unauthorized.into());
    }
    
    if let Some(auth) = mint.mint_authority {
        if auth != *current_authority_account.key {
            return Err(TokenError::Unauthorized.into());
        }
    } else {
        return Err(TokenError::Unauthorized.into());
    }
    
    // 更新铸币权限
    mint.mint_authority = new_authority;
    mint.serialize(&mut &mut mint_data[..])?;
    
    msg!("Mint authority updated");
    Ok(())
}

// 修正序列化/反序列化方法
impl Mint {
    pub fn serialize(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        // 直接使用切片，不使用 Cursor
        BorshSerialize::serialize(self, &mut &mut data[..])
            .map_err(|_| ProgramError::InvalidAccountData)?;
        Ok(())
    }
    
    pub fn deserialize(data: &[u8]) -> Result<Self, ProgramError> {
        // 使用 try_from_slice 而不是 deserialize
        Mint::try_from_slice(data).map_err(|_| ProgramError::InvalidAccountData)
    }
}

impl TokenAccount {
    pub fn serialize(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        BorshSerialize::serialize(self, &mut &mut data[..])
            .map_err(|_| ProgramError::InvalidAccountData)?;
        Ok(())
    }
    
    pub fn deserialize(data: &[u8]) -> Result<Self, ProgramError> {
        TokenAccount::try_from_slice(data).map_err(|_| ProgramError::InvalidAccountData)
    }
}