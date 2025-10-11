import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Timestamp, addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where, limit } from "firebase/firestore";
import { db } from "../firebase/config";
import { isManagerRole } from "../types/models";
import { TEAM_NAME } from "../config/app";
import formatMatchDateLabel from '../utils/date'
// strings util not needed here anymore
import { getResultLabel, getResultTagClass } from '../utils/status'
import { useAuth } from "../context/AuthContext";
import useSeasonActions from '../hooks/useSeasonActions'
import { clamp } from '../utils/stats'
import ImportFixturesPanel from './ImportFixturesPanel'
import PlayerStatsEditor from './PlayerStatsEditor'
import PlayerStatsSummary from './PlayerStatsSummary'
import MatchForm from './MatchForm'
import type { SeasonGameDocument, SeasonGamePlayerStat, UserProfileDocument } from "../types/models";

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

// clamp moved to utils/stats

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

// --- import helpers ---

// RawImportGame type moved to utils/fixtures

// moved import helpers to utils/fixtures

const SeasonManager = () => {
  const { profile } = useAuth();
  const [games, setGames] = useState<SeasonGame[]>([]);
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MatchFilter>("upcoming");
  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState<MatchFormState>(defaultFormState);
  const [submitting, setSubmitting] = useState(false);
  // Import fixtures state
  const [showImporter, setShowImporter] = useState(false);
  const [importText, setImportText] = useState<string>(`[
  {\n    \"opponent\": \"Washhouse Miners\",\n    \"matchDate\": null,\n    \"location\": \"Miners Arms\",\n    \"homeOrAway\": \"away\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2025-10-16\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"Roundabout\",\n    \"matchDate\": null,\n    \"location\": \"Roundabout\",\n    \"homeOrAway\": \"away\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2025-10-23\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"Railway Club\",\n    \"matchDate\": null,\n    \"location\": \"Railway Club\",\n    \"homeOrAway\": \"away\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2025-10-30\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"Roundabout\",\n    \"matchDate\": null,\n    \"location\": \"Union Jack Club\",\n    \"homeOrAway\": \"home\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2025-11-06\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"Vinnies\",\n    \"matchDate\": null,\n    \"location\": \"Vinnies\",\n    \"homeOrAway\": \"away\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2025-11-13\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"Grapes B\",\n    \"matchDate\": null,\n    \"location\": \"Union Jack Club\",\n    \"homeOrAway\": \"home\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2025-11-20\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"JJ's E\",\n    \"matchDate\": null,\n    \"location\": \"Union Jack Club\",\n    \"homeOrAway\": \"home\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2025-11-27\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"Vinnies\",\n    \"matchDate\": null,\n    \"location\": \"Union Jack Club\",\n    \"homeOrAway\": \"home\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2025-12-04\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"Grapes B\",\n    \"matchDate\": null,\n    \"location\": \"Grapes\",\n    \"homeOrAway\": \"away\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2025-12-18\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"Union Jack A\",\n    \"matchDate\": null,\n    \"location\": \"Union Jack Club\",\n    \"homeOrAway\": \"home\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2026-01-08\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"JJ's D\",\n    \"matchDate\": null,\n    \"location\": \"JJ's\",\n    \"homeOrAway\": \"away\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2026-01-15\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"Washhouse Miners\",\n    \"matchDate\": null,\n    \"location\": \"Union Jack Club\",\n    \"homeOrAway\": \"home\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2026-02-12\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"JJ's E\",\n    \"matchDate\": null,\n    \"location\": \"JJ's\",\n    \"homeOrAway\": \"away\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2026-03-05\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  },\n  {\n    \"opponent\": \"JJ's E\",\n    \"matchDate\": null,\n    \"location\": \"Union Jack Club\",\n    \"homeOrAway\": \"home\",\n    \"players\": [],\n    \"playerStats\": [],\n    \"result\": \"pending\",\n    \"notes\": \"2026-04-02\",\n    \"createdAt\": null,\n    \"updatedAt\": null\n  }\n]"
  `);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
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

  const formatDateLabel = (game: SeasonGame): string => {
    return formatMatchDateLabel(game.matchDate, game.notes)
  };

  const { updateResult, importFixtures, savePlayerStats } = useSeasonActions()
  const handleUpdateResult = async (gameId: string, result: 'win' | 'loss') => {
    if (!canManageGames) return
    const out = await updateResult(gameId, result, games)
    if (!out.ok) setError(out.error)
  }

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

  const handleImportFixtures = async () => {
    if (!canManageGames) return
    setImporting(true)
    setImportMessage(null)
    const out = await importFixtures(importText)
    setImporting(false)
    if (!out.ok) { setImportMessage(`Import failed: ${out.error}`); return }
    setImportMessage(`Import complete. Created: ${out.created}, Skipped: ${out.skipped}, Updated: ${out.updated}`)
    setShowImporter(false)
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

  const handleSavePlayerStats = async (event: FormEvent<HTMLFormElement>, game: SeasonGame) => {
    event.preventDefault()
    if (!canManageGames) return
    setStatsSubmitting(true)
    setError(null)
    const out = await savePlayerStats(game.id, rows, playerOptions)
    setStatsSubmitting(false)
    if (!out.ok) { setError(out.error); return }
    setActiveMatchId(null)
    setRows([])
  }

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
        <div className="card">
          <MatchForm
            formState={formState}
            onChange={handleFormChange}
            submitting={submitting}
            onSubmit={handleCreateMatch}
            onCancel={resetMatchForm}
          />
        </div>
      ) : null}

      <div className="list">
        {canManageGames ? (
          <ImportFixturesPanel
            open={showImporter}
            importText={importText}
            setImportText={setImportText}
            importing={importing}
            importMessage={importMessage}
            onImport={handleImportFixtures}
            onToggle={() => setShowImporter((v) => !v)}
          />
        ) : null}
        
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
                {formatDateLabel(game)}{" "}
                  · {game.location || "Location TBC"}
                </p>
              </div>
              <span className={`tag ${getResultTagClass(game.result)}`}>
                {getResultLabel(game.result)}
              </span>
            </header>
            <p className="meta">
              {game.homeOrAway === "home" ? "Home fixture" : "Away fixture"}
            </p>
            {game.notes ? <p>{game.notes}</p> : null}

            <PlayerStatsSummary stats={game.playerStats} canManage={canManageGames} />

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
                  <PlayerStatsEditor
                    rows={rows as any}
                    playerOptions={playerOptions}
                    getPlayerSelectHandler={handlePlayerSelect}
                    getStatInputHandler={handleStatInput as any}
                    onAddRow={addRow}
                    onRemoveRow={removeRow}
                    onSubmit={(e) => handleSavePlayerStats(e as any, game)}
                    onCancel={() => { setActiveMatchId(null); setRows([]) }}
                    submitting={statsSubmitting}
                    canAdd={playerOptions.length > 0}
                    MAX_SINGLES={MAX_SINGLES}
                    MAX_DOUBLES={MAX_DOUBLES}
                  />
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
