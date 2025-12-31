'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, query, orderByChild, limitToLast } from "firebase/database";

// --- SOLANA IMPORTS ---
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';

const WalletMultiButton = dynamic(
  async () =>
    (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

// ---------------------------------------------------------
// ⚠️ PASTE YOUR FIREBASE CONFIG HERE ⚠️
// ---------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDGhDdPagufkGaflK3EI7lhkkFXJM4jJj0",
  authDomain: "orbital-rush-db.firebaseapp.com",
  databaseURL: "https://orbital-rush-db-default-rtdb.firebaseio.com/",
  projectId: "orbital-rush-db",
  storageBucket: "orbital-rush-db.firebasestorage.app",
  messagingSenderId: "458701749674",
  appId: "1:458701749674:web:bf3e9c6a85a23b8cd6bfd3",
  measurementId: "G-KXBZX738M2"
};

// Initialize Firebase (Only once)
let database: any;
try {
    const app = initializeApp(firebaseConfig);
    database = getDatabase(app);
} catch (e) {
    console.error("Firebase init error", e);
}

// --- MAIN GAME LOGIC ---
function ScrollyGame() {
  const { publicKey } = useWallet();

  // --- STATE ---
  const [gameState, setGameState] = useState('START');
  const [score, setScore] = useState(0);
  const [diamonds, setDiamonds] = useState(0);
  const [totalDiamonds, setTotalDiamonds] = useState(0);
  const [level, setLevel] = useState(1);
  const [topScores, setTopScores] = useState<{ addr: string; score: number }[]>([]);
  const [magicEffect, setMagicEffect] = useState('');
  const [shake, setShake] = useState(false);
  const [hasShield, setHasShield] = useState(false);
  const [isGhost, setIsGhost] = useState(false);
  const [revived, setRevived] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [lastRunGems, setLastRunGems] = useState(0);
  const [comboText, setComboText] = useState('');

  // --- SHOP STATE ---
  const [ownedSkins, setOwnedSkins] = useState<string[]>(['default']);
  const [equippedSkin, setEquippedSkin] = useState('default');
  const [shopDetailItem, setShopDetailItem] = useState<any>(null); 

  // --- MUSIC STATE ---
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const MUSIC_TRACKS = [
    { name: "Default (Silent)", src: "" }, 
    { name: "No Music", src: "" },
    { name: "Silence", src: "" }
  ];

  const SKINS = [
    {
      id: 'default',
      name: 'Orbital One',
      price: 0,
      color: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #cbd5e1 100%)',
      shape: '50%',
    },
    {
      id: 'crimson',
      name: 'Crimson Ace',
      price: 50,
      color: 'linear-gradient(135deg, #ef4444, #991b1b)',
      shape: '0%',
    },
    {
      id: 'gold',
      name: 'Golden Cube',
      price: 200,
      color: 'linear-gradient(135deg, #facc15, #ca8a04)',
      shape: '4px',
    },
    {
      id: 'neon',
      name: 'Neon Ghost',
      price: 500,
      color: 'transparent',
      border: '3px solid #d8b4fe',
      shape: '50%',
    },
  ];

  const THEMES = [
    { name: 'CLASSIC', bg: 'linear-gradient(180deg, #0f172a 0%, #334155 100%)', color: '#cbd5e1' },
    { name: 'OCEAN', bg: 'radial-gradient(circle at center, #1e3a8a 0%, #020617 100%)', color: '#3b82f6' },
    { name: 'TOXIC', bg: 'linear-gradient(180deg, #064e3b 0%, #022c22 100%)', color: '#4ade80' },
    { name: 'MAGMA', bg: 'linear-gradient(180deg, #7f1d1d 0%, #450a0a 100%)', color: '#f87171' },
    { name: 'CYBER', bg: 'radial-gradient(circle at center, #581c87 0%, #2e1065 100%)', color: '#d8b4fe' },
    { name: 'VOID', bg: 'radial-gradient(circle at center, #000000 0%, #1c1917 100%)', color: '#facc15' },
  ];

  // --- REFS ---
  const playerRef = useRef<HTMLDivElement>(null);
  const playerY = useRef(300);
  const playerX = useRef(0);
  const velocity = useRef(0);
  const scoreVal = useRef(0);
  const levelRef = useRef(1);
  const shieldActive = useRef(false);
  const ghostModeUntil = useRef(0);
  const speed = useRef(6);
  const startTime = useRef(0);
  const requestRef = useRef<any>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const diamondVal = useRef(0);
  const comboCount = useRef(0);
  const comboTimer = useRef<any>(null);

  // --- TUNING ---
  const START_SPEED = 6;
  const SPEED_INC = 0.5;
  const POINTS_PER_LEVEL = 100;
  const REVIVE_COST = 20;
  const currentTheme = THEMES[Math.min(level - 1, 5)];
  const GRAVITY = 0.7;
  const JUMP = -9.5;
  const PLAYER_SIZE = 28;
  const ROOF_LIMIT = 50;
  const HIT_MARGIN = 12;

  // --- DATABASE & SAVE SYSTEM ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. Load Local User Data (Gems/Skins)
      const savedGems = parseInt(localStorage.getItem('scrollyGems') || '0');
      setTotalDiamonds(savedGems);
      const savedSkins = JSON.parse(localStorage.getItem('scrollySkins') || '["default"]');
      setOwnedSkins(savedSkins);
      const savedEquip = localStorage.getItem('scrollyEquipped') || 'default';
      setEquippedSkin(savedEquip);
      
      // 2. LISTEN TO REAL FIREBASE DATABASE
      const scoresRef = query(ref(database, 'scores'), orderByChild('score'), limitToLast(50));
      
      onValue(scoresRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
           // FILTER: Only show the HIGHEST score for each player
           const allScores = Object.values(data) as { addr: string; score: number }[];
           const bestScoresMap = new Map();

           allScores.forEach((s) => {
             const existing = bestScoresMap.get(s.addr);
             if (!existing || s.score > existing.score) {
               bestScoresMap.set(s.addr, s);
             }
           });

           const parsedScores = Array.from(bestScoresMap.values());
           // Sort descending (Highest first) and take top 5
           parsedScores.sort((a, b) => b.score - a.score);
           setTopScores(parsedScores.slice(0, 5));
        } else {
           setTopScores([]);
        }
      });

      // Initialize Audio
      musicRef.current = new Audio(MUSIC_TRACKS[0].src);
      musicRef.current.loop = true;
    }
  }, []);

  const saveProgress = (finalScore: number, runGems: number) => {
    const playerName = publicKey
      ? publicKey.toString().slice(0, 4) + '...' + publicKey.toString().slice(-4)
      : 'Guest';

    // 1. SAVE TO FIREBASE (REAL DB)
    if (finalScore > 0) {
        push(ref(database, 'scores'), {
            addr: playerName,
            score: finalScore,
            timestamp: Date.now()
        });
    }

    // 2. Save Gems Locally
    const newTotalGems = totalDiamonds + runGems;
    setTotalDiamonds(newTotalGems);
    localStorage.setItem('scrollyGems', newTotalGems.toString());
  };

  const selectSkin = (skin: any) => {
     if(ownedSkins.includes(skin.id)) {
         setEquippedSkin(skin.id);
         localStorage.setItem('scrollyEquipped', skin.id);
     } else {
         if(totalDiamonds >= skin.price) {
             const newTotal = totalDiamonds - skin.price;
             setTotalDiamonds(newTotal);
             localStorage.setItem('scrollyGems', newTotal.toString());
             
             const newOwned = [...ownedSkins, skin.id];
             setOwnedSkins(newOwned);
             localStorage.setItem('scrollySkins', JSON.stringify(newOwned));
             
             setEquippedSkin(skin.id);
             localStorage.setItem('scrollyEquipped', skin.id);
         } else {
             alert("Not enough gems!");
         }
     }
  };

  // --- AUDIO LOGIC ---
  const changeTrack = (index: number) => {
      setCurrentTrackIndex(index);
      if(musicRef.current) {
          musicRef.current.src = MUSIC_TRACKS[index].src;
          if(MUSIC_TRACKS[index].src !== "") {
              musicRef.current.play().catch(e => console.log("Audio play error:", e));
              setIsPlaying(true);
          } else {
              musicRef.current.pause();
              setIsPlaying(false);
          }
      }
  };

  const playMusic = () => {
    if (musicRef.current && MUSIC_TRACKS[currentTrackIndex].src !== "") {
      musicRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const pauseMusic = () => {
    if (musicRef.current) {
        musicRef.current.pause();
        setIsPlaying(false);
    }
  };

  const stopMusic = () => {
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  // --- RENDER STATE ---
  const [hazards, setHazards] = useState<any[]>([]);
  const [coins, setCoins] = useState<any[]>([]);
  const [trail, setTrail] = useState<any[]>([]);

  // --- CONTROLS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'PLAYING') return;
      if (e.key === 'ArrowLeft') playerX.current -= 40;
      if (e.key === 'ArrowRight') playerX.current += 40;
      if (e.code === 'Space' || e.key === 'ArrowUp') handleJump(e);
      if (e.key === 'Escape' || e.key === 'p') togglePause();
      updatePlayerPosition();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  const updatePlayerPosition = () => {
      if (playerX.current < -window.innerWidth / 2) playerX.current = -window.innerWidth / 2;
      if (playerX.current > window.innerWidth / 2) playerX.current = window.innerWidth / 2;
      
      if (playerRef.current) {
         const rotation = velocity.current * 2; 
         playerRef.current.style.transform = `translate(${playerX.current}px, ${playerY.current}px) rotate(${rotation}deg)`;
      }
  };

  const handleJump = (e?: any) => {
    if (e && e.cancelable && e.type !== 'mousedown') e.preventDefault();
    if (e && e.target && e.target.closest && (e.target.closest('button') || e.target.closest('input'))) return;

    if (gameState === 'START') startGame();
    else if (gameState === 'PAUSED') togglePause();
    else if (gameState === 'PLAYING')
      if (playerY.current > ROOF_LIMIT + 10) velocity.current = JUMP;
  };

  const handleMove = (e: any) => {
    if (gameState !== 'PLAYING') return;
    if (e.cancelable && e.type !== 'mousemove') e.preventDefault();
    
    if (typeof window === 'undefined') return;
    let clientX;
    if (e.type.includes('touch') && e.touches && e.touches[0])
      clientX = e.touches[0].clientX;
    else clientX = e.clientX;
    
    if (clientX) {
      const centerX = window.innerWidth / 2;
      playerX.current = clientX - centerX;
      updatePlayerPosition();
    }
  };

  const startGame = () => {
    setGameState('PLAYING');
    setShake(false);
    playerY.current = 300;
    playerX.current = 0;
    velocity.current = JUMP;
    scoreVal.current = 0;
    speed.current = START_SPEED;
    startTime.current = Date.now();
    shieldActive.current = false;
    ghostModeUntil.current = 0;
    levelRef.current = 1; 
    comboCount.current = 0; 
    setHasShield(false);
    setIsGhost(false);
    setRevived(false);
    setHazards([]);
    setCoins([]);
    setTrail([]);
    setScore(0);
    setDiamonds(0);
    diamondVal.current = 0;
    setLastRunGems(0);
    setLevel(1);
    setMagicEffect('');
    setComboText('');
    updatePlayerPosition();
    playMusic();
  };

  const reviveGame = () => {
    if (totalDiamonds >= REVIVE_COST) {
      const newTotal = totalDiamonds - REVIVE_COST;
      setTotalDiamonds(newTotal);
      localStorage.setItem('scrollyGems', newTotal.toString());
      playerY.current = 300;
      velocity.current = JUMP;
      setHasShield(true);
      shieldActive.current = true;
      ghostModeUntil.current = Date.now() + 3000;
      setRevived(true);
      setGameState('PLAYING');
      setShake(false);
      setMagicEffect('REVIVED!');
      playMusic();
    }
  };

  const togglePause = () => {
    if (gameState === 'PLAYING') {
      setGameState('PAUSED');
      pauseMusic();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    } else if (gameState === 'PAUSED') {
      setGameState('PLAYING');
      playMusic();
    }
  };

  const gameOver = () => {
    setGameState('GAME_OVER');
    setShake(true);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(400);
    stopMusic();
    setLastRunGems(diamondVal.current); 
    saveProgress(scoreVal.current, diamondVal.current);
    setDiamonds(0);
    diamondVal.current = 0;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const gameLoop = () => {
    if (gameState !== 'PLAYING') return;
    
    velocity.current += GRAVITY;
    playerY.current += velocity.current;

    if (playerY.current < ROOF_LIMIT) {
      playerY.current = ROOF_LIMIT;
      updatePlayerPosition();
      gameOver();
      return;
    }
    if (playerY.current > window.innerHeight) {
      gameOver();
      return;
    }

    updatePlayerPosition();

    // --- LEVEL LOGIC ---
    const currentLevel = 1 + Math.floor(scoreVal.current / POINTS_PER_LEVEL);
    
    if (currentLevel > levelRef.current) {
      levelRef.current = currentLevel; 
      setLevel(currentLevel); 
      
      let zoneName = currentLevel <= 6 ? 'CLASSIC ZONE' : currentLevel <= 12 ? 'CRYSTAL ZONE' : currentLevel <= 18 ? 'CYBER ZONE' : 'THE VOID';
      setMagicEffect(zoneName);
      setTimeout(() => setMagicEffect(''), 3000);
      
      if (musicRef.current) {
        let newRate = 1.0 + currentLevel * 0.03;
        if (newRate > 1.5) newRate = 1.5;
        musicRef.current.playbackRate = newRate;
      }
    }
    
    speed.current = START_SPEED + currentLevel * SPEED_INC;
    if (speed.current > 25) speed.current = 25;
    
    if (Date.now() < ghostModeUntil.current) setIsGhost(true);
    else setIsGhost(false);

    if (scoreVal.current % 5 === 0) {
        setTrail((prev) => {
        const newTrail = [...prev, { x: playerX.current, y: playerY.current, id: Math.random() }];
        if (newTrail.length > 5) newTrail.shift();
        return newTrail;
        });
    }

    // --- ENHANCED WALL SPAWNER ---
    setHazards((prev) => {
      let next = prev
        .map((h) => ({ ...h, y: h.y + speed.current }))
        .filter((h) => h.y < window.innerHeight + 100);
      
      for (let i = 0; i < next.length; i++) {
        const h = next[i];
        if (Date.now() < ghostModeUntil.current) continue;
        if (
          Math.abs(playerY.current - h.y) < h.height / 2 + PLAYER_SIZE / 2 - HIT_MARGIN &&
          Math.abs(playerX.current - h.x) < h.width / 2 + PLAYER_SIZE / 2 - HIT_MARGIN
        ) {
          if (shieldActive.current) {
            shieldActive.current = false;
            setHasShield(false);
            ghostModeUntil.current = Date.now() + 1500;
            setMagicEffect('SHIELD SAVED YOU!');
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(100);
            setTimeout(() => setMagicEffect(''), 1000);
          } else {
            gameOver();
            return next;
          }
        }
      }

      if (Date.now() - startTime.current > 800) {
        const last = next[next.length - 1];
        if (!last || last.y > 100) {
          
          let gapWidth = 220 - (currentLevel * 8);
          if (gapWidth < 100) gapWidth = 100; 

          const lastCenter = last ? last.gapCenter : 0;
          const shiftIntensity = 60 + (currentLevel * 8); 
          let shift = (Math.random() * shiftIntensity * 2) - shiftIntensity;
          if (Math.random() > 0.8) shift *= 1.5;

          let newCenter = lastCenter + shift;
          const maxCenter = (window.innerWidth / 2) - (gapWidth / 2) - 10;
          if (newCenter > maxCenter) newCenter = maxCenter;
          if (newCenter < -maxCenter) newCenter = -maxCenter;
          
          const leftBlockWidth = window.innerWidth / 2 + newCenter - gapWidth / 2;
          const rightBlockWidth = window.innerWidth / 2 - newCenter - gapWidth / 2;
          const rowId = Math.random();
          let obsType = 'WALL';
          if (currentLevel > 6 && currentLevel <= 12) obsType = 'SHARD';
          if (currentLevel > 12 && currentLevel <= 18) obsType = 'SAW';
          if (currentLevel > 18) obsType = 'GLITCH';
          
          next.push({ id: `L-${rowId}`, y: -60, height: 40, width: leftBlockWidth, x: -(window.innerWidth / 2) + leftBlockWidth / 2, gapCenter: newCenter, type: 'block', obstacleType: obsType });
          next.push({ id: `R-${rowId}`, y: -60, height: 40, width: rightBlockWidth, x: window.innerWidth / 2 - rightBlockWidth / 2, gapCenter: newCenter, type: 'block', obstacleType: obsType });

          const rand = Math.random();
          if (rand > 0.96 && !shieldActive.current)
            setCoins((curr) => [...curr, { id: `S-${rowId}`, y: -60, x: newCenter, type: 'shield', collected: false }]);
          else if (rand > 0.7)
            setCoins((curr) => [...curr, { id: `C-${rowId}`, y: -60, x: newCenter, type: 'coin', collected: false }]);
          
          if (next.length % 10 === 0) {
            scoreVal.current += 1;
            setScore(scoreVal.current);
          }
        }
      }
      return next;
    });

    setCoins((prev) => {
      let next = prev
        .map((c) => ({ ...c, y: c.y + speed.current }))
        .filter((c) => c.y < window.innerHeight + 50 && !c.collected);
      next.forEach((c) => {
        const dist = Math.sqrt(Math.pow(playerX.current - c.x, 2) + Math.pow(playerY.current - c.y, 2));
        if (dist < 40) {
          c.collected = true;
          if (c.type === 'shield') {
            shieldActive.current = true;
            setHasShield(true);
            setMagicEffect('SHIELD EQUIPPED');
            setTimeout(() => setMagicEffect(''), 1500);
          } else {
            scoreVal.current += 5;
            setScore(scoreVal.current);
            setDiamonds((d) => d + 1);
            diamondVal.current += 1;
            
            comboCount.current += 1;
            if (comboCount.current > 1) {
                setComboText(`COMBO x${comboCount.current}!`);
                if (comboTimer.current) clearTimeout(comboTimer.current);
                comboTimer.current = setTimeout(() => {
                    setComboText('');
                    comboCount.current = 0;
                }, 2000);
            }

            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
          }
        }
      });
      return next.filter((c) => !c.collected);
    });

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    if (gameState === 'PLAYING')
      requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState]);

  const activeSkin = SKINS.find((s) => s.id === equippedSkin) || SKINS[0];

  return (
    <div
      onMouseDown={handleJump}
      onMouseMove={handleMove}
      onTouchStart={handleJump}
      onTouchMove={handleMove}
      style={{
        width: '100vw',
        height: '100vh',
        background: currentTheme.bg,
        overflow: 'hidden',
        position: 'relative',
        cursor: 'crosshair',
        fontFamily: '"Segoe UI", Roboto, sans-serif',
        textAlign: 'center',
        userSelect: 'none',
        touchAction: 'none',
        color: 'white',
        transition: 'background 2s ease',
        animation: shake ? 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both' : 'none',
      }}
    >
      {/* WALLET BUTTON */}
      <div 
        style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000 }} // FIX 1: HIGH Z-INDEX
        onMouseDown={(e) => e.stopPropagation()} // FIX 2: STOP CLICK FROM STARTING GAME
        onTouchStart={(e) => e.stopPropagation()} // FIX 3: STOP TOUCH FROM STARTING GAME
      >
        <WalletMultiButton />
      </div>

      {/* HUD */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '500px',
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
          borderRadius: '30px',
          padding: '8px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: '1px solid rgba(255,255,255,0.15)',
          zIndex: 50,
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        <div onClick={(e) => { e.stopPropagation(); togglePause(); }} style={{ cursor: 'pointer', fontSize: '1.2rem', padding: '5px' }}>
          {gameState === 'PAUSED' ? '▶️' : '⏸️'}
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', opacity: 0.7, marginRight: 5 }}>SCORE</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{score}</span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.3)' }}></div>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', opacity: 0.7, marginRight: 5 }}>LEVEL</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: currentTheme.color }}>{level}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '1.2rem' }}>💎</span>
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#facc15' }}>{totalDiamonds + diamonds}</span>
        </div>
      </div>

      {/* COMBO TEXT */}
      {comboText && (
        <div style={{ position: 'absolute', top: 250, left: '50%', transform: 'translateX(-50%)', zIndex: 60, animation: 'pop 0.2s ease' }}>
            <h3 style={{ fontSize: '1.5rem', color: '#facc15', margin: 0, textShadow: '0 0 10px rgba(0,0,0,0.5)' }}>{comboText}</h3>
        </div>
      )}

      {magicEffect && (
        <div style={{ position: 'absolute', top: 180, left: '50%', transform: 'translateX(-50%)', width: '100%', animation: 'pop 0.5s ease', zIndex: 60 }}>
          <h2 style={{ fontSize: '2rem', color: '#fff', margin: 0, textShadow: '0 0 20px rgba(255,255,255,0.5)' }}>{magicEffect}</h2>
        </div>
      )}

      {/* PAUSE SCREEN */}
      {gameState === 'PAUSED' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 70, background: 'rgba(15, 23, 42, 0.95)', padding: '40px', borderRadius: 20, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)', textAlign: 'center', minWidth: '300px' }}>
          <h1 style={{ margin: '0 0 20px 0' }}>PAUSED</h1>
          <button onClick={() => togglePause()} style={{ padding: '12px 30px', fontSize: '1.2rem', borderRadius: '50px', background: '#38BDF8', border: 'none', color: '#0f172a', fontWeight: 'bold', cursor: 'pointer' }}>RESUME</button>
          <div style={{ marginTop: 20, fontSize: '0.9rem', opacity: 0.7 }}>Current Score: {score}</div>
        </div>
      )}

      {/* MUSIC MENU */}
      {gameState === 'MUSIC' && (
         <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.98)', zIndex: 85, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
             <h1 style={{ color: '#d8b4fe', marginBottom: 20 }}>DJ STATION</h1>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '80%', maxWidth: '400px' }}>
                 {MUSIC_TRACKS.map((track, i) => (
                     <div key={i} onClick={() => changeTrack(i)} style={{ padding: 15, background: currentTrackIndex === i ? '#d8b4fe' : 'rgba(255,255,255,0.1)', color: currentTrackIndex === i ? '#000' : '#fff', borderRadius: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                         <span>{track.name}</span>
                         <span>{currentTrackIndex === i && isPlaying ? '🔊' : ''}</span>
                     </div>
                 ))}
             </div>
             <button onClick={() => setGameState('START')} style={{ marginTop: 30, padding: '12px 30px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: 20, cursor: 'pointer' }}>Close</button>
         </div>
      )}

      {/* SHOP SCREEN */}
      {gameState === 'SHOP' && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.98)', zIndex: 80, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
          
          {!shopDetailItem && (
            <>
                <h1 style={{ color: '#facc15', marginBottom: 10 }}>SKIN SHOP</h1>
                <div style={{ marginBottom: 30, fontSize: '1.5rem', fontWeight: 'bold' }}>💎 {totalDiamonds}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20, maxWidth: 600 }}>
                    {SKINS.map((skin) => {
                    const isOwned = ownedSkins.includes(skin.id);
                    const isEquipped = equippedSkin === skin.id;
                    return (
                        <div key={skin.id} onClick={() => setShopDetailItem(skin)} style={{ background: 'rgba(255,255,255,0.05)', padding: 20, borderRadius: 15, border: isEquipped ? '2px solid #4ade80' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', width: 140, textAlign: 'center', opacity: !isOwned && totalDiamonds < skin.price ? 0.5 : 1, transition: 'all 0.2s' }}>
                        <div style={{ width: 40, height: 40, margin: '0 auto 15px auto', background: skin.color, borderRadius: skin.shape, border: skin.border || 'none' }} />
                        <div style={{ fontWeight: 'bold', marginBottom: 5 }}>{skin.name}</div>
                        {isEquipped ? <div style={{ color: '#4ade80', fontSize: '0.9rem' }}>EQUIPPED</div> : isOwned ? <div style={{ color: '#fff', fontSize: '0.9rem' }}>OWNED</div> : <div style={{ color: '#facc15' }}>💎 {skin.price}</div>}
                        </div>
                    );
                    })}
                </div>
                <button onClick={() => setGameState('START')} style={{ marginTop: 40, padding: '15px 40px', fontSize: '1.2rem', background: '#38BDF8', border: 'none', borderRadius: 30, color: '#0f172a', fontWeight: 'bold', cursor: 'pointer' }}>BACK TO MENU</button>
            </>
          )}

          {shopDetailItem && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, animation: 'pop 0.2s' }}>
                  <h2 style={{ fontSize: '2rem', color: '#fff' }}>{shopDetailItem.name}</h2>
                  <div style={{ width: 150, height: 150, background: shopDetailItem.color, borderRadius: shopDetailItem.shape, border: shopDetailItem.border || 'none', boxShadow: '0 0 30px rgba(255,255,255,0.2)', margin: '20px 0' }} />
                  
                  {ownedSkins.includes(shopDetailItem.id) ? (
                      equippedSkin === shopDetailItem.id ? (
                          <button disabled style={{ padding: '15px 50px', fontSize: '1.2rem', background: '#4ade80', border: 'none', borderRadius: 10, color: '#004d00', fontWeight: 'bold', cursor: 'not-allowed' }}>EQUIPPED</button>
                      ) : (
                          <button onClick={() => selectSkin(shopDetailItem)} style={{ padding: '15px 50px', fontSize: '1.2rem', background: '#38BDF8', border: 'none', borderRadius: 10, color: '#002a3a', fontWeight: 'bold', cursor: 'pointer' }}>SELECT</button>
                      )
                  ) : (
                      <button onClick={() => selectSkin(shopDetailItem)} style={{ padding: '15px 50px', fontSize: '1.2rem', background: '#facc15', border: 'none', borderRadius: 10, color: '#422006', fontWeight: 'bold', cursor: 'pointer' }}>BUY ({shopDetailItem.price} 💎)</button>
                  )}

                  <button onClick={() => setShopDetailItem(null)} style={{ marginTop: 10, padding: '10px 30px', background: 'transparent', border: '1px solid #777', color: '#ccc', borderRadius: 20, cursor: 'pointer' }}>GO BACK</button>
              </div>
          )}
        </div>
      )}

      {/* START SCREEN */}
      {gameState === 'START' && (
        <div style={{ marginTop: 120, position: 'relative', zIndex: 60, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h1 style={{ fontSize: '3.5rem', fontWeight: '900', textShadow: '0 5px 15px rgba(0,0,0,0.3)', marginBottom: 5, background: '-webkit-linear-gradient(#eee, #333)', WebkitBackgroundClip: 'text' }}>ORBITAL RUSH</h1>
          <p style={{ fontSize: '1.1rem', opacity: 0.8, marginBottom: 30 }}>Avoid obstacles. Collect gems. Survive.</p>
          <div style={{ display: 'flex', gap: 15, marginBottom: 40 }}>
            <button onClick={() => startGame()} style={{ background: 'linear-gradient(45deg, #facc15, #fbbf24)', border: 'none', padding: '20px 60px', fontSize: '1.8rem', fontWeight: 'bold', borderRadius: '50px', cursor: 'pointer', boxShadow: '0 10px 30px rgba(251, 191, 36, 0.4)', color: '#0f172a', transition: 'transform 0.1s' }}>PLAY</button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 30 }}>
            <button onClick={() => { setShopDetailItem(null); setGameState('SHOP'); }} style={{ padding: '10px 25px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer' }}>🛒 SKIN SHOP</button>
            <button onClick={() => setGameState('MUSIC')} style={{ padding: '10px 25px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer' }}>🎵 MUSIC</button>
            <button onClick={() => setShowInstructions(!showInstructions)} style={{ padding: '10px 25px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer' }}>❓ HELP</button>
          </div>
          {showInstructions && (
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 15, maxWidth: 400, fontSize: '0.9rem', lineHeight: '1.5', marginBottom: 20 }}>
              <p><strong>🖱️ Desktop:</strong> Arrow keys to Move. <strong>Spacebar</strong> to Jump.</p>
              <p><strong>📱 Mobile:</strong> Drag to Move. Tap screen to Jump.</p>
              <p>💎 Collect Gems to buy skins and revive!</p>
            </div>
          )}
          
          {/* GLOBAL LEADERBOARD SECTION (FIREBASE CONNECTED) */}
          <div style={{ marginTop: 20, width: '100%', maxWidth: '400px', background: 'rgba(0,0,0,0.5)', borderRadius: '15px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#facc15', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px' }}>🏆 Global Top 5</h3>
            {topScores.length === 0 ? <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Waiting for scores...</p> : topScores.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: '1rem', opacity: i === 0 ? 1 : 0.8 }}>
                <span style={{ color: i === 0 ? '#facc15' : i === 1 ? '#e2e8f0' : i === 2 ? '#b45309' : '#fff', fontWeight: i < 3 ? 'bold' : 'normal' }}>
                  #{i + 1} {s.addr}
                </span>
                <span style={{ fontWeight: 'bold' }}>{s.score}</span>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* GAME OVER SCREEN */}
      {gameState === 'GAME_OVER' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(15, 23, 42, 0.98)', padding: '40px', pointerEvents: 'auto', borderRadius: '25px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', zIndex: 100, minWidth: '320px' }}>
          <h2 style={{ color: '#ef4444', fontSize: '3.5rem', margin: '0 0 5px 0' }}>CRASHED</h2>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: 5 }}>Score: {score}</div>
          <div style={{ fontSize: '1rem', color: '#94a3b8', marginBottom: 25 }}>High Score: {topScores[0]?.score > score ? topScores[0].score : score}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: 10 }}>💎 +{lastRunGems} Gems</div>
          </div>
          {!revived && totalDiamonds >= REVIVE_COST ? (
            <button onClick={reviveGame} style={{ display: 'block', width: '100%', padding: '15px', marginBottom: 15, fontSize: '1.1rem', fontWeight: 'bold', borderRadius: '15px', border: 'none', background: 'linear-gradient(90deg, #8b5cf6, #d946ef)', color: 'white', cursor: 'pointer', boxShadow: '0 5px 15px rgba(217, 70, 239, 0.4)' }}>💖 REVIVE ({REVIVE_COST} Gems)</button>
          ) : !revived ? (
            <div style={{ marginBottom: 20, opacity: 0.5, fontSize: '0.9rem' }}>(Earn {REVIVE_COST} Gems to unlock Revive)</div>
          ) : (
            <div style={{ marginBottom: 20, color: '#facc15', fontWeight: 'bold' }}>⚠️ Revive Used</div>
          )}
          <button style={{ width: '100%', padding: '15px', fontSize: '1.2rem', cursor: 'pointer', borderRadius: '15px', border: 'none', background: '#38BDF8', color: '#0f172a', fontWeight: 'bold' }} onClick={() => setGameState('START')}>MAIN MENU</button>
        </div>
      )}

      {trail.map((t, i) => (
        <div key={t.id} style={{ position: 'absolute', top: t.y, left: '50%', marginLeft: t.x - PLAYER_SIZE / 2, width: PLAYER_SIZE, height: PLAYER_SIZE, borderRadius: activeSkin.shape, background: hasShield ? '#60a5fa' : activeSkin.id === 'neon' ? 'transparent' : activeSkin.color, border: activeSkin.border || 'none', opacity: (i / 8) * 0.2, pointerEvents: 'none', transform: `scale(${i / 6})` }} />
      ))}

      {/* PLAYER RENDERED DIRECTLY VIA REF FOR PERFORMANCE */}
      <div
        ref={playerRef}
        style={{
          position: 'absolute',
          top: 0, 
          left: '50%',
          marginLeft: -PLAYER_SIZE / 2,
          width: PLAYER_SIZE,
          height: PLAYER_SIZE,
          zIndex: 20,
          opacity: isGhost ? 0.5 : 1,
          animation: isGhost ? 'flash 0.1s infinite' : 'none',
          transform: `translate(0px, 300px)` 
        }}
      >
         <div style={{ 
             width: '100%', 
             height: '100%', 
             borderRadius: activeSkin.shape, 
             background: activeSkin.color, 
             border: activeSkin.border || 'none', 
             boxShadow: hasShield ? '0 0 30px #3b82f6' : '0 0 30px rgba(255,255,255,0.5)' 
         }} />
         
         {hasShield && (
            <div style={{ 
                position: 'absolute', 
                top: -8, 
                left: -8, 
                width: PLAYER_SIZE + 16, 
                height: PLAYER_SIZE + 16, 
                borderRadius: '50%', 
                border: '2px solid #60a5fa', 
                opacity: 0.8, 
                boxShadow: '0 0 20px #60a5fa', 
                animation: 'spin 3s infinite linear' 
            }} />
         )}
      </div>

      {hazards.map((h) => (
        <div key={h.id} style={{ position: 'absolute', top: h.y, left: '50%', marginLeft: h.x - h.width / 2, width: h.width, height: h.height, background: `linear-gradient(135deg, ${currentTheme.color} 0%, rgba(255,255,255,0.2) 100%)`, borderRadius: h.obstacleType === 'WALL' ? '4px' : h.obstacleType === 'SHARD' ? h.id.includes('L') ? '0 50% 50% 0' : '50% 0 0 50%' : '50%', border: h.obstacleType === 'SAW' ? `2px dashed ${currentTheme.color}` : 'none', boxShadow: `0 0 15px ${currentTheme.color}`, animation: h.obstacleType === 'SAW' ? 'spin 1s infinite linear' : 'none' }} />
      ))}

      {coins.map((c) => (
        <div key={c.id} style={{ position: 'absolute', top: c.y, left: '50%', marginLeft: c.x - 15, width: 30, height: 30, clipPath: c.type === 'coin' ? 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' : 'polygon(10% 0, 90% 0, 100% 60%, 50% 100%, 0 60%)', background: c.type === 'coin' ? 'linear-gradient(135deg, #facc15, #ca8a04)' : 'linear-gradient(180deg, #60a5fa, #2563eb)', zIndex: 10, boxShadow: c.type === 'coin' ? '0 0 15px #facc15' : '0 0 20px #3b82f6', animation: 'float 2s infinite ease-in-out' }} />
      ))}

      <style jsx global>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-5px); } 100% { transform: translateY(0px); } }
        @keyframes pop { 0% { transform: translateX(-50%) scale(0); } 80% { transform: translateX(-50%) scale(1.1); } 100% { transform: translateX(-50%) scale(1); } }
        @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
        @keyframes flash { 0% { opacity: 1; } 50% { opacity: 0.2; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}

// --- SOLANA WRAPPER ---
export default function GamePage() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ScrollyGame />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
