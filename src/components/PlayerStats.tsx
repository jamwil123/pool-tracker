import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import type { PlayerDocument, Role, RosterDocument } from "../types/models";

type PlayerRecord = PlayerDocument & { id: string };

type PlayerFormState = {
  displayName: string;
  role: Role;
};

type UserProfile = {
  displayName?: string;
  totalWins?: number;
  totalLosses?: number;
  subsStatus?: "paid" | "due";
  // whatever else you store
};

const defaultPlayerForm: PlayerFormState = {
  displayName: "",
  role: "player",
};

const createPlayerSkeleton = (displayName: string): PlayerDocument => ({
  displayName,
  wins: 0,
  losses: 0,
  subsStatus: "due",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  linkedProfileUid: null,
});

const createRosterSkeleton = (
  displayName: string,
  role: Role
): RosterDocument => ({
  displayName,
  role,
  assignedUid: null,
  assignedEmail: null,
  assignedAt: null,
  createdAt: serverTimestamp(),
  linkedProfileUid: null,
});

// Try to resolve a UID off your AuthContext profile.
// Adjust this if your shape is different.
const resolveUid = (profile: any | null | undefined): string | null => {
  if (!profile) return null;
  return profile.uid ?? profile.id ?? null;
};

const PlayerStats = () => {
  const { profile } = useAuth();
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [formState, setFormState] =
    useState<PlayerFormState>(defaultPlayerForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // NEW: logged-in user's profile doc
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);

  // Subscribe to all players (kept for admin controls and list)
  useEffect(() => {
    const playersQuery = query(
      collection(db, "players"),
      orderBy("displayName", "asc")
    );

    const unsubscribe = onSnapshot(
      playersQuery,
      (snapshot) => {
        const nextPlayers: PlayerRecord[] = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as Partial<PlayerDocument>;
          return {
            id: docSnapshot.id,
            displayName: data.displayName ?? "Unknown Player",
            wins: typeof data.wins === "number" ? data.wins : 0,
            losses: typeof data.losses === "number" ? data.losses : 0,
            subsStatus: data.subsStatus === "paid" ? "paid" : "due",
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
            subsUpdatedAt: data.subsUpdatedAt ?? null,
            linkedProfileUid: data.linkedProfileUid ?? null,
          };
        });
        setPlayers(nextPlayers);
      },
      (snapshotError) => {
        console.error("Failed to load players", snapshotError);
        setError("Unable to load players.");
      }
    );

    return () => unsubscribe();
  }, []);

  // NEW: subscribe to the logged-in user's userProfiles/{uid}
  useEffect(() => {
    const uid = resolveUid(profile);
    if (!uid) return;

    const ref = doc(db, "userProfiles", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setMyProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      },
      (err) => {
        console.error("Failed to load user profile", err);
      }
    );
    return () => unsub();
  }, [profile]);

  const canManagePlayers = useMemo(() => {
    if (!profile) return false;
    return profile.role === "captain" || profile.role === "viceCaptain";
  }, [profile]);

  const handleAddPlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManagePlayers) return;

    const trimmedName = formState.displayName.trim();
    if (!trimmedName) {
      setError("Enter a player name before saving.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
        const rosterRef = doc(db, "users", trimmedName);
        const playerRef = doc(db, "players", trimmedName);

        const rosterSnapshot = await transaction.get(rosterRef);
        const playerSnapshot = await transaction.get(playerRef);

        if (rosterSnapshot.exists()) {
          throw new Error(
            "A roster entry with that name already exists. Choose a different name."
          );
        }

        if (playerSnapshot.exists()) {
          throw new Error(
            "A player record with that name already exists. Choose a different name."
          );
        }

        transaction.set(playerRef, createPlayerSkeleton(trimmedName));
        transaction.set(
          rosterRef,
          createRosterSkeleton(trimmedName, formState.role)
        );
      });

      setShowForm(false);
      setFormState(defaultPlayerForm);
    } catch (createError) {
      console.error("Failed to add player", createError);
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to add player. Try again later."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordResult = async (
    playerId: string,
    result: "win" | "loss"
  ) => {
    if (!canManagePlayers) return;

    const targetPlayer = players.find((player) => player.id === playerId);

    try {
      const playerRef = doc(db, "players", playerId);
      const playerUpdates: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (result === "win") {
        playerUpdates.wins = increment(1);
      } else {
        playerUpdates.losses = increment(1);
      }
      await updateDoc(playerRef, playerUpdates);

      if (targetPlayer?.linkedProfileUid) {
        const profileRef = doc(
          db,
          "userProfiles",
          targetPlayer.linkedProfileUid
        );
        const profileUpdates: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
        };
        if (result === "win") {
          profileUpdates.totalWins = increment(1);
        } else {
          profileUpdates.totalLosses = increment(1);
        }
        await updateDoc(profileRef, profileUpdates);
      }
    } catch (updateError) {
      console.error("Failed to record result", updateError);
      setError("Could not update player record.");
    }
  };

  const handleToggleSubsStatus = async (
    playerId: string,
    currentStatus: "paid" | "due"
  ) => {
    if (!canManagePlayers) return;

    const targetPlayer = players.find((player) => player.id === playerId);
    const nextStatus = currentStatus === "paid" ? "due" : "paid";

    try {
      const playerRef = doc(db, "players", playerId);
      await updateDoc(playerRef, {
        subsStatus: nextStatus,
        subsUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (targetPlayer?.linkedProfileUid) {
        const profileRef = doc(
          db,
          "userProfiles",
          targetPlayer.linkedProfileUid
        );
        await updateDoc(profileRef, {
          subsStatus: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (toggleError) {
      console.error("Failed to update subs status", toggleError);
      setError("Could not update the subs status.");
    }
  };

  // CHANGED: chart data now shows the LOGGED-IN user's wins/losses from userProfiles
  const myWins = myProfile?.totalWins ?? 0;
  const myLosses = myProfile?.totalLosses ?? 0;
  const chartData = [
    { name: myProfile?.displayName ?? "Me", wins: myWins, losses: myLosses },
  ];

  return (
    <section className="panel">
      <header>
        <h2>Player Performance</h2>
        <p>Track wins, losses, and weekly subs.</p>
      </header>
      {error ? <p className="error">{error}</p> : null}

      {/* Optional: show a small card with the user's own numbers */}
      {myProfile && (
        <div className="card">
          <h3>My Stats</h3>
          <p>
            {myProfile.displayName ?? "Me"} — {myWins} wins · {myLosses} losses
          </p>
          <span className={`tag subs-${myProfile.subsStatus ?? "due"}`}>
            Subs {myProfile.subsStatus === "paid" ? "paid" : "due"}
          </span>
        </div>
      )}

      <div className="card">
        <h3>My Wins vs Losses</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="wins" fill="#16a34a" name="Wins" />
              <Bar dataKey="losses" fill="#dc2626" name="Losses" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Keep admin features and full list below */}
      {canManagePlayers ? (
        <div className="card">
          <header className="card-header">
            <h3>Add Player</h3>
            <button type="button" onClick={() => setShowForm((prev) => !prev)}>
              {showForm ? "Close Form" : "New Player"}
            </button>
          </header>
          {showForm ? (
            <form className="form-inline" onSubmit={handleAddPlayer}>
              <label htmlFor="displayName">Name</label>
              <input
                id="displayName"
                type="text"
                value={formState.displayName}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    displayName: event.target.value,
                  }))
                }
                required
              />
              <label htmlFor="role">Role</label>
              <select
                id="role"
                value={formState.role}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    role: event.target.value as Role,
                  }))
                }
              >
                <option value="player">Player</option>
                <option value="viceCaptain">Vice Captain</option>
                <option value="captain">Captain</option>
              </select>
              <p className="hint">
                Creates a roster entry in <code>users</code> and a stats record
                in <code>players</code> with default values.
              </p>
              <button type="submit" disabled={submitting}>
                {submitting ? "Adding…" : "Add Player"}
              </button>
            </form>
          ) : (
            <p className="hint">Use the button to add a new squad member.</p>
          )}
        </div>
      ) : (
        <p className="hint">
          Only the captain or vice captain can add or update players.
        </p>
      )}

      <div className="list">
        {players.length === 0 ? (
          <p>No players yet. Add someone to get started.</p>
        ) : null}
        {players.map((player) => (
          <article key={player.id} className="card">
            <header className="card-header">
              <div>
                <h3>{player.displayName}</h3>
                <p>
                  {player.wins} wins · {player.losses} losses
                </p>
              </div>
              <span className={`tag subs-${player.subsStatus}`}>
                Subs {player.subsStatus === "paid" ? "paid" : "due"}
              </span>
            </header>
            {canManagePlayers ? (
              <div className="actions">
                <button
                  type="button"
                  onClick={() => handleRecordResult(player.id, "win")}
                >
                  Add Win
                </button>
                <button
                  type="button"
                  onClick={() => handleRecordResult(player.id, "loss")}
                >
                  Add Loss
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleToggleSubsStatus(player.id, player.subsStatus)
                  }
                >
                  {player.subsStatus === "paid"
                    ? "Mark Subs Due"
                    : "Mark Subs Paid"}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};

export default PlayerStats;
