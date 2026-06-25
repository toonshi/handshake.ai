import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { generateGeminiEmbedding } from "@/lib/gemini";

const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const sql = postgres(process.env.DATABASE_URL!, { ssl: isProd ? 'require' : false, max: 5 });

// Demo personas designed to produce high-confidence agent matches.
// Three natural pairs:
//   Amina  <-> James  — mobile founder needs ML / ML eng needs distribution
//   James  <-> David  — ML inference needs infra / infra needs ML customers
//   Nia    <-> Amina  — investor looking for exactly Amina's stage + domain
const DEMO_USERS = [
  {
    name: "Amina Odhiambo",
    telegram_username: "amina_odhiambo",
    role: "Founder / Co-founder",
    description:
      "Building Duka — an offline-first inventory and sales tracking app for small retailers in Nairobi. We handle multi-device sync without internet using CRDTs and have 47 pilot shops.",
    goals:
      "Find an ML/AI co-founder who can add demand forecasting to Duka. Also want feedback on our B2B SaaS pricing from someone who has sold to African SMBs before.",
    challenges:
      "Stuck on CRDT conflict resolution when devices reconnect after days offline. Also struggling to price — shops say they want it but resist monthly subscriptions.",
    offers:
      "5 years building React Native apps in Kenya. Deep network in the Nairobi retail sector. Can introduce founders to 3 angel investors I know personally. Strong understanding of offline-first architecture.",
    wallet_address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    github_username: "aminaodhiambo",
    phone_number: "+254712345678",
  },
  {
    name: "James Kariuki",
    telegram_username: "james_kariuki_ml",
    role: "Software Developer",
    description:
      "Building TidaML — a lightweight ML inference library optimised for low-bandwidth, unreliable internet environments. Models run fully on-device with cloud sync when connectivity allows.",
    goals:
      "Find a technical co-founder with mobile distribution expertise and real retail customers to validate demand forecasting use cases. Need someone who can get pilots running fast.",
    challenges:
      "My models are good but I have no retail domain knowledge and zero distribution. I need a partner who has existing customer relationships and understands offline-first constraints.",
    offers:
      "Deep Python/TensorFlow expertise. Built and deployed models that run on 2GB RAM Android devices. Experience exporting TFLite models. Strong on data pipelines and model versioning.",
    wallet_address: "0x2546BcD3c84621e976D8185a91A922aE77ECEc30",
    github_username: "jkariuki_ml",
    phone_number: "+254723456789",
  },
  {
    name: "Nia Wanjiku",
    telegram_username: "nia_wanjiku_vc",
    role: "Investor / VC",
    description:
      "Running Baobab Seed — a $2M pre-seed fund focused on mobile commerce and fintech infrastructure for East Africa. I write $25k–$50k first checks into technical founders.",
    goals:
      "Find promising pre-seed mobile commerce or SMB tooling founders in Kenya for our next two investments. Specifically looking for teams with traction — paying customers, even small.",
    challenges:
      "Getting quality deal flow outside Nairobi. Hard to evaluate technical due diligence on mobile/offline architecture without a technical partner. Most decks look the same.",
    offers:
      "Pre-seed capital ($25k–$50k). Intros to Safaricom Spark, Y Combinator Africa network, and 12 Series A investors I know personally. Can fast-track into iHub accelerator program.",
    wallet_address: "0xbDA5747bFD65F08deb54cb465eB87D40e51B197E",
    github_username: "",
    phone_number: "+254734567890",
  },
  {
    name: "David Mwangi",
    telegram_username: "david_mwangi_devops",
    role: "Software Developer",
    description:
      "Building AfriInfra — a cloud infrastructure toolkit that optimises AWS/GCP for African connectivity patterns: variable latency, packet loss, intermittent connectivity. Used in production by 3 startups.",
    goals:
      "Find ML/AI startup customers who need optimised cloud infra for model serving in low-bandwidth regions. Want to validate edge-caching for ML inference as a core product feature.",
    challenges:
      "Need a co-founder with business development skills. I can build anything but I hate selling. Also need real ML workloads to benchmark edge-caching performance improvements.",
    offers:
      "AWS and GCP certified. Can reduce cloud costs by 30–40% for Africa-deployed workloads. Experience with Cloudflare Workers edge compute. Strong Terraform, Kubernetes background.",
    wallet_address: "0xdD2FD4581271e230360230F9337D5c0430Bf44C0",
    github_username: "davidmwangi_infra",
    phone_number: "+254745678901",
  },
  {
    name: "Zara Ahmed",
    telegram_username: "zara_ahmed_product",
    role: "Designer / Product",
    description:
      "Building GigWallet — a micro-savings and earnings tracking app for gig workers (boda boda riders, delivery drivers) in Nairobi. Have 200 beta users. Beautiful mobile-first design.",
    goals:
      "Find a React Native or Flutter developer to be my technical co-founder. Also want to get into an accelerator — ideally iHub or Antler.",
    challenges:
      "No mobile dev experience myself. Current contractor builds are slow and expensive. Need someone who can take ownership of the entire technical side.",
    offers:
      "Deep user research experience — ran 80 interviews with gig workers. Strong UX portfolio for low-literacy mobile interfaces. Network at Safaricom and M-Pesa team.",
    wallet_address: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
    github_username: "",
    phone_number: "+254756789012",
  },
];

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reset = req.nextUrl.searchParams.get("reset") === "true";
  // Replace Amina's telegram_username with the presenter's so they receive the real notification.
  // Usage: ?secret=...&presenter=your_telegram_username
  const presenterUsername = req.nextUrl.searchParams.get("presenter")?.replace(/^@/, "");

  const users = DEMO_USERS.map((u, i) =>
    i === 0 && presenterUsername ? { ...u, telegram_username: presenterUsername } : u
  );

  const results: Array<{ name: string; status: string; id?: string }> = [];

  if (reset) {
    try {
      const usernames = users.map((u) => u.telegram_username);
      await sql`DELETE FROM users WHERE telegram_username = ANY(${usernames})`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Reset failed: ${msg}` }, { status: 500 });
    }
  }

  for (const demo of users) {
    try {
      // Skip if already exists (unless reset was requested)
      const existing = await sql`
        SELECT id FROM users WHERE telegram_username = ${demo.telegram_username} LIMIT 1
      `;
      if (existing.length > 0) {
        results.push({ name: demo.name, status: "skipped (already exists)", id: existing[0].id as string });
        continue;
      }

      const [goalEmbedding, challengeEmbedding] = await Promise.all([
        generateGeminiEmbedding(demo.goals),
        generateGeminiEmbedding(demo.challenges),
      ]);

      const enrichments: Record<string, unknown> = { websites: [] };
      if (demo.github_username) {
        enrichments.github = { username: demo.github_username, fetchedAt: new Date().toISOString() };
      }

      const placeholderTelegramId = -(Math.abs(hashCode(demo.telegram_username)) % 2147483647);

      const inserted = await sql`
        INSERT INTO users (
          telegram_id, telegram_username, phone_number, wallet_address,
          name, role, description, goals, challenges, offers,
          enrichments, goal_embedding, challenge_embedding, accept_all_matches
        ) VALUES (
          ${placeholderTelegramId}, ${demo.telegram_username},
          ${demo.phone_number || null}, ${demo.wallet_address || null},
          ${demo.name}, ${demo.role}, ${demo.description},
          ${demo.goals}, ${demo.challenges}, ${demo.offers},
          ${JSON.stringify(enrichments)}::jsonb,
          ${JSON.stringify(goalEmbedding)}::vector,
          ${JSON.stringify(challengeEmbedding)}::vector,
          false
        )
        RETURNING id
      `;
      results.push({ name: demo.name, status: "created", id: inserted[0].id as string });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: demo.name, status: `error: ${msg}` });
    }
  }

  const seeded = results.filter((r) => r.status === "created").map((r) => r.name);
  const skipped = results.filter((r) => r.status.startsWith("skipped")).map((r) => r.name);
  const errors = results.filter((r) => r.status.startsWith("error")).map((r) => `${r.name}: ${r.status}`);

  return NextResponse.json({
    ok: errors.length === 0,
    seeded,
    skipped,
    errors,
    results,
    next: [
      "1. Message @HandshakeAIBot on Telegram — the bot will link your real telegram_id to your username",
      `2. POST /api/match with header: Authorization: Bearer <CRON_SECRET>`,
      "3. Watch Vercel logs to see agents negotiating live",
      "4. Check your Telegram for the match notification",
    ],
  });
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

export async function POST(req: NextRequest) {
  return GET(req);
}
