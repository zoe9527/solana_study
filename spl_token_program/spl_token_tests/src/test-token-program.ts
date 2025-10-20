import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl
} from '@solana/web3.js';
import { 
  TestResult, 
  ProgramAccounts 
} from './types';
import {
  waitForConfirmation,
  getBalance,
  requestAirdrop,
  createInitializeMintInstruction,
  createInitializeAccountInstruction,
  createMintToInstruction,
  createTransferInstruction,
  createBurnInstruction,
  createSetMintAuthorityInstruction,
  getMintData,
  getTokenAccountData
} from './utils';

/**
 * SPL 代币程序完整测试套件
 * 这个测试覆盖了后端程序的所有分支流程
 */
class TokenProgramTester {
  private connection: Connection;
  private payer: Keypair;
  private programId: PublicKey;
  private testResults: TestResult[] = [];

  constructor(programId: string) {
    // 连接到 Solana Devnet
    //this.connection = new Connection(clusterApiUrl('localhost'), 'confirmed');
    this.connection = new Connection('http://localhost:8899', 'confirmed');
    this.payer = Keypair.generate();
    this.programId = new PublicKey(programId);
  }

  /**
   * 运行完整的测试套件
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 开始 SPL 代币程序完整测试');
    console.log('========================================');
    
    try {
      // 1. 准备测试环境
      await this.prepareTestEnvironment();
      
      // 2. 创建测试账户
      const accounts = await this.createTestAccounts();
      
      // 3. 执行所有测试用例
      await this.testInitializeMint(accounts);
      await this.testInitializeAccount(accounts);
      await this.testMintTo(accounts);
      await this.testTransfer(accounts);
      await this.testBurn(accounts);
      await this.testSetMintAuthority(accounts);
      await this.testErrorCases(accounts);
      
      // 4. 输出测试报告
      this.printTestReport();
      
    } catch (error) {
      console.error('❌ 测试套件执行失败:', error);
      this.recordTestResult('测试套件', false, error instanceof Error ? error.message : String(error));
      this.printTestReport();
    }
  }

  /**
   * 准备测试环境
   */
  private async prepareTestEnvironment(): Promise<void> {
    console.log('\n📋 步骤 1: 准备测试环境');
    
    console.log(`💰 付费账户: ${this.payer.publicKey.toString()}`);
    
    // 获取当前余额
    const initialBalance = await getBalance(this.connection, this.payer.publicKey);
    console.log(`初始余额: ${initialBalance} SOL`);
    
    // 如果余额不足，请求空投
    if (initialBalance < 0.1) {
      console.log('余额不足，请求空投...');
      await requestAirdrop(this.connection, this.payer.publicKey, 1);
    }
    
    const finalBalance = await getBalance(this.connection, this.payer.publicKey);
    console.log(`准备完成，当前余额: ${finalBalance} SOL`);
    
    this.recordTestResult('环境准备', true, { balance: finalBalance });
  }

  /**
   * 创建测试所需的账户
   */
  private async createTestAccounts(): Promise<ProgramAccounts> {
    console.log('\n📋 步骤 2: 创建测试账户');
    
    // 生成测试账户密钥对
    const mint = Keypair.generate();
    const tokenAccount = Keypair.generate();
    const receiverTokenAccount = Keypair.generate();
    const newMintAuthority = Keypair.generate(); // 确保这个总是存在
    
    console.log(`🎯 铸币账户: ${mint.publicKey.toString()}`);
    console.log(`👤 代币账户: ${tokenAccount.publicKey.toString()}`);
    console.log(`👥 接收方代币账户: ${receiverTokenAccount.publicKey.toString()}`);
    console.log(`🔑 新铸币权限: ${newMintAuthority.publicKey.toString()}`);
    
    // 为账户分配空间
    const accounts = [mint, tokenAccount, receiverTokenAccount, newMintAuthority];
    
    for (const account of accounts) {
      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: this.payer.publicKey,
          newAccountPubkey: account.publicKey,
          lamports: await this.connection.getMinimumBalanceForRentExemption(82),
          space: 82,
          programId: this.programId,
        })
      );
      
      await sendAndConfirmTransaction(this.connection, transaction, [this.payer, account]);
      console.log(`✅ 账户创建成功: ${account.publicKey.toString()}`);
    }
    
    this.recordTestResult('账户创建', true, {
      mint: mint.publicKey.toString(),
      tokenAccount: tokenAccount.publicKey.toString(),
      receiverTokenAccount: receiverTokenAccount.publicKey.toString(),
      newMintAuthority: newMintAuthority.publicKey.toString()
    });
    
    return {
      mint: mint.publicKey,
      tokenAccount: tokenAccount.publicKey,
      receiverTokenAccount: receiverTokenAccount.publicKey,
      newMintAuthority: newMintAuthority.publicKey
    };
  }

  /**
   * 测试初始化铸币账户
   */
  private async testInitializeMint(accounts: ProgramAccounts): Promise<void> {
    console.log('\n🧪 测试 1: 初始化铸币账户');
    
    try {
      const transaction = new Transaction();
      
      // 添加初始化铸币指令
      transaction.add(createInitializeMintInstruction(
        accounts.mint,
        9, // decimals
        this.payer.publicKey, // mint_authority
        null, // freeze_authority (不设置冻结权限)
        this.programId
      ));
      
      // 发送交易
      const signature = await sendAndConfirmTransaction(
        this.connection, 
        transaction, 
        [this.payer]
      );
      
      console.log(`✅ 初始化铸币交易成功: ${signature}`);
      
      // 验证铸币账户状态
      const mintData = await getMintData(this.connection, accounts.mint);
      console.log('🔍 铸币账户验证:');
      console.log(`   - 已初始化: ${mintData.is_initialized}`);
      console.log(`   - 精度: ${mintData.decimals}`);
      console.log(`   - 总供应量: ${mintData.supply}`);
      console.log(`   - 铸币权限: ${mintData.mint_authority ? new PublicKey(mintData.mint_authority).toString() : '无'}`);
      console.log(`   - 冻结权限: ${mintData.freeze_authority ? new PublicKey(mintData.freeze_authority).toString() : '无'}`);
      
      // 验证数据正确性
      const isValid = mintData.is_initialized && 
                     mintData.decimals === 9 && 
                     mintData.supply === BigInt(0) &&
                     mintData.mint_authority !== null;
      
      if (isValid) {
        this.recordTestResult('初始化铸币账户', true, {
          signature,
          decimals: mintData.decimals,
          supply: mintData.supply.toString()
        });
      } else {
        throw new Error('铸币账户数据验证失败');
      }
      
    } catch (error) {
      this.recordTestResult('初始化铸币账户', false, error instanceof Error ? error.message : String(error));
      throw error; // 重新抛出，因为后续测试依赖这个步骤
    }
  }

  /**
   * 测试初始化代币账户
   */
  private async testInitializeAccount(accounts: ProgramAccounts): Promise<void> {
    console.log('\n🧪 测试 2: 初始化代币账户');
    
    try {
      const transaction = new Transaction();
      
      // 添加初始化代币账户指令
      transaction.add(createInitializeAccountInstruction(
        accounts.tokenAccount,
        accounts.mint,
        this.payer.publicKey, // owner
        this.programId
      ));
      
      // 发送交易
      const signature = await sendAndConfirmTransaction(
        this.connection, 
        transaction, 
        [this.payer]
      );
      
      console.log(`✅ 初始化代币账户交易成功: ${signature}`);
      
      // 验证代币账户状态
      const tokenAccountData = await getTokenAccountData(this.connection, accounts.tokenAccount);
      console.log('🔍 代币账户验证:');
      console.log(`   - 已初始化: ${tokenAccountData.is_initialized}`);
      console.log(`   - 关联铸币: ${new PublicKey(tokenAccountData.mint).toString()}`);
      console.log(`   - 所有者: ${new PublicKey(tokenAccountData.owner).toString()}`);
      console.log(`   - 余额: ${tokenAccountData.amount}`);
      console.log(`   - 是否冻结: ${tokenAccountData.is_frozen}`);
      
      // 验证数据正确性
      const isValid = tokenAccountData.is_initialized && 
                     new PublicKey(tokenAccountData.mint).equals(accounts.mint) &&
                     new PublicKey(tokenAccountData.owner).equals(this.payer.publicKey) &&
                     tokenAccountData.amount === BigInt(0) &&
                     !tokenAccountData.is_frozen;
      
      if (isValid) {
        this.recordTestResult('初始化代币账户', true, {
          signature,
          mint: new PublicKey(tokenAccountData.mint).toString(),
          owner: new PublicKey(tokenAccountData.owner).toString(),
          amount: tokenAccountData.amount.toString()
        });
      } else {
        throw new Error('代币账户数据验证失败');
      }
      
    } catch (error) {
      this.recordTestResult('初始化代币账户', false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * 测试铸造代币
   */
  private async testMintTo(accounts: ProgramAccounts): Promise<void> {
    console.log('\n🧪 测试 3: 铸造代币');
    
    try {
      const mintAmount = BigInt(1000 * (10 ** 9)); // 1000 个代币，考虑 9 位小数
      
      const transaction = new Transaction();
      
      // 添加铸造代币指令
      transaction.add(createMintToInstruction(
        accounts.mint,
        accounts.tokenAccount,
        this.payer.publicKey, // mint_authority
        mintAmount,
        this.programId
      ));
      
      // 发送交易
      const signature = await sendAndConfirmTransaction(
        this.connection, 
        transaction, 
        [this.payer]
      );
      
      console.log(`✅ 铸造代币交易成功: ${signature}`);
      console.log(`🎯 铸造数量: ${mintAmount} 基础单位`);
      
      // 验证铸造后的状态
      const mintData = await getMintData(this.connection, accounts.mint);
      const tokenAccountData = await getTokenAccountData(this.connection, accounts.tokenAccount);
      
      console.log('🔍 铸造后验证:');
      console.log(`   - 总供应量: ${mintData.supply}`);
      console.log(`   - 代币账户余额: ${tokenAccountData.amount}`);
      
      // 验证数据正确性
      const isValid = mintData.supply === mintAmount && 
                     tokenAccountData.amount === mintAmount;
      
      if (isValid) {
        this.recordTestResult('铸造代币', true, {
          signature,
          mintAmount: mintAmount.toString(),
          newSupply: mintData.supply.toString(),
          newBalance: tokenAccountData.amount.toString()
        });
      } else {
        throw new Error('铸造代币数据验证失败');
      }
      
    } catch (error) {
      this.recordTestResult('铸造代币', false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * 测试转移代币
   */
  private async testTransfer(accounts: ProgramAccounts): Promise<void> {
    console.log('\n🧪 测试 4: 转移代币');
    
    try {
      // 首先为接收方初始化代币账户
      console.log('📝 为接收方初始化代币账户...');
      const initTransaction = new Transaction();
      initTransaction.add(createInitializeAccountInstruction(
        accounts.receiverTokenAccount,
        accounts.mint,
        this.payer.publicKey, // 接收方账户的所有者
        this.programId
      ));
      
      await sendAndConfirmTransaction(this.connection, initTransaction, [this.payer]);
      console.log('✅ 接收方代币账户初始化成功');
      
      // 执行转账
      const transferAmount = BigInt(200 * (10 ** 9)); // 200 个代币
      
      const transferTransaction = new Transaction();
      transferTransaction.add(createTransferInstruction(
        accounts.tokenAccount, // 源账户
        accounts.receiverTokenAccount, // 目标账户
        this.payer.publicKey, // 所有者（签名者）
        transferAmount,
        this.programId
      ));
      
      const signature = await sendAndConfirmTransaction(
        this.connection, 
        transferTransaction, 
        [this.payer]
      );
      
      console.log(`✅ 转账交易成功: ${signature}`);
      console.log(`🎯 转账数量: ${transferAmount} 基础单位`);
      
      // 验证转账后的状态
      const sourceAccountData = await getTokenAccountData(this.connection, accounts.tokenAccount);
      const destAccountData = await getTokenAccountData(this.connection, accounts.receiverTokenAccount);
      
      console.log('🔍 转账后验证:');
      console.log(`   - 源账户余额: ${sourceAccountData.amount}`);
      console.log(`   - 目标账户余额: ${destAccountData.amount}`);
      
      // 验证数据正确性
      const expectedSourceBalance = BigInt(1000 * (10 ** 9)) - transferAmount; // 初始 1000 - 转账 200
      const isValid = sourceAccountData.amount === expectedSourceBalance && 
                     destAccountData.amount === transferAmount;
      
      if (isValid) {
        this.recordTestResult('转移代币', true, {
          signature,
          transferAmount: transferAmount.toString(),
          sourceBalance: sourceAccountData.amount.toString(),
          destBalance: destAccountData.amount.toString()
        });
      } else {
        throw new Error('转账数据验证失败');
      }
      
    } catch (error) {
      this.recordTestResult('转移代币', false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * 测试销毁代币
   */
  private async testBurn(accounts: ProgramAccounts): Promise<void> {
    console.log('\n🧪 测试 5: 销毁代币');
    
    try {
      const burnAmount = BigInt(100 * (10 ** 9)); // 销毁 100 个代币
      
      const transaction = new Transaction();
      
      // 添加销毁代币指令
      transaction.add(createBurnInstruction(
        accounts.tokenAccount,
        accounts.mint,
        this.payer.publicKey, // 所有者
        burnAmount,
        this.programId
      ));
      
      const signature = await sendAndConfirmTransaction(
        this.connection, 
        transaction, 
        [this.payer]
      );
      
      console.log(`✅ 销毁代币交易成功: ${signature}`);
      console.log(`🎯 销毁数量: ${burnAmount} 基础单位`);
      
      // 验证销毁后的状态
      const mintData = await getMintData(this.connection, accounts.mint);
      const tokenAccountData = await getTokenAccountData(this.connection, accounts.tokenAccount);
      
      console.log('🔍 销毁后验证:');
      console.log(`   - 总供应量: ${mintData.supply}`);
      console.log(`   - 代币账户余额: ${tokenAccountData.amount}`);
      
      // 验证数据正确性
      const expectedSupply = BigInt(1000 * (10 ** 9)) - BigInt(200 * (10 ** 9)) - burnAmount; // 初始 1000 - 转账 200 - 销毁 100
      const expectedBalance = BigInt(1000 * (10 ** 9)) - BigInt(200 * (10 ** 9)) - burnAmount; // 同理
      
      const isValid = mintData.supply === expectedSupply && 
                     tokenAccountData.amount === expectedBalance;
      
      if (isValid) {
        this.recordTestResult('销毁代币', true, {
          signature,
          burnAmount: burnAmount.toString(),
          newSupply: mintData.supply.toString(),
          newBalance: tokenAccountData.amount.toString()
        });
      } else {
        throw new Error('销毁代币数据验证失败');
      }
      
    } catch (error) {
      this.recordTestResult('销毁代币', false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * 测试设置铸币权限
   */
  private async testSetMintAuthority(accounts: ProgramAccounts): Promise<void> {
    console.log('\n🧪 测试 6: 设置铸币权限');
    
    try {
      const transaction = new Transaction();
      
      // 添加设置铸币权限指令 - 现在 accounts.newMintAuthority 保证存在
      transaction.add(createSetMintAuthorityInstruction(
        accounts.mint,
        this.payer.publicKey, // 当前铸币权限
        accounts.newMintAuthority, // 新铸币权限 (现在保证不是 undefined)
        this.programId
      ));
      
      const signature = await sendAndConfirmTransaction(
        this.connection, 
        transaction, 
        [this.payer]
      );
      
      console.log(`✅ 设置铸币权限交易成功: ${signature}`);
      console.log(`🎯 新铸币权限: ${accounts.newMintAuthority.toString()}`);
      
      // 验证权限更改
      const mintData = await getMintData(this.connection, accounts.mint);
      const newAuthority = mintData.mint_authority ? new PublicKey(mintData.mint_authority) : null;
      
      console.log('🔍 权限更改验证:');
      console.log(`   - 当前铸币权限: ${newAuthority ? newAuthority.toString() : '无'}`);
      
      // 验证数据正确性
      const isValid = newAuthority !== null && 
                     newAuthority.equals(accounts.newMintAuthority);
      
      if (isValid) {
        this.recordTestResult('设置铸币权限', true, {
          signature,
          newAuthority: newAuthority.toString()
        });
      } else {
        throw new Error('设置铸币权限验证失败');
      }
      
    } catch (error) {
      this.recordTestResult('设置铸币权限', false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * 测试错误情况
   */
  private async testErrorCases(accounts: ProgramAccounts): Promise<void> {
    console.log('\n🧪 测试 7: 错误情况测试');
    
    // 测试 7.1: 无权限铸造
    await this.testUnauthorizedMint(accounts);
    
    // 测试 7.2: 余额不足转账
    await this.testInsufficientBalanceTransfer(accounts);
    
    // 测试 7.3: 无权限设置铸币权限
    await this.testUnauthorizedSetAuthority(accounts);
  }

  /**
   * 测试无权限铸造
   */
  private async testUnauthorizedMint(accounts: ProgramAccounts): Promise<void> {
    try {
      const unauthorizedUser = Keypair.generate();
      const mintAmount = BigInt(100 * (10 ** 9));
      
      console.log('🔒 测试无权限铸造...');
      
      const transaction = new Transaction();
      transaction.add(createMintToInstruction(
        accounts.mint,
        accounts.tokenAccount,
        unauthorizedUser.publicKey, // 无权限的用户
        mintAmount,
        this.programId
      ));
      
      // 这里应该失败
      await sendAndConfirmTransaction(this.connection, transaction, [this.payer, unauthorizedUser]);
      
      // 如果执行到这里，说明测试失败
      this.recordTestResult('无权限铸造测试', false, '预期交易应该失败，但实际成功了');
      
    } catch (error) {
      // 预期会失败，所以这是成功的测试
      console.log('✅ 无权限铸造测试通过 - 正确拒绝了无权限操作');
      this.recordTestResult('无权限铸造测试', true, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 测试余额不足转账
   */
  private async testInsufficientBalanceTransfer(accounts: ProgramAccounts): Promise<void> {
    try {
      const excessiveAmount = BigInt(10000 * (10 ** 9)); // 远超余额的数量
      
      console.log('💰 测试余额不足转账...');
      
      const transaction = new Transaction();
      transaction.add(createTransferInstruction(
        accounts.tokenAccount,
        accounts.receiverTokenAccount,
        this.payer.publicKey,
        excessiveAmount,
        this.programId
      ));
      
      // 这里应该失败
      await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
      
      // 如果执行到这里，说明测试失败
      this.recordTestResult('余额不足转账测试', false, '预期交易应该失败，但实际成功了');
      
    } catch (error) {
      // 预期会失败，所以这是成功的测试
      console.log('✅ 余额不足转账测试通过 - 正确拒绝了余额不足的操作');
      this.recordTestResult('余额不足转账测试', true, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 测试无权限设置铸币权限
   */
  private async testUnauthorizedSetAuthority(accounts: ProgramAccounts): Promise<void> {
    try {
      const unauthorizedUser = Keypair.generate();
      
      console.log('🔒 测试无权限设置铸币权限...');
      
      const transaction = new Transaction();
      transaction.add(createSetMintAuthorityInstruction(
        accounts.mint,
        unauthorizedUser.publicKey, // 无权限的用户
        this.payer.publicKey, // 新权限
        this.programId
      ));
      
      // 这里应该失败
      await sendAndConfirmTransaction(this.connection, transaction, [this.payer, unauthorizedUser]);
      
      // 如果执行到这里，说明测试失败
      this.recordTestResult('无权限设置铸币权限测试', false, '预期交易应该失败，但实际成功了');
      
    } catch (error) {
      // 预期会失败，所以这是成功的测试
      console.log('✅ 无权限设置铸币权限测试通过 - 正确拒绝了无权限操作');
      this.recordTestResult('无权限设置铸币权限测试', true, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 记录测试结果
   */
  private recordTestResult(name: string, success: boolean, details?: any): void {
    this.testResults.push({
      name,
      success,
      details: success ? details : { error: details }
    });
  }

  /**
   * 输出测试报告
   */
  private printTestReport(): void {
    console.log('\n📊 ========================================');
    console.log('📊          测试报告');
    console.log('📊 ========================================');
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(result => result.success).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`📈 总测试数: ${totalTests}`);
    console.log(`✅ 通过: ${passedTests}`);
    console.log(`❌ 失败: ${failedTests}`);
    console.log(`📊 成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    console.log('\n🔍 详细结果:');
    this.testResults.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`  ${index + 1}. ${status} ${result.name}`);
      
      if (!result.success && result.details?.error) {
        console.log(`     错误: ${result.details.error}`);
      }
      
      if (result.details && result.success) {
        console.log(`     详情: ${JSON.stringify(result.details, null, 2).split('\n').join('\n     ')}`);
      }
    });
    
    if (failedTests === 0) {
      console.log('\n🎉 所有测试通过！SPL 代币程序功能正常。');
    } else {
      console.log('\n💡 部分测试失败，请检查程序实现。');
    }
  }
}

/**
 * 主函数 - 运行测试
 */
async function main() {
  console.log('🎯 SPL 代币程序完整测试套件');
  console.log('========================================');
  
  // 从命令行参数获取程序ID，或使用默认值
  const programId = process.argv[2] || 'ByiUxkVUtZM8fHoVFM3wsWVmaxL43i81G8eAHWKbwBBu';
  
  console.log(`🔧 程序ID: ${programId}`);
  console.log('🌐 网络: Devnet');
  console.log('========================================\n');
  
  const tester = new TokenProgramTester(programId);
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('💥 测试套件执行过程中发生致命错误:', error);
    process.exit(1);
  }
}

// 运行测试
main().catch(console.error);