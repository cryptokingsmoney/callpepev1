import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class UserService {
  getProfile(userId: string) {
    return prisma.user.findUnique({ where: { id: userId } });
  }
}
