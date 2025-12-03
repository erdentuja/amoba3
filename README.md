# 🎮 Amőba Online (Gomoku)

Modern, teljes funkcionalitású online amőba játék valós idejű kapcsolattal, haladó AI ellenfél opcióval.

## ✨ Főbb Funkciók

### 🎯 Játékmódok
- **👥 PvP** - Játékos vs Játékos (multiplayer)
- **🤖 AI Ellenfél** - 5 nehézségi szint (Bugyuta → Extrém)
- **🤖⚔️🤖 AI vs AI** - Bemutató mód (két AI küzd egymással)
- **👁️ Nézői mód** - Folyamatban lévő meccsek megtekintése

### 🧠 Haladó AI Rendszer
- **Optimalizált heurisztikák** - Nyitott/zárt minták felismerése
- **Alfa-béta vágás** - Hatékony fakeresés
- **Instant win/block** - Azonnali válasz kritikus helyzetekben
- **Move ordering** - Okos lépés-prioritizálás
- **5 nehézségi szint**: Bugyuta (1) → Extrém (4 mélység)

### 💬 Kommunikáció
- **Játékon belüli chat** - Játékosok és nézők beszélgetnek
- **Lobby chat** - Közösségi beszélgetés a lobbiban
- **🤖 Balambér chatbot** - Automatikus szórakoztató üzenetek

### 🎮 Játék Funkciók
- **Dinamikus táblaméretek**: 9×9, 13×13, 15×15, 19×19
- **Undo lépés** - Utolsó lépés visszavonása
- **Timer rendszer** - Opcionális időkorlát (admin által állítható)
- **🔊 Hangeffektek** - Web Audio API alapú hangok
- **Győzelmi animáció** - Konfetti effekt + új játék kérés
- **Automatikus újracsatlakozás** - F5 frissítés után folytatható a játék

### 👨‍💼 Admin Rendszer
- **Jelszóval védett admin panel**
- **Felhasználó kezelés** - Kirúgás, szobák bezárása
- **Globális beállítások** - Timer, AI vs AI mód
- **Online játékosok** - Valós idejű listázás
- **Statisztikák** - Játékos teljesítmények nyomon követése

### 📊 Felhasználó Rendszer
- **Regisztráció/Belépés** - bcrypt titkosított jelszavak
- **🔐 Google OAuth** - Opcionális belépés Google fiókkal
- **Vendég mód** - Játék regisztráció nélkül
- **Rangrendszer**: Újonc → Haladó → Mester → Nagymester
- **Pontrendszer** - Győzelmek/vereségek alapján
- **Statisztikák**: W/L arány, win streak, leggyorsabb győzelem, stb.

## 🚀 Gyors Indítás

### Telepítés
```bash
npm install
```

### Futtatás
```bash
# Fejlesztői mód (auto-reload)
npm run dev

# Produkciós mód
npm start

# Docker
docker-compose up -d
```

**Szerver cím**: `http://localhost:9000` (vagy saját `PORT` környezeti változó)

## 🎮 Használat

### Játékosként
1. **Belépés/Regisztráció** - Név megadása, opcionális jelszó
2. **Szoba létrehozása** - Válaszd ki a táblaméretet és játékmódot
3. **Játék indítása** - Automatikus, amikor 2 játékos csatlakozott
4. **Célkövetés**: 5 egy sorban (vízszintes/függőleges/átlós)

### Nézőként
- Kattints a **"Megnézem"** gombra egy aktív meccsnél
- Valós idejű követés, chat hozzáférés

### Admin
- Admin bejelentkezés a **⚙️** ikonnal
- Jelszó: `ADMIN_CODE` környezeti változó (alapért: `admin123`)
- **⚠️ FONTOS**: Változtasd meg produkciós környezetben!

## 🛠️ Technológiák

- **Backend**: Node.js 20, Express, Socket.IO
- **Frontend**: Vanilla JS, HTML5 Canvas, CSS3
- **Biztonság**: bcrypt, helmet, rate limiting
- **Deploy**: Docker, Docker Compose
- **Valós idejű**: WebSocket (Socket.IO)
- **Hang**: Web Audio API (procedurálisan generált)

## 📁 Projekt Struktúra

```
amoba3/
├── server.js              # Backend: Socket.IO, AI, GameRoom logika
├── package.json           # Függőségek, scriptek
├── Dockerfile             # Docker image konfiguráció
├── docker-compose.yml     # Orchestration
├── data/                  # Adatok (users, stats, chat-history)
│   ├── users.json
│   ├── stats.json
│   └── chat-history.json
└── public/               # Static frontend
    ├── index.html        # UI struktúra
    ├── style.css         # Responsive design
    └── game.js           # Client-side logika, Canvas rendering
```

## 🎲 AI Részletek

### Algoritmus
- **Minimax** alfa-béta vágással (depth 1-4)
- **Heurisztikus értékelés**: Nyitott/zárt minták
- **Move ordering**: Legjobb lépések előre (hatékonyabb pruning)
- **Instant win/block**: Kritikus lépések azonnal detektálva

### Nehézségi Szintek
| Szint | Mélység | Jellemzők |
|-------|---------|-----------|
| 🤪 **Bugyuta** | 1 | 40% random lépés |
| 😊 **Közepes** | 2 | Alapvető előrelátás |
| 😎 **Nehéz** | 3 | Okos heurisztikák |
| 🔥 **Nagyon Nehéz** | 3 | Jobb értékelés |
| 💀 **Extrém** | 4 | Legjobb értékelés + alfa-béta |

### Értékelési Súlyok
- **Nyitott négyes**: 50,000 (megállíthatatlan!)
- **Zárt négyes**: 10,000
- **Nyitott hármas**: 8,000 (két irányból építhető)
- **Félig-nyitott hármas**: 3,000
- **Zárt hármas**: 1,000

## 🌍 Környezeti Változók

```bash
PORT=9000                    # Szerver port
ADMIN_CODE=admin123          # Admin jelszó (VÁLTOZTASD MEG!)
NODE_ENV=production          # Environment mode
BCRYPT_ROUNDS=10             # Jelszó hash erőssége

# Google OAuth (opcionális)
GOOGLE_CLIENT_ID=            # Google OAuth Client ID
GOOGLE_CLIENT_SECRET=        # Google OAuth Client Secret
GOOGLE_CALLBACK_URL=http://localhost:9000/auth/google/callback
SESSION_SECRET=              # Session titkosítási kulcs (VÁLTOZTASD MEG!)
```

### 🔐 Google OAuth Beállítás (Opcionális)

A Google bejelentkezés engedélyezéséhez:

1. **Google Cloud Console**
   - Menj: https://console.cloud.google.com
   - Hozz létre projektet vagy válassz meglévőt
   - APIs & Services → Credentials
   - Create Credentials → OAuth 2.0 Client ID
   - Application type: Web application

2. **Authorized URLs**
   ```
   Authorized JavaScript origins:
   - http://localhost:9000
   - https://your-domain.com

   Authorized redirect URIs:
   - http://localhost:9000/auth/google/callback
   - https://your-domain.com/auth/google/callback
   ```

3. **Környezeti változók**
   - Másold ki a **Client ID** és **Client Secret** értékeket
   - Állítsd be őket környezeti változókként vagy `.env` fájlban

4. **Újraindítás**
   ```bash
   npm start
   ```

**Megjegyzés**: Google OAuth nélkül is működik az app - username/password és vendég mód mindig elérhető!

## 🐋 Docker Deploy

```bash
# Build és indítás
docker-compose up -d

# Logok megtekintése
docker logs -f amoba-online

# Leállítás
docker-compose down
```

## 📊 Játékszabályok

- ⚫ **X (fekete)** mindig kezd
- 🔴 **O (piros)** következik
- 🎯 **Cél**: 5 egy sorban (↔️ ↕️ ↗️ ↘️)
- ⏱️ **Timer**: Opcionális (admin által állítható)
- ↩️ **Undo**: Utolsó lépés visszavonható
- 🏆 **Győzelem**: Automatikus detektálás + animáció

## 🚧 Jövőbeli Funkciók

- [ ] Játék replay rendszer (mozgás visszajátszás)
- [ ] Tournament/verseny mód
- [ ] Privát szobák jelszóval
- [ ] Barátlista és meghívók
- [ ] ELO rating rendszer
- [ ] Achievement/trophy rendszer
- [ ] Mobil optimalizálás (touch events)
- [ ] PWA support (offline játék)

## 📝 Fejlesztés

### Lokális Tesztelés
```bash
# Fejlesztői szerver indítása
npm run dev

# Több böngésző ablak/tab megnyitása a teszteléshez
# → http://localhost:9000
```

### Tesztelési Forgatókönyvek
- ✅ 2 játékos ugyanabban a szobában
- ✅ AI ellenfél (mindegyik nehézségi szint)
- ✅ AI vs AI automatikus játék
- ✅ Nézői mód (csatlakozás aktív meccshez)
- ✅ Chat (játékon belüli és lobby)
- ✅ Timer lejárat
- ✅ Undo lépés
- ✅ F5 frissítés (auto-rejoin)
- ✅ Admin funkciók (kirúgás, bezárás)

## 🤝 Közreműködés

Hozzájárulásokat szívesen fogadunk! Kérjük:
1. Fork-old a repo-t
2. Hozz létre egy feature branch-et (`git checkout -b feature/AmazingFeature`)
3. Commit-old a változtatásokat (`git commit -m 'Add some AmazingFeature'`)
4. Push-old a branch-re (`git push origin feature/AmazingFeature`)
5. Nyiss egy Pull Request-et

## 📄 Licensz

Ez a projekt szabadon használható és módosítható oktatási célokra.

## 👨‍💻 Készítő

Fejlesztve modern Node.js technológiákkal és haladó AI algoritmusokkal.

---

**Élvezd a játékot!** 🎮 Ha megtetszik, adj egy ⭐-ot!
