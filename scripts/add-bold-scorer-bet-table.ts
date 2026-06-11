import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { readFileSync } from "fs";
import { join } from "path";

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarQuote = false;

  for (let i = 0; i < sql.length; i++) {
    if (!inDollarQuote && sql.slice(i, i + 2) === "$$") {
      inDollarQuote = true;
      current += "$$";
      i++;
      continue;
    }
    if (inDollarQuote && sql.slice(i, i + 2) === "$$") {
      inDollarQuote = false;
      current += "$$";
      i++;
      continue;
    }
    if (sql[i] === ";" && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith("--")) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }
    current += sql[i];
  }

  const trimmed = current.trim();
  if (trimmed && !trimmed.startsWith("--")) {
    statements.push(trimmed);
  }

  return statements;
}

async function main() {
  const sql = readFileSync(
    join(__dirname, "../prisma/migrations/20250611000006_bold_scorer_bet/migration.sql"),
    "utf8"
  );

  for (const statement of splitSqlStatements(sql)) {
    await prisma.$executeRawUnsafe(statement);
  }

  console.log("bold_scorer_bets table ready");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
