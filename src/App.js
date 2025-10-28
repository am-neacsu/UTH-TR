import { useState, useEffect, useRef, memo } from 'react';
import {
  Users,
  Monitor,
  Settings,
  Plus,
  X,
  Cast,
  Database,
  Wifi,
  WifiOff,
  Trash2,
  ChevronLeft,
  ChevronRight,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  Trophy,
  Download,
  Lock,
  LogIn,
  LogOut,
} from 'lucide-react';

import { LayoutGroup, motion } from 'framer-motion';

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection as fsCollection,
  onSnapshot,
  addDoc,
  doc as fsDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  query,
  orderBy,
  startAfter,
  limit,
  documentId,
  setDoc,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

import * as XLSX from 'xlsx';

const firebaseConfig = {
  apiKey: 'AIzaSyAygueD0U3-aRMarRi7thg5M4Z4QnH21Po',
  authDomain: 'poker-tournament-app-98a32.firebaseapp.com',
  projectId: 'poker-tournament-app-98a32',
  storageBucket: 'poker-tournament-app-98a32.firebasestorage.app',
  messagingSenderId: '146461312885',
  appId: '1:146461312885:web:13640c72d6c80967b6353c',
};

// -------- Animation pacing (ms per name) --------
const DRAW_STEP_MS = 2500;

/** Fit children to viewport (no scroll), center them, and paint the whole screen. */
const FitToViewport = ({ children, bgClass = 'bg-gray-900' }) => {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;

      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      const iw = inner.scrollWidth || inner.clientWidth || 1;
      const ih = inner.scrollHeight || inner.clientHeight || 1;

      const s = Math.min(1, ow / iw, oh / ih) * 0.98;
      setScale(Number.isFinite(s) ? s : 1);
    };

    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    update();
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className={`w-screen h-screen overflow-hidden ${bgClass} flex items-start justify-center`}>
      <div ref={innerRef} style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
        {children}
      </div>
    </div>
  );
};

// ---------- helpers ----------
const getStatus = (t) => (t?.status ? t.status : t?.inPlay ? 'in_play' : 'not_playing');

const statusBadge = (status) => {
  if (status === 'in_play') return { text: '🎮 IN PLAY', cls: 'bg-green-400 text-green-900 animate-pulse' };
  if (status === 'finished') return { text: '🏁 FINISHED', cls: 'bg-red-400 text-red-900' };
  return { text: '⏸️ WAITING', cls: 'bg-gray-500 text-gray-200' };
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const gbp = (n) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
    .format(Number(n || 0));

const flatPlayers = (tables) => {
  const rows = [];
  for (const t of tables) {
    const st = getStatus(t);
    (t.players || []).forEach((p, idx) => {
      const seat = p.seat ?? idx + 1;
      rows.push({
        id: `${t.id}|${seat}|${p.name}`,
        tableId: t.id,
        tableNumber: Number(t.tableNumber) || 0,
        status: st,
        seat,
        name: p.name || '',
        chips: Number(p.chips || 0),
      });
    });
  }
  return rows;
};

const tableSummaryRows = (tables) => {
  return tables
    .map((t) => {
      const st = getStatus(t);
      const players = t.players || [];
      const chips = players.map((p) => Number(p.chips || 0));
      const total = chips.reduce((a, b) => a + b, 0);
      const count = players.length || 0;
      const avg = count ? total / count : 0;
      const min = chips.length ? Math.min(...chips) : 0;
      const max = chips.length ? Math.max(...chips) : 0;
      return {
        tableNumber: Number(t.tableNumber) || 0,
        status: st,
        players: count,
        totalChips: total,
        averageStack: Math.round(avg),
        minStack: min,
        maxStack: max,
        lastUpdated: t.lastUpdated || t.createdAt || '',
      };
    })
    .sort((a, b) => a.tableNumber - b.tableNumber);
};

/* ===========================
   Login Screen (full-screen)
   =========================== */
const LoginScreen = ({ onSignIn, isBusy = false, error = '' }) => {
  const emailRef = useRef(null);
  const passRef = useRef(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-gray-800/80 backdrop-blur rounded-2xl p-6 shadow-2xl border border-gray-700">
        <div className="text-center mb-6">
          <div className="text-3xl font-extrabold text-white">Tournament Admin</div>
          <div className="text-gray-300 mt-1 text-sm">Please sign in to continue</div>
        </div>

        {error && <div className="mb-4 bg-red-900/60 text-red-100 px-3 py-2 rounded text-sm">{error}</div>}

        <label className="block mb-3 text-sm">
          <span className="text-gray-300 mb-1 block">Email</span>
          <input
            ref={emailRef}
            type="email"
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
            placeholder="admin@yourdomain.com"
          />
        </label>

        <label className="block mb-4 text-sm">
          <span className="text-gray-300 mb-1 block">Password</span>
          <input
            ref={passRef}
            type="password"
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
            placeholder="••••••••"
          />
        </label>

        <button
          onClick={() => onSignIn(emailRef.current?.value || '', passRef.current?.value || '')}
          disabled={isBusy}
          className={`w-full py-3 rounded-lg font-semibold ${isBusy ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {isBusy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="mt-4 text-xs text-gray-400 text-center">
          Tip: add <code>?public=1</code> to the link for a read-only display without login.
        </div>
      </div>
    </div>
  );
};

/* ===========================
   Memoized Draw form (keeps focus)
   =========================== */
const DrawParticipantsPanel = memo(function DrawParticipantsPanel({
  initialText,
  seatsPerTable,
  startingChips,
  autoOpen,
  onChangeSeats,
  onChangeChips,
  onToggleAutoOpen,
  onPrepare, // (text) => void
  onStart,
  onReset,
  onClear,
  onSave,
  canSave,
  statusLabel,
}) {
  const [localText, setLocalText] = useState(initialText);

  // If parent clears the text (Clear), reflect that
  useEffect(() => {
    if (!initialText) setLocalText('');
  }, [initialText]);

  return (
    <div className="bg-gray-800 p-6 rounded-lg mb-6">
      <h2 className="text-lg font-semibold mb-3">Participants</h2>

      <textarea
        value={localText}
        onChange={(e) => setLocalText(e.target.value)}
        placeholder="One name per line"
        className="w-full h-64 p-3 bg-gray-700 border border-gray-600 rounded outline-none resize-y"
      />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm mb-1">Seats per table</label>
          <input
            type="number"
            min={1}
            value={seatsPerTable}
            onChange={(e) => onChangeSeats(parseInt(e.target.value || '0', 10))}
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Starting Chips</label>
          <input
            type="number"
            min={0}
            value={startingChips}
            onChange={(e) => onChangeChips(parseInt(e.target.value || '0', 10))}
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoOpen}
            onChange={(e) => onToggleAutoOpen(e.target.checked)}
            className="w-4 h-4"
          />
          Auto-open Live Display when done
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => onPrepare(localText)} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg">
          Prepare
        </button>
        <button onClick={onStart} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg">
          Start Animation
        </button>
        <button onClick={onReset} className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg">
          Reset
        </button>
        <button onClick={onClear} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg">
          Clear
        </button>
        <button
          onClick={onSave}
          disabled={!canSave}
          className={`px-4 py-2 rounded-lg ml-auto ${!canSave ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          Save to Firestore
        </button>
      </div>

      <div className="mt-3 text-gray-300 text-sm">Status: {statusLabel}</div>
    </div>
  );
});

/* ===========================
   Memoized Podium setup panel (keeps focus)
   =========================== */
const PodiumSetupPanel = memo(function PodiumSetupPanel({
  initialPrizes,                  // { first, second, third }
  initialSelection,               // { firstId, secondId, thirdId }
  players,                        // array from flatPlayers(tables)
  onChangePrizes,                 // ({first,second,third}) => void
  onChangeSelection,              // ({firstId,secondId,thirdId}) => void
  onBackToDisplay,
  onExportExcel,
  podiumScale,
  onChangeScale,
}) {
  const [p1, setP1] = useState(initialPrizes.first);
  const [p2, setP2] = useState(initialPrizes.second);
  const [p3, setP3] = useState(initialPrizes.third);
  const [w1, setW1] = useState(initialSelection.firstId);
  const [w2, setW2] = useState(initialSelection.secondId);
  const [w3, setW3] = useState(initialSelection.thirdId);

  useEffect(() => { setP1(initialPrizes.first); setP2(initialPrizes.second); setP3(initialPrizes.third); }, [initialPrizes]);
  useEffect(() => { setW1(initialSelection.firstId); setW2(initialSelection.secondId); setW3(initialSelection.thirdId); }, [initialSelection]);

  const commitPrizes = () => onChangePrizes({ first: Number(p1||0), second: Number(p2||0), third: Number(p3||0) });

  return (
    <div className="bg-gray-800 rounded-2xl p-4 mb-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="text-xl font-bold mb-2">Podium setup</div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="block mb-1">1st Prize (£)</span>
              <input type="number" min={0} value={p1} onChange={(e)=>setP1(e.target.value)}
                     onBlur={commitPrizes}
                     className="w-full p-2 bg-gray-700 border border-gray-600 rounded" />
            </label>
            <label className="text-sm">
              <span className="block mb-1">2nd Prize (£)</span>
              <input type="number" min={0} value={p2} onChange={(e)=>setP2(e.target.value)}
                     onBlur={commitPrizes}
                     className="w-full p-2 bg-gray-700 border border-gray-600 rounded" />
            </label>
            <label className="text-sm">
              <span className="block mb-1">3rd Prize (£)</span>
              <input type="number" min={0} value={p3} onChange={(e)=>setP3(e.target.value)}
                     onBlur={commitPrizes}
                     className="w-full p-2 bg-gray-700 border border-gray-600 rounded" />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1">
          <label className="text-sm">
            <span className="block mb-1">Winner</span>
            <select
              value={w1}
              onChange={(e) => {
                const val = e.target.value;
                setW1(val);
                onChangeSelection({ firstId: val, secondId: w2, thirdId: w3 });
              }}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
            >
              <option value="">(Select manually)</option>
              {players.map((p)=>(
                <option key={p.id} value={p.id}>
                  {p.name} — Table {p.tableNumber} Seat {p.seat} — {p.chips.toLocaleString()} chips
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block mb-1">Second</span>
            <select
              value={w2}
              onChange={(e) => {
                const val = e.target.value;
                setW2(val);
                onChangeSelection({ firstId: w1, secondId: val, thirdId: w3 });
              }}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
            >
              <option value="">(Select manually)</option>
              {players.map((p)=>(
                <option key={p.id} value={p.id}>
                  {p.name} — Table {p.tableNumber} Seat {p.seat} — {p.chips.toLocaleString()} chips
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block mb-1">Third</span>
            <select
              value={w3}
              onChange={(e) => {
                const val = e.target.value;
                setW3(val);
                onChangeSelection({ firstId: w1, secondId: w2, thirdId: val });
              }}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
            >
              <option value="">(Select manually)</option>
              {players.map((p)=>(
                <option key={p.id} value={p.id}>
                  {p.name} — Table {p.tableNumber} Seat {p.seat} — {p.chips.toLocaleString()} chips
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3">
          {/* Size slider */}
          <label className="text-sm text-gray-300 flex items-center gap-2">
            Size
            <input type="range" min="0.9" max="1.8" step="0.05"
                   value={podiumScale}
                   onChange={(e)=>onChangeScale(parseFloat(e.target.value))} />
            <span className="w-10 text-right">{Math.round(podiumScale*100)}%</span>
          </label>

          <button onClick={onBackToDisplay} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">
            Back to Display
          </button>
          <button onClick={onExportExcel} className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg">
            Export Winners (Excel)
          </button>
        </div>
      </div>
    </div>
  );
});

// ===========================================================
const PokerTournamentApp = () => {
  const [tables, setTables] = useState([]);
  const [currentView, setCurrentView] = useState('admin'); // admin | draw | display | podium
  const [newTable, setNewTable] = useState({ tableNumber: '', players: [], status: 'not_playing' });
  const [newPlayer, setNewPlayer] = useState({ name: '', chips: '' });
  const [isCasting, setIsCasting] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // display pagination
  const [displayPage, setDisplayPage] = useState(0);
  const rotatorRef = useRef(null);

  // connection
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [db, setDb] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // auth
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const canWrite = !!user;

  // gate/login
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState('');
  const urlQuery =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const publicDisplayBypass = urlQuery.has('public') || urlQuery.has('display');

  // ===== Random Draw state & animation =====
  const [participantsText, setParticipantsText] = useState('');
  const [seatsPerTable, setSeatsPerTable] = useState(5); // default 5 (can change)
  const [startingChips, setStartingChips] = useState(0);
  const [autoSwitchToDisplay, setAutoSwitchToDisplay] = useState(true);

  const [drawPhase, setDrawPhase] = useState('idle'); // idle | prepared | animating | done
  const [participants, setParticipants] = useState([]); // [{id, name}]
  const [preparedTables, setPreparedTables] = useState([]); // [{tableNumber, seats}]
  const [seatTargets, setSeatTargets] = useState({}); // id -> {tableIdx, seat}
  const [seatOccupants, setSeatOccupants] = useState({}); // `${tableIdx}-${seat}` -> participant id
  const [animOrder, setAnimOrder] = useState([]); // ids in the order we animate
  const [animIndex, setAnimIndex] = useState(0);
  const animTimerRef = useRef(null);

  // Presentation + fit + HUD
  const [drawPresentation, setDrawPresentation] = useState(false);
  const [fitToScreen, setFitToScreen] = useState(true);
  const [hudVisible, setHudVisible] = useState(true);

  // Draw layout controls (real size zoom)
  const [compact, setCompact] = useState(true);
  const [uiScale, setUiScale] = useState(1.0); // 0.8..1.6

  // Podium config (local fallback)
  const [podiumConfig, setPodiumConfig] = useState({
    firstPrize: 0,
    secondPrize: 0,
    thirdPrize: 0,
    firstWinnerId: '',
    secondWinnerId: '',
    thirdWinnerId: '',
  });

  // ---- Firestore-synced UI controls (shared across devices) ----
  const [ui, setUi] = useState({
    podiumSetupVisible: false,   // hidden by default
    podiumScale: 1.4,
    podiumPrizes: { first: 0, second: 0, third: 0 },
    podiumSelection: { firstId: '', secondId: '', thirdId: '' },
  });

  // ---------- init Firebase (Firestore + Auth) + live listeners ----------
  useEffect(() => {
    let unsubTables = null;
    let unsubAuth = null;
    let unsubUi = null;
    try {
      const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const auth = getAuth(app);
      setDb(firestore);

      unsubAuth = onAuthStateChanged(auth, (u) => {
        setUser(u || null);
        setAuthReady(true);
      });

      unsubTables = onSnapshot(
        fsCollection(firestore, 'tables'),
        (snap) => {
          const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setTables((prev) => {
            const same =
              prev.length === data.length &&
              prev.every((row, i) => row.id === data[i].id && JSON.stringify(row) === JSON.stringify(data[i]));
            if (same) return prev;
            setLastUpdate(Date.now());
            return data;
          });
          setFirebaseReady(true);
        },
        (err) => {
          console.error('Firestore listener error:', err);
          setFirebaseReady(false);
        }
      );

      // Shared UI controls
      const uiRef = fsDoc(firestore, 'controls', 'ui');
      unsubUi = onSnapshot(uiRef, async (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setUi((prev) => ({
            podiumSetupVisible: !!data.podiumSetupVisible,
            podiumScale: Number(data.podiumScale ?? prev.podiumScale),
            podiumPrizes: {
              first: Number(data?.podiumPrizes?.first ?? prev.podiumPrizes.first ?? 0),
              second: Number(data?.podiumPrizes?.second ?? prev.podiumPrizes.second ?? 0),
              third: Number(data?.podiumPrizes?.third ?? prev.podiumPrizes.third ?? 0),
            },
            podiumSelection: {
              firstId: data?.podiumSelection?.firstId ?? prev.podiumSelection.firstId ?? '',
              secondId: data?.podiumSelection?.secondId ?? prev.podiumSelection.secondId ?? '',
              thirdId: data?.podiumSelection?.thirdId ?? prev.podiumSelection.thirdId ?? '',
            },
          }));
        } else {
          await setDoc(uiRef, {
            podiumSetupVisible: false,
            podiumScale: 1.4,
            podiumPrizes: { first: 0, second: 0, third: 0 },
            podiumSelection: { firstId: '', secondId: '', thirdId: '' },
            createdAt: new Date().toISOString(),
          });
        }
      });
    } catch (e) {
      console.error('Firebase init error:', e);
      setFirebaseReady(false);
      setDb(null);
    }
    return () => {
      if (unsubTables) unsubTables();
      if (unsubAuth) unsubAuth();
      if (unsubUi) unsubUi();
    };
  }, []);

  // online/offline
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Ctrl+Space toggles HUD
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        setHudVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // public display bypass
  useEffect(() => {
    if (publicDisplayBypass) {
      setCurrentView('display');
      setHudVisible(false);
    }
  }, [publicDisplayBypass]);

  // ---------- auto-rotate display pages every 20s ----------
  useEffect(() => {
    const inPlayTables = tables.filter((t) => getStatus(t) === 'in_play');
    const featured = inPlayTables.length
      ? [...inPlayTables].sort(
          (a, b) =>
            new Date(b.lastUpdated || b.createdAt || 0) - new Date(a.lastUpdated || a.createdAt || 0)
        )[0]
      : null;

    const pagesCount = featured
      ? 1 + Math.ceil(Math.max(0, tables.length - 1) / 2)
      : Math.max(1, Math.ceil(tables.length / 2));

    if (displayPage >= pagesCount) setDisplayPage(0);

    if (currentView === 'display' && pagesCount > 1) {
      if (rotatorRef.current) clearInterval(rotatorRef.current);
      rotatorRef.current = setInterval(() => {
        setDisplayPage((p) => (p + 1) % pagesCount);
      }, 20000);
    } else {
      if (rotatorRef.current) {
        clearInterval(rotatorRef.current);
        rotatorRef.current = null;
      }
      if (currentView !== 'display') setDisplayPage(0);
    }

    return () => {
      if (rotatorRef.current) {
        clearInterval(rotatorRef.current);
        rotatorRef.current = null;
      }
    };
  }, [currentView, tables, displayPage]);

  // ---------- Auth actions ----------
  const signInAdmin = async (email, pass) => {
    if (!email || !pass) {
      setGateError('Please enter email and password.');
      return;
    }
    try {
      setGateBusy(true);
      setGateError('');
      await signInWithEmailAndPassword(getAuth(), email, pass);
    } catch (e) {
      setGateError(e.code || e.message || 'Login failed');
    } finally {
      setGateBusy(false);
    }
  };

  const headerSignOut = async () => {
    try {
      await signOut(getAuth());
      window.alert('Signed out.');
    } catch (e) {
      window.alert(`Sign out failed: ${e.code || e.message}`);
    }
  };

  // ---------- actions (guarded by canWrite) ----------
  const requireWrite = () => {
    if (!canWrite) {
      window.alert('Admin only. Please sign in to modify data.');
      return false;
    }
    return true;
  };

  const addTable = async () => {
    if (!db || !requireWrite()) return;
    if (!newTable.tableNumber || newTable.players.length === 0) return;

    const table = {
      tableNumber: parseInt(newTable.tableNumber, 10),
      players: [...newTable.players],
      status: newTable.status,
      inPlay: newTable.status === 'in_play',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    try {
      await addDoc(fsCollection(db, 'tables'), table);
      setNewTable({ tableNumber: '', players: [], status: 'not_playing' });
    } catch (e) {
      console.error('Failed to add table:', e);
      window.alert('Could not add table. Check Firestore rules or connection.');
    }
  };

  const addPlayerToNewTable = () => {
    const chipsNum = Number(newPlayer.chips || 0);
    if (!newPlayer.name || chipsNum < 0) return;
    setNewTable((prev) => ({
      ...prev,
      players: [...prev.players, { name: newPlayer.name.trim(), chips: chipsNum }],
    }));
    setNewPlayer({ name: '', chips: '' });
  };

  const removePlayerFromNewTable = (index) => {
    setNewTable((prev) => ({
      ...prev,
      players: prev.players.filter((_, i) => i !== index),
    }));
  };

  const deleteTable = async (tableId) => {
    if (!db || !requireWrite()) return;
    try {
      await deleteDoc(fsDoc(db, 'tables', tableId));
    } catch (e) {
      console.error('Failed to delete table:', e);
      window.alert(`Could not delete table. ${e.code || ''} ${e.message || ''}`);
    }
  };

  const setTableStatus = async (tableId, status) => {
    if (!db || !requireWrite()) return;
    try {
      await updateDoc(fsDoc(db, 'tables', tableId), {
        status,
        inPlay: status === 'in_play',
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to update status:', e);
      window.alert(`Could not update status. ${e.code || ''} ${e.message || ''}`);
    }
  };

  const updatePlayerChips = async (tableId, playerIndex, newChips) => {
    if (!db || !requireWrite()) return;
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    const players = table.players.map((p, i) =>
      i === playerIndex ? { ...p, chips: parseInt(newChips || 0, 10) } : p
    );

    try {
      await updateDoc(fsDoc(db, 'tables', tableId), {
        players,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to update chips:', e);
      window.alert(`Could not update chips. ${e.code || ''} ${e.message || ''}`);
    }
  };

  const deleteAllTables = async () => {
    if (!db || !requireWrite()) return;
    if (!window.confirm('Delete ALL tables and players from Firestore?\n\nThis cannot be undone.')) return;

    try {
      let cursor = null;
      while (true) {
        const q = cursor
          ? query(fsCollection(db, 'tables'), orderBy(documentId()), startAfter(cursor), limit(500))
          : query(fsCollection(db, 'tables'), orderBy(documentId()), limit(500));

        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();

        cursor = snap.docs[snap.docs.length - 1].id;
      }

      window.alert('All tables deleted.');
    } catch (e) {
      console.error('Delete all failed:', e);
      window.alert(`Delete failed: ${e.code || 'error'} — ${e.message || ''}`);
    }
  };

  // ---------- Excel exports ----------
  const exportTableSummaryToExcel = () => {
    const byTable = [];
    const tablesSorted = [...tables].sort(
      (a, b) => (Number(a.tableNumber) || 0) - (Number(b.tableNumber) || 0)
    );

    for (const t of tablesSorted) {
      let tableTotal = 0;
      const players = t.players || [];
      players.forEach((p, idx) => {
        const seat = p.seat ?? idx + 1;
        const chips = Number(p.chips || 0);
        tableTotal += chips;
        byTable.push({
          Table: Number(t.tableNumber) || 0,
          Seat: seat,
          Name: p.name || '',
          Chips: chips,
        });
      });
      byTable.push({ Table: Number(t.tableNumber) || 0, Seat: '', Name: 'Table total', Chips: tableTotal });
      byTable.push({ Table: '', Seat: '', Name: '', Chips: '' });
    }

    const summary = tableSummaryRows(tables).map((r) => ({
      Table: r.tableNumber,
      Status: r.status,
      Players: r.players,
      'Total Chips': r.totalChips,
      'Average Stack': r.averageStack,
      'Min Stack': r.minStack,
      'Max Stack': r.maxStack,
      'Last Updated': r.lastUpdated,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byTable), 'By Table');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');
    const dateTag = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `table_summary_${dateTag}.xlsx`);
  };

  const exportPodiumToExcel = (winners = []) => {
    const rows = winners.map((w, i) => ({
      Place: i + 1,
      Name: w?.name || '',
      Table: w?.tableNumber || '',
      Seat: w?.seat || '',
      Chips: w?.chips ?? '',
      Prize: i === 0 ? gbp(ui.podiumPrizes.first) : i === 1 ? gbp(ui.podiumPrizes.second) : gbp(ui.podiumPrizes.third),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Podium');
    const dateTag = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `podium_${dateTag}.xlsx`);
  };

  // ---------- casting helpers ----------
  const startScreenShare = async () => {
    try {
      setCurrentView('display');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { mediaSource: 'screen' }, audio: false });
      setIsCasting(true);
      const [track] = stream.getVideoTracks();
      if (track) {
        track.addEventListener('ended', () => {
          setIsCasting(false);
          window.alert("Screen sharing stopped. You can cast this tab with your browser's cast button or use HDMI.");
        });
      }
      window.alert('Screen sharing started.\n\nUse browser cast, AirPlay, or HDMI to show on TV.');
    } catch (error) {
      console.error('Screen sharing failed:', error);
      if (error.name === 'NotAllowedError') {
        window.alert('Screen sharing permission denied. Please allow and try again.');
      } else {
        window.alert('Screen sharing not supported or failed. Try browser cast or HDMI.');
      }
    }
  };

  const showCastingOptions = () => {
    const msg = `📺 CASTING OPTIONS:

🎯 METHOD 1: Browser Cast
• Menu (⋮) → Cast → Cast tab

🖥️ METHOD 2: Screen Share + HDMI
• Connect HDMI
• Press "Share Screen" in the Admin toolbar

📱 METHOD 3: AirPlay (Mac/iOS)
• Click AirPlay → Apple TV → Mirror Display

🔧 METHOD 4: Wireless Display
• Windows: Win+K → select display
• Mac: System Settings → Displays → AirPlay

Start screen sharing now?`;

    if (typeof window !== 'undefined' && window.confirm(msg)) {
      startScreenShare();
    }
  };

  // ---------- status chip ----------
  const statusChip = (() => {
    if (!firebaseReady && isOnline) return { className: 'bg-gray-700 text-gray-200', label: 'Not connected' };
    if (!isOnline) return { className: 'bg-yellow-900 text-yellow-300', label: 'Browser offline' };
    return { className: 'bg-green-900 text-green-300', label: 'Live Database' };
  })();

  // ---------- display pages ----------
  const anyInPlay = tables.some((t) => getStatus(t) === 'in_play');
  let featured = null;
  let pages = [];
  if (anyInPlay) {
    const inPlayTables = tables.filter((t) => getStatus(t) === 'in_play');
    featured = inPlayTables.length
      ? [...inPlayTables].sort(
          (a, b) =>
            new Date(b.lastUpdated || b.createdAt || 0) - new Date(a.lastUpdated || a.createdAt || 0)
        )[0]
      : null;
    const rest = featured ? tables.filter((t) => t.id !== featured.id) : tables;
    pages = featured ? [[featured], ...chunk(rest, 2)] : chunk(rest, 2);
  } else {
    const sortedByNumber = [...tables].sort(
      (a, b) => parseInt(a.tableNumber || 0, 10) - parseInt(b.tableNumber || 0, 10)
    );
    pages = chunk(sortedByNumber, 2);
  }
  const pagesCount = Math.max(1, pages.length);
  const visibleTables = pages[displayPage] || [];

  // ===================== DRAW LOGIC =====================
  const parseNames = (text) =>
    text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

  const prepareDraw = (textOverride) => {
    const sourceText = textOverride ?? participantsText;
    const names = parseNames(sourceText);
    if (!names.length) {
      window.alert('Add at least one participant name.');
      return;
    }
    if (seatsPerTable <= 0) {
      window.alert('Seats per table must be greater than 0.');
      return;
    }

    const base = names.map((name, i) => ({ id: `${name}-${i}`, name }));
    const shuffled = shuffle(base); // randomness each run
    const tCount = Math.ceil(shuffled.length / seatsPerTable);

    const tablesPreview = Array.from({ length: tCount }, (_, idx) => ({
      tableNumber: idx + 1,
      seats: seatsPerTable,
    }));

    const targets = {};
    shuffled.forEach((p, idx) => {
      const tableIdx = Math.floor(idx / seatsPerTable);
      const seat = (idx % seatsPerTable) + 1;
      targets[p.id] = { tableIdx, seat };
    });

    setParticipants(base);
    setPreparedTables(tablesPreview);
    setSeatTargets(targets);
    setSeatOccupants({});
    setAnimOrder(shuffled.map((p) => p.id));
    setAnimIndex(0);
    setDrawPhase('prepared');
  };

  const saveDrawToFirestore = async ({ silent = false } = {}) => {
    if (!db) {
      if (!silent) window.alert('Database not ready.');
      return;
    }
    if (!requireWrite()) return;
    if (drawPhase !== 'done') {
      if (!silent) window.alert('Run the animation first, then save.');
      return;
    }

    try {
      const tCount = preparedTables.length;
      const tablesOut = Array.from({ length: tCount }, (_, idx) => ({ tableNumber: idx + 1, players: [] }));

      for (let idx = 0; idx < tCount; idx++) {
        for (let seat = 1; seat <= seatsPerTable; seat++) {
          const key = `${idx}-${seat}`;
          const id = seatOccupants[key];
          if (!id) continue;
          const p = participants.find((x) => x.id === id);
          if (!p) continue;
          tablesOut[idx].players.push({ name: p.name, chips: Number(startingChips || 0), seat });
        }
      }

      // wipe existing tables then write
      let cursor = null;
      while (true) {
        const q = cursor
          ? query(fsCollection(db, 'tables'), orderBy(documentId()), startAfter(cursor), limit(500))
          : query(fsCollection(db, 'tables'), orderBy(documentId()), limit(500));

        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();

        cursor = snap.docs[snap.docs.length - 1].id;
      }

      for (const t of tablesOut) {
        await addDoc(fsCollection(db, 'tables'), {
          tableNumber: t.tableNumber,
          players: t.players,
          status: 'not_playing',
          inPlay: false,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        });
      }

      if (!silent) window.alert('Draw saved to Firestore.');
    } catch (e) {
      console.error('Save draw failed:', e);
      if (!silent) window.alert(`Save failed: ${e.code || 'error'} — ${e.message || ''}`);
    }
  };

  const startAnimation = () => {
    if (drawPhase !== 'prepared') return;
    setDrawPhase('animating');

    animTimerRef.current = setInterval(() => {
      setAnimIndex((i) => {
        const next = i + 1;
        const id = animOrder[i];
        if (id) {
          const t = seatTargets[id];
          const key = `${t.tableIdx}-${t.seat}`;
          setSeatOccupants((prev) => ({ ...prev, [key]: id }));
        }
        if (next >= animOrder.length) {
          clearInterval(animTimerRef.current);
          animTimerRef.current = null;
          setDrawPhase('done');

          if (autoSwitchToDisplay) {
            (async () => {
              await saveDrawToFirestore({ silent: true });
              setTimeout(() => setCurrentView('display'), 400);
            })();
          }
        }
        return next;
      });
    }, DRAW_STEP_MS);
  };

  const resetDraw = () => {
    if (animTimerRef.current) {
      clearInterval(animTimerRef.current);
      animTimerRef.current = null;
    }
    setSeatOccupants({});
    setAnimIndex(0);
    setDrawPhase('prepared');
  };

  const clearDraw = () => {
    if (animTimerRef.current) {
      clearInterval(animTimerRef.current);
      animTimerRef.current = null;
    }
    setParticipantsText('');
    setParticipants([]);
    setPreparedTables([]);
    setSeatTargets({});
    setSeatOccupants({});
    setAnimOrder([]);
    setAnimIndex(0);
    setDrawPhase('idle');
  };

  // ---- helper to update shared UI controls doc ----
  const updateUi = async (patch) => {
    if (!db) return;
    try {
      await updateDoc(fsDoc(db, 'controls', 'ui'), { ...patch, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.error('Failed to update UI controls', e);
    }
  };

  // ---------- ADMIN VIEW ----------
  const renderAdminView = () => (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8 gap-4">
          <h1 className="text-3xl font-bold text-blue-400 flex items-center gap-3">
            <Settings className="w-8 h-8" />
            Tournament Admin Panel
            <div className={`flex items-center gap-2 text-sm px-3 py-1 rounded-full ${statusChip.className}`}>
              <Database className="w-4 h-4" />
              {statusChip.label}
            </div>
          </h1>

        <div className="flex gap-3 items-center flex-wrap">
            <div className="flex items-center gap-2 mr-2">
              {authReady && user ? (
                <>
                  <span className="text-sm text-emerald-300 bg-emerald-900/60 px-2 py-1 rounded flex items-center gap-1">
                    <Lock className="w-3 h-3" /> {user.email}
                  </span>
                  <button onClick={headerSignOut} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg flex items-center gap-2">
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <LogIn className="w-3 h-3" /> Please sign in
                </span>
              )}
            </div>

            <button onClick={exportTableSummaryToExcel} className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg flex items-center gap-2">
              <Download className="w-4 h-4" /> Export Summary
            </button>

            <button onClick={() => setCurrentView('podium')} className="bg-pink-600 hover:bg-pink-700 px-4 py-2 rounded-lg flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Podium
            </button>

            <button onClick={showCastingOptions} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg flex items-center gap-2">
              <Cast className="w-5 h-5" /> Cast to TV
            </button>

            <button onClick={startScreenShare} className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Share Screen
            </button>

            <button onClick={() => setCurrentView('display')} className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg flex items-center gap-2">
              <Monitor className="w-5 h-5" /> View Display
            </button>

            <button onClick={() => setCurrentView('draw')} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-white">
              Random Draw
            </button>

            <button
              onClick={deleteAllTables}
              disabled={!tables.length || !db || !canWrite}
              className={`px-4 py-2 rounded-lg text-white ${!tables.length || !db || !canWrite ? 'bg-gray-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
              title="Delete all tables from Firestore"
            >
              Delete All Data
            </button>

            <div className="text-sm text-gray-400">
              Last update: {new Date(lastUpdate).toLocaleTimeString()}
              {isCasting && <div className="text-purple-400 font-medium">🎯 Casting Active</div>}
            </div>
          </div>
        </div>

        {/* Add New Table */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4 text-blue-300">Add New Table</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Table Number</label>
              <input
                type="number"
                value={newTable.tableNumber}
                onChange={(e) => setNewTable({ ...newTable, tableNumber: e.target.value })}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:border-blue-500 focus:outline-none"
                placeholder="Enter table number"
              />

              <div className="mt-4">
                <span className="block text-sm font-medium mb-2">Initial Status</span>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setNewTable((t) => ({ ...t, status: 'not_playing' }))} className={`px-3 py-1 rounded ${newTable.status === 'not_playing' ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                    <span className="inline-flex items-center gap-1"><PauseCircle className="w-4 h-4" /> Not Playing</span>
                  </button>
                  <button onClick={() => setNewTable((t) => ({ ...t, status: 'in_play' }))} className={`px-3 py-1 rounded ${newTable.status === 'in_play' ? 'bg-green-700' : 'bg-green-800 hover:bg-green-700'}`}>
                    <span className="inline-flex items-center gap-1"><PlayCircle className="w-4 h-4" /> In Play</span>
                  </button>
                  <button onClick={() => setNewTable((t) => ({ ...t, status: 'finished' }))} className={`px-3 py-1 rounded ${newTable.status === 'finished' ? 'bg-red-700' : 'bg-red-800 hover:bg-red-700'}`}>
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Finished</span>
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Add Players</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newPlayer.name}
                  onChange={(e) => setNewPlayer((p) => ({ ...p, name: e.target.value }))}
                  className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:outline-none"
                  placeholder="Player name"
                />
                <input
                  type="number"
                  value={newPlayer.chips}
                  onChange={(e) => setNewPlayer((p) => ({ ...p, chips: e.target.value }))}
                  className="w-32 p-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:outline-none"
                  placeholder="starting chips"
                />
                <button onClick={addPlayerToNewTable} className="bg-blue-600 hover:bg-blue-700 p-2 rounded transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1 max-h-32 overflow-y-auto">
                {newTable.players.map((player, index) => (
                  <div key={index} className="flex justify-between items-center bg-gray-700 p-2 rounded text-sm">
                    <span>{player.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">{player.chips.toLocaleString()} chips</span>
                      <button onClick={() => removePlayerFromNewTable(index)} className="text-red-400 hover:text-red-300">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addTable}
                disabled={!canWrite || !newTable.tableNumber || newTable.players.length === 0}
                className={`w-full mt-4 p-3 rounded-lg font-medium transition-colors ${!canWrite || !newTable.tableNumber || !newTable.players.length ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
              >
                Create Table
              </button>
              {!canWrite && (
                <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Sign in to add tables
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Existing Tables */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {tables.map((table) => {
            const st = getStatus(table);
            return (
              <div key={table.id} className="bg-gray-800 rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-blue-300">Table {table.tableNumber}</h3>
                  <button
                    onClick={() => deleteTable(table.id)}
                    disabled={!canWrite}
                    className={`${!canWrite ? 'text-gray-500 cursor-not-allowed' : 'text-red-400 hover:text-red-300'} p-1`}
                    title={!canWrite ? 'Sign in to delete' : 'Delete table'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-2 mb-4 flex-wrap">
                  <button
                    onClick={() => setTableStatus(table.id, 'not_playing')}
                    disabled={!canWrite}
                    className={`px-3 py-1 rounded text-sm ${getStatus(table) === 'not_playing' ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'} ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="inline-flex items-center gap-1"><PauseCircle className="w-4 h-4" /> Not Playing</span>
                  </button>
                  <button
                    onClick={() => setTableStatus(table.id, 'in_play')}
                    disabled={!canWrite}
                    className={`px-3 py-1 rounded text-sm ${getStatus(table) === 'in_play' ? 'bg-green-700' : 'bg-green-800 hover:bg-green-700'} ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="inline-flex items-center gap-1"><PlayCircle className="w-4 h-4" /> In Play</span>
                  </button>
                  <button
                    onClick={() => setTableStatus(table.id, 'finished')}
                    disabled={!canWrite}
                    className={`px-3 py-1 rounded text-sm ${getStatus(table) === 'finished' ? 'bg-red-700' : 'bg-red-800 hover:bg-red-700'} ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Finished</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {table.players?.map((player, playerIndex) => {
                    const seatLabel = player.seat ?? playerIndex + 1;
                    return (
                      <div key={playerIndex} className="flex justify-between items-center bg-gray-700 p-3 rounded">
                        <span className="font-medium">
                          <span className="text-gray-400 mr-2">Seat {seatLabel}</span>
                          {player.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={player.chips}
                            onChange={(e) => updatePlayerChips(table.id, playerIndex, e.target.value)}
                            disabled={!canWrite}
                            className={`w-24 p-1 bg-gray-600 border border-gray-500 rounded text-right focus:border-blue-500 focus:outline-none ${!canWrite ? 'opacity-60 cursor-not-allowed' : ''}`}
                          />
                          <span className="text-sm text-gray-300">chips</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ---------- DRAW VIEW ----------
  const renderDrawView = () => {
    const tCount = preparedTables.length;

    const Inner = () => (
      <div className="min-h-screen text-white p-6 w-full">
        {/* header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-blue-400 flex items-center gap-3">
            <Settings className="w-7 h-7" />
            Random Draw
          </h1>
          <div className="flex gap-3">
            <button onClick={() => setDrawPresentation((v) => !v)} className="bg-slate-600 hover:bg-slate-700 px-4 py-2 rounded-lg">
              {drawPresentation ? 'Exit Presentation' : 'Presentation Mode'}
            </button>
            <button onClick={() => setCurrentView('admin')} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">
              Back to Admin
            </button>
            <button onClick={() => setCurrentView('display')} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg">
              View Display
            </button>
          </div>
        </div>

        {/* Inputs panel (memoized to keep focus) */}
        {!drawPresentation && (
          <DrawParticipantsPanel
            initialText={participantsText}
            seatsPerTable={seatsPerTable}
            startingChips={startingChips}
            autoOpen={autoSwitchToDisplay}
            onChangeSeats={setSeatsPerTable}
            onChangeChips={setStartingChips}
            onToggleAutoOpen={setAutoSwitchToDisplay}
            onPrepare={(text) => {
              setParticipantsText(text);
              prepareDraw(text);
            }}
            onStart={startAnimation}
            onReset={resetDraw}
            onClear={clearDraw}
            onSave={() => saveDrawToFirestore({ silent: false })}
            canSave={drawPhase === 'done' && !!user}
            statusLabel={
              drawPhase === 'idle' ? 'Idle' :
              drawPhase === 'prepared' ? 'Ready to animate' :
              drawPhase === 'animating' ? 'Animating…' : 'Done'
            }
          />
        )}

        {/* Two-column: sticky Name Pool + responsive Tables */}
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)] grid-cols-1 w-full">
          {/* Name Pool - always visible */}
          <div className="bg-gray-800 p-4 rounded-lg xl:sticky xl:top-24 xl:max-h-[calc(100vh-8rem)] xl:overflow-auto">
            <h2 className="text-lg font-semibold mb-3">Name Pool</h2>
            <p className="text-sm text-gray-400 mb-3">
              All names start here. Click <span className="text-gray-200 font-medium">Start Animation</span> to fly them to seats.
            </p>
            <LayoutGroup>
              <div className="min-h-[16rem] grid grid-cols-2 sm:grid-cols-3 gap-2">
                {participants
                  .filter((p) => !Object.values(seatOccupants).includes(p.id))
                  .map((p) => (
                    <motion.div
                      key={p.id}
                      layoutId={p.id}
                      layout
                      className="rounded-md bg-gray-700 border border-gray-600 text-white shadow"
                      style={{ padding: `${8 * uiScale}px ${12 * uiScale}px`, fontSize: `${14 * uiScale}px` }}
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    >
                      {p.name}
                    </motion.div>
                  ))}
                {!participants.length && <div className="text-gray-400 text-sm">Paste names and click Prepare.</div>}
              </div>
            </LayoutGroup>
          </div>

          {/* Tables */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-3">
              Tables {tCount ? `(auto: ${tCount})` : ''}
            </h2>

            {/* Zoom + density controls */}
            <div className="flex items-center gap-4 mb-4 text-sm text-gray-300">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} className="w-4 h-4" />
                Compact seats
              </label>
              <label className="inline-flex items-center gap-2">
                Zoom
                <input
                  type="range"
                  min="0.8"
                  max="1.6"
                  step="0.05"
                  value={uiScale}
                  onChange={(e) => setUiScale(parseFloat(e.target.value))}
                />
                <span className="w-12 text-right">{Math.round(uiScale * 100)}%</span>
              </label>
            </div>

            <LayoutGroup>
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(auto-fit, minmax(${Math.round(320 * uiScale)}px, 1fr))`,
                  gap: `${16 * uiScale}px`,
                }}
              >
                {preparedTables.map((t, tIdx) => (
                  <div
                    key={t.tableNumber}
                    className="rounded-xl border border-gray-600 bg-gray-900/60"
                    style={{ padding: `${20 * uiScale}px` }}
                  >
                    <div className="flex items-center justify-between mb-3" style={{ marginBottom: `${12 * uiScale}px` }}>
                      <div className="text-blue-300 font-semibold" style={{ fontSize: `${16 * uiScale}px` }}>
                        Table {t.tableNumber}
                      </div>
                      <div className="text-xs text-gray-400" style={{ fontSize: `${12 * uiScale}px` }}>
                        {Array.from({ length: seatsPerTable }).filter((_, seat) => seatOccupants[`${tIdx}-${seat + 1}`]).length}
                        {' / '}
                        {seatsPerTable}
                      </div>
                    </div>

                    <div className={`grid gap-3 ${seatsPerTable <= 8 ? 'grid-cols-2' : 'grid-cols-3'}`} style={{ gap: `${12 * uiScale}px` }}>
                      {Array.from({ length: seatsPerTable }).map((_, i) => {
                        const seat = i + 1;
                        const key = `${tIdx}-${seat}`;
                        const occId = seatOccupants[key];
                        const occ = participants.find((p) => p.id === occId);

                        const seatHeight = (compact ? 56 : 76) * uiScale;
                        const seatLabelSize = 14 * uiScale;
                        const chipFont = (compact ? 14 : 16) * uiScale;
                        const chipPadY = (compact ? 6 : 8) * uiScale;
                        const chipPadX = (compact ? 12 : 14) * uiScale;

                        return (
                          <div key={key} className="flex items-stretch gap-2" style={{ height: `${seatHeight}px`, gap: `${8 * uiScale}px` }}>
                            {/* Fixed seat card */}
                            <div
                              className="flex items-center justify-center rounded-md border border-gray-600 bg-gray-800/80 text-gray-200 font-semibold"
                              style={{ width: `${90 * uiScale}px`, minWidth: `${90 * uiScale}px`, fontSize: `${seatLabelSize}px` }}
                            >
                              Seat {seat}
                            </div>

                            {/* Name target card */}
                            <div className="relative flex-1 rounded-md border border-dashed border-gray-600 bg-gray-800/60">
                              {occ && (
                                <motion.div
                                  layoutId={occ.id}
                                  layout
                                  className="absolute inset-0 z-10 flex items-center justify-center"
                                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                                >
                                  <div
                                    className="rounded bg-gray-200 text-gray-900 font-semibold shadow"
                                    style={{ fontSize: `${chipFont}px`, padding: `${chipPadY}px ${chipPadX}px` }}
                                  >
                                    {occ.name}
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {drawPhase === 'idle' && (
                <div className="text-gray-400 text-sm mt-4">
                  After you click <span className="text-gray-200 font-medium">Prepare</span>, empty tables will appear here.
                </div>
              )}
            </LayoutGroup>
          </div>
        </div>

        {/* Floating controls in presentation mode (Ctrl+Space toggles visibility) */}
        {drawPresentation && hudVisible && (
          <div className="fixed bottom-6 right-6 flex items-center gap-2">
            <button
              onClick={startAnimation}
              disabled={drawPhase !== 'prepared'}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg"
            >
              Start
            </button>
            <button
              onClick={resetDraw}
              disabled={drawPhase === 'idle'}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg"
            >
              Reset
            </button>
            <button
              onClick={() => saveDrawToFirestore({ silent: false })}
              disabled={drawPhase !== 'done' || !canWrite}
              className={`px-4 py-2 rounded-lg ${drawPhase !== 'done' || !canWrite ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              Save
            </button>

            {/* small fit toggle */}
            <div className="ml-3 text-xs text-gray-200 bg-gray-800/80 px-2 py-1 rounded">
              Fit:{' '}
              <button className="underline" onClick={() => setFitToScreen((v) => !v)} title="Toggle fit-to-screen">
                {fitToScreen ? 'On' : 'Off'}
              </button>
              <span className="ml-2 opacity-70">Ctrl+Space hides HUD</span>
            </div>
          </div>
        )}
      </div>
    );

    return drawPresentation && fitToScreen ? (
      <FitToViewport bgClass="bg-gray-900">
        <div className="w-[100vw]">
          <Inner />
        </div>
      </FitToViewport>
    ) : (
      <Inner />
    );
  };

  // ---------- PODIUM VIEW (defaults BLANK; manual only) ----------
  const PodiumView = () => {
    const isPublicDisplay = publicDisplayBypass;

    // Firestore-synced values:
    const setupVisible = !!ui.podiumSetupVisible;
    const podiumScale = Number(ui.podiumScale || 1.4);
    const prizes = ui.podiumPrizes || { first: 0, second: 0, third: 0 };
    const selection = ui.podiumSelection || { firstId: '', secondId: '', thirdId: '' };

    const allPlayers = flatPlayers(tables).sort((a, b) => (b.chips || 0) - (a.chips || 0));

    // NEW: Only use manual selections; leave blank if not selected.
    function pickWinners() {
      const pool = [...allPlayers];
      const takeById = (id) => {
        if (!id) return null;
        const i = pool.findIndex((p) => p.id === id);
        if (i >= 0) { const [p] = pool.splice(i, 1); return p; }
        return null;
      };
      const w1 = takeById(selection.firstId) || null;
      const w2 = takeById(selection.secondId) || null;
      const w3 = takeById(selection.thirdId) || null;
      return [w1, w2, w3];
    }
    const [w1, w2, w3] = pickWinners();

    const StageCard = ({ place, person, baseW, baseH, color, prize }) => {
      const w = `${baseW * podiumScale}rem`;
      const h = `${baseH * podiumScale}rem`;
      const nameClass = `font-extrabold ${podiumScale >= 1.4 ? 'text-4xl md:text-5xl' : 'text-2xl md:text-3xl'}`;

      return (
        <div className="flex flex-col items-center">
          <div
            className="flex items-center justify-center rounded-t-2xl shadow-lg"
            style={{ width: w, height: h, background: color }}
          >
            <div className="text-center px-4">
              <div className={nameClass}>{person?.name || '—'}</div>
              {person && (
                <div className="mt-1 text-sm md:text-base opacity-90">
                  Table {person.tableNumber} • Seat {person.seat}
                </div>
              )}
              {person && (
                <div className="mt-2 text-base md:text-lg font-semibold opacity-90">
                  {Number(person.chips || 0).toLocaleString()} chips
                </div>
              )}
            </div>
          </div>
          <div className="bg-gray-900/70 border border-gray-700 w-full text-center py-2 rounded-b-2xl mt-[1px]">
            <span className="font-bold">{place}</span>
            <span className="ml-2 text-gray-300">{gbp(prize)}</span>
          </div>
        </div>
      );
    };

    const Inner = () => (
      <div className="min-h-screen text-white p-8 w-full">
        {!isPublicDisplay && (
          <div className="flex justify-end mb-3">
            <button
              onClick={() => updateUi({ podiumSetupVisible: !setupVisible })}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg"
              title="Show/Hide setup on all devices"
            >
              {!isPublicDisplay && setupVisible ? 'Hide Setup' : 'Show Setup'}
            </button>
          </div>
        )}

        {!isPublicDisplay && setupVisible && (
          <PodiumSetupPanel
            initialPrizes={{ first: prizes.first, second: prizes.second, third: prizes.third }}
            initialSelection={{ firstId: selection.firstId, secondId: selection.secondId, thirdId: selection.thirdId }}
            players={allPlayers}
            onChangePrizes={(p) => {
              setPodiumConfig((s) => ({ ...s, firstPrize: p.first, secondPrize: p.second, thirdPrize: p.third }));
              updateUi({ podiumPrizes: p });
            }}
            onChangeSelection={(sel) => {
              setPodiumConfig((s) => ({ ...s, firstWinnerId: sel.firstId, secondWinnerId: sel.secondId, thirdWinnerId: sel.thirdId }));
              updateUi({ podiumSelection: sel });
            }}
            onBackToDisplay={() => setCurrentView('display')}
            onExportExcel={() => exportPodiumToExcel([w1, w2, w3])}
            podiumScale={podiumScale}
            onChangeScale={(val) => updateUi({ podiumScale: val })}
          />
        )}

        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-3">
            <span className="text-yellow-400 text-4xl">🏆</span>
            <h1 className="text-5xl font-extrabold">Podium</h1>
          </div>
          <div className="text-gray-300 mt-2">Announce the winners</div>
        </div>

        <div className="flex flex-col items-center mt-8">
          <div className="flex items-end justify-center gap-6 w-full max-w-7xl">
            <StageCard
              place="2nd"
              person={w2}
              baseW={14}
              baseH={12}
              color="linear-gradient(180deg,#c0c0c0,#8d8d8d)"
              prize={prizes.second}
            />
            <StageCard
              place="1st"
              person={w1}
              baseW={18}
              baseH={16}
              color="linear-gradient(180deg,#ffd54d,#ffb300)"
              prize={prizes.first}
            />
            <StageCard
              place="3rd"
              person={w3}
              baseW={14}
              baseH={10}
              color="linear-gradient(180deg,#d7a97f,#8a6a4f)"
              prize={prizes.third}
            />
          </div>

          <div className="mt-2 flex justify-center gap-6 w-full max-w-7xl">
            <div className="bg-gray-800 h-3 w-56 rounded" />
            <div className="bg-gray-800 h-3 w-72 rounded" />
            <div className="bg-gray-800 h-3 w-56 rounded" />
          </div>
        </div>
      </div>
    );

    return fitToScreen ? (
      <FitToViewport bgClass="bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
        <div className="w-[100vw]">
          <Inner />
        </div>
      </FitToViewport>
    ) : (
      <Inner />
    );
  };

  // ---------- DISPLAY VIEW ----------
  const renderDisplayView = () => {
    const Inner = () => (
      <div className="min-h-screen text-white p-8 w-full">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-3">
            Ultimate Texas Hold&apos;em Tournament
          </h1>
        </div>

        <div className="text-lg text-gray-300 flex items-center justify-center gap-4 mb-6">
          Updated: {new Date(lastUpdate).toLocaleTimeString()}
          {firebaseReady && isOnline ? (
            <div className="flex items-center gap-2 bg-green-900 px-3 py-1 rounded-full text-sm">
              <Database className="w-4 h-4" />
              <Wifi className="w-4 h-4" />
              Live Database
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-yellow-900 px-3 py-1 rounded-full text-sm">
              <WifiOff className="w-4 h-4" />
              Offline
            </div>
          )}
        </div>

        {pagesCount > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3 text-sm text-gray-300">
            <button
              onClick={() => setDisplayPage((p) => (p - 1 + pagesCount) % pagesCount)}
              className="px-2 py-1 bg-gray-700/60 rounded hover:bg-gray-700"
              title="Previous screen"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>
              Screen {displayPage + 1} of {pagesCount}
            </span>
            <button
              onClick={() => setDisplayPage((p) => (p + 1) % pagesCount)}
              className="px-2 py-1 bg-gray-700/60 rounded hover:bg-gray-700"
              title="Next screen"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className={`grid gap-8 w-full ${visibleTables.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
          {visibleTables.map((table) => {
            const st = getStatus(table);
            const badge = statusBadge(st);

            const playersSorted = [...(table.players || [])].sort(
              (a, b) => (b.chips || 0) - (a.chips || 0) || (a.seat || 0) - (b.seat || 0)
            );

            return (
              <div
                key={table.id}
                className={`relative overflow-hidden rounded-2xl ${
                  st === 'in_play'
                    ? 'bg-gradient-to-br from-green-800 to-green-900 border-2 border-green-400 shadow-lg shadow-green-400/20'
                    : st === 'finished'
                    ? 'bg-gradient-to-br from-red-800 to-red-900 border-2 border-red-400 shadow-lg shadow-red-400/20'
                    : 'bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-600'
                }`}
              >
                <div className={`absolute top-4 right-4 px-4 py-2 rounded-full text-sm font-bold ${badge.cls}`}>
                  {badge.text}
                </div>

                <div className="p-8">
                  <div className="text-center mb-6">
                    <h2 className="text-4xl font-bold text-white mb-2">TABLE {table.tableNumber}</h2>
                    <div className="text-lg text-gray-300">
                      {playersSorted.length} Player{playersSorted.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {playersSorted.map((player, index) => {
                      const seatLabel = player.seat ?? index + 1;
                      return (
                        <div key={`${player.name}-${seatLabel}`} className="bg-black/30 backdrop-blur-sm rounded-lg p-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="text-xl font-bold text-white">
                                <span className="text-gray-300 mr-3 text-base">Seat {seatLabel}</span>
                                {player.name}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-green-400">
                                {Number(player.chips || 0).toLocaleString()}
                              </div>
                              <div className="text-sm text-gray-400">chips</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!playersSorted.length && (
                    <div className="text-center py-8 text-gray-400">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <div>No players assigned</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {tables.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎰</div>
            <div className="text-2xl text-gray-400 mb-2">No tables configured</div>
            <div className="text-lg text-gray-500">Use the admin panel to set up tournament tables</div>
          </div>
        )}

        {hudVisible && (
          <div className="fixed bottom-6 left-6 flex items-center gap-3">
            <button onClick={() => setCurrentView('admin')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-colors">
              <Settings className="w-5 h-5" /> Admin Panel
            </button>

            <button onClick={() => setCurrentView('podium')} className="bg-pink-600 hover:bg-pink-700 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-colors">
              <Trophy className="w-5 h-5" /> Podium
            </button>

            <button onClick={showCastingOptions} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-colors">
              <Cast className="w-5 h-5" /> Cast Options
            </button>

            <div className="ml-3 text-xs text-gray-200 bg-gray-800/80 px-2 py-1 rounded">
              Fit:{' '}
              <button className="underline" onClick={() => setFitToScreen((v) => !v)} title="Toggle fit-to-screen">
                {fitToScreen ? 'On' : 'Off'}
              </button>
              <span className="ml-2 opacity-70">Ctrl+Space hides HUD</span>
            </div>
          </div>
        )}
      </div>
    );

    return fitToScreen ? (
      <FitToViewport bgClass="bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
        <div className="w-[100vw]">
          <Inner />
        </div>
      </FitToViewport>
    ) : (
      <Inner />
    );
  };

  /* ======== LOGIN GATE ======== */
  if (authReady && !user && !publicDisplayBypass) {
    return <LoginScreen onSignIn={signInAdmin} isBusy={gateBusy} error={gateError} />;
  }

  // Choose view
  return currentView === 'admin'
    ? renderAdminView()
    : currentView === 'draw'
    ? renderDrawView()
    : currentView === 'podium'
    ? <PodiumView />
    : renderDisplayView();
};

export default PokerTournamentApp;
