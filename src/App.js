import { useState, useEffect, useRef } from 'react';
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
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAygueD0U3-aRMarRi7thg5M4Z4QnH21Po',
  authDomain: 'poker-tournament-app-98a32.firebaseapp.com',
  projectId: 'poker-tournament-app-98a32',
  storageBucket: 'poker-tournament-app-98a32.firebasestorage.app',
  messagingSenderId: '146461312885',
  appId: '1:146461312885:web:13640c72d6c80967b6353c',
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

// ===========================================================
const PokerTournamentApp = () => {
  const [tables, setTables] = useState([]);
  const [currentView, setCurrentView] = useState('admin');
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

  // ===== Random Draw state & animation =====
  const [participantsText, setParticipantsText] = useState('');
  const [seatsPerTable, setSeatsPerTable] = useState(9);
  const [startingChips, setStartingChips] = useState(0); // NEW: starting chips for draw save
  const [autoSwitchToDisplay, setAutoSwitchToDisplay] = useState(true); // NEW: auto-open Live Display after animation

  const [drawPhase, setDrawPhase] = useState('idle'); // idle | prepared | animating | done
  const [participants, setParticipants] = useState([]); // [{id, name}]
  const [preparedTables, setPreparedTables] = useState([]); // [{tableNumber, seats}]
  const [seatTargets, setSeatTargets] = useState({}); // id -> {tableIdx, seat}
  const [seatOccupants, setSeatOccupants] = useState({}); // `${tableIdx}-${seat}` -> participant id
  const [animOrder, setAnimOrder] = useState([]); // ids in the order we animate
  const [animIndex, setAnimIndex] = useState(0);
  const animTimerRef = useRef(null);

  // ---------- init Firestore + live listener ----------
  useEffect(() => {
    let unsub = null;
    try {
      const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      setDb(firestore);

      unsub = onSnapshot(
        fsCollection(firestore, 'tables'),
        (snap) => {
          const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setTables(data);
          setLastUpdate(Date.now());
          setFirebaseReady(true);
        },
        (err) => {
          console.error('Firestore listener error:', err);
          setFirebaseReady(false);
        }
      );
    } catch (e) {
      console.error('Firebase init error:', e);
      setFirebaseReady(false);
      setDb(null);
    }
    return () => unsub && unsub();
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

  // ---------- auto-rotate display pages every 20s ----------
  useEffect(() => {
    const inPlayTables = tables.filter((t) => getStatus(t) === 'in_play');
    const featured = inPlayTables.length
      ? [...inPlayTables].sort(
          (a, b) =>
            new Date(b.lastUpdated || b.createdAt || 0) - new Date(a.lastUpdated || a.createdAt || 0)
        )[0]
      : null;

    // If there is an in-play table, we keep the featured-first rotation logic.
    // If **none** are in play (i.e., all waiting/finished), pagesCount will be computed later from sorted tables.
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

  // ---------- actions ----------
  const addTable = async () => {
    if (!db) return;
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
    if (!db) return;
    try {
      await deleteDoc(fsDoc(db, 'tables', tableId));
    } catch (e) {
      console.error('Failed to delete table:', e);
      window.alert(`Could not delete table. ${e.code || ''} ${e.message || ''}`);
    }
  };

  const setTableStatus = async (tableId, status) => {
    if (!db) return;
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
    if (!db) return;
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
    if (!db) return;
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

  // ---------- casting helpers ----------
  const startScreenShare = async () => {
    try {
      setCurrentView('display');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' },
        audio: false,
      });

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

  // ---------- display page building ----------
  const anyInPlay = tables.some((t) => getStatus(t) === 'in_play');

  // If none are in-play, sort by tableNumber asc; otherwise keep featured-first logic.
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
      (a, b) => (parseInt(a.tableNumber || 0, 10)) - (parseInt(b.tableNumber || 0, 10))
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

  const prepareDraw = () => {
    const names = parseNames(participantsText);
    if (!names.length) {
      window.alert('Add at least one participant name.');
      return;
    }
    if (seatsPerTable <= 0) {
      window.alert('Seats per table must be greater than 0.');
      return;
    }

    const base = names.map((name, i) => ({ id: `${name}-${i}`, name }));
    const shuffled = shuffle(base);
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
            // small pause so the last chip settles visually
            setTimeout(() => setCurrentView('display'), 600);
          }
        }
        return next;
      });
    }, 400);
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

  const saveDrawToFirestore = async () => {
    if (!db) {
      window.alert('Database not ready.');
      return;
    }
    if (drawPhase !== 'done') {
      window.alert('Run the animation first, then save.');
      return;
    }

    try {
      // Build final tables from seatOccupants
      const tCount = preparedTables.length;
      const tablesOut = Array.from({ length: tCount }, (_, idx) => ({
        tableNumber: idx + 1,
        players: [],
      }));

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

      window.alert('Draw saved to Firestore.');
    } catch (e) {
      console.error('Save draw failed:', e);
      window.alert(`Save failed: ${e.code || 'error'} — ${e.message || ''}`);
    }
  };

  // ---------- ADMIN VIEW ----------
  const renderAdminView = () => (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-blue-400 flex items-center gap-3">
            <Settings className="w-8 h-8" />
            Tournament Admin Panel
            <div className={`flex items-center gap-2 text-sm px-3 py-1 rounded-full ${statusChip.className}`}>
              <Database className="w-4 h-4" />
              {statusChip.label}
            </div>
          </h1>

        <div className="flex gap-4 items-center">
            <div className="flex gap-2">
              <button
                onClick={showCastingOptions}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Cast className="w-5 h-5" />
                Cast to TV
              </button>

              <button
                onClick={startScreenShare}
                className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                title="Start screen sharing"
              >
                <Monitor className="w-4 h-4" />
                Share Screen
              </button>
            </div>

            <button
              onClick={() => setCurrentView('display')}
              className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Monitor className="w-5 h-5" />
              View Display
            </button>

            <button
              onClick={() => setCurrentView('draw')}
              className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-white"
            >
              Random Draw
            </button>

            <button
              onClick={deleteAllTables}
              disabled={!tables.length || !db}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-white"
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
                  <button
                    onClick={() => setNewTable((t) => ({ ...t, status: 'not_playing' }))}
                    className={`px-3 py-1 rounded ${newTable.status === 'not_playing' ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                  >
                    <span className="inline-flex items-center gap-1"><PauseCircle className="w-4 h-4" /> Not Playing</span>
                  </button>
                  <button
                    onClick={() => setNewTable((t) => ({ ...t, status: 'in_play' }))}
                    className={`px-3 py-1 rounded ${newTable.status === 'in_play' ? 'bg-green-700' : 'bg-green-800 hover:bg-green-700'}`}
                  >
                    <span className="inline-flex items-center gap-1"><PlayCircle className="w-4 h-4" /> In Play</span>
                  </button>
                  <button
                    onClick={() => setNewTable((t) => ({ ...t, status: 'finished' }))}
                    className={`px-3 py-1 rounded ${newTable.status === 'finished' ? 'bg-red-700' : 'bg-red-800 hover:bg-red-700'}`}
                  >
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
                disabled={!newTable.tableNumber || newTable.players.length === 0}
                className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed p-3 rounded-lg font-medium transition-colors"
              >
                Create Table
              </button>
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
                  <button onClick={() => deleteTable(table.id)} className="text-red-400 hover:text-red-300 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-2 mb-4 flex-wrap">
                  <button
                    onClick={() => setTableStatus(table.id, 'not_playing')}
                    className={`px-3 py-1 rounded text-sm ${st === 'not_playing' ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title="Not Playing"
                  >
                    <span className="inline-flex items-center gap-1"><PauseCircle className="w-4 h-4" /> Not Playing</span>
                  </button>
                  <button
                    onClick={() => setTableStatus(table.id, 'in_play')}
                    className={`px-3 py-1 rounded text-sm ${st === 'in_play' ? 'bg-green-700' : 'bg-green-800 hover:bg-green-700'}`}
                    title="In Play"
                  >
                    <span className="inline-flex items-center gap-1"><PlayCircle className="w-4 h-4" /> In Play</span>
                  </button>
                  <button
                    onClick={() => setTableStatus(table.id, 'finished')}
                    className={`px-3 py-1 rounded text-sm ${st === 'finished' ? 'bg-red-700' : 'bg-red-800 hover:bg-red-700'}`}
                    title="Finished"
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
                            className="w-24 p-1 bg-gray-600 border border-gray-500 rounded text-right focus:border-blue-500 focus:outline-none"
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

    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-blue-400 flex items-center gap-3">
              <Settings className="w-7 h-7" />
              Random Draw
            </h1>
            <div className="flex gap-3">
              <button
                onClick={() => setCurrentView('admin')}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                Back to Admin
              </button>
              <button
                onClick={() => setCurrentView('display')}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg"
              >
                View Display
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left: Inputs */}
            <div className="bg-gray-800 p-6 rounded-lg xl:col-span-1">
              <h2 className="text-lg font-semibold mb-3">Participants</h2>
              <textarea
                value={participantsText}
                onChange={(e) => setParticipantsText(e.target.value)}
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
                    onChange={(e) => setSeatsPerTable(parseInt(e.target.value || '0', 10))}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Starting Chips</label>
                  <input
                    type="number"
                    min={0}
                    value={startingChips}
                    onChange={(e) => setStartingChips(parseInt(e.target.value || '0', 10))}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autoSwitchToDisplay}
                    onChange={(e) => setAutoSwitchToDisplay(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Auto-open Live Display when done
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={prepareDraw}
                  className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg"
                >
                  Prepare
                </button>
                <button
                  onClick={startAnimation}
                  disabled={drawPhase !== 'prepared'}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg"
                >
                  Start Animation
                </button>
                <button
                  onClick={resetDraw}
                  disabled={drawPhase === 'idle'}
                  className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg"
                >
                  Reset
                </button>
                <button
                  onClick={clearDraw}
                  className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg"
                >
                  Clear
                </button>
                <button
                  onClick={saveDrawToFirestore}
                  disabled={drawPhase !== 'done'}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg ml-auto"
                >
                  Save to Firestore
                </button>
              </div>

              <div className="mt-3 text-gray-300 text-sm">
                Status:&nbsp;
                {drawPhase === 'idle' && 'Idle'}
                {drawPhase === 'prepared' && 'Ready to animate'}
                {drawPhase === 'animating' && 'Animating…'}
                {drawPhase === 'done' && 'Done'}
              </div>
            </div>

            {/* Middle: Name pool */}
            <div className="bg-gray-800 p-6 rounded-lg xl:col-span-1">
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
                        className="px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-sm text-white shadow"
                        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                      >
                        {p.name}
                      </motion.div>
                    ))}
                  {!participants.length && (
                    <div className="text-gray-400 text-sm">Paste names and click Prepare.</div>
                  )}
                </div>
              </LayoutGroup>
            </div>

            {/* Right: Tables preview and target seats */}
            <div className="bg-gray-800 p-6 rounded-lg xl:col-span-1">
              <h2 className="text-lg font-semibold mb-3">
                Tables {tCount ? `(auto: ${tCount})` : ''}
              </h2>
              <LayoutGroup>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {preparedTables.map((t, tIdx) => (
                    <div
                      key={t.tableNumber}
                      className="rounded-xl border border-gray-600 bg-gray-900/60 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-blue-300 font-semibold">Table {t.tableNumber}</div>
                        <div className="text-xs text-gray-400">
                          {Array.from({ length: seatsPerTable }).filter((_, seat) =>
                            seatOccupants[`${tIdx}-${seat + 1}`]
                          ).length}{' '}
                          / {seatsPerTable}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {Array.from({ length: seatsPerTable }).map((_, i) => {
                          const seat = i + 1;
                          const key = `${tIdx}-${seat}`;
                          const occId = seatOccupants[key];
                          const occ = participants.find((p) => p.id === occId);

                          return (
                            <div
                              key={key}
                              className="relative h-10 rounded-md border border-dashed border-gray-600 bg-gray-800/60 flex items-center justify-between px-2"
                            >
                              <span className="text-xs text-gray-300">Seat {seat}</span>
                              {occ && (
                                <motion.div
                                  layoutId={occ.id}
                                  layout
                                  className="absolute inset-0 flex items-center justify-center"
                                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                                >
                                  <div className="px-3 py-1 rounded bg-gray-200 text-gray-900 text-sm font-medium">
                                    {occ.name}
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {drawPhase === 'idle' && (
                  <div className="text-gray-400 text-sm mt-4">
                    After you click <span className="text-gray-200 font-medium">Prepare</span>,
                    empty tables will appear here.
                  </div>
                )}
              </LayoutGroup>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ---------- DISPLAY VIEW ----------
  const renderDisplayView = () => (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-3">
            Ultimate Texas Hold&apos;em Tournament
          </h1>
          <div className="text-lg text-gray-300 flex items-center justify-center gap-4">
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
        </div>

        <div className={`grid gap-8 ${visibleTables.length === 1 ? 'grid-cols-1 max-w-3xl mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
          {visibleTables.map((table) => {
            const st = getStatus(table);
            const badge = statusBadge(st);

            // sort players by chips desc for display; tie-break by seat
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

                  {(!playersSorted.length) && (
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

        <div className="fixed bottom-6 left-6 flex gap-3">
          <button
            onClick={() => setCurrentView('admin')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-colors"
          >
            <Settings className="w-5 h-5" />
            Admin Panel
          </button>

          <button
            onClick={showCastingOptions}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-colors"
          >
            <Cast className="w-5 h-5" />
            Cast Options
          </button>
        </div>
      </div>
    </div>
  );

  // Choose view
  return currentView === 'admin'
    ? renderAdminView()
    : currentView === 'draw'
    ? renderDrawView()
    : renderDisplayView();
};

export default PokerTournamentApp;
