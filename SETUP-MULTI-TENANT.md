# Setup Multi-Tenant OpenBill

## Pre-requisits

- Node.js 18+
- PostgreSQL 14+
- Cont Gmail cu App Password pentru email-uri

## Pași de Instalare

### 1. Baze de Date PostgreSQL

Creează 2 baze de date:

```sql
-- Baza de date MASTER (conține lista companiilor)
CREATE DATABASE openbill_master;

-- Baza de date pentru compania FMD (exemplu)
CREATE DATABASE openbill_fmd;
```

### 2. Environment Variables

Copiază `.env.example` în `.env` și completează:

```bash
cp .env.example .env
```

Variabile obligatorii:
- `MASTER_DATABASE_URL` - Connection string către DB master
- `EMAIL_PASSWORD` - App Password din Gmail (nu parola normală!)
- `SESSION_SECRET` - Cheie lungă și aleatoare

### 3. Instalare Dependențe

```bash
npm install
```

### 4. Pornire Server

```bash
npm start
```

La prima pornire:
- Se creează tabelele în master DB
- Se creează superadminul (alex1)
- Dacă `AUTO_CREATE_FMD=true`, se creează și compania FMD automat

## Configurare Gmail

1. Mergi la https://myaccount.google.com/security
2. Activează "2-Step Verification"
3. Generează "App Password" pentru aplicația ta
4. Copiază acel password în `EMAIL_PASSWORD`

## Configurare DNS (Wildcard)

Pentru ca subdomeniile să funcționeze:

```
*.openbill.ro    A    IP_SERVER_TAU
```

Sau dacă folosești Cloudflare:
```
*.openbill.ro    CNAME    openbill.ro
```

## Flow-uri

### Înregistrare Companie Nouă

1. Vizitator intră pe `openbill.ro`
2. Click "Înregistrează compania"
3. Completează formularul (nume, slug, CUI, email, date admin)
4. Se creează:
   - Intrare în `companies` (master DB)
   - Bază de date nouă (`openbill_<slug>`)
   - Tabele migrate
   - Admin user
   - Email de bun venit
5. Redirect către `https://<slug>.openbill.ro`

### Invitare Utilizator

1. Admin se loghează în aplicația companiei
2. Merge la "Setări" > "Utilizatori" > "Invită"
3. Introduce email și rol
4. Se trimite email cu link valabil 24h
5. Userul accesează linkul, completează datele, primește cont

### Login

1. Userul accesează `https://<slug>.openbill.ro/login.html`
2. Middleware detectează subdomeniul și conectează la DB corespunzător
3. Login se face pe baza userilor din acel DB
4. Sesiunea este per domeniu (datorită cookie-urilor)

## Structură Fișiere

```
├── db-master.js          # Conexiune la master DB
├── db-tenant.js          # Conexiuni dinamice per companie
├── middleware/
│   └── tenant.js         # Detectare subdomeniu
├── routes/
│   ├── superadmin.js     # Endpoint-uri superadmin
│   ├── public.js         # Endpoint-uri publice (fără tenant)
│   ├── invitations.js    # Sistem invitații
│   └── settings.js       # Settings companie (trasee, categorii)
├── migrations/
│   ├── tenant-schema.sql # Schema pentru fiecare companie
│   └── runner.js         # Utilitare migrări
├── services/
│   └── email.js          # Serviciu email
├── public/
│   ├── index-new.html    # Landing page
│   ├── register-company.html
│   ├── accept-invite.html
│   ├── superadmin.html
│   └── ...               # Restul aplicației
└── server-new.js         # Server principal multi-tenant
```

## Backup

Pentru backup toate bazele de date:

```bash
# Backup master
pg_dump openbill_master > backup_master_$(date +%Y%m%d).sql

# Backup toate companiile
for db in $(psql -l | grep openbill_ | awk '{print $1}'); do
  pg_dump $db > backup_${db}_$(date +%Y%m%d).sql
done
```

## Migrări

Când adaugi/modifici tabele:

1. Editează `migrations/tenant-schema.sql`
2. Rulează script de migrare pentru toate companiile:

```javascript
const { runMigrationsForAllTenants } = require('./migrations/runner');
runMigrationsForAllTenants();
```

## Troubleshooting

### "Companie negăsită"
- Verifică DNS-ul pentru subdomeniu
- Verifică `MAIN_DOMAIN` în .env

### "Nu pot construi connection string"
- Verifică formatul `MASTER_DATABASE_URL`
- Trebuie să fie: `postgres://user:pass@host:port/db`

### Email-uri nu se trimit
- Verifică `EMAIL_PASSWORD` (trebuie să fie App Password, nu parola Gmail)
- Verifică că 2FA e activat pe contul Gmail

## Comutare la Noul Sistem

Pentru a trece de la vechiul server.js la noul sistem multi-tenant:

1. Backup la datele existente
2. Migrează compania existentă (FMD) în noul format
3. Testează pe un subdomeniu de staging
4. Update DNS pentru wildcard
5. Comutare producție
