/**
 * A sample customer for showing the console: Acme Payments, a made-up company
 * with three roles whose candidates have already been read, scored and moved
 * part-way through hiring, so every screen has something real to show.
 *
 * Everything in it is fictional. Every address is on a reserved domain
 * (acme.example, example.com) that no mailbox can receive, and sendEmail never
 * sends to those, so nothing done in the demo can reach a real person. The
 * company carries orgs.demo, which nothing else sets; building it again
 * replaces it.
 */
import { and, eq, like, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activity,
  applicationFacts,
  applications,
  auditLog,
  companyFacts,
  contradictions,
  debriefs,
  documents,
  evaluations,
  hardFilters,
  interviews,
  memberships,
  messages,
  notes,
  notifications,
  observations,
  orgs,
  personIdentities,
  persons,
  questions,
  refusedCriteria,
  requirements,
  roleSources,
  roles,
  rubricVersions,
  talentPoolMembers,
  talentPools,
  users,
  verdicts,
  type Access,
  type Decision,
  type FactGroup,
  type ReqOrigin,
  type SourceKind,
  type Stage,
  type Support,
  type VerdictValue,
} from "@/lib/db/schema";
import { MODEL } from "@/lib/ai/claude";
import { arithmetic, contribution } from "./arith";

export const DEMO_DOMAIN = "acme.example";
export const DEMO_NAME = "Acme Payments (demo)";

const DAY = 86_400_000;
const MIN = 60_000;

// ---- The company ------------------------------------------------------------------

type Who = "meera" | "rohan" | "sana" | "vikram" | "nisha";
const TEAM: Record<Who, { name: string; access: Access }> = {
  meera: { name: "Meera Iyer", access: "admin" },
  vikram: { name: "Vikram Rao", access: "ta" },
  rohan: { name: "Rohan Kapoor", access: "hiring_manager" },
  sana: { name: "Sana Qureshi", access: "hiring_manager" },
  nisha: { name: "Nisha Menon", access: "hiring_manager" },
};

const BRAIN: [FactGroup, string][] = [
  ["what_you_build", "Payment gateway and payouts API for small businesses in India: UPI, cards and net banking."],
  ["stage_scale", "Series B, about 140 people. Processes roughly ₹900 crore a month for 40,000 merchants."],
  ["stack", "Go and Java services on Kubernetes in AWS Mumbai, Postgres, Kafka, and a React front end."],
  ["team", "Engineering is 48 people in seven squads, each with a tech lead. Design is a team of six."],
  ["operating_reality", "Every backend engineer is on call one week in six. Releases go out daily."],
  ["compensation", "Senior engineers: ₹35–50 LPA fixed plus ESOPs. Offers above the band need the CFO's sign-off."],
  ["locations", "Bengaluru office three days a week. Design can be fully remote within India."],
  ["past_hires", "Two of the last three senior engineers who struggled had never owned a production database."],
  ["vocabulary", "Senior means owning a service end to end. Staff means owning a domain across squads."],
];

// ---- Roles, rubrics and candidates ------------------------------------------------

type Req = { key: string; text: string; weight: number; must?: boolean; origin: ReqOrigin; source: string; keywords: string[]; minYears?: number; ask: string };

type Job = [title: string, company: string, from: string, to: string, bullets: string[]];

type Interview = { d: number; by: Who; title: string; debrief?: ["strong_yes" | "yes" | "no" | "strong_no", string, string] };

type Cand = {
  name: string;
  city: string;
  gender?: "female" | "male";
  born?: number;
  link?: string;
  relocate?: boolean;
  jobs: Job[];
  edu: [degree: string, institution: string, year: number];
  skills: string;
  years: number;
  ctc: number;
  expected: number;
  notice: number;
  /**
   * One per requirement, in order: "m:<words from the CV>" met, "p:…" partly,
   * "n" not met, "u" unknown. The quote is the CV line containing those words.
   * A "|v" suffix marks verified evidence.
   */
  v: string[];
  strength: string;
  gap: string;
  evidence: "strong" | "moderate" | "weak";
  asks?: [string, string][];
  source: string;
  referredBy?: string;
  applied: number;
  stage?: Stage;
  /** Who decided, when (days ago), and why. */
  by?: Who;
  at?: number;
  reason?: string;
  note?: string;
  /** Shortlisted this many days ago, before a later stage or drop. */
  sl?: number;
  slReason?: string;
  steps?: [action: string, daysAgo: number][];
  seen?: number;
  interviews?: Interview[];
  question?: { req: string; text: string; sent: number; answer?: string; answeredHours?: number };
  notes?: [Who, number, string][];
  contradiction?: ["dates" | "title" | "employer", string, string];
  pool?: boolean;
};

type RoleSpec = {
  title: string;
  family: string;
  locations: string[];
  openings: number;
  target: number | null;
  comp: [number, number] | null;
  manager: Who;
  created: number;
  closed?: number;
  sources: { key: string; kind: SourceKind; label: string; cost: number }[];
  jd: string;
  intake: string;
  reqs: Req[];
  refused: { line: string; kind: "protected" | "unwise"; reason: string }[];
  noticeFilter?: number;
  candidates: Cand[];
};

const BACKEND: RoleSpec = {
  title: "Senior Backend Engineer",
  family: "Engineering",
  locations: ["Bengaluru"],
  openings: 2,
  target: 21,
  comp: [3_500_000, 5_000_000],
  manager: "rohan",
  created: 18,
  sources: [
    { key: "careers", kind: "careers_inbox", label: "Careers page", cost: 0 },
    { key: "referral", kind: "referral", label: "Employee referrals", cost: 50_000 },
    { key: "sourcing", kind: "winnow_sourcing", label: "Winnow sourcing", cost: 0 },
    { key: "naukri", kind: "upload", label: "Naukri résumé search", cost: 18_000 },
  ],
  jd: `Senior Backend Engineer, Payments Platform

Acme Payments moves money for 40,000 small businesses across India. The payments platform team owns payouts, refunds and the ledger behind them.

You have 5+ years building backend services that run in production. You write Go or Java every day. You have designed schemas and tuned queries on Postgres or MySQL at scale. Experience with payments, ledgers or reconciliation is a strong plus. You have mentored other engineers.

Candidates from IIT/NIT preferred. Age below 32. Notice period of 60 days or less.`,
  intake: "From the intake call with Rohan: two hires, one for payouts and one for the ledger. Wants people who have been woken up by a pager. Take-home is optional.",
  reqs: [
    { key: "be_years", text: "5+ years building backend services that run in production", weight: 5, must: true, origin: "jd", source: "You have 5+ years building backend services that run in production.", keywords: ["backend", "production"], minYears: 5, ask: "How many of your years were spent on services running in production?" },
    { key: "be_lang", text: "Writes Go or Java in production", weight: 4, must: true, origin: "jd", source: "You write Go or Java every day.", keywords: ["go", "golang", "java"], ask: "Which production services have you written in Go or Java?" },
    { key: "be_db", text: "Has owned a Postgres or MySQL database at scale: schema design, migrations, query tuning", weight: 4, origin: "jd", source: "You have designed schemas and tuned queries on Postgres or MySQL at scale.", keywords: ["postgres", "mysql", "schema", "migration"], ask: "Tell us about a schema change or slow query you fixed on a large table." },
    { key: "be_money", text: "Has built payments, ledgers or other systems that move money", weight: 4, origin: "jd", source: "Experience with payments, ledgers or reconciliation is a strong plus.", keywords: ["payments", "ledger", "reconciliation", "payouts"], ask: "Have you worked on anything that moves money: payments, payouts, wallets or a ledger?" },
    { key: "be_dist", text: "Distributed-systems basics: queues, idempotency, retries", weight: 3, origin: "winnow", source: "Every service at Acme talks over Kafka, which the brief assumed rather than said.", keywords: ["kafka", "queue", "idempotent", "retries"], ask: "How have you made a consumer or API safe to retry?" },
    { key: "be_oncall", text: "Has carried a pager and led incident response", weight: 3, origin: "chat", source: "From the intake call: on call one week in six.", keywords: ["on-call", "incident"], ask: "Have you carried a pager for a production service? Tell us about one incident you led." },
    { key: "be_mentor", text: "Has mentored engineers or led a small team", weight: 2, origin: "jd", source: "You have mentored other engineers.", keywords: ["mentor", "lead"], ask: "Have you mentored or led other engineers?" },
  ],
  refused: [
    { line: "Candidates from IIT/NIT preferred.", kind: "unwise", reason: "Institution prestige predicts performance poorly and narrows the pool." },
    { line: "Age below 32.", kind: "protected", reason: "This is about who a person is, not what they can do. Ask instead: what pace or seniority does the team actually need?" },
  ],
  noticeFilter: 60,
  candidates: [
    {
      name: "Aditya Kulkarni", city: "Bengaluru", gender: "male", born: 1993,
      jobs: [
        ["Senior Software Engineer", "Paystream Labs", "Jun 2020", "present", [
          "Own the payouts service in Go, which sends 2.1 million bank transfers a day",
          "Designed the double-entry ledger that reconciles every payout against bank statements",
          "Cut p99 latency of the payouts API from 900 ms to 140 ms by reworking Postgres indexes and partitioning the transfers table",
          "Built idempotent retries on Kafka so a bank timeout can never pay a seller twice",
          "Lead the payouts on-call rotation; ran the post-mortem for the March 2024 UPI outage",
          "Mentor three engineers, two of whom have since been promoted",
        ]],
        ["Software Engineer", "Ledgerline", "Jul 2016", "May 2020", ["Wrote Java services for invoice reconciliation used by 600 businesses", "Moved nightly batch jobs to an event-driven pipeline"]],
      ],
      edu: ["B.Tech, Computer Science", "NIT Trichy", 2016], skills: "Go, Java, Postgres, Kafka, Kubernetes, AWS", years: 8, ctc: 38, expected: 48, notice: 60,
      v: ["m:Experience (", "m:payouts service in Go|v", "m:p99 latency", "m:double-entry ledger", "m:idempotent retries", "m:on-call rotation", "m:Mentor three"],
      strength: "Owns a Go payouts service sending 2.1 million transfers a day, on a ledger he designed.",
      gap: "Notice period is 60 days, the most the role allows.",
      evidence: "strong", source: "sourcing", applied: 16,
      stage: "offer", sl: 14, by: "meera", slReason: "strong_match", steps: [["stage.interviewing", 11], ["stage.offer", 2]], seen: 13,
      interviews: [
        { d: -10, by: "rohan", title: "System design", debrief: ["strong_yes", "Walked through the ledger design with real numbers and knew exactly where it would break.", "Has worked on bank rails, not card networks."] },
        { d: -6, by: "meera", title: "Values and team", debrief: ["yes", "Clear about why he wants to move: a bigger surface than payouts.", "Wants to join in March, after his bonus."] },
      ],
      notes: [["rohan", 9, "Best system design round this quarter. @Meera let's get to an offer before someone else does."]],
    },
    {
      name: "Kavya Reddy", city: "Hyderabad", gender: "female", born: 1994, relocate: true,
      jobs: [
        ["Senior Software Engineer", "Freightnest", "Apr 2019", "present", [
          "Built the cash-on-delivery remittance service in Java that settles ₹40 crore a month to sellers",
          "Designed the shipments schema in Postgres and ran the zero-downtime migration to a partitioned table",
          "Introduced an outbox pattern so order events reach Kafka exactly once",
          "Primary on-call for remittances; wrote the incident runbook the team still uses",
          "Tech lead for a squad of five since 2023",
        ]],
        ["Software Engineer", "Kartwise", "Aug 2017", "Mar 2019", ["Built inventory APIs in Java and Spring Boot"]],
      ],
      edu: ["B.E., Information Technology", "Osmania University", 2017], skills: "Java, Spring Boot, Postgres, Kafka, Redis", years: 7, ctc: 34, expected: 44, notice: 30,
      v: ["m:Experience (", "m:remittance service in Java", "m:zero-downtime migration", "p:cash-on-delivery remittance", "m:outbox pattern", "m:Primary on-call", "m:Tech lead for a squad"],
      strength: "Built and runs a Java remittance service settling ₹40 crore a month, and leads a squad.",
      gap: "Her money work is cash-on-delivery settlement, not a payment gateway or ledger.",
      evidence: "strong", source: "careers", applied: 15,
      stage: "interviewing", sl: 9, by: "meera", slReason: "worth_a_conversation", steps: [["stage.interviewing", 6]], seen: 8,
      interviews: [
        { d: -4, by: "rohan", title: "System design", debrief: ["yes", "Strong on data modelling; her outbox answer was the best we have heard.", "Less depth on card and UPI flows."] },
        { d: 2, by: "meera", title: "Values and team" },
      ],
      notes: [["meera", 7, "Relocating from Hyderabad in January. Expected CTC is inside the band."]],
    },
    {
      name: "Arjun Menon", city: "Bengaluru", gender: "male", born: 1995,
      jobs: [
        ["Software Engineer II", "Kartwise", "Jan 2021", "present", [
          "Integrated three payment gateways into checkout and own refunds end to end",
          "Rewrote the checkout service in Go, cutting failed payments by 18%",
          "Tuned the orders database (MySQL) for the Diwali sale: 9,000 orders a minute at peak",
        ]],
        ["Software Engineer", "Tiffino", "Jun 2018", "Dec 2020", ["Built the restaurant payouts job in Python", "Added retry queues for partner webhooks"]],
      ],
      edu: ["B.Tech, Electronics", "VIT Vellore", 2018], skills: "Go, Python, MySQL, RabbitMQ", years: 6, ctc: 26, expected: 36, notice: 30,
      v: ["m:Experience (", "m:checkout service in Go", "m:9,000 orders a minute", "m:three payment gateways", "p:retry queues", "u", "u"],
      strength: "Owns refunds across three payment gateways and rewrote checkout in Go.",
      gap: "Nothing on the CV about on-call or incident response.",
      evidence: "moderate", source: "naukri", applied: 12,
      stage: "shortlisted", at: 4, by: "meera", reason: "worth_a_conversation", seen: 3,
      question: {
        req: "be_oncall",
        text: "Have you carried a pager for a production service? Tell us about one incident you led.",
        sent: 3,
        answer: "Yes. I have been primary on-call for checkout for two years, one week in four. During last year's Diwali sale a gateway failover sent traffic to a gateway that was down. I led the incident, switched routing by hand within 12 minutes and wrote the review.",
        answeredHours: 5,
      },
    },
    {
      name: "Priya Nair", city: "Kochi", gender: "female", born: 1990, relocate: true,
      jobs: [
        ["Lead Engineer", "Northbridge Bank", "2015", "present", [
          "Joined Northbridge Bank in 2018 to rebuild the NEFT and RTGS gateway in Java",
          "Own the settlement database (Postgres, 4 TB): schema changes, replication and query tuning",
          "Designed reconciliation between the core banking ledger and RBI settlement files",
          "Led incident response for payment outages as part of the bank's 24x7 on-call",
          "Manage a team of six engineers",
        ]],
        ["Software Engineer", "Bluefin Insurance", "2012", "2015", ["Built policy and claims APIs in Java"]],
      ],
      edu: ["B.Tech, Computer Science", "College of Engineering Trivandrum", 2012], skills: "Java, Spring, Postgres, Oracle, IBM MQ", years: 12, ctc: 42, expected: 50, notice: 90,
      v: ["m:Experience (", "m:NEFT and RTGS gateway in Java", "m:settlement database", "m:reconciliation between", "p:IBM MQ", "m:Led incident response", "m:Manage a team of six"],
      strength: "Rebuilt a bank's NEFT and RTGS gateway in Java and owns its 4 TB settlement database.",
      gap: "The CV gives two start dates at Northbridge Bank (2015 and 2018), and her notice period is 90 days.",
      evidence: "strong", source: "referral", referredBy: "Vikram Rao", applied: 3,
      contradiction: ["dates", "Lead Engineer, Northbridge Bank (2015", "Joined Northbridge Bank in 2018"],
      asks: [["be_years", "Your CV says you joined Northbridge Bank in 2015 in one place and 2018 in another. Which is right?"]],
    },
    {
      name: "Rahul Verma", city: "Pune", gender: "male", born: 1996,
      jobs: [
        ["Backend Engineer", "Orbitwave", "Mar 2019", "present", [
          "Build booking APIs in Node.js and TypeScript serving 40 requests a second",
          "Designed the Postgres schema for bookings and payments, including refunds",
          "Integrated two payment gateways for card and UPI payments",
          "On the on-call rotation for bookings",
          "Moved notifications to a queue with retries and dead-lettering",
        ]],
        ["Software Engineer", "Quillpad", "Jul 2018", "Feb 2019", ["Built internal tools in TypeScript"]],
      ],
      edu: ["B.E., Computer Engineering", "Pune Institute of Computer Technology", 2018], skills: "Node.js, TypeScript, Postgres, Redis, SQS", years: 6, ctc: 24, expected: 32, notice: 30,
      v: ["m:Experience (", "n", "m:Postgres schema for bookings", "m:two payment gateways", "m:dead-lettering", "p:on-call rotation for bookings", "u"],
      strength: "Designed the bookings and payments schema in Postgres, including refunds.",
      gap: "Writes Node.js and TypeScript; no Go or Java, which the role requires.",
      evidence: "strong", source: "careers", applied: 10,
      stage: "dropped", at: 9, by: "vikram", reason: "missing_must_have",
    },
    {
      name: "Sneha Joshi", city: "Bengaluru", gender: "female", born: 1998,
      jobs: [
        ["Software Engineer", "Paystream Labs", "Jul 2021", "present", [
          "Build merchant onboarding services in Go",
          "Wrote the KYC document pipeline with retries and idempotency keys",
          "Added Postgres read replicas for the merchant dashboard",
          "Shadow on-call for the onboarding service",
        ]],
      ],
      edu: ["B.Tech, Computer Science", "BITS Pilani", 2021], skills: "Go, Postgres, Kafka, gRPC", years: 3, ctc: 22, expected: 30, notice: 30,
      v: ["n", "m:merchant onboarding services in Go", "p:read replicas", "u", "m:idempotency keys", "p:Shadow on-call", "u"],
      strength: "Writes Go at a payments company, with idempotent retries done properly.",
      gap: "Three years of experience; the role asks for five.",
      evidence: "moderate", source: "sourcing", applied: 7,
    },
    {
      name: "Imran Shaikh", city: "Mumbai", gender: "male", born: 1986, relocate: true,
      jobs: [
        ["Staff Engineer", "Mediloop", "2018", "present", [
          "Architect for claims processing: 30 Java services",
          "Designed the payments and reimbursement ledger for 2 million insured members",
          "Run the architecture review for database changes across Postgres and Cassandra",
          "Escalation point for major incidents",
          "Grew the platform team from 4 to 15 engineers",
        ]],
        ["Senior Engineer", "Bluefin Insurance", "2013", "2018", ["Built premium collection in Java"]],
      ],
      edu: ["M.Tech, Computer Science", "IIT Madras", 2013], skills: "Java, Kotlin, Postgres, Cassandra, Kafka", years: 13, ctc: 62, expected: 75, notice: 60,
      v: ["m:Experience (", "m:30 Java services", "m:architecture review for database", "m:reimbursement ledger", "p:Cassandra, Kafka", "m:Escalation point", "m:Grew the platform team"],
      strength: "Staff engineer who designed a reimbursement ledger for 2 million members.",
      gap: "Expects ₹75 LPA, well above the ₹50 LPA top of the band.",
      evidence: "strong", source: "sourcing", applied: 14,
      stage: "dropped", sl: 12, slReason: "strong_match", at: 10, by: "meera", reason: "comp_misaligned", seen: 11,
      note: "Firm on ₹75 LPA. Worth keeping warm for a Staff role.",
    },
    {
      name: "Deepak Singh", city: "Gurugram", gender: "male", born: 1992,
      jobs: [
        ["Senior Software Engineer", "Kartwise", "2020", "present", [
          "Own the wallet service in Go: top-ups, cashback and refunds",
          "Partitioned the wallet transactions table in Postgres, 1.2 billion rows",
          "Kafka consumers with exactly-once processing for cashback",
          "On-call for wallet one week in five",
        ]],
        ["Software Engineer", "Freightnest", "2016", "2020", ["Built tracking APIs in Java"]],
      ],
      edu: ["B.Tech, Information Technology", "Delhi Technological University", 2016], skills: "Go, Java, Postgres, Kafka", years: 8, ctc: 40, expected: 50, notice: 90,
      v: ["m:Experience (", "m:wallet service in Go", "m:1.2 billion rows", "m:top-ups, cashback and refunds", "m:exactly-once processing", "m:On-call for wallet", "u"],
      strength: "Owns a Go wallet service with a 1.2-billion-row Postgres table.",
      gap: "Notice period is 90 days; the role needs 60 or less.",
      evidence: "strong", source: "naukri", applied: 13,
      stage: "dropped", at: 11, by: "vikram", reason: "notice_too_long", note: "Will not be bought out of his notice period.",
    },
    {
      name: "Ananya Gupta", city: "Bengaluru", gender: "female", born: 1996,
      jobs: [
        ["Software Engineer II", "Quillpad", "2019", "present", [
          "Build the sync service in Go that keeps documents consistent across devices",
          "Designed conflict-free retries for offline edits",
          "Run the team's on-call rotation and its weekly incident review",
          "Added indexes to the documents tables in Postgres",
        ]],
      ],
      edu: ["B.E., Computer Science", "RV College of Engineering", 2019], skills: "Go, TypeScript, Postgres, NATS", years: 5, ctc: 28, expected: 38, notice: 45,
      v: ["m:Experience (", "m:sync service in Go", "p:Added indexes", "u", "m:conflict-free retries", "m:on-call rotation", "u"],
      strength: "Writes Go and runs her team's on-call rotation and incident reviews.",
      gap: "No payments or money-moving work on the CV.",
      evidence: "moderate", source: "referral", referredBy: "Rohan Kapoor", applied: 5,
    },
    {
      name: "Karthik Subramanian", city: "Chennai", gender: "male", born: 1991, relocate: true,
      jobs: [
        ["Senior Engineer", "Tiffino", "2019", "present", [
          "Built the order routing platform in Java, 1.5 million orders a day",
          "Owned the orders Postgres cluster: schema design, migrations and vacuum tuning",
          "Moved order events to Kafka with idempotent consumers",
          "Incident commander for the platform team",
          "Mentored four engineers through the SDE 2 promotion",
        ]],
        ["Software Engineer", "Mediloop", "2015", "2019", ["Built appointment booking in Java"]],
      ],
      edu: ["B.E., Computer Science", "Anna University", 2015], skills: "Java, Spring Boot, Postgres, Kafka, Kubernetes", years: 9, ctc: 36, expected: 45, notice: 60,
      v: ["m:Experience (", "m:order routing platform in Java", "m:orders Postgres cluster", "n", "m:idempotent consumers", "m:Incident commander", "m:Mentored four"],
      strength: "Owns a Java order platform at 1.5 million orders a day, and its Postgres cluster.",
      gap: "No payments or ledger work.",
      evidence: "strong", source: "careers", applied: 8,
      stage: "shortlisted", at: 1, by: "meera", reason: "strong_match",
    },
    {
      name: "Farah Khan", city: "Bengaluru", gender: "female", born: 1993,
      jobs: [
        ["Senior Software Engineer", "Mediloop", "2020", "present", [
          "Build the lab reports service in Go",
          "Designed the reports schema and its migrations in Postgres",
          "Mentor two junior engineers",
          "Joined the on-call rotation in 2024",
        ]],
        ["Software Engineer", "Orbitwave", "2016", "2020", ["Built search in Java with Elasticsearch", "Wrote a job queue for hotel inventory updates"]],
      ],
      edu: ["B.Tech, Computer Science", "Jamia Millia Islamia", 2016], skills: "Go, Java, Postgres, Elasticsearch", years: 8, ctc: 33, expected: 42, notice: 30,
      v: ["m:Experience (", "m:lab reports service in Go", "m:reports schema", "n", "p:job queue", "p:on-call rotation in 2024", "m:Mentor two"],
      strength: "Writes Go and Java and designed a production Postgres schema.",
      gap: "Has not built anything that moves money.",
      evidence: "moderate", source: "careers", applied: 11,
      stage: "on_hold", at: 5, by: "meera", reason: "comparing",
    },
    {
      name: "Siddharth Bose", city: "Kolkata", gender: "male", born: 2000,
      jobs: [["Software Engineer", "Quillpad", "2022", "present", ["Build REST APIs in Python and Django", "Wrote SQL reports for the finance team", "Added Celery tasks for email sending"]]],
      edu: ["B.Tech, Computer Science", "Jadavpur University", 2022], skills: "Python, Django, Postgres, Celery", years: 2, ctc: 12, expected: 20, notice: 30,
      v: ["n", "n", "p:SQL reports", "u", "p:Celery tasks", "u", "u"],
      strength: "Builds Python APIs and has worked with Postgres.",
      gap: "Two years of experience and no Go or Java; both are must-haves.",
      evidence: "weak", source: "naukri", applied: 6,
    },
    {
      name: "Meghna Pillai", city: "Bengaluru", gender: "female", born: 1992,
      jobs: [
        ["Senior Software Engineer", "Tiffino", "2018", "present", [
          "Own the customer wallet in Java: refunds, credits and payouts to riders",
          "Designed the wallet ledger tables in Postgres",
          "Built retry and reconciliation jobs on Kafka",
          "Primary on-call for payments one week in six",
          "Onboard new joiners to the payments team",
        ]],
        ["Software Engineer", "Ledgerline", "2015", "2018", ["Built GST invoice generation in Java"]],
      ],
      edu: ["B.Tech, Computer Science", "Cochin University of Science and Technology", 2015], skills: "Java, Postgres, Kafka, Redis", years: 9, ctc: 39, expected: 47, notice: 60,
      v: ["m:Experience (", "m:customer wallet in Java", "m:wallet ledger tables", "m:payouts to riders", "m:reconciliation jobs on Kafka", "m:Primary on-call", "p:Onboard new joiners"],
      strength: "Owns a Java wallet with its own ledger, including payouts to riders.",
      gap: "Her mentoring is onboarding new joiners rather than leading people.",
      evidence: "strong", source: "sourcing", applied: 1,
    },
    {
      name: "Rohit Agarwal", city: "Jaipur", gender: "male", born: 1995,
      jobs: [["Software Engineer", "Freightnest", "2019", "present", ["Build carrier payouts in Go", "Wrote reconciliation scripts for carrier invoices", "Contributed to the Go services migration"]]],
      edu: ["B.Tech, Computer Science", "Manipal Institute of Technology", 2019], skills: "Go, Python, MySQL", years: 5, ctc: 25, expected: 34, notice: 30,
      v: ["m:Experience (", "m:carrier payouts in Go", "u", "m:carrier payouts in Go", "u", "u", "u"],
      strength: "Builds carrier payouts in Go.",
      gap: "The CV is thin: nothing on databases, queues or on-call.",
      evidence: "weak", source: "careers", applied: 0,
    },
  ],
};

const DESIGNER: RoleSpec = {
  title: "Product Designer",
  family: "Design",
  locations: ["Mumbai", "Remote (India)"],
  openings: 1,
  target: 30,
  comp: [2_000_000, 3_200_000],
  manager: "sana",
  created: 9,
  sources: [
    { key: "careers", kind: "careers_inbox", label: "Careers page", cost: 0 },
    { key: "referral", kind: "referral", label: "Employee referrals", cost: 30_000 },
    { key: "sourcing", kind: "winnow_sourcing", label: "Winnow sourcing", cost: 0 },
    { key: "naukri", kind: "upload", label: "Naukri résumé search", cost: 9_000 },
  ],
  jd: `Product Designer, Merchant Experience

You will design how 40,000 merchants get paid: onboarding, payouts, refunds and disputes.

You have 4+ years designing digital products that shipped. You take work from research to handoff. You have designed for payments, banking or other regulated flows. You have built or maintained a design system. You run usability research with real users. You work closely with engineers through build and QA.

Must have a portfolio from a top design school.`,
  intake: "From the intake call with Sana: the first project is the payouts dashboard redesign. Remote is fine; one week a quarter in Bengaluru.",
  reqs: [
    { key: "pd_years", text: "4+ years designing digital products that shipped", weight: 5, must: true, origin: "jd", source: "You have 4+ years designing digital products that shipped.", keywords: ["product design"], minYears: 4, ask: "How many years have you spent designing products that shipped?" },
    { key: "pd_e2e", text: "Has taken work end to end: research, flows, visual design and handoff", weight: 5, must: true, origin: "jd", source: "You take work from research to handoff.", keywords: ["research", "handoff", "end to end"], ask: "Walk us through one project you took from research to launch." },
    { key: "pd_fin", text: "Has designed for payments, banking or other regulated flows", weight: 3, origin: "jd", source: "You have designed for payments, banking or other regulated flows.", keywords: ["payments", "banking", "kyc"], ask: "Have you designed payments, banking or other regulated flows?" },
    { key: "pd_sys", text: "Has built or maintained a design system", weight: 3, origin: "jd", source: "You have built or maintained a design system.", keywords: ["design system", "components"], ask: "Have you built or maintained a design system? What were you responsible for?" },
    { key: "pd_research", text: "Has run usability research with real users", weight: 3, origin: "jd", source: "You run usability research with real users.", keywords: ["usability", "research"], ask: "Tell us about the last usability research you ran yourself." },
    { key: "pd_dev", text: "Works closely with engineers through build and QA", weight: 2, origin: "jd", source: "You work closely with engineers through build and QA.", keywords: ["engineers", "qa"], ask: "How do you work with engineers once a design is handed off?" },
  ],
  refused: [{ line: "Must have a portfolio from a top design school.", kind: "unwise", reason: "Where someone studied says little about their work; the portfolio itself shows it." }],
  candidates: [
    {
      name: "Ishita Banerjee", city: "Bengaluru", gender: "female", born: 1993, link: "portfolio.example.com/ishita",
      jobs: [
        ["Lead Product Designer", "Quillpad", "2021", "present", [
          "Led design for the editor from research to launch: 2 million monthly users",
          "Built and maintain Quillpad's design system, 140 components in Figma",
          "Run fortnightly usability sessions with teachers and students",
          "Pair with engineers through build and review every release before it ships",
        ]],
        ["Product Designer", "Paystream Labs", "2018", "2021", ["Designed the merchant payouts dashboard and refund flows"]],
      ],
      edu: ["B.Des, Interaction Design", "National Institute of Design", 2018], skills: "Figma, prototyping, usability research, design systems", years: 6, ctc: 28, expected: 36, notice: 30,
      v: ["m:Experience (", "m:from research to launch", "m:payouts dashboard and refund flows", "m:design system, 140 components|v", "m:fortnightly usability sessions", "m:Pair with engineers"],
      strength: "Led the editor end to end for 2 million users and built its design system.",
      gap: "Her payments work is three years old.",
      evidence: "strong", source: "careers", applied: 8,
      stage: "interviewing", sl: 5, by: "sana", slReason: "strong_match", steps: [["stage.interviewing", 3]], seen: 5,
      interviews: [{ d: 1, by: "sana", title: "Portfolio review" }],
    },
    {
      name: "Nikhil Das", city: "Mumbai", gender: "male", born: 1995,
      jobs: [
        ["Product Designer", "Paystream Labs", "2021", "present", [
          "Designed UPI AutoPay mandate flows from research through handoff",
          "Redesigned failed-payment recovery, lifting recovered payments by 11%",
          "Contribute components to the shared design library",
          "Run user interviews with small merchants in Hindi and Marathi",
        ]],
        ["Visual Designer", "Orbitwave", "2019", "2021", ["Designed marketing pages and the hotel booking flow"]],
      ],
      edu: ["B.Des, Communication Design", "MIT Institute of Design, Pune", 2019], skills: "Figma, Protopie, user interviews", years: 5, ctc: 18, expected: 26, notice: 30,
      v: ["m:Experience (", "m:from research through handoff", "m:UPI AutoPay mandate flows", "p:Contribute components", "m:user interviews with small merchants", "u"],
      strength: "Designs UPI mandate and failed-payment flows, with merchant research behind them.",
      gap: "Has contributed to a design system rather than built one.",
      evidence: "strong", source: "sourcing", applied: 6,
      stage: "shortlisted", at: 1, by: "sana", reason: "worth_a_conversation", seen: 1,
    },
    {
      name: "Tanvi Shah", city: "Ahmedabad", gender: "female", born: 1997,
      jobs: [["Product Designer", "Fieldwork Studio", "2020", "present", [
        "Designed mobile apps for 12 agency clients",
        "Set up the studio's Figma component library",
        "Hand off to client engineering teams and support them through QA",
        "Ran usability tests for two clients",
      ]]],
      edu: ["B.Des, Product Design", "CEPT University", 2020], skills: "Figma, Framer, usability testing", years: 4, ctc: 14, expected: 20, notice: 30,
      v: ["m:Experience (", "p:mobile apps for 12 agency clients", "n", "m:Figma component library", "p:usability tests for two clients", "m:support them through QA"],
      strength: "Set up a component library and supports engineers through QA.",
      gap: "Agency work: no product she has owned after launch.",
      evidence: "moderate", source: "careers", applied: 5,
    },
    {
      name: "Zoya Ahmed", city: "Mumbai", gender: "female", born: 1991,
      jobs: [
        ["Senior Product Designer", "Northbridge Bank", "2019", "present", [
          "Own design for the mobile banking app, from customer research to release",
          "Designed account opening and video KYC within RBI rules",
          "Lead the bank's design system and its accessibility standards",
          "Run monthly research with customers in branches",
          "Sit with the mobile squad through sprint reviews and QA",
        ]],
        ["Product Designer", "Bluefin Insurance", "2016", "2019", ["Designed the claims filing flow"]],
      ],
      edu: ["M.Des, Interaction Design", "IDC School of Design, IIT Bombay", 2016], skills: "Figma, accessibility, research", years: 8, ctc: 32, expected: 40, notice: 60,
      v: ["m:Experience (", "m:customer research to release", "m:video KYC within RBI rules", "m:Lead the bank's design system", "m:monthly research", "p:sprint reviews and QA"],
      strength: "Owns the mobile banking app's design, including KYC flows within RBI rules.",
      gap: "Notice period is 60 days.",
      evidence: "strong", source: "referral", referredBy: "Sana Qureshi", applied: 7,
      stage: "shortlisted", at: 3, by: "meera", reason: "strong_match", seen: 2,
    },
    {
      name: "Varun Malhotra", city: "Delhi", gender: "male", born: 1999,
      jobs: [["UI Designer", "Kartwise", "2022", "present", ["Design product listing pages and offer banners", "Maintain icons in the design library"]]],
      edu: ["B.Des, Communication Design", "Pearl Academy", 2021], skills: "Figma, Illustrator", years: 3, ctc: 9, expected: 14, notice: 30,
      v: ["n", "n", "u", "p:Maintain icons", "u", "u"],
      strength: "Maintains icons in a shared design library.",
      gap: "Three years of visual work; the role needs four years of end-to-end product design.",
      evidence: "weak", source: "naukri", applied: 8,
      stage: "dropped", at: 6, by: "vikram", reason: "missing_must_have",
    },
    {
      name: "Pooja Iyer", city: "Bengaluru", gender: "female", born: 1994,
      jobs: [["Product Designer", "Orbitwave", "2019", "present", ["Designed the trip planner from concept to launch", "Rebuilt the design system's form components", "Work with engineers on every release"]]],
      edu: ["B.Des, Interaction Design", "Srishti Manipal Institute", 2019], skills: "Figma, prototyping", years: 5, ctc: 19, expected: 26, notice: 30,
      v: ["m:Experience (", "m:from concept to launch", "n", "m:form components", "u", "m:Work with engineers"],
      strength: "Took a trip planner from concept to launch.",
      gap: "No regulated or payments flows, and nothing on user research.",
      evidence: "moderate", source: "careers", applied: 4,
    },
    {
      name: "Aman Chopra", city: "Gurugram", gender: "male", born: 1988,
      jobs: [
        ["Brand Design Lead", "Kartwise", "2018", "present", ["Lead brand identity and campaign design", "Art-direct photo shoots and festive campaigns", "Built the brand guidelines"]],
        ["Graphic Designer", "Fieldwork Studio", "2014", "2018", ["Designed packaging and print"]],
      ],
      edu: ["B.F.A., Applied Arts", "College of Art, Delhi", 2014], skills: "Brand, art direction, Figma", years: 10, ctc: 30, expected: 38, notice: 60,
      v: ["m:Experience (", "n", "n", "p:brand guidelines", "u", "u"],
      strength: "Ten years leading brand and campaign design.",
      gap: "Brand and campaign work, not product design: nothing taken end to end in a product.",
      evidence: "moderate", source: "sourcing", applied: 7,
      stage: "dropped", at: 5, by: "sana", reason: "below_bar",
    },
    {
      name: "Riya Sen", city: "Kolkata", gender: "female", born: 1996,
      jobs: [["Product Designer", "Bluefin Insurance", "2020", "present", ["Designed the claims filing flow from research to launch", "Ran usability tests with policyholders before every major release", "Redesigned the policy renewal payment step"]]],
      edu: ["B.Des, Product Design", "NIFT Kolkata", 2020], skills: "Figma, usability testing", years: 4, ctc: 15, expected: 22, notice: 30,
      v: ["m:Experience (", "m:claims filing flow from research to launch", "p:policy renewal payment step", "u", "m:usability tests with policyholders", "u"],
      strength: "Took claims filing from research to launch and tests with policyholders.",
      gap: "Says nothing about design systems or working with engineers.",
      evidence: "moderate", source: "careers", applied: 4,
      stage: "on_hold", at: 2, by: "vikram", reason: "awaiting_answer",
      question: { req: "pd_sys", text: "Have you built or maintained a design system? What were you responsible for?", sent: 2 },
    },
    {
      name: "Harsh Vardhan", city: "Hyderabad", gender: "male", born: 1992,
      jobs: [
        ["Senior Product Designer", "Ledgerline", "2019", "present", [
          "Own the invoicing product's design from discovery to release",
          "Designed GST-compliant invoice and payment reminder flows",
          "Run research calls with accountants every sprint",
          "Work with engineers daily and test every build",
        ]],
        ["Product Designer", "Tiffino", "2017", "2019", ["Designed the restaurant partner app"]],
      ],
      edu: ["B.Des, Industrial Design", "Symbiosis Institute of Design", 2017], skills: "Figma, research", years: 7, ctc: 27, expected: 34, notice: 45,
      v: ["m:Experience (", "m:from discovery to release", "m:GST-compliant invoice", "u", "m:research calls with accountants", "m:test every build"],
      strength: "Owns design for an invoicing product, including GST-compliant payment flows.",
      gap: "No design system work on the CV.",
      evidence: "strong", source: "sourcing", applied: 0,
    },
  ],
};

const ANALYST: RoleSpec = {
  title: "Data Analyst, Risk",
  family: "Analytics",
  locations: ["Bengaluru"],
  openings: 1,
  target: null,
  comp: [1_600_000, 2_600_000],
  manager: "nisha",
  created: 52,
  closed: 12,
  sources: [
    { key: "careers", kind: "careers_inbox", label: "Careers page", cost: 0 },
    { key: "referral", kind: "referral", label: "Employee referrals", cost: 30_000 },
    { key: "sourcing", kind: "winnow_sourcing", label: "Winnow sourcing", cost: 0 },
    { key: "naukri", kind: "upload", label: "Naukri résumé search", cost: 9_000 },
  ],
  jd: `Data Analyst, Risk

You will help the risk team decide which payments to trust.

You have 3+ years of analytics in a product company. Your SQL is advanced: window functions, and making slow queries fast. You build dashboards people actually use. You use Python or R. You have designed or analysed A/B experiments. Fraud, risk or payments analytics is a plus.`,
  intake: "From the intake call with Nisha: first project is chargeback forecasting.",
  reqs: [
    { key: "da_years", text: "3+ years of analytics in a product company", weight: 5, must: true, origin: "jd", source: "You have 3+ years of analytics in a product company.", keywords: ["analytics"], minYears: 3, ask: "How many years have you worked in analytics at a product company?" },
    { key: "da_sql", text: "Advanced SQL: window functions, tuning slow queries", weight: 5, must: true, origin: "jd", source: "Your SQL is advanced: window functions, and making slow queries fast.", keywords: ["sql", "window functions"], ask: "Tell us about a slow query you made fast." },
    { key: "da_dash", text: "Has built dashboards that people actually use (Metabase, Looker, Tableau)", weight: 3, origin: "jd", source: "You build dashboards people actually use.", keywords: ["metabase", "looker", "tableau"], ask: "Which of your dashboards is used most, and by whom?" },
    { key: "da_py", text: "Python or R for analysis", weight: 3, origin: "jd", source: "You use Python or R.", keywords: ["python", "r", "pandas"], ask: "What do you use Python or R for?" },
    { key: "da_ab", text: "Has designed or analysed A/B experiments", weight: 3, origin: "jd", source: "You have designed or analysed A/B experiments.", keywords: ["a/b", "experiment"], ask: "Tell us about an experiment you designed or analysed." },
    { key: "da_risk", text: "Fraud, risk or payments analytics", weight: 2, origin: "jd", source: "Fraud, risk or payments analytics is a plus.", keywords: ["fraud", "risk", "payments"], ask: "Have you worked on fraud, risk or payments data?" },
  ],
  refused: [],
  candidates: [
    {
      name: "Neha Kapoor", city: "Bengaluru", gender: "female", born: 1995,
      jobs: [
        ["Data Analyst", "Paystream Labs", "2021", "present", [
          "Own the payments success-rate dashboards in Metabase used by every squad",
          "Write SQL daily on a 2 TB warehouse, including window functions for cohort retention",
          "Built the fraud rules dashboard and the weekly chargeback analysis",
          "Analysed 14 checkout A/B tests and wrote the guide the team uses to size them",
        ]],
        ["Business Analyst", "Kartwise", "2019", "2021", ["Automated weekly reports in Python and pandas"]],
      ],
      edu: ["B.Sc, Statistics", "St. Xavier's College, Mumbai", 2019], skills: "SQL, Python, Metabase, experimentation", years: 5, ctc: 18, expected: 24, notice: 30,
      v: ["m:Experience (", "m:window functions for cohort|v", "m:success-rate dashboards", "m:Python and pandas", "m:14 checkout A/B tests", "m:fraud rules dashboard"],
      strength: "Owns payments dashboards every squad uses and the weekly chargeback analysis.",
      gap: "Has not yet presented to leadership.",
      evidence: "strong", source: "referral", referredBy: "Nisha Menon", applied: 49,
      stage: "hired", sl: 47, by: "nisha", slReason: "strong_match", steps: [["stage.interviewing", 44], ["stage.offer", 20], ["stage.hired", 18], ["stage.joined", 5]], seen: 47,
      interviews: [
        { d: -42, by: "nisha", title: "SQL exercise", debrief: ["strong_yes", "Fastest, cleanest SQL in the exercise, and explained every join.", "Has not presented to leadership yet."] },
        { d: -35, by: "nisha", title: "Case study", debrief: ["yes", "Sized the A/B test correctly and challenged the metric we gave her.", "None."] },
      ],
    },
    {
      name: "Abhishek Jain", city: "Pune", gender: "male", born: 1993,
      jobs: [["Senior Analyst", "Orbitwave", "2018", "present", ["Built the bookings funnel dashboards in Looker", "Advanced SQL on BigQuery, including tuning slow queries", "Python notebooks for demand forecasting", "Ran pricing experiments across 40 cities"]]],
      edu: ["B.Tech, Computer Science", "College of Engineering Pune", 2018], skills: "SQL, BigQuery, Looker, Python", years: 6, ctc: 20, expected: 27, notice: 60,
      v: ["m:Experience (", "m:tuning slow queries", "m:funnel dashboards in Looker", "m:Python notebooks", "m:pricing experiments", "u"],
      strength: "Strong SQL and Looker, and has run pricing experiments across 40 cities.",
      gap: "No fraud, risk or payments background.",
      evidence: "strong", source: "careers", applied: 50,
      stage: "dropped", sl: 46, by: "nisha", slReason: "strong_match", steps: [["stage.interviewing", 43]], at: 13, reason: "someone_else", seen: 46,
      interviews: [{ d: -40, by: "nisha", title: "SQL exercise", debrief: ["yes", "Very strong SQL, and good questions about our data.", "No fraud or payments background."] }],
      pool: true,
    },
    {
      name: "Lakshmi Narayanan", city: "Chennai", gender: "female", born: 1990,
      jobs: [["Analytics Manager", "Mediloop", "2017", "present", ["Lead a team of three analysts", "Write SQL on Redshift, including window functions", "Built Tableau dashboards for hospital partners", "Use R for claims analysis"]]],
      edu: ["M.Sc, Statistics", "University of Madras", 2016], skills: "SQL, Redshift, Tableau, R", years: 8, ctc: 26, expected: 32, notice: 60,
      v: ["m:Experience (", "m:including window functions", "m:Tableau dashboards", "m:Use R", "u", "p:claims analysis"],
      strength: "Leads analysts and builds Tableau dashboards for hospital partners.",
      gap: "Nothing on experiments.",
      evidence: "moderate", source: "sourcing", applied: 48,
      stage: "dropped", sl: 45, by: "nisha", slReason: "worth_a_conversation", steps: [["stage.interviewing", 41]], at: 36, reason: "interview_feedback", seen: 45,
      interviews: [{ d: -38, by: "nisha", title: "Case study", debrief: ["no", "Her SQL was strong.", "Could not explain how she would size an experiment."] }],
    },
    {
      name: "Manish Tiwari", city: "Lucknow", gender: "male", born: 1997,
      jobs: [["MIS Executive", "Freightnest", "2020", "present", ["Prepare daily Excel reports for operations", "Basic SQL queries for shipment counts"]]],
      edu: ["B.Com", "University of Lucknow", 2019], skills: "Excel, SQL", years: 4, ctc: 6, expected: 9, notice: 30,
      v: ["p:Prepare daily Excel", "p:Basic SQL", "u", "u", "u", "u"],
      strength: "Runs daily operations reporting.",
      gap: "Reporting rather than analysis, and only basic SQL.",
      evidence: "weak", source: "naukri", applied: 47,
      stage: "dropped", at: 45, by: "nisha", reason: "below_bar",
    },
    {
      name: "Shreya Ghosh", city: "Kolkata", gender: "female", born: 1994,
      jobs: [["Data Analyst", "Ledgerline", "2019", "present", ["Built Metabase dashboards for collections", "SQL with window functions for ageing analysis", "Python for automated reconciliation checks", "Analysed payment reminder A/B tests"]]],
      edu: ["B.Sc, Economics", "Presidency University", 2019], skills: "SQL, Python, Metabase", years: 5, ctc: 16, expected: 22, notice: 30,
      v: ["m:Experience (", "m:SQL with window functions for ageing", "m:Metabase dashboards", "m:Python for automated", "m:payment reminder A/B tests", "p:reconciliation checks"],
      strength: "Builds collections dashboards and has analysed payment reminder experiments.",
      gap: "Risk work is limited to reconciliation checks.",
      evidence: "strong", source: "sourcing", applied: 46,
      stage: "dropped", sl: 44, by: "nisha", slReason: "strong_match", at: 30, reason: "not_interested", seen: 44,
      note: "Accepted another offer before our interview.",
    },
    {
      name: "Yash Patel", city: "Ahmedabad", gender: "male", born: 1996,
      jobs: [["Data Analyst", "Kartwise", "2020", "present", ["Looker dashboards for seller performance", "SQL on Snowflake", "Python for seller churn models"]]],
      edu: ["B.Tech, Computer Engineering", "Nirma University", 2018], skills: "SQL, Snowflake, Looker, Python", years: 4, ctc: 15, expected: 21, notice: 90,
      v: ["m:Experience (", "p:SQL on Snowflake", "m:Looker dashboards", "m:Python for seller churn", "u", "u"],
      strength: "Builds Looker dashboards and churn models.",
      gap: "Notice period is 90 days.",
      evidence: "moderate", source: "careers", applied: 46,
      stage: "dropped", at: 44, by: "nisha", reason: "notice_too_long",
    },
    {
      name: "Divya Rao", city: "Bengaluru", gender: "female", born: 1995,
      jobs: [["Risk Analyst", "Northbridge Bank", "2019", "present", ["Build fraud detection reports for card transactions", "SQL with window functions on Oracle", "Python for anomaly detection", "Tableau dashboards for the risk committee"]]],
      edu: ["B.Sc, Mathematics", "Mount Carmel College", 2017], skills: "SQL, Oracle, Python, Tableau", years: 5, ctc: 17, expected: 23, notice: 60,
      v: ["m:Experience (", "m:SQL with window functions on Oracle", "m:Tableau dashboards for the risk", "m:Python for anomaly", "u", "m:fraud detection reports"],
      strength: "Builds fraud detection reports for card transactions at a bank.",
      gap: "Nothing on experiments.",
      evidence: "strong", source: "sourcing", applied: 30,
      stage: "dropped", at: 12, by: "nisha", reason: "role_closed",
      pool: true,
    },
    {
      name: "Sameer Qureshi", city: "Hyderabad", gender: "male", born: 1998,
      jobs: [["Analyst", "Tiffino", "2022", "present", ["Weekly sales reports in Excel and Google Sheets"]]],
      edu: ["BBA", "Osmania University", 2020], skills: "Excel, Google Sheets", years: 2, ctc: 7, expected: 10, notice: 30,
      v: ["n", "u", "u", "u", "u", "u"],
      strength: "Prepares weekly sales reports.",
      gap: "Two years of reporting; the role needs three years of analytics.",
      evidence: "weak", source: "naukri", applied: 47,
      stage: "dropped", at: 46, by: "vikram", reason: "missing_must_have",
    },
  ],
};

const ROLES = [BACKEND, DESIGNER, ANALYST];

const REASON_LABEL: Record<string, string> = {
  strong_match: "Strong match",
  worth_a_conversation: "Worth a conversation",
  missing_must_have: "Missing a must-have",
  below_bar: "Below the bar on requirements",
  comp_misaligned: "Compensation misaligned",
  notice_too_long: "Notice period too long",
  not_interested: "Candidate not interested",
  interview_feedback: "Interview feedback",
  someone_else: "Another candidate was chosen",
  role_closed: "Role closed or on hold",
  comparing: "Comparing with others",
  awaiting_answer: "Waiting on an answer",
};

const RATIONALE: Record<VerdictValue, string> = {
  met: "The quoted line is direct evidence for this.",
  partial: "Related experience, but not all of what this asks for.",
  not_met: "The CV covers this ground and does not show it.",
  unknown: "The CV does not say either way.",
};

// ---- Building it -------------------------------------------------------------------

const uuid = () => crypto.randomUUID();
const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

function cvLines(c: Cand, email: string) {
  const first = c.jobs[0];
  const lines = [c.name, `${first[0]}, ${first[1]} · ${c.city}`, [email, c.link].filter(Boolean).join(" · "), "", `Experience (${c.years} years)`];
  for (const [title, company, from, to, bullets] of c.jobs) {
    lines.push(`${title}, ${company} (${from} – ${to})`);
    for (const b of bullets) lines.push(`- ${b}`);
  }
  lines.push(
    "",
    "Education",
    `${c.edu[0]}, ${c.edu[1]}, ${c.edu[2]}`,
    "",
    `Skills: ${c.skills}`,
    `Notice period: ${c.notice} days · Current CTC: ₹${c.ctc} LPA · Expected: ₹${c.expected} LPA${c.relocate ? " · Willing to relocate" : ""}`,
  );
  return lines;
}

/** The CV line containing these words, as a quote. Throws if the demo data is wrong. */
function quoteOf(lines: string[], words: string, who: string) {
  const line = lines.find((l) => l.includes(words));
  if (!line) throw new Error(`Demo data: "${words}" is not in ${who}'s CV.`);
  return line.replace(/^- /, "");
}

function parseVerdict(spec: string, lines: string[], who: string): { verdict: VerdictValue; quote: string | null; support: Support | null } {
  const [body, flag] = spec.split("|");
  const [kind, ...rest] = body.split(":");
  const verdict = ({ m: "met", p: "partial", n: "not_met", u: "unknown" } as const)[kind as "m" | "p" | "n" | "u"];
  if (!verdict) throw new Error(`Demo data: bad verdict "${spec}" for ${who}.`);
  const words = rest.join(":");
  const quote = words ? quoteOf(lines, words, who) : null;
  const support: Support | null = verdict === "unknown" || verdict === "not_met" ? null : flag === "v" ? "verified" : "supported";
  return { verdict, quote, support };
}

const DECISION: Record<Stage, Decision> = {
  new: "none",
  screening: "none",
  shortlisted: "shortlisted",
  interviewing: "shortlisted",
  offer: "shortlisted",
  hired: "shortlisted",
  dropped: "dropped",
  on_hold: "held",
};

/**
 * Removes the demo company and its made-up team (anyone on the reserved
 * domain who belongs to no other company). Their audit entries stay, as the
 * audit log is append-only; they point at a company that is gone.
 */
async function removeDemo(tx: typeof db) {
  await tx.delete(orgs).where(eq(orgs.demo, true));
  const members = tx.select({ id: memberships.userId }).from(memberships);
  await tx.delete(users).where(and(like(users.email, `%@${DEMO_DOMAIN}`), notInArray(users.id, members)));
}

export async function findDemo() {
  return db.query.orgs.findFirst({ where: eq(orgs.demo, true) });
}

export async function deleteDemo() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('winnow-demo'))`);
    await removeDemo(tx as unknown as typeof db);
  });
}

/**
 * Builds the demo company from scratch, replacing any earlier one, in one
 * transaction so it is never half there. `viewer` is the operator building it,
 * who gets its notifications. Returns the new organisation's id.
 */
export async function buildDemo(viewer: string): Promise<string> {
  const now = Date.now();
  const ago = (days: number, minutes = 0) => new Date(now - days * DAY - minutes * MIN);

  return db.transaction(async (t) => {
    const tx = t as unknown as typeof db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('winnow-demo'))`);
    await removeDemo(tx);

    // The team: made-up people on the reserved domain, who cannot sign in.
    const team = Object.fromEntries((Object.keys(TEAM) as Who[]).map((k) => [k, uuid()])) as Record<Who, string>;
    await tx.insert(users).values((Object.keys(TEAM) as Who[]).map((k) => ({ id: team[k], name: TEAM[k].name, email: `${k}@${DEMO_DOMAIN}`, createdAt: ago(60) })));

    const orgId = uuid();
    await tx.insert(orgs).values({
      id: orgId,
      name: DEMO_NAME,
      domain: DEMO_DOMAIN,
      demo: true,
      careersEmail: `careers@${DEMO_DOMAIN}`,
      locations: ["Bengaluru", "Mumbai", "Remote (India)"],
      levelLadder: ["SDE 1", "SDE 2", "Senior", "Staff", "Principal"],
      compBands: [
        { level: "SDE 2", min: 2_200_000, max: 3_200_000 },
        { level: "Senior", min: 3_500_000, max: 5_000_000 },
        { level: "Staff", min: 5_500_000, max: 7_500_000 },
      ],
      plan: "growth",
      createdAt: ago(60),
    });
    await tx.insert(memberships).values((Object.keys(TEAM) as Who[]).map((k) => ({ orgId, userId: team[k], access: TEAM[k].access, seenAt: ago(0, 30), createdAt: ago(60) })));
    await tx.insert(companyFacts).values(
      BRAIN.map(([group, text], i) => ({ orgId, group, text, provenance: group === "past_hires" ? ("inferred" as const) : ("told" as const), confidence: group === "past_hires" ? 0.7 : 1, evidence: group === "past_hires" ? "From debriefs on three past senior hires." : null, key: group === "past_hires" ? "demo:past_hires" : null, updatedBy: group === "past_hires" ? null : team.meera, updatedAt: ago(58, i) })),
    );

    const rows = {
      persons: [] as (typeof persons.$inferInsert)[],
      identities: [] as (typeof personIdentities.$inferInsert)[],
      apps: [] as (typeof applications.$inferInsert)[],
      docs: [] as (typeof documents.$inferInsert)[],
      facts: [] as (typeof applicationFacts.$inferInsert)[],
      evals: [] as (typeof evaluations.$inferInsert)[],
      verdicts: [] as (typeof verdicts.$inferInsert)[],
      flags: [] as (typeof contradictions.$inferInsert)[],
      interviews: [] as (typeof interviews.$inferInsert)[],
      debriefs: [] as (typeof debriefs.$inferInsert)[],
      questions: [] as (typeof questions.$inferInsert)[],
      messages: [] as (typeof messages.$inferInsert)[],
      notes: [] as (typeof notes.$inferInsert)[],
      observations: [] as (typeof observations.$inferInsert)[],
      activity: [] as (typeof activity.$inferInsert)[],
      audit: [] as (typeof auditLog.$inferInsert)[],
      notifications: [] as (typeof notifications.$inferInsert)[],
    };
    const pooled: string[] = [];
    const act = (roleId: string, at: Date, kind: string, message: string, actor: string | null = null, costUsd = 0, detail: Record<string, unknown> = {}) =>
      rows.activity.push({ orgId, roleId, kind, message, actorId: actor, costUsd, detail, createdAt: at });
    const log = (roleId: string, at: Date, action: string, actor: string, entity: string, entityId: string, applicationId: string | null, detail: Record<string, unknown> = {}) =>
      rows.audit.push({ orgId, actorId: actor, action, entity, entityId, roleId, applicationId, rubricVersion: 1, detail, createdAt: at });

    for (const spec of ROLES) {
      const roleId = uuid();
      const created = ago(spec.created, 120);
      const manager = team[spec.manager];
      const sourceIds = Object.fromEntries(spec.sources.map((s) => [s.key, uuid()]));

      // Each candidate's arithmetic first, to rank them the way the scorer does.
      const people = spec.candidates.map((c, i) => {
        const email = `${slug(c.name)}@example.com`;
        const lines = cvLines(c, email);
        if (c.v.length !== spec.reqs.length) throw new Error(`Demo data: ${c.name} needs ${spec.reqs.length} verdicts.`);
        const vs = c.v.map((v, j) => ({ ...parseVerdict(v, lines, c.name), key: spec.reqs[j].key }));
        const flagged = c.contradiction ? 1 : 0;
        const a = arithmetic(
          spec.reqs.map((q) => ({ key: q.key, weight: q.weight, mustHave: !!q.must, text: q.text })),
          vs.map((v) => ({ requirementKey: v.key, verdict: v.verdict, support: v.support })),
          flagged,
        );
        const appliedAt = ago(c.applied, 60 + ((i * 97) % 600));
        return { c, i, email, lines, vs, a, appliedAt, appId: uuid(), personId: uuid(), docId: uuid(), evalId: uuid() };
      });
      const ranked = [...people].sort((x, y) => y.a.standing - x.a.standing || y.a.confidence - x.a.confidence || x.appliedAt.getTime() - y.appliedAt.getTime());
      const n = ranked.length;
      const rankOf = (p: (typeof people)[number]) => ranked.indexOf(p) + 1;
      const hired = people.find((p) => p.c.stage === "hired");

      await tx.insert(roles).values({
        id: roleId,
        orgId,
        title: spec.title,
        family: spec.family,
        locations: spec.locations,
        openings: spec.openings,
        targetDate: spec.target != null ? new Date(now + spec.target * DAY).toISOString().slice(0, 10) : null,
        compMin: spec.comp?.[0] ?? null,
        compMax: spec.comp?.[1] ?? null,
        compShareable: true,
        hiringManagerId: manager,
        sources: [...new Set(spec.sources.map((s) => s.kind))],
        jdText: spec.jd,
        intakeNotes: spec.intake,
        state: spec.closed != null ? "closed" : "open",
        closeReason: spec.closed != null ? "filled" : null,
        hiredApplicationId: hired?.appId ?? null,
        rubricVersion: 1,
        rubricReviewedAt: ago(spec.created - 1),
        lastChangeAt: spec.closed != null ? ago(spec.closed) : ago(0, 90),
        createdBy: team.meera,
        createdAt: created,
        closedAt: spec.closed != null ? ago(spec.closed) : null,
      });
      const [rv] = await tx.insert(rubricVersions).values({ roleId, version: 1, origin: "initial", summary: "Built from the job description", createdAt: ago(spec.created, 110) }).returning();
      await tx.insert(requirements).values(
        spec.reqs.map((q, i) => ({ rubricVersionId: rv.id, key: q.key, position: i, text: q.text, weight: q.weight, mustHave: !!q.must, sourceSentence: q.source, origin: q.origin, keywords: q.keywords, minYears: q.minYears ?? null })),
      );
      if (spec.refused.length) await tx.insert(refusedCriteria).values(spec.refused.map((r) => ({ rubricVersionId: rv.id, ...r })));
      if (spec.noticeFilter) await tx.insert(hardFilters).values({ roleId, field: "notice_period_days", op: "lte", value: spec.noticeFilter, active: false, createdAt: ago(spec.created, 110) });
      await tx.insert(roleSources).values(spec.sources.map((s) => ({ id: sourceIds[s.key], roleId, kind: s.kind, label: s.label, costInr: s.cost, lastRunAt: ago(1), createdAt: created })));

      log(roleId, created, "role.create", team.meera, "role", roleId, null);
      log(roleId, ago(spec.created - 1), "rubric.review", manager, "role", roleId, null);
      act(roleId, created, "role_created", "Role created", team.meera);
      act(roleId, ago(spec.created, 110), "rubric_built", `Built the rubric: ${spec.reqs.length} requirements, ${spec.refused.length} criteria refused`, null, 0.031);
      if (spec.sources.some((s) => s.kind === "winnow_sourcing")) act(roleId, ago(spec.created, 100), "sourcing_requested", "Asked Winnow to source candidates", team.meera);

      for (const p of people) {
        const { c, appId, personId, docId, evalId, lines, vs, a, appliedAt } = p;
        const text = lines.join("\n");
        const stage = c.stage ?? "new";
        const decision = DECISION[stage];
        const decidedAt = decision === "none" ? null : decision === "shortlisted" ? ago(c.sl ?? c.at ?? 0, 200) : ago(c.at ?? 0, 180);
        const lastStep = c.steps?.length ? c.steps[c.steps.length - 1][1] : null;
        const stageChangedAt = stage === "new" ? appliedAt : decision === "shortlisted" && lastStep != null ? ago(lastStep, 150) : decidedAt!;
        const reason = decision === "shortlisted" ? (c.slReason ?? c.reason ?? "worth_a_conversation") : c.reason ?? null;
        const snapshot = { score: a.score, rank: rankOf(p), band: a.band, confidence: Math.round(a.confidence * 100) / 100, reason: [c.strength, c.gap] };
        const replied = c.question?.answer ? ago(0, (c.question.answeredHours ?? 1) * 60) : null;

        rows.persons.push({ id: personId, orgId, name: c.name, email: p.email, city: c.city, links: c.link ? [`https://${c.link}`] : [], consent: "given", consentAt: appliedAt, createdAt: appliedAt });
        rows.identities.push({ personId, kind: "email", value: p.email });
        rows.apps.push({
          id: appId,
          orgId,
          roleId,
          personId,
          source: spec.sources.find((s) => s.key === c.source)!.kind,
          sourceId: sourceIds[c.source],
          referredBy: c.referredBy ?? null,
          appliedAt,
          stage,
          stageChangedAt,
          decision,
          reasonCode: reason,
          decisionNote: c.note ?? null,
          decidedBy: decision === "none" ? null : team[c.by ?? "meera"],
          decidedAt,
          acceptedAt: stage === "hired" ? ago(c.steps?.find((s) => s[0] === "stage.hired")?.[1] ?? 0, 150) : null,
          joinedAt: stage === "hired" ? ago(c.steps?.find((s) => s[0] === "stage.joined")?.[1] ?? 0, 150) : null,
          protectedAttrs: { gender: c.gender ?? null, birthYear: c.born ?? null },
          managerSeenAt: c.seen != null ? ago(c.seen, 100) : null,
          parseStatus: "parsed",
          interest: c.question?.answer ? "interested" : "unknown",
          lastReplyAt: replied,
          replyReadAt: null,
          createdAt: appliedAt,
        });
        rows.docs.push({ id: docId, orgId, personId, applicationId: appId, roleId, kind: "cv", filename: `${c.name.replace(/ /g, "_")}_CV.pdf`, mime: "application/pdf", size: 38_000 + text.length * 9, text, parseStatus: "parsed", createdAt: appliedAt });

        const [job] = c.jobs;
        const head = quoteOf(lines, `${job[0]}, ${job[1]} (`, c.name);
        const exp = quoteOf(lines, "Experience (", c.name);
        const edu = quoteOf(lines, c.edu[1], c.name);
        const pay = quoteOf(lines, "Notice period:", c.name);
        const fact = (field: string, value: string, quote: string, num: number | null = null) => rows.facts.push({ applicationId: appId, field, value, num, stated: true, quote, documentId: docId });
        fact("current_title", job[0], head);
        fact("current_company", job[1], head);
        fact("years_experience", `${c.years} years`, exp, c.years);
        fact("city", c.city, lines[1]);
        fact("institution", c.edu[1], edu);
        fact("degree", c.edu[0], edu);
        fact("graduation_year", String(c.edu[2]), edu, c.edu[2]);
        fact("current_ctc", `₹${c.ctc} LPA`, pay, c.ctc * 100_000);
        fact("expected_ctc", `₹${c.expected} LPA`, pay, c.expected * 100_000);
        fact("notice_period_days", `${c.notice} days`, pay, c.notice);
        if (c.relocate) fact("willing_to_relocate", "Yes", pay);

        const scoredAt = new Date(appliedAt.getTime() + 6 * MIN);
        const open = vs.filter((v) => v.verdict === "unknown" || v.verdict === "partial").map((v) => spec.reqs.find((q) => q.key === v.key)!);
        const suggestions = [...(c.asks ?? []).map(([requirementKey, text]) => ({ requirementKey, text })), ...open.map((q) => ({ requirementKey: q.key, text: q.ask }))].slice(0, 3);
        rows.evals.push({
          id: evalId,
          applicationId: appId,
          roleId,
          rubricVersion: 1,
          status: "done",
          score: a.score,
          confidence: Math.round(a.confidence * 100) / 100,
          band: a.band,
          rank: rankOf(p),
          percentile: n === 1 ? 100 : Math.round((100 * (n - rankOf(p))) / (n - 1)),
          reasonStrength: c.strength,
          reasonGap: c.gap,
          mustHavesMet: a.mustMet,
          mustHavesTotal: a.mustTotal,
          evidenceStrength: c.evidence,
          pointsEarned: a.pointsEarned,
          pointsAvailable: a.pointsAvailable,
          suggestions,
          costUsd: 0.012,
          model: MODEL,
          createdAt: scoredAt,
          scoredAt,
        });
        for (const v of vs) {
          const q = spec.reqs.find((r) => r.key === v.key)!;
          rows.verdicts.push({ evaluationId: evalId, requirementKey: v.key, verdict: v.verdict, quote: v.quote, documentId: docId, position: v.quote ? text.indexOf(v.quote) : null, retrievedAt: scoredAt, support: v.support, contribution: contribution(q.weight, v.verdict), rationale: RATIONALE[v.verdict] });
        }
        if (c.contradiction) {
          const [kind, x, y] = c.contradiction;
          rows.flags.push({ applicationId: appId, kind, quoteA: quoteOf(lines, x, c.name), sourceA: `${c.name.replace(/ /g, "_")}_CV.pdf`, quoteB: quoteOf(lines, y, c.name), sourceB: `${c.name.replace(/ /g, "_")}_CV.pdf`, createdAt: scoredAt });
          rows.notifications.push({ orgId, userId: viewer, type: "contradiction", title: `Contradiction flagged on ${c.name}`, href: `/console/c/${appId}#contradictions`, createdAt: scoredAt });
        }

        act(roleId, new Date(appliedAt.getTime() + 3 * MIN), "parsed", `Read ${c.name.replace(/ /g, "_")}_CV.pdf`, null, 0.004, { applicationId: appId, personId });
        act(roleId, scoredAt, "scored", `Scored ${c.name} against rubric v1`, null, 0.012, { applicationId: appId });

        // Decisions, in the order they happened.
        const decide = (kind: "shortlisted" | "dropped" | "held", at: Date, code: string, from: Stage, by: Who) => {
          log(roleId, at, `decision.${kind}`, team[by], "application", appId, appId, { stage: from, reasonCode: code, note: kind === "shortlisted" ? null : c.note ?? null, evaluation: snapshot });
          rows.observations.push({ orgId, kind: "decision", personId, applicationId: appId, roleId, payload: { decision: kind, reasonCode: code, note: c.note ?? null, rubricVersion: 1, evaluation: snapshot }, createdBy: team[by], createdAt: at });
          act(roleId, at, "decision", `${{ shortlisted: "Shortlisted", dropped: "Dropped", held: "Held" }[kind]} 1 (${REASON_LABEL[code] ?? code})`, team[by], 0, { ids: [appId] });
        };
        const by = c.by ?? "meera";
        if (decision === "shortlisted" || c.sl != null) decide("shortlisted", ago(c.sl ?? c.at ?? 0, 200), c.slReason ?? c.reason ?? "worth_a_conversation", "new", by);
        for (const [action, days] of c.steps ?? []) {
          const at = ago(days, 150);
          log(roleId, at, action, team[by], "application", appId, appId);
          if (action === "stage.hired") rows.observations.push({ orgId, kind: "outcome", personId, applicationId: appId, roleId, payload: { hired: true }, createdBy: team[by], createdAt: at });
          act(roleId, at, "stage", action === "stage.joined" ? `${c.name} joined` : `${c.name}: ${action.slice(6)}`, team[by]);
        }
        if (decision === "dropped") decide("dropped", ago(c.at ?? 0, 180), c.reason ?? "other", c.steps?.length ? "interviewing" : c.sl != null ? "shortlisted" : "new", by);
        if (decision === "held") decide("held", ago(c.at ?? 0, 180), c.reason ?? "comparing", "new", by);
        if (stage === "shortlisted" && c.seen == null && spec.manager !== by)
          rows.notifications.push({ orgId, userId: viewer, type: "shortlist_ready", title: `1 shortlisted for ${spec.title}`, href: `/console/roles/${roleId}?view=shortlisted`, createdAt: decidedAt! });

        for (const iv of c.interviews ?? []) {
          const id = uuid();
          const start = new Date(now + iv.d * DAY);
          start.setUTCHours(iv.d < 0 ? 6 : 8, 30, 0, 0);
          const end = new Date(start.getTime() + 45 * MIN);
          rows.interviews.push({ id, applicationId: appId, roleId, interviewerId: team[iv.by], title: iv.title, startAt: start, endAt: end, status: iv.d < 0 ? "done" : "scheduled", createdAt: ago(Math.max(iv.d < 0 ? -iv.d + 3 : 2, 0)) });
          act(roleId, ago(Math.max(iv.d < 0 ? -iv.d + 3 : 2, 0)), "interview_booked", `Interview with ${c.name}: ${iv.title}`, team.meera, 0, { applicationId: appId });
          if (iv.debrief) {
            const [wouldHire, strongest, concern] = iv.debrief;
            const at = new Date(end.getTime() + 3 * 60 * MIN);
            rows.debriefs.push({ interviewId: id, applicationId: appId, authorId: team[iv.by], wouldHire, strongest, concern, createdAt: at });
            rows.observations.push({ orgId, kind: "debrief", personId, applicationId: appId, roleId, payload: { wouldHire, strongest, concern, interviewId: id }, createdBy: team[iv.by], createdAt: at });
            act(roleId, at, "debrief", `Debrief on ${c.name}: ${wouldHire.replace("_", " ")}`, team[iv.by]);
          } else {
            rows.notifications.push({ orgId, userId: viewer, type: "interview_booked", title: `${c.name}: ${iv.title} is booked`, href: `/console/roles/${roleId}/interviews`, createdAt: ago(1) });
          }
        }

        if (c.question) {
          const q = c.question;
          const sent = ago(q.sent, 240);
          const batchId = uuid();
          rows.questions.push({ applicationId: appId, roleId, kind: "question", requirementKey: q.req, text: q.text, status: q.answer ? "answered" : "sent", batchId, token: uuid().replace(/-/g, ""), sentAt: sent, answer: q.answer ?? null, answeredAt: replied, createdBy: team.vikram, createdAt: sent });
          rows.messages.push({ applicationId: appId, direction: "out", channel: "email", subject: `A question about your application to ${spec.title} at Acme Payments`, body: `Hi ${c.name.split(" ")[0]},\n\nThanks for applying. Before we go further, one question:\n\n${q.text}\n\nYou can answer from the link below.\n\nAcme Payments, via Winnow`, fromAddress: `careers@${DEMO_DOMAIN}`, sentBy: team.vikram, createdAt: sent });
          act(roleId, sent, "questions_sent", `Sent 1 question to ${c.name}`, team.vikram, 0, { applicationId: appId });
          if (q.answer && replied) {
            rows.messages.push({ applicationId: appId, direction: "in", channel: "reply_page", body: q.answer, createdAt: replied });
            rows.observations.push({ orgId, kind: "answer", personId, applicationId: appId, roleId, payload: { answers: [{ question: q.text, answer: q.answer }] }, createdAt: replied });
            act(roleId, replied, "candidate_replied", `${c.name} answered a question`, null, 0, { applicationId: appId });
            rows.notifications.push({ orgId, userId: viewer, type: "candidate_replied", title: `${c.name} replied`, href: `/console/c/${appId}#communication`, createdAt: replied });
          }
        }
        for (const [who, days, body] of c.notes ?? []) {
          const mentions = (Object.keys(TEAM) as Who[]).filter((k) => body.includes(`@${TEAM[k].name.split(" ")[0]}`)).map((k) => team[k]);
          rows.notes.push({ applicationId: appId, authorId: team[who], body, mentions, createdAt: ago(days, 30) });
        }
        if (c.pool) pooled.push(personId);
      }

      if (spec.closed != null && hired) {
        const at = ago(spec.closed, 100);
        log(roleId, at, "role.close", manager, "role", roleId, null, { reason: "filled", hired: [hired.appId], note: null });
        act(roleId, at, "role_closed", `Closed the role: filled by ${hired.c.name}`, manager);
      }
    }

    const insert = async <T>(table: Parameters<typeof tx.insert>[0], values: T[]) => {
      for (let i = 0; i < values.length; i += 200) await tx.insert(table).values(values.slice(i, i + 200) as never);
    };
    await insert(persons, rows.persons);
    await insert(personIdentities, rows.identities);
    await insert(applications, rows.apps);
    await insert(documents, rows.docs);
    await insert(applicationFacts, rows.facts);
    await insert(evaluations, rows.evals);
    await insert(verdicts, rows.verdicts);
    await insert(contradictions, rows.flags);
    await insert(interviews, rows.interviews);
    await insert(debriefs, rows.debriefs);
    await insert(questions, rows.questions);
    await insert(messages, rows.messages);
    await insert(notes, rows.notes);
    await insert(observations, rows.observations);
    await insert(activity, rows.activity);
    await insert(auditLog, rows.audit);
    await insert(notifications, rows.notifications);

    if (pooled.length) {
      const [pool] = await tx.insert(talentPools).values({ orgId, name: "Analytics silver medallists", createdBy: team.nisha, createdAt: ago(12) }).returning();
      await tx.insert(talentPoolMembers).values(pooled.map((personId) => ({ poolId: pool.id, personId, addedBy: team.nisha, addedAt: ago(12) })));
    }
    return orgId;
  });
}
