import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma ORM v7 moved connection URLs out of schema.prisma and into this file.
// The CLI (migrate, db pull, db push, studio) reads `datasource.url` from here;
// at runtime PrismaClient receives the same URL via a driver adapter in
// src/config/database.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});