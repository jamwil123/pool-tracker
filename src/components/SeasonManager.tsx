import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { isManagerRole } from "../types/models";
import { TEAM_NAME } from "../config/app";
import { useAuth } from "../context/AuthContext";
import type {
  PlayerDocument,
  SeasonGameDocument,
  SeasonGamePlayerStat,
  UserProfileDocument,
} from "../types/models";

type SeasonGame = SeasonGameDocument & { id: string };

type MatchFormState = {
  opponent: string;
  matchDate: string;
  location: string;
  homeOrAway: "home" | "away";
};

type MatchFilter = "upcoming" | "previous";

type PlayerOption = {
  id: string;
  displayName: string;
};

type PlayerStatRow = {
  rowId: string;
  playerId: string;
  singlesWins: number;
  singlesLosses: number;
  doublesWins: number;
  doublesLosses: number;
};

const MAX_SINGLES = 2;
const MAX_DOUBLES = 1;

const defaultFormState: MatchFormState = {
  opponent: "",
  matchDate: "",
  location: "",
  homeOrAway: "home",
};

const createRowId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

const sanitizePlayerStats = (value: unknown): SeasonGamePlayerStat[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const stat = entry as Partial<SeasonGamePlayerStat>;
      if (
        !stat.playerId ||
        typeof stat.playerId !== "string" ||
        stat.playerId.trim().length === 0
      ) {
        return null;
      }
      const displayName =
        typeof stat.displayName === "string" &&
        stat.displayName.trim().length > 0
          ? stat.displayName.trim()
          : stat.playerId;

      return {
        playerId: stat.playerId,
        displayName,
        singlesWins: clamp(Number(stat.singlesWins ?? 0), MAX_SINGLES),
        singlesLosses: clamp(Number(stat.singlesLosses ?? 0), MAX_SINGLES),
        doublesWins: clamp(Number(stat.doublesWins ?? 0), MAX_DOUBLES),
        doublesLosses: clamp(Number(stat.doublesLosses ?? 0), MAX_DOUBLES),
      };
    })
    .filter((stat): stat is SeasonGamePlayerStat => stat !== null);
};

// --- date helpers for sorting ---
const getMatchTime = (game: SeasonGame): number | null =>
  game.matchDate instanceof Timestamp ? game.matchDate.toMillis() : null;

const nowMs = () => Date.now();

// Try to resolve a UID from your AuthContext profile (adjust if your shape differs)
const resolveUid = (profile: any | null | undefined): string | null => {
  if (!profile) return null;
  return profile.uid ?? profile.id ?? null;
};

const SeasonManager = () => {
  const { profile } = useAuth();
  const [games, setGames] = useState<SeasonGame[]>([]);
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MatchFilter>("upcoming");
  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState<MatchFormState>(defaultFormState);
  const [submitting, setSubmitting] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [rows, setRows] = useState<PlayerStatRow[]>([]);
  const [statsSubmitting, setStatsSubmitting] = useState(false);

  // NEW: logged-in user's profile (to show wins/losses)
  const [myProfile, setMyProfile] = useState<UserProfileDocument | null>(null);

  useEffect(() => {
    const gamesQuery = query(
      collection(db, "games"),
      orderBy("matchDate", "asc")
    );

    const unsubscribe = onSnapshot(
      gamesQuery,
      (snapshot) => {
        const nextGames: SeasonGame[] = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as Partial<SeasonGameDocument>;
          return {
            id: docSnapshot.id,
            opponent: data.opponent ?? "TBC",
            matchDate: data.matchDate ?? null,
            location: data.location ?? "",
            homeOrAway: data.homeOrAway === "away" ? "away" : "home",
            players: Array.isArray(data.players) ? data.players : [],
            playerStats: sanitizePlayerStats(data.playerStats ?? []),
            result:
              data.result === "win" || data.result === "loss"
                ? data.result
                : "pending",
            notes: data.notes ?? null,
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        setGames(nextGames);
        setError(null);
      },
      (snapshotError) => {
        console.error("Failed to load games", snapshotError);
        setError("Unable to load matches right now.");
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const profilesQuery = query(
      collection(db, "userProfiles"),
      orderBy("displayName", "asc")
    );

    const unsubscribe = onSnapshot(
      profilesQuery,
      (snapshot) => {
        const options: PlayerOption[] = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as { displayName?: string };
          const displayName =
            typeof data.displayName === "string" &&
            data.displayName.trim().length > 0
              ? data.displayName.trim()
              : docSnapshot.id;
          return {
            id: docSnapshot.id,
            displayName,
          };
        });
        options.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setPlayerOptions(options);
      },
      (snapshotError) => {
        console.error(
          "Failed to load user profiles for match results",
          snapshotError
        );
      }
    );

    return () => unsubscribe();
  }, []);

  // NEW: subscribe to logged-in user's profile by uid field (auto-id docs)
  useEffect(() => {
    const uid = resolveUid(profile);
    if (!uid) return;
    const q = query(collection(db, 'userProfiles'), where('uid', '==', uid), limit(1))
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) setMyProfile(snap.docs[0].data() as UserProfileDocument)
      else setMyProfile(null)
    }, (err) => {
      console.error("Failed to load user profile", err);
    })
    return () => unsub();
  }, [profile]);

  const canManageGames = useMemo(() => !!profile && isManagerRole(profile.role), [profile]);

  // Upcoming = date >= now OR pending-without-date; sort soonest first, nulls last
  const upcomingGames = useMemo(() => {
    const now = nowMs();
    const list = games.filter((game) => {
      const t = getMatchTime(game);
      return t !== null ? t >= now : game.result === "pending";
    });

    return list.sort((a, b) => {
      const ta = getMatchTime(a);
      const tb = getMatchTime(b);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1; // nulls last
      if (tb === null) return -1;
      return ta - tb; // earlier first
    });
  }, [games]);

  // Previous = date < now OR non-pending-without-date; sort closest past first, nulls last
  const previousGames = useMemo(() => {
    const now = nowMs();
    const list = games.filter((game) => {
      const t = getMatchTime(game);
      return t !== null ? t < now : game.result !== "pending";
    });

    return list.sort((a, b) => {
      const ta = getMatchTime(a);
      const tb = getMatchTime(b);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1; // nulls last
      if (tb === null) return -1;
      return tb - ta; // most recent past first
    });
  }, [games]);

  const visibleGames = filter === "upcoming" ? upcomingGames : previousGames;

  const handleUpdateResult = async (gameId: string, result: "win" | "loss") => {
    if (!canManageGames) return;

    try {
      const current = games.find((g) => g.id === gameId);
      if (!current) throw new Error('Match not found');
      if (current.result === 'pending') {
        const decidedSnap = await getDocs(query(collection(db, 'games'), where('result', 'in', ['win', 'loss'])));
        if (decidedSnap.size >= 13) {
          setError('Season cap reached: 13 results already recorded.');
          return;
        }
      }
      const gameRef = doc(db, "games", gameId);
      await updateDoc(gameRef, {
        result,
        updatedAt: serverTimestamp(),
      });
    } catch (updateError) {
      console.error("Failed to update match result", updateError);
      setError("Could not update the match result.");
    }
  };

  const handleFormChange =
    (field: keyof MatchFormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setFormState((prev) => ({
        ...prev,
        [field]: field === "homeOrAway" ? (value as "home" | "away") : value,
      }));
    };

  const resetMatchForm = () => {
    setFormState(defaultFormState);
    setShowForm(false);
  };

  const handleCreateMatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageGames) return;

    if (!formState.opponent.trim()) {
      setError("Enter an opponent name to create the match.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await addDoc(collection(db, "games"), {
        opponent: formState.opponent.trim(),
        matchDate: formState.matchDate
          ? Timestamp.fromDate(new Date(formState.matchDate))
          : null,
        location: formState.location.trim(),
        homeOrAway: formState.homeOrAway,
        players: [],
        playerStats: [],
        notes: null,
        result: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      resetMatchForm();
    } catch (createError) {
      console.error("Failed to add match", createError);
      setError("Unable to add the match. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const openPlayerStatsEditor = (game: SeasonGame) => {
    setActiveMatchId(game.id);
    const initialRows = game.playerStats.length
      ? game.playerStats.map((stat) => ({
          rowId: createRowId(),
          playerId: stat.playerId,
          singlesWins: stat.singlesWins,
          singlesLosses: stat.singlesLosses,
          doublesWins: stat.doublesWins,
          doublesLosses: stat.doublesLosses,
        }))
      : playerOptions.length > 0
      ? [
          {
            rowId: createRowId(),
            playerId: playerOptions[0].id,
            singlesWins: 0,
            singlesLosses: 0,
            doublesWins: 0,
            doublesLosses: 0,
          },
        ]
      : [];
    setRows(initialRows);
    if (playerOptions.length === 0) {
      setError("Add players to the roster to record results.");
    } else {
      setError(null);
    }
  };

  const handleToggleStatsPanel = (game: SeasonGame) => {
    if (activeMatchId === game.id) {
      setActiveMatchId(null);
      setRows([]);
      setError(null);
      return;
    }
    openPlayerStatsEditor(game);
  };

  const updateRow = (rowId: string, updates: Partial<PlayerStatRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const next = { ...row, ...updates };
        if (updates.singlesWins !== undefined) {
          next.singlesWins = clamp(Number(updates.singlesWins), MAX_SINGLES);
        }
        if (updates.singlesLosses !== undefined) {
          next.singlesLosses = clamp(
            Number(updates.singlesLosses),
            MAX_SINGLES
          );
        }
        if (updates.doublesWins !== undefined) {
          next.doublesWins = clamp(Number(updates.doublesWins), MAX_DOUBLES);
        }
        if (updates.doublesLosses !== undefined) {
          next.doublesLosses = clamp(
            Number(updates.doublesLosses),
            MAX_DOUBLES
          );
        }
        if (updates.playerId !== undefined) {
          next.playerId = updates.playerId;
        }
        return next;
      })
    );
  };

  const handlePlayerSelect =
    (rowId: string) => (event: ChangeEvent<HTMLSelectElement>) => {
      updateRow(rowId, { playerId: event.target.value });
    };

  const handleStatInput =
    (rowId: string, field: keyof PlayerStatRow, max: number) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = clamp(Number(event.target.value), max);
      updateRow(rowId, { [field]: value } as Partial<PlayerStatRow>);
    };

  const addRow = () => {
    if (playerOptions.length === 0) return;
    setRows((prev) => [
      ...prev,
      {
        rowId: createRowId(),
        playerId: playerOptions[0].id,
        singlesWins: 0,
        singlesLosses: 0,
        doublesWins: 0,
        doublesLosses: 0,
      },
    ]);
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId));
  };

  const handleSavePlayerStats = async (
    event: FormEvent<HTMLFormElement>,
    game: SeasonGame
  ) => {
    event.preventDefault();
    if (!canManageGames) return;

    if (playerOptions.length === 0) {
      setError("No players available. Add players to the roster first.");
      return;
    }

    const stats: SeasonGamePlayerStat[] = rows
      .filter((row) => row.playerId.trim().length > 0)
      .map((row) => {
        const option = playerOptions.find(
          (player) => player.id === row.playerId
        );
        return {
          playerId: row.playerId,
          displayName: option?.displayName ?? row.playerId,
          singlesWins: clamp(row.singlesWins, MAX_SINGLES),
          singlesLosses: clamp(row.singlesLosses, MAX_SINGLES),
          doublesWins: clamp(row.doublesWins, MAX_DOUBLES),
          doublesLosses: clamp(row.doublesLosses, MAX_DOUBLES),
        };
      });

    setStatsSubmitting(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, "games", game.id);
        const gameSnapshot = await transaction.get(gameRef);
        if (!gameSnapshot.exists()) {
          throw new Error("Match not found");
        }

        const gameData = gameSnapshot.data() as SeasonGameDocument;
        const previousStats = sanitizePlayerStats(gameData.playerStats ?? []);

        const previousMap = new Map(
          previousStats.map((stat) => [stat.playerId, stat])
        );
        const nextMap = new Map(stats.map((stat) => [stat.playerId, stat]));

        const playersToUpdate = new Set<string>([
          ...previousStats.map((stat) => stat.playerId),
          ...stats.map((stat) => stat.playerId),
        ]);

        for (const playerId of playersToUpdate) {
          const previous = previousMap.get(playerId);
          const next = nextMap.get(playerId);

          const previousWins = previous
            ? previous.singlesWins + previous.doublesWins
            : 0;
          const previousLosses = previous
            ? previous.singlesLosses + previous.doublesLosses
            : 0;
          const nextWins = next ? next.singlesWins + next.doublesWins : 0;
          const nextLosses = next ? next.singlesLosses + next.doublesLosses : 0;

          const winDiff = nextWins - previousWins;
          const lossDiff = nextLosses - previousLosses;

          if (winDiff === 0 && lossDiff === 0) continue;

          // --- Update players doc (if it exists) ---
          const playerRef = doc(db, "players", playerId);
          const playerSnapshot = await transaction.get(playerRef);

          let linkedProfileUid: string | undefined = undefined;

          if (playerSnapshot.exists()) {
            const playerUpdates: Record<string, unknown> = {
              updatedAt: serverTimestamp(),
            };
            if (winDiff !== 0) playerUpdates.wins = increment(winDiff);
            if (lossDiff !== 0) playerUpdates.losses = increment(lossDiff);
            transaction.update(playerRef, playerUpdates);

            const playerData = playerSnapshot.data() as PlayerDocument;
            linkedProfileUid = playerData.linkedProfileUid ?? undefined;
          }

          // --- Update userProfiles totals ---
          const profileTargets = new Set<string>();
          if (linkedProfileUid) profileTargets.add(linkedProfileUid);
          profileTargets.add(playerId); // fallback

          for (const uid of profileTargets) {
            const profileRef = doc(db, "userProfiles", uid);
            transaction.set(
              profileRef,
              {
                updatedAt: serverTimestamp(),
                ...(winDiff !== 0 ? { totalWins: increment(winDiff) } : {}),
                ...(lossDiff !== 0 ? { totalLosses: increment(lossDiff) } : {}),
              },
              { merge: true }
            );
          }
        }

        const uniquePlayers = Array.from(
          new Set(stats.map((stat) => stat.displayName))
        );

        const uniquePlayerIds = Array.from(new Set(stats.map((s) => s.playerId)))
        transaction.update(gameRef, {
          playerStats: stats,
          players: uniquePlayers,
          playerIds: uniquePlayerIds,
          updatedAt: serverTimestamp(),
        });
      });

      setActiveMatchId(null);
      setRows([]);
    } catch (saveError) {
      console.error("Failed to save player stats", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save player stats right now."
      );
    } finally {
      setStatsSubmitting(false);
    }
  };

  const myWins = myProfile?.totalWins ?? 0;
  const myLosses = myProfile?.totalLosses ?? 0;

  return (
    <section className="panel">
      <header>
        <h2>Season Matches</h2>
        <p style={{ margin: 0 }}>{TEAM_NAME}</p>
        <p>
          {profile?.displayName ? (
            <>Welcome, {profile.displayName}. </>
          ) : null}
          Keep track of upcoming fixtures and past results.
        </p>
      </header>

      {/* NEW: Logged-in user's wins/losses */}
      {myProfile && (
        <div className="card">
          <h3>My Season Totals</h3>
          <p>
            {myProfile.displayName ?? "Me"} — {myWins} wins · {myLosses} losses
          </p>
          <span className={`tag subs-${myProfile.subsStatus}`}>
            Subs {myProfile.subsStatus === "paid" ? "paid" : "due"}
          </span>
        </div>
      )}

      <div className="filter-bar">
        <div className="tab-group">
          <button
            type="button"
            className={filter === "upcoming" ? "tab active" : "tab"}
            onClick={() => setFilter("upcoming")}
          >
            Upcoming Matches ({upcomingGames.length})
          </button>
          <button
            type="button"
            className={filter === "previous" ? "tab active" : "tab"}
            onClick={() => setFilter("previous")}
          >
            Previous Matches ({previousGames.length})
          </button>
        </div>
        {canManageGames ? (
          <button type="button" onClick={() => setShowForm((prev) => !prev)}>
            {showForm ? "Close New Match" : "Add New Match"}
          </button>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {canManageGames && showForm ? (
        <form className="card" onSubmit={handleCreateMatch}>
          <h3>Add Match</h3>
          <label htmlFor="opponent">Team Name</label>
          <input
            id="opponent"
            type="text"
            value={formState.opponent}
            onChange={handleFormChange("opponent")}
            required
          />

          <label htmlFor="matchDate">Match Date</label>
          <input
            id="matchDate"
            type="date"
            value={formState.matchDate}
            onChange={handleFormChange("matchDate")}
            required
          />

          <label htmlFor="location">Location</label>
          <input
            id="location"
            type="text"
            value={formState.location}
            onChange={handleFormChange("location")}
            placeholder="Club venue"
            required
          />

          <label htmlFor="homeOrAway">Home or Away</label>
          <select
            id="homeOrAway"
            value={formState.homeOrAway}
            onChange={handleFormChange("homeOrAway")}
          >
            <option value="home">Home</option>
            <option value="away">Away</option>
          </select>

          <div className="actions">
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save Match"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={resetMatchForm}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="list">
        {visibleGames.length === 0 ? (
          <p>
            {filter === "upcoming"
              ? "No upcoming matches yet."
              : "No previous matches recorded."}
          </p>
        ) : null}
        {visibleGames.map((game) => (
          <article key={game.id} className="card">
            <header className="card-header">
              <div>
                <h3>{game.opponent}</h3>
                <p>
                  {game.matchDate
                    ? game.matchDate.toDate().toLocaleDateString()
                    : "Date TBC"}{" "}
                  · {game.location || "Location TBC"}
                </p>
              </div>
              <span className={`tag status-${game.result}`}>
                {game.result === "pending"
                  ? "Pending"
                  : game.result === "win"
                  ? "Win"
                  : "Loss"}
              </span>
            </header>
            <p className="meta">
              {game.homeOrAway === "home" ? "Home fixture" : "Away fixture"}
            </p>
            {game.notes ? <p>{game.notes}</p> : null}

            {game.playerStats.length > 0 ? (
              <div className="player-stats-summary">
                {game.playerStats.map((stat) => (
                  <div key={stat.playerId} className="player-stat-chip">
                    <strong>{stat.displayName}</strong>
                    <span>
                      Singles W/L {stat.singlesWins}:{stat.singlesLosses}
                    </span>
                    <span>
                      Doubles W/L {stat.doublesWins}:{stat.doublesLosses}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">No individual player results yet.</p>
            )}

            {canManageGames ? (
              <>
                <div className="actions">
                  <button
                    type="button"
                    onClick={() => handleUpdateResult(game.id, "win")}
                  >
                    Mark Win
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateResult(game.id, "loss")}
                  >
                    Mark Loss
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleStatsPanel(game)}
                  className="secondary-button"
                  disabled={playerOptions.length === 0}
                >
                  {playerOptions.length === 0
                    ? "Add players to record results"
                    : activeMatchId === game.id
                    ? "Close Player Results"
                    : "Record Player Results"}
                </button>
                {activeMatchId === game.id ? (
                  <form
                    className="player-result-form"
                    onSubmit={(event) => handleSavePlayerStats(event, game)}
                  >
                    <div className="player-result-grid">
                      {rows.map((row) => (
                        <div key={row.rowId} className="player-result-row">
                          <label>
                            Player
                            <select
                              value={row.playerId}
                              onChange={handlePlayerSelect(row.rowId)}
                              disabled={playerOptions.length === 0}
                            >
                              <option value="">Select player…</option>
                              {playerOptions.map((player) => (
                                <option key={player.id} value={player.id}>
                                  {player.displayName}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Singles Wins
                            <input
                              type="number"
                              min={0}
                              max={MAX_SINGLES}
                              value={row.singlesWins}
                              onChange={handleStatInput(
                                row.rowId,
                                "singlesWins",
                                MAX_SINGLES
                              )}
                            />
                          </label>
                          <label>
                            Singles Losses
                            <input
                              type="number"
                              min={0}
                              max={MAX_SINGLES}
                              value={row.singlesLosses}
                              onChange={handleStatInput(
                                row.rowId,
                                "singlesLosses",
                                MAX_SINGLES
                              )}
                            />
                          </label>
                          <label>
                            Doubles Wins
                            <input
                              type="number"
                              min={0}
                              max={MAX_DOUBLES}
                              value={row.doublesWins}
                              onChange={handleStatInput(
                                row.rowId,
                                "doublesWins",
                                MAX_DOUBLES
                              )}
                            />
                          </label>
                          <label>
                            Doubles Losses
                            <input
                              type="number"
                              min={0}
                              max={MAX_DOUBLES}
                              value={row.doublesLosses}
                              onChange={handleStatInput(
                                row.rowId,
                                "doublesLosses",
                                MAX_DOUBLES
                              )}
                            />
                          </label>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => removeRow(row.rowId)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    {playerOptions.length === 0 ? (
                      <p className="hint">
                        Add players to the roster to record results.
                      </p>
                    ) : null}
                    <div className="actions">
                      <button
                        type="button"
                        onClick={addRow}
                        disabled={playerOptions.length === 0}
                      >
                        Add Player Result
                      </button>
                      <button type="submit" disabled={statsSubmitting}>
                        {statsSubmitting ? "Saving…" : "Save Results"}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setActiveMatchId(null);
                          setRows([]);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};

export default SeasonManager;
