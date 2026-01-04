import { PrismaClient } from "@prisma/client";
import { ENV } from "../config/env";
import { ethers } from "ethers";

type ClaimArgs = {
  userId: string;
  txHash: string;
  tokenAddress?: string;
  amount: string; // human-readable USD amount as string, e.g. "10" or "1.00"
};

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)"
];

function normalizeAddr(a: string): string {
  return ethers.getAddress(a);
}

function parseAmountToUnits(amount: string, decimals: number): bigint {
  // ethers v6: parseUnits returns bigint
  return ethers.parseUnits(amount, decimals);
}

export class CreditService {
  constructor(private prisma: PrismaClient) {}

  async getBalance(userId: string): Promise<number> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    return u?.creditsMilli ?? 0;
  }

  /**
   * Credits rule:
   * - $1.00 = 60 credits
   * - stored as milli-credits: 1 credit = 1000 milli
   * - 1 cent => 0.6 credits => 600 milli-credits
   */
  private usdCentsToMilliCredits(usdCents: number): number {
    return Math.floor(usdCents * 600);
  }

  async claimWithUsdcTransfer(args: ClaimArgs): Promise<{ ok: true; creditsMilli: number; addedMilli: number }> {
    if (!ENV.BSC_RPC_URL) {
      throw new Error("Server missing BSC_RPC_URL env var.");
    }
    if (!ENV.TREASURY_ADDRESS) {
      throw new Error("Server missing TREASURY_ADDRESS env var.");
    }

    // Token address priority:
    // 1) client-provided tokenAddress
    // 2) ENV.BSC_USDC_ADDRESS (recommended)
    // 3) default to BSC Binance-Peg USDC
    const tokenAddress = normalizeAddr(
      args.tokenAddress || ENV.BSC_USDC_ADDRESS || "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"
    );
    const treasury = normalizeAddr(ENV.TREASURY_ADDRESS);

    // Require tx confirmations (helps prevent reorg / race conditions)
    const minConf = Number.isFinite(ENV.MIN_CONFIRMATIONS) ? Math.max(0, ENV.MIN_CONFIRMATIONS) : 2;

    // prevent double-credits for the same txHash
    const existing = await this.prisma.creditTransaction.findFirst({
      where: { ref: args.txHash, type: "PURCHASE" }
    });
    if (existing) {
      const creditsMilli = await this.getBalance(args.userId);
      return { ok: true, creditsMilli, addedMilli: 0 };
    }

    const provider = new ethers.JsonRpcProvider(ENV.BSC_RPC_URL);
    const receipt = await provider.getTransactionReceipt(args.txHash);
    if (!receipt) throw new Error("Transaction not found yet (wait for confirmations and retry).");
    if (receipt.status !== 1) throw new Error("Transaction failed on-chain.");

    if (minConf > 0) {
      const latest = await provider.getBlockNumber();
      const conf = latest - receipt.blockNumber + 1;
      if (conf < minConf) {
        throw new Error(`Tx has ${conf} confirmation(s). Need ${minConf}.`);
      }
    }

    // Tie the credit to the authenticated user's wallet (prevents claiming someone else's tx)
    const user = await this.prisma.user.findUnique({ where: { id: args.userId }, select: { wallet: true } });
    const userWallet = user?.wallet ? normalizeAddr(user.wallet) : null;

    // Use token decimals from chain if possible
    let decimals = 18;
    try {
      const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      decimals = Number(await erc20.decimals());
    } catch {
      decimals = 18;
    }

    // Find a Transfer(from, to, value) log to treasury
    const iface = new ethers.Interface(ERC20_ABI);
    const transferTopic = iface.getEvent("Transfer").topicHash;

    // Expected units based on input amount
    const expectedUnits = parseAmountToUnits(args.amount, decimals);

    let matched = false;
    for (const log of receipt.logs) {
      if (normalizeAddr(log.address) !== tokenAddress) continue;
      if (!log.topics || log.topics[0] !== transferTopic) continue;

      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      const from = normalizeAddr(parsed.args.from);
      const to = normalizeAddr(parsed.args.to);
      const value = BigInt(parsed.args.value.toString());

      if (to !== treasury) continue;

      // If we know the user's wallet, require the transfer to originate from it.
      if (userWallet && from !== userWallet) continue;

      // Strict match: value must be >= expected (allows fee-on-transfer tokens; USDC isn't)
      if (value < expectedUnits) continue;

      matched = true;
      break;
    }

    if (!matched) {
      throw new Error("Could not verify a USDC Transfer to the treasury in this transaction.");
    }

    // Convert amount -> credits
    // NOTE: We treat the UI amount as USD for USDC. For safety we compute cents from string.
    const usd = Number(args.amount);
    const usdCents = Math.round(usd * 100);
    if (!Number.isFinite(usdCents) || usdCents <= 0) {
      throw new Error("Invalid amount.");
    }
    const addedMilli = this.usdCentsToMilliCredits(usdCents);
    if (addedMilli <= 0) throw new Error("Amount too small for credits.");

    // Apply credits + write audit log atomically
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: args.userId },
        data: { creditsMilli: { increment: addedMilli } },
        select: { creditsMilli: true }
      });

      await tx.creditTransaction.create({
        data: {
          userId: args.userId,
          type: "PURCHASE",
          usdCents,
          creditsDeltaMilli: addedMilli,
          ref: args.txHash
        }
      });

      return user;
    });

    return { ok: true, creditsMilli: result.creditsMilli, addedMilli: addedMilli };
  }
}
