import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class AuthService {
  async loginOrRegister(wallet: string) {
    const w = String(wallet).toLowerCase();
    let user = await prisma.user.findUnique({ where: { wallet: w } });
    if (!user) {
      user = await prisma.user.create({
        data: { wallet: w, role: "USER" }
      });
    }
    const token = jwt.sign({ sub: user.id, role: user.role }, ENV.JWT_SECRET, {
      expiresIn: "7d"
    });
    return { user, token };
  }
}
