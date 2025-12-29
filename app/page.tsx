'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';

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

// --- DYNAMIC IMPORT FOR WALLET BUTTON ---
const WalletMultiButton = dynamic(
  async () =>
    (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

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

  // --- BOOM FEATURE STATES ---
  const [hyperMode, setHyperMode] = useState(false);
  const [hyperCharge, setHyperCharge] = useState(0); // 0 to 100

  // --- SHOP STATE ---
  const [ownedSkins, setOwnedSkins] = useState<string[]>(['default']);
  const [equippedSkin, setEquippedSkin] = useState('default');
  const [shopDetailItem, setShopDetailItem] = useState<any>(null);

  // --- MUSIC STATE ---
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // --- CONFIG ---
  const MUSIC_TRACKS = [
    { name: "Our Song", src: "/our-song.wav" },
    { name: "Monkey Business", src: "/monkey.aac" },
    { name: "Silence", src: "" }
  ];

  const SKINS = [
    { id: 'default', name: 'Orbital One', price: 0, color: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #cbd5e1 100%)', shape: '50%' },
    { id: 'crimson', name: 'Crimson Ace', price: 50, color: 'linear-gradient(135deg, #ef4444, #991b1b)', shape: '0%' },
    { id: 'gold', name: 'Golden Cube', price: 200, color: 'linear-gradient(135deg, #facc15, #ca8a04)', shape: '4px' },
    { id: 'neon', name: 'Neon Ghost', price: 500, color: 'transparent', border: '3px solid #d8b4fe', shape: '50%' },
  ];

  const THEMES = [
    { name: 'CLASSIC', bg: 'linear-gradient(180deg, #0f172a 0%, #334155 100%)', color: '#cbd5e1' },
    { name: 'OCEAN', bg: 'radial-gradient(circle at center, #1e3a8a 0%, #020617 100%)', color: '#3b82f6' },
    { name: 'TOXIC', bg: 'linear-gradient(180deg, #064e3b 0%, #022c22 100%)', color: '#4ade80' },
    { name: 'MAGMA', bg: 'linear-gradient(180deg, #7f1d1d 0%, #450a0a 100%)', color: '#f87171' },
    { name: 'CYBER', bg: 'radial-gradient(circle at center, #581c87 0%, #2e1065 100%)', color: '#d8b4fe' },
    { name: 'VOID', bg: 'radial-gradient(circle at center, #000000 0%, #1c1917 100%)', color: '#facc15' },
  ];

  // --- REFS (GAME ENGINE) ---
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
  
  // NEW REFS FOR BOOM FEATURES
  const hyperRef = useRef(0); 
  const isHyper = useRef(false);
  const particles = useRef<any[]>([]);

  // --- TUNING ---
  const START_SPEED = 7; // Slightly faster start for smoothness
  const GRAVITY = 0.6;
  const JUMP = -10;
  const PLAYER_SIZE = 30;
  const ROOF_LIMIT = 50;

  // --- SAVE SYSTEM ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedScores = JSON.parse(localStorage.getItem('scrollyScoresSol') || '[]');
      setTopScores(savedScores);
      const savedGems = parseInt(localStorage.getItem('scrollyGems') || '0');
      setTotalDiamonds(savedGems);
      const savedSkins = JSON.parse(localStorage.getItem('scrollySkins') || '["default"]');
      setOwnedSkins(savedSkins);
      const savedEquip = localStorage.getItem('scrollyEquipped') || 'default';
      setEquippedSkin(savedEquip);
      
      musicRef.current = new Audio(MUSIC_TRACKS[0].src);
      musicRef.current.loop = true;
    }
  }, []);

  const saveProgress = (finalScore: number, runGems: number) => {
    const playerName = publicKey
      ? publicKey.toString().slice(0, 4) + '..' + publicKey.toString().slice(-4)
      : 'Guest';
    const newEntry = { addr: playerName, score: finalScore };
    const newScores = [...topScores, newEntry].sort((a, b) => b.score - a.score).slice(0, 3);
    setTopScores(newScores);
    localStorage.setItem('scrollyScoresSol', JSON.stringify(newScores));

    const newTotalGems = totalDiamonds + runGems;
    setTotalDiamonds(newTotalGems);
    localStorage.setItem('scrollyGems', newTotalGems.toString());
  };

  const selectSkin = (skin: any) => {
     if(ownedSkins.includes(skin.id)) {
         setEquippedSkin(skin.id);
         localStorage.setItem('scrollyEquipped', skin.id);
     } else if(totalDiamonds >= skin.price) {
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
  };

  // --- AUDIO LOGIC ---
  const changeTrack = (index: number) => {
      setCurrentTrackIndex(index);
      if(musicRef.current) {
          musicRef.current.src = MUSIC_TRACKS[index].src;
          if(MUSIC_TRACKS[index].src !== "") {
              musicRef.current.play().catch(e => console.log(e));
              setIsPlaying(true);
          } else {
              musicRef.current.pause();
              setIsPlaying(false);
          }
      }
  };

  const playMusic = () => {
    if (musicRef.current && MUSIC_TRACKS[currentTrackIndex].src !== "") {
      musicRef.current.playbackRate = 1;
      musicRef.current.play().catch(() => {});
      setIsPlaying(true);
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
  const [renderParticles, setRenderParticles] = useState<any[]>([]); // For React rendering

  // --- CONTROLS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'PLAYING') return;
      if (e.key === 'ArrowLeft') playerX.current -= 45; // Smoother faster movement
      if (e.key === 'ArrowRight') playerX.current += 45;
      if (e.code === 'Space' || e.key === 'ArrowUp') handleJump(e);
      if (e.key === 'Escape') setGameState(prev => prev === 'PLAYING' ? 'PAUSED' : 'PLAYING');
      updatePlayerPosition();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  const updatePlayerPosition = () => {
      if (playerX.current < -window.innerWidth / 2) playerX.current = -window.innerWidth / 2;
      if (playerX.current > window.innerWidth / 2) playerX.current = window.innerWidth / 2;
      
      if (playerRef.current) {
         // Add tilt for smoothness
         const tilt = velocity.current * 3; 
         playerRef.current.style.transform = `translate(${playerX.current}px, ${playerY.current}px) rotate(${tilt}deg)`;
      }
  };

  const handleJump = (e?: any) => {
    if (e && e.cancelable && e.type !== 'mousedown') e.preventDefault();
    if (e?.target?.closest('button')) return;

    if (gameState === 'START') startGame();
    else if (gameState === 'PAUSED') setGameState('PLAYING');
    else if (gameState === 'PLAYING')
      if (playerY.current > ROOF_LIMIT + 10) velocity.current = JUMP;
  };

  const handleMove = (e: any) => {
    if (gameState !== 'PLAYING') return;
    if (e.cancelable && e.type !== 'mousemove') e.preventDefault();
    
    let clientX;
    if (e.type.includes('touch') && e.touches[0]) clientX = e.touches[0].clientX;
    else clientX = e.clientX;
    
    if (clientX) {
      playerX.current = clientX - window.innerWidth / 2;
      updatePlayerPosition();
    }
  };

  // --- PARTICLE SYSTEM ---
  const spawnParticles = (x: number, y: number, color: string, count: number) => {
      for(let i=0; i<count; i++) {
          particles.current.push({
              id: Math.random(),
              x: x,
              y: y,
              vx: (Math.random() - 0.5) * 10,
              vy: (Math.random() - 0.5) * 10,
              life: 1.0,
              color: color
          });
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
    hyperRef.current = 0;
    isHyper.current = false;
    setHyperCharge(0);
    setHyperMode(false);
    setHasShield(false);
    setIsGhost(false);
    setRevived(false);
    setHazards([]);
    setCoins([]);
    particles.current = [];
    setScore(0);
    setDiamonds(0);
    diamondVal.current = 0;
    setLevel(1);
    setMagicEffect('');
    setComboText('');
    playMusic();
  };

  const gameOver = () => {
    setGameState('GAME_OVER');
    setShake(true);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(400);
    spawnParticles(playerX.current, playerY.current, '#ff4757', 30); // Boom Effect
    stopMusic();
    setLastRunGems(diamondVal.current); 
    saveProgress(scoreVal.current, diamondVal.current);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const gameLoop = () => {
    if (gameState !== 'PLAYING') return;
    
    velocity.current += GRAVITY;
    playerY.current += velocity.current;

    // Bounds Check
    if (playerY.current < ROOF_LIMIT) { playerY.current = ROOF_LIMIT; velocity.current = 1; }
    if (playerY.current > window.innerHeight) { gameOver(); return; }

    updatePlayerPosition();

    // --- LEVEL & DIFFICULTY ---
    const currentLevel = 1 + Math.floor(scoreVal.current / 100);
    if (currentLevel > levelRef.current) {
      levelRef.current = currentLevel; 
      setLevel(currentLevel); 
      let zoneName = currentLevel <= 5 ? 'CLASSIC ZONE' : currentLevel <= 10 ? 'DANGER ZONE' : 'HYPER SPACE';
      setMagicEffect(zoneName);
      setTimeout(() => setMagicEffect(''), 2000);
    }
    
    // Speed Logic (Including Hyper Mode)
    let currentSpeed = START_SPEED + (currentLevel * 0.5);
    if (isHyper.current) currentSpeed *= 1.5; 
    if (currentSpeed > 30) currentSpeed = 30;
    speed.current = currentSpeed;

    // --- HYPER MODE LOGIC ---
    if(isHyper.current) {
        hyperRef.current -= 0.5; // Drain bar
        if(hyperRef.current <= 0) {
            isHyper.current = false;
            setHyperMode(false);
            if(musicRef.current) musicRef.current.playbackRate = 1;
        }
        setHyperCharge(hyperRef.current);
    }

    // --- PARTICLES UPDATE ---
    particles.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
    });
    particles.current = particles.current.filter(p => p.life > 0);
    setRenderParticles([...particles.current]); 

    // --- SPAWN OBJECTS ---
    setHazards((prev) => {
      let next = prev
        .map((h) => ({ 
            ...h, 
            y: h.y + speed.current,
            // Moving Obstacles Logic
            x: h.moving ? h.x + Math.sin(Date.now() / 200) * 5 : h.x,
            rotation: h.spin ? (h.rotation || 0) + 10 : 0
        }))
        .filter((h) => h.y < window.innerHeight + 100);
      
      // Collision
      if(!isHyper.current && Date.now() > ghostModeUntil.current) {
          for (const h of next) {
            if (
              Math.abs(playerY.current - h.y) < h.height / 2 + PLAYER_SIZE / 2 - 10 &&
              Math.abs(playerX.current - h.x) < h.width / 2 + PLAYER_SIZE / 2 - 10
            ) {
              if (shieldActive.current) {
                shieldActive.current = false;
                setHasShield(false);
                ghostModeUntil.current = Date.now() + 1500;
                setMagicEffect('SHIELD BROKE!');
                spawnParticles(playerX.current, playerY.current, '#60a5fa', 15);
              } else {
                gameOver();
                return next;
              }
            }
          }
      }

      // Spawner
      if (Date.now() - startTime.current > 800) {
        const last = next[next.length - 1];
        if (!last || last.y > 120) { // Increased gap for smoothness
          let gap = 250 - (currentLevel * 8);
          if (gap < 120) gap = 120;
          
          const lastCenter = last ? last.gapCenter : 0;
          let newCenter = lastCenter + (Math.random() * 100 - 50);
          if (newCenter > 150) newCenter = 150;
          if (newCenter < -150) newCenter = -150;
          
          const leftW = window.innerWidth / 2 + newCenter - gap / 2;
          const rightW = window.innerWidth / 2 - newCenter - gap / 2;
          const rowId = Math.random();
          
          // Difficulty Types
          const isSpinner = currentLevel > 3 && Math.random() > 0.7;
          const isMover = currentLevel > 5 && Math.random() > 0.8;
          
          // Left Wall
          next.push({ 
              id: `L-${rowId}`, y: -100, height: 40, width: leftW, 
              x: -(window.innerWidth / 2) + leftW / 2, gapCenter: newCenter, 
              type: 'block', spin: false, moving: false 
          });
          
          // Right Wall
          next.push({ 
              id: `R-${rowId}`, y: -100, height: 40, width: rightW, 
              x: window.innerWidth / 2 - rightW / 2, gapCenter: newCenter, 
              type: 'block', spin: false, moving: false 
          });

          // Special Obstacle in middle
          if (isSpinner) {
               next.push({
                   id: `S-${rowId}`, y: -100, height: 60, width: 60,
                   x: newCenter, gapCenter: newCenter,
                   type: 'saw', spin: true, moving: isMover
               });
          }

          // Coin Spawning
          const rand = Math.random();
          if (rand > 0.96 && !shieldActive.current)
            setCoins((curr) => [...curr, { id: `S-${rowId}`, y: -100, x: newCenter, type: 'shield' }]);
          else if (!isSpinner)
            setCoins((curr) => [...curr, { id: `C-${rowId}`, y: -100, x: newCenter, type: 'coin' }]);
          
          if (next.length % 10 === 0) setScore(s => s + 1);
        }
      }
      return next;
    });

    setCoins((prev) => {
      let next = prev.map((c) => ({ ...c, y: c.y + speed.current })).filter((c) => c.y < window.innerHeight + 50 && !c.collected);
      next.forEach((c) => {
        const dist = Math.sqrt(Math.pow(playerX.current - c.x, 2) + Math.pow(playerY.current - c.y, 2));
        if (dist < 40) {
          c.collected = true;
          if (c.type === 'shield') {
            shieldActive.current = true;
            setHasShield(true);
            setMagicEffect('SHIELD EQUIPPED');
          } else {
            scoreVal.current += isHyper.current ? 20 : 10;
            setScore(scoreVal.current);
            setDiamonds((d) => d + 1);
            diamondVal.current += 1;
            spawnParticles(c.x, c.y, '#facc15', 10);
            
            // Hyper Charge Accumulation
            if(!isHyper.current) {
                hyperRef.current += 10;
                if(hyperRef.current >= 100) {
                    hyperRef.current = 100;
                    isHyper.current = true;
                    setHyperMode(true);
                    setMagicEffect('HYPER MODE ACTIVATED!');
                    if(musicRef.current) musicRef.current.playbackRate = 1.2;
                }
                setHyperCharge(hyperRef.current);
            }
          }
        }
      });
      return next.filter((c) => !c.collected);
    });

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    if (gameState === 'PLAYING') requestRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameState]);

  const activeSkin = SKINS.find((s) => s.id === equippedSkin) || SKINS[0];

  return (
    <div
      onMouseDown={handleJump} onMouseMove={handleMove}
      onTouchStart={handleJump} onTouchMove={handleMove}
      style={{
        width: '100vw', height: '100vh',
        background: isHyper.current ? 'linear-gradient(180deg, #4c1d95 0%, #be185d 100%)' : THEMES[Math.min(level-1, 5)].bg,
        overflow: 'hidden', position: 'relative', cursor: 'none',
        fontFamily: '"Segoe UI", Roboto, sans-serif', textAlign: 'center',
        userSelect: 'none', touchAction: 'none', color: 'white',
        transition: 'background 0.5s ease',
        animation: shake ? 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both' : 'none',
      }}
    >
      {/* --- SPEED LINES (BOOM EFFECT) --- */}
      {(speed.current > 15 || hyperMode) && (
          <div className="speed-lines" style={{
              position: 'absolute', top:0, left:0, width:'100%', height:'100%',
              background: 'repeating-linear-gradient(90deg, transparent, transparent 50px, rgba(255,255,255,0.1) 50px, rgba(255,255,255,0.1) 52px)',
              animation: 'speed 0.2s linear infinite', zIndex: 1
          }}/>
      )}

      {/* --- UI HUD --- */}
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 60 }}><WalletMultiButton /></div>
      
      {/* HYPER BAR */}
      <div style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', width: '300px', height: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px', zIndex: 55 }}>
          <div style={{ 
              width: `${hyperCharge}%`, height: '100%', 
              background: hyperMode ? '#ff00ff' : '#facc15', 
              boxShadow: hyperMode ? '0 0 10px #ff00ff' : 'none',
              borderRadius: '4px', transition: 'width 0.1s linear' 
          }} />
          {hyperMode && <div style={{position:'absolute', top:10, width:'100%', fontSize:'0.8rem', color:'#ff00ff', fontWeight:'bold', textShadow:'0 0 5px black'}}>HYPER MODE</div>}
      </div>

      <div style={{ position: 'absolute', top: 100, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', borderRadius: '30px', padding: '8px 20px', display: 'flex', gap: '20px', zIndex: 50, border: '1px solid rgba(255,255,255,0.15)' }}>
        <div><span style={{ fontSize: '0.7rem', opacity: 0.7 }}>SCORE</span> <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{score}</span></div>
        <div><span style={{ fontSize: '1.2rem' }}>💎</span> <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#facc15' }}>{totalDiamonds + diamonds}</span></div>
      </div>

      {magicEffect && <div style={{ position: 'absolute', top: 200, width:'100%', textAlign:'center', fontSize: '2rem', fontWeight:'900', color: '#fff', textShadow: '0 0 20px #facc15', zIndex: 60, animation: 'pop 0.5s ease' }}>{magicEffect}</div>}

      {/* --- RENDER GAME OBJECTS --- */}
      
      {/* PARTICLES */}
      {renderParticles.map(p => (
          <div key={p.id} style={{
              position: 'absolute', top: p.y, left: '50%', marginLeft: p.x,
              width: 6, height: 6, borderRadius: '50%',
              background: p.color, opacity: p.life, pointerEvents: 'none', zIndex: 30
          }}/>
      ))}

      {/* PLAYER */}
      <div ref={playerRef} style={{ position: 'absolute', top: 0, left: '50%', marginLeft: -PLAYER_SIZE / 2, width: PLAYER_SIZE, height: PLAYER_SIZE, zIndex: 20 }}>
         <div style={{ width: '100%', height: '100%', borderRadius: activeSkin.shape, background: hyperMode ? '#fff' : activeSkin.color, boxShadow: hyperMode ? '0 0 20px #ff00ff' : '0 0 10px rgba(0,0,0,0.5)' }} />
         {hasShield && <div style={{ position: 'absolute', top: -8, left: -8, width: PLAYER_SIZE + 16, height: PLAYER_SIZE + 16, borderRadius: '50%', border: '2px solid #60a5fa', animation: 'spin 3s infinite linear' }} />}
      </div>

      {/* OBSTACLES */}
      {hazards.map((h) => (
        <div key={h.id} style={{ 
            position: 'absolute', top: h.y, left: '50%', marginLeft: h.x - h.width / 2, 
            width: h.width, height: h.height, 
            background: h.type === 'saw' ? 'transparent' : 'linear-gradient(135deg, #cbd5e1 0%, #64748b 100%)',
            borderRadius: h.type === 'saw' ? '50%' : '4px',
            border: h.type === 'saw' ? '4px dashed #ef4444' : 'none',
            transform: h.spin ? `rotate(${h.rotation}deg)` : 'none',
            boxShadow: '0 5px 15px rgba(0,0,0,0.5)'
        }}>
            {h.type === 'saw' && <div style={{width:'100%', height:'100%', background:'rgba(239, 68, 68, 0.3)', borderRadius:'50%'}} />}
        </div>
      ))}

      {/* COINS */}
      {coins.map((c) => (
        <div key={c.id} style={{ position: 'absolute', top: c.y, left: '50%', marginLeft: c.x - 15, width: 30, height: 30, clipPath: c.type === 'coin' ? 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' : 'polygon(10% 0, 90% 0, 100% 60%, 50% 100%, 0 60%)', background: c.type === 'coin' ? 'linear-gradient(135deg, #facc15, #ca8a04)' : '#60a5fa', zIndex: 10, animation: 'spin 2s infinite linear' }} />
      ))}

      {/* --- MENUS --- */}
      {gameState === 'START' && (
        <div style={{ marginTop: 150, position: 'relative', zIndex: 70, padding: 20 }}>
          <h1 style={{ fontSize: '4rem', fontWeight: '900', textShadow: '0 10px 20px rgba(0,0,0,0.5)', marginBottom: 10 }}>BOUNCE RUSH</h1>
          <button onClick={startGame} style={{ background: '#facc15', border: 'none', padding: '20px 60px', fontSize: '2rem', fontWeight: 'bold', borderRadius: '50px', cursor: 'pointer', boxShadow: '0 0 30px #facc15', color: '#000', animation: 'pop 1s infinite alternate' }}>PLAY</button>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button onClick={() => { setShopDetailItem(null); setGameState('SHOP'); }} style={{ padding: '10px 20px', borderRadius: '20px', border: '1px solid #fff', background: 'transparent', color: '#fff', cursor: 'pointer' }}>🛒 SKIN SHOP</button>
              <button onClick={() => setGameState('MUSIC')} style={{ padding: '10px 20px', borderRadius: '20px', border: '1px solid #fff', background: 'transparent', color: '#fff', cursor: 'pointer' }}>🎵 MUSIC</button>
          </div>
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
                    {SKINS.map((skin) => (
                        <div key={skin.id} onClick={() => setShopDetailItem(skin)} style={{ background: 'rgba(255,255,255,0.05)', padding: 20, borderRadius: 15, border: equippedSkin === skin.id ? '2px solid #4ade80' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', width: 140, textAlign: 'center' }}>
                            <div style={{ width: 40, height: 40, margin: '0 auto 15px auto', background: skin.color, borderRadius: skin.shape, border: skin.border || 'none' }} />
                            <div style={{ fontWeight: 'bold' }}>{skin.name}</div>
                            {ownedSkins.includes(skin.id) ? <div style={{ color: '#4ade80', fontSize: '0.8rem' }}>OWNED</div> : <div style={{ color: '#facc15' }}>💎 {skin.price}</div>}
                        </div>
                    ))}
                </div>
                <button onClick={() => setGameState('START')} style={{ marginTop: 40, padding: '15px 40px', background: '#38BDF8', border: 'none', borderRadius: 30, color: '#0f172a', fontWeight: 'bold', cursor: 'pointer' }}>BACK</button>
            </>
            )}
            {shopDetailItem && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                    <h2 style={{ fontSize: '2rem' }}>{shopDetailItem.name}</h2>
                    <div style={{ width: 150, height: 150, background: shopDetailItem.color, borderRadius: shopDetailItem.shape, border: shopDetailItem.border || 'none', boxShadow: '0 0 30px rgba(255,255,255,0.2)' }} />
                    <button onClick={() => selectSkin(shopDetailItem)} style={{ padding: '15px 50px', fontSize: '1.2rem', background: '#facc15', border: 'none', borderRadius: 10, color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>{ownedSkins.includes(shopDetailItem.id) ? 'EQUIP' : `BUY ${shopDetailItem.price}`} </button>
                    <button onClick={() => setShopDetailItem(null)} style={{ marginTop: 10, background: 'transparent', border: '1px solid #777', color: '#ccc', borderRadius: 20, padding: '10px 30px', cursor: 'pointer' }}>BACK</button>
                </div>
            )}
        </div>
      )}

      {/* MUSIC MENU */}
      {gameState === 'MUSIC' && (
         <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.95)', zIndex: 85, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
             <h1 style={{ color: '#d8b4fe', marginBottom: 20 }}>DJ STATION</h1>
             {MUSIC_TRACKS.map((track, i) => (
                 <div key={i} onClick={() => changeTrack(i)} style={{ padding: 15, width: 250, margin: 5, background: currentTrackIndex === i ? '#d8b4fe' : 'rgba(255,255,255,0.1)', color: currentTrackIndex === i ? '#000' : '#fff', borderRadius: 10, cursor: 'pointer', textAlign:'center' }}>{track.name} {currentTrackIndex === i && isPlaying ? '🔊' : ''}</div>
             ))}
             <button onClick={() => setGameState('START')} style={{ marginTop: 30, padding: '12px 30px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: 20, cursor: 'pointer' }}>CLOSE</button>
         </div>
      )}

      {/* GAME OVER */}
      {gameState === 'GAME_OVER' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(15, 23, 42, 0.98)', padding: '40px', borderRadius: '25px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', zIndex: 100, minWidth: '320px' }}>
          <h2 style={{ color: '#ef4444', fontSize: '3rem', margin: 0 }}>CRASHED</h2>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '10px 0' }}>Score: {score}</div>
          <button onClick={startGame} style={{ width: '100%', padding: '15px', fontSize: '1.2rem', cursor: 'pointer', borderRadius: '15px', border: 'none', background: '#38BDF8', color: '#0f172a', fontWeight: 'bold' }}>TRY AGAIN</button>
          <button onClick={() => setGameState('START')} style={{ width: '100%', padding: '15px', marginTop: 10, background: 'transparent', border: '1px solid #555', color: '#aaa', borderRadius: '15px', cursor: 'pointer' }}>MENU</button>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes pop { 0% { transform: scale(0); } 80% { transform: scale(1.2); } 100% { transform: scale(1); } }
        @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
        @keyframes speed { 0% { transform: translateY(0); } 100% { transform: translateY(100px); } }
      `}</style>
    </div>
  );
}

// --- SOLANA WRAPPER ---
export default function GamePage() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

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
