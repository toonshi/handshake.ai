import dotenv from "dotenv";
import { generateGeminiText, streamGeminiText, generateGeminiEmbedding } from "../lib/gemini.js";

// Load env vars
dotenv.config({ path: ".env.local" });

async function main() {
  console.log("──────────────────────────────────────────────────");
  console.log("Testing OpenRouter Integration...");
  console.log(`API Key configured: ${process.env.OPENROUTER_API_KEY ? "Yes" : "No"}`);
  console.log(`Model: ${process.env.OPENROUTER_MODEL}`);
  console.log("──────────────────────────────────────────────────");

  if (!process.env.OPENROUTER_API_KEY) {
    console.error("❌ Error: OPENROUTER_API_KEY is not defined in .env.local");
    return;
  }

  // 1. Test Text Generation
  console.log("1. Testing generateGeminiText (chat completion)...");
  try {
    const text = await generateGeminiText(
      "You are a helpful coding assistant.",
      [{ role: "user", content: "Say hello in 3 words!" }],
      50
    );
    console.log(`   Response: "${text}"`);
    console.log("   ✅ Text generation passed!");
  } catch (err: any) {
    console.error(`   ❌ Text generation failed: ${err.message}`);
  }

  console.log("──────────────────────────────────────────────────");

  // 2. Test Streaming Text Generation
  console.log("2. Testing streamGeminiText (streaming)...");
  try {
    let responseText = "";
    process.stdout.write("   Stream: ");
    await streamGeminiText(
      "You are a poetic assistant.",
      [{ role: "user", content: "Write a 1-line poem about rain." }],
      (token) => {
        responseText += token;
        process.stdout.write(token);
      },
      50
    );
    console.log("\n   ✅ Streaming passed!");
  } catch (err: any) {
    console.error(`\n   ❌ Streaming failed: ${err.message}`);
  }

  console.log("──────────────────────────────────────────────────");

  // 3. Test Embedding Generation
  console.log("3. Testing generateGeminiEmbedding (embeddings)...");
  try {
    const embedding = await generateGeminiEmbedding("Testing OpenRouter embeddings.");
    console.log(`   Embedding dimensions: ${embedding.length}`);
    console.log(`   First 5 values: [${embedding.slice(0, 5).join(", ")}]`);
    console.log("   ✅ Embeddings passed!");
  } catch (err: any) {
    console.error(`   ❌ Embeddings failed: ${err.message}`);
  }
  console.log("──────────────────────────────────────────────────");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
