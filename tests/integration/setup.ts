import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("Integration tests need DATABASE_URL (a database you don't mind adding test users to).");
}
