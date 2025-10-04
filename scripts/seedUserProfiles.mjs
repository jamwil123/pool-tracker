// Seed userProfiles from users collection using Firebase Admin SDK
// Usage:
//   1) Install dependency: npm i firebase-admin
//   2) Set credentials (one of):
//        - export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
//        - or set FIREBASE_SERVICE_ACCOUNT to JSON string or path
//   3) Optionally set flags:
//        - DRY_RUN=1 to preview without writes
//        - OVERWRITE=1 to overwrite existing userProfiles
//        - LINK_UP=1 to also backfill linkedProfileUid on users/players
//   4) Run: npm run seed:userProfiles

import fs from "node:fs";
import path from "node:path";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

let PROJECT_ID_HINT;

function loadServiceAccount() {
  const env = process.env;
  // Prefer GOOGLE_APPLICATION_CREDENTIALS path for ADC
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const json = JSON.parse(
        fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
      );
      if (json && typeof json.project_id === "string")
        PROJECT_ID_HINT = json.project_id;
    } catch {}
    return applicationDefault();
  }

  // Optional: FIREBASE_SERVICE_ACCOUNT can be a path or a JSON string
  const svc = env.FIREBASE_SERVICE_ACCOUNT;
  if (!svc) return applicationDefault();

  try {
    // If it looks like JSON, parse it
    const maybeJson = svc.trim();
    if (maybeJson.startsWith("{")) {
      const json = JSON.parse(maybeJson);
      if (json && typeof json.project_id === "string")
        PROJECT_ID_HINT = json.project_id;
      return cert(json);
    }
    // Otherwise treat as a file path
    const p = path.resolve(process.cwd(), maybeJson);
    const json = JSON.parse(fs.readFileSync(p, "utf8"));
    if (json && typeof json.project_id === "string")
      PROJECT_ID_HINT = json.project_id;
    return cert(json);
  } catch (err) {
    console.warn(
      "Failed to load FIREBASE_SERVICE_ACCOUNT; falling back to ADC:",
      err?.message
    );
    return applicationDefault();
  }
}

// Initialize Admin app
const credential = loadServiceAccount();
const projectId =
  process.env.VITE_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  PROJECT_ID_HINT;

const app = initializeApp({ credential, projectId });

const db = getFirestore(app);

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const OVERWRITE =
  process.env.OVERWRITE === "1" || process.env.OVERWRITE === "true";
const LINK_UP = process.env.LINK_UP === "1" || process.env.LINK_UP === "true";

const serverTimestamp = FieldValue.serverTimestamp();

const normalizeRole = (role) => {
  if (role === "captain" || role === "viceCaptain" || role === "player")
    return role;
  return "player";
};

const trimName = (name, fallback) => {
  if (typeof name === "string") {
    const t = name.trim();
    if (t.length) return t;
  }
  return fallback;
};

async function seed() {
  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} users to consider`);

  let creates = 0;
  let updates = 0;
  let skipped = 0;
  let linked = 0;

  let batch = db.batch();
  let ops = 0;

  for (const docSnap of usersSnap.docs) {
    const rosterId = docSnap.id;
    const u = docSnap.data() || {};
    const assignedUid = u.assignedUid;

    if (
      !assignedUid ||
      typeof assignedUid !== "string" ||
      !assignedUid.trim()
    ) {
      skipped++;
      continue;
    }

    const profileRef = db.collection("userProfiles").doc(assignedUid);
    const existing = await profileRef.get();

    if (existing.exists && !OVERWRITE) {
      skipped++;
      continue;
    }

    const playerSnap = await db.collection("players").doc(rosterId).get();
    const player = playerSnap.exists ? playerSnap.data() : null;

    const displayName = trimName(u.displayName, rosterId);
    const role = normalizeRole(u.role);
    const totalWins = player?.wins ?? 0;
    const totalLosses = player?.losses ?? 0;
    const subsStatus = player?.subsStatus === "paid" ? "paid" : "due";

    const profileDoc = {
      displayName,
      role,
      linkedRosterId: rosterId,
      linkedPlayerId: player ? rosterId : null,
      totalWins,
      totalLosses,
      subsStatus,
      createdAt: serverTimestamp,
      updatedAt: serverTimestamp,
    };

    if (DRY_RUN) {
      console.log(
        `[DRY_RUN] ${
          existing.exists ? "update" : "create"
        } userProfiles/${assignedUid}`,
        profileDoc
      );
    } else {
      batch.set(profileRef, profileDoc, { merge: OVERWRITE });
      ops++;
      if (existing.exists) updates++;
      else creates++;
    }

    if (LINK_UP && !DRY_RUN) {
      const rosterRef = db.collection("users").doc(rosterId);
      // Ensure linkedProfileUid matches assignedUid
      batch.set(
        rosterRef,
        {
          linkedProfileUid: assignedUid,
          assignedUid,
          assignedEmail: u.assignedEmail ?? null,
          assignedAt: u.assignedAt ?? serverTimestamp,
        },
        { merge: true }
      );
      ops++;

      if (playerSnap.exists) {
        const playerRef = db.collection("players").doc(rosterId);
        batch.set(
          playerRef,
          {
            linkedProfileUid: assignedUid,
            updatedAt: serverTimestamp,
            subsStatus: player?.subsStatus ?? "due",
          },
          { merge: true }
        );
        ops++;
      }
      linked++;
    }

    // Commit in chunks to avoid 500-op limit; keep some headroom
    if (ops >= 400 && !DRY_RUN) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (!DRY_RUN && ops > 0) {
    await batch.commit();
  }

  console.log(
    DRY_RUN
      ? `DRY_RUN complete. Would create: ${creates}, update: ${updates}, link-up updates: ${linked}, skipped: ${skipped}`
      : `Seeding complete. Created: ${creates}, updated: ${updates}, link-up updates: ${linked}, skipped: ${skipped}`
  );
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
