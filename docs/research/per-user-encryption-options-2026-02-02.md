# Per-User Data Encryption Options for Izzie

**Research Date:** 2026-02-02
**Status:** Research Complete
**Goal:** Even with data leakage, one user would never see another's content

---

## Executive Summary

This research evaluates encryption options for implementing per-user data isolation in Izzie. The core challenge is that Izzie processes sensitive user data (emails, calendar events, extracted entities) with server-side AI processing while needing strong cryptographic isolation between users.

**Key Finding:** True end-to-end encryption (E2EE) is incompatible with server-side AI processing. The recommended approach is **server-side per-user encryption with envelope encryption** (KEK/DEK hierarchy), combined with **property-preserving encryption for Weaviate vectors**.

**Recommended Solution:** Hybrid approach combining:
1. Per-user AES-256-GCM encryption for PostgreSQL data
2. IronCore Labs Cloaked AI for Weaviate vectors (searchable encrypted embeddings)
3. Key derivation from user passphrase + server secret
4. Optional key escrow in user's Google Drive

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Encryption Approach Comparison](#2-encryption-approach-comparison)
3. [Key Management Options](#3-key-management-options)
4. [What to Encrypt](#4-what-to-encrypt)
5. [Vector Database Encryption](#5-vector-database-encryption)
6. [Implementation Libraries](#6-implementation-libraries)
7. [Performance Analysis](#7-performance-analysis)
8. [Comparison Matrix](#8-comparison-matrix)
9. [Recommended Implementation](#9-recommended-implementation)
10. [Key Recovery Options](#10-key-recovery-options)
11. [References](#11-references)

---

## 1. Current Architecture Analysis

### Data Flow
```
User (Google OAuth) -> Next.js API -> Claude API (AI Processing) -> Storage
                                                                      |
                                                          +-----------+-----------+
                                                          |                       |
                                                    PostgreSQL              Weaviate
                                                    (Entities,              (Vectors,
                                                     Relationships,          Memories,
                                                     Chat History)           Embeddings)
```

### Current Data Stored

**PostgreSQL (Drizzle):**
- User accounts and sessions (Better Auth)
- OAuth tokens (access/refresh tokens)
- Entity relationships
- Chat history
- Account metadata

**Weaviate:**
- Extracted entities (Person, Company, Project, Tool, Topic, Location, ActionItem)
- Memory objects (preferences, facts, events, decisions)
- Each object has `userId` field for filtering

### Current Isolation
- Application-level filtering by `userId`
- No cryptographic isolation
- Database leak exposes all user data

---

## 2. Encryption Approach Comparison

### 2.1 Server-Side Per-User Encryption

**How it works:**
- Server generates unique encryption key per user
- Keys stored separately from data (e.g., different database, KMS)
- Server encrypts data on write, decrypts on read
- AI processing happens on decrypted data

**Pros:**
- Compatible with server-side AI processing (Claude API)
- User doesn't need to manage keys
- Key recovery possible through server
- Simpler implementation

**Cons:**
- Server can still access all data (trusted server model)
- Compromised server = all data exposed
- Operator can theoretically access user data

**Security Model:** Protects against database leaks, not server compromise.

### 2.2 Client-Side Encryption (True E2EE)

**How it works:**
- Keys generated and stored on client device only
- Data encrypted before leaving browser
- Server only stores ciphertext

**Pros:**
- Maximum privacy (server cannot read data)
- Protects against server compromise
- True zero-knowledge architecture

**Cons:**
- **INCOMPATIBLE with server-side AI processing**
- Server cannot call Claude API on encrypted data
- Key loss = permanent data loss
- Complex key synchronization across devices

**The E2EE Challenge for Izzie:**
Izzie's core value is AI-powered analysis of user emails and calendar. This requires the server to read the data to send it to Claude. True E2EE would require:
1. Fully Homomorphic Encryption (FHE) - Currently costs ~$5,000 per token
2. Trusted Execution Environments (TEEs) - Requires NVIDIA H100 + AMD SEV-SNP
3. Client-side AI processing - Not feasible for Claude

### 2.3 Hybrid Approach (RECOMMENDED)

**How it works:**
- User provides passphrase at login (or uses WebAuthn)
- Key derived from: `PBKDF2/Argon2(passphrase) XOR ServerSecret`
- Data Encryption Key (DEK) encrypted by user's Key Encryption Key (KEK)
- DEK stored in database, KEK derived at runtime

**Pros:**
- Neither passphrase alone nor server secret alone can decrypt
- Server can process data when user is authenticated
- Possible key recovery through multiple channels
- Balances security and usability

**Cons:**
- More complex key management
- User must remember passphrase (or use hardware key)
- Session-based: data only accessible when user logged in

**Architecture:**
```
User Passphrase ---> PBKDF2(passphrase, salt, 600000 iterations)
                                    |
                                    v
                            User Partial Key
                                    |
                                    + (XOR or KDF-combine)
                                    |
Server Secret ------------------>   v
                                   KEK (Key Encryption Key)
                                    |
                                    v
                         [Encrypted DEK in DB]
                                    |
                                    v
                                   DEK (Data Encryption Key)
                                    |
                                    v
                         AES-256-GCM Encryption
```

---

## 3. Key Management Options

### 3.1 User-Provided Passphrase

**Implementation:**
```typescript
import { scrypt, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Buffer,
  serverSecret: string
): Promise<Buffer> {
  // Derive user partial key using scrypt (more secure than PBKDF2)
  const userPartialKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(passphrase, salt, 32, { N: 2 ** 17, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });

  // Combine with server secret
  const serverKeyHash = await new Promise<Buffer>((resolve, reject) => {
    scrypt(serverSecret, salt, 32, { N: 2 ** 14, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });

  // XOR combine (both required to decrypt)
  const combinedKey = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    combinedKey[i] = userPartialKey[i] ^ serverKeyHash[i];
  }

  return combinedKey;
}
```

**Pros:**
- User has control
- No additional hardware required
- Can be changed if compromised

**Cons:**
- Users forget passphrases
- Weak passphrases are vulnerable
- UX friction at every login

### 3.2 Hardware Security Keys (WebAuthn/FIDO2)

**Implementation with Better Auth Passkey plugin:**
```typescript
// Client-side key derivation using PRF extension
const credential = await navigator.credentials.get({
  publicKey: {
    challenge: serverChallenge,
    allowCredentials: [...],
    extensions: {
      prf: {
        eval: {
          first: new Uint8Array([...]) // Salt
        }
      }
    }
  }
});

// PRF output can be used as encryption key
const encryptionKey = credential.getClientExtensionResults().prf.results.first;
```

**Pros:**
- Strongest security (hardware-backed)
- No password to remember
- Phishing-resistant

**Cons:**
- Requires hardware key purchase
- Device loss = potential lockout
- Limited browser/device support for PRF extension
- PRF extension not universally supported yet

### 3.3 System-Generated Key with Backup

**Implementation:**
```typescript
// On account creation
const userDEK = randomBytes(32); // 256-bit key
const encryptedDEK = await encryptWithServerKEK(userDEK);

// Generate recovery code
const recoveryCode = Buffer.from(userDEK).toString('base64url');
// Show to user ONCE, never store

// Store encrypted DEK
await db.insert(userEncryptionKeys).values({
  userId,
  encryptedDEK,
  salt: randomBytes(16),
  algorithm: 'aes-256-gcm'
});
```

**Pros:**
- Strong random keys
- No passphrase fatigue
- One-time backup process

**Cons:**
- Users must securely store recovery code
- Lost recovery code = lost data
- Social engineering risk if support can "reset"

### 3.4 Key Stored in User's Google Drive

**Implementation:**
```typescript
// Store encrypted key in user's Drive (they control it)
async function storeKeyInDrive(userId: string, encryptedKey: Buffer) {
  const oauth2Client = await getGoogleOAuthClient(userId);
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // Store in appDataFolder (hidden from user, only this app can access)
  await drive.files.create({
    requestBody: {
      name: 'izzie-encryption-key.enc',
      parents: ['appDataFolder']
    },
    media: {
      mimeType: 'application/octet-stream',
      body: Readable.from(encryptedKey)
    }
  });
}
```

**Pros:**
- Key backup automatic
- User controls their own key storage
- Works across devices
- No additional passwords

**Cons:**
- Requires Drive API scope
- Google account compromise = key compromise
- Adds Google Drive as dependency
- App deletion might lose appDataFolder

---

## 4. What to Encrypt

### 4.1 Must Encrypt (Sensitive PII)

| Data Type | Location | Encryption Method |
|-----------|----------|-------------------|
| Email content | PostgreSQL/cache | AES-256-GCM |
| Email metadata (from, to, subject) | PostgreSQL | AES-256-GCM |
| Extracted entities (names, companies) | Weaviate | Cloaked AI |
| Relationships | PostgreSQL | AES-256-GCM |
| Chat history | PostgreSQL | AES-256-GCM |
| Memory content | Weaviate | Cloaked AI |
| OAuth tokens | PostgreSQL | AES-256-GCM (already supported) |

### 4.2 Can Remain Unencrypted

| Data Type | Reason |
|-----------|--------|
| User ID (UUID) | Not PII, needed for queries |
| Timestamps | Not PII, needed for sorting |
| Entity type labels | Categorical, not PII |
| Confidence scores | Numeric metadata |
| Session tokens | Already secured by Better Auth |

### 4.3 Vector Embeddings - Special Consideration

**Challenge:** Semantic search requires comparing vector distances. Standard encryption destroys this property.

**Solution:** Property-Preserving Encryption (PPE) via IronCore Labs Cloaked AI

```
Original Vector: [0.1, 0.5, 0.3, ...]
                         |
                 Cloaked AI Encrypt
                         |
Encrypted Vector: [0.73, 0.12, 0.89, ...]

Key Property: distance(enc_v1, enc_v2) ≈ distance(v1, v2)
```

**What PPE leaks:**
- Relative distances between vectors
- Cannot reverse to original values
- Cannot determine what vectors represent without key

---

## 5. Vector Database Encryption

### 5.1 Weaviate Native Encryption

**Current Capability:**
- Encryption at rest (disk-level)
- Encryption in transit (TLS)
- Multi-tenancy with data isolation

**Limitations:**
- No searchable encryption
- No per-user encryption keys
- Weaviate operator can see all data

### 5.2 IronCore Labs Cloaked AI (RECOMMENDED)

**How it works:**
- Client encrypts vectors before sending to Weaviate
- Encrypted vectors maintain distance relationships
- kNN search works on encrypted vectors
- Metadata encrypted with standard encryption or deterministic encryption

**Implementation:**
```typescript
import { CloakedAI } from '@ironcorelabs/ironcore-alloy';

// Initialize
const cloaked = new CloakedAI({
  standardSecrets: {
    primary: { id: 1, secret: userDEK }
  },
  vectorSecrets: {
    primary: { id: 1, secret: userVectorKey }
  }
});

// Encrypt vector before storing in Weaviate
const plainVector = await generateEmbedding(text);
const encryptedVector = await cloaked.vector().encrypt(
  plainVector,
  { tenantId: userId }
);

// Store in Weaviate
await collection.data.insert({
  vector: encryptedVector.encryptedVector,
  metadata: encryptedVector.encryptedMetadata
});

// Search with encrypted query
const queryVector = await generateEmbedding(query);
const encryptedQuery = await cloaked.vector().generateQueryVectors(
  { tenantId: userId },
  queryVector
);

const results = await collection.query.nearVector(encryptedQuery[0], {
  limit: 10
});
```

**Licensing:**
- Open source: AGPL (requires derivative works to be open source)
- Commercial license available for proprietary use
- Pricing: Contact IronCore Labs

### 5.3 Alternative: Separate Weaviate Instances

**Implementation:**
- Deploy separate Weaviate instance per user (or user group)
- Each instance has unique encryption key
- Route queries by user ID

**Pros:**
- Complete isolation
- No specialized encryption needed
- Standard Weaviate encryption

**Cons:**
- High infrastructure cost
- Operational complexity
- Not scalable for many users

---

## 6. Implementation Libraries

### 6.1 Node.js Crypto (Built-in)

```typescript
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16;

async function encrypt(
  plaintext: string,
  key: Buffer
): Promise<{ ciphertext: string; iv: string; authTag: string }> {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64')
  };
}

async function decrypt(
  ciphertext: string,
  key: Buffer,
  iv: string,
  authTag: string
): Promise<string> {
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64'),
    { authTagLength: AUTH_TAG_LENGTH }
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
```

### 6.2 Better Auth Integration

Better Auth already supports OAuth token encryption:

```typescript
// In auth configuration
export const auth = betterAuth({
  // ...existing config
  advanced: {
    // Enable token encryption
  },
  // Token encryption is available via configuration
});
```

**Extend for user data encryption:**
```typescript
// Custom encryption service
class UserEncryptionService {
  private keyCache = new Map<string, { key: Buffer; expires: Date }>();

  async getDecryptionKey(userId: string, sessionToken: string): Promise<Buffer> {
    // Check cache
    const cached = this.keyCache.get(userId);
    if (cached && cached.expires > new Date()) {
      return cached.key;
    }

    // Derive key from session
    const session = await validateSession(sessionToken);
    const userKey = await this.deriveUserKey(userId, session);

    // Cache for session duration
    this.keyCache.set(userId, {
      key: userKey,
      expires: new Date(Date.now() + 15 * 60 * 1000) // 15 min
    });

    return userKey;
  }
}
```

### 6.3 Drizzle ORM Integration

```typescript
// Custom encrypted column type
import { customType } from 'drizzle-orm/pg-core';

const encryptedText = customType<{
  data: string;
  driverData: { ciphertext: string; iv: string; authTag: string };
}>({
  dataType() {
    return 'jsonb';
  },
  toDriver(value: string): { ciphertext: string; iv: string; authTag: string } {
    // Encryption happens in middleware, not here
    // This type hints that the column stores encrypted data
    return JSON.parse(value);
  },
  fromDriver(value): string {
    // Decryption happens in middleware
    return JSON.stringify(value);
  }
});

// Usage in schema
export const entityRelationships = pgTable('entity_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  sourceEntity: encryptedText('source_entity').notNull(),
  targetEntity: encryptedText('target_entity').notNull(),
  relationshipType: text('relationship_type').notNull(), // Not encrypted (categorical)
  confidence: real('confidence').notNull(), // Not encrypted (numeric)
});
```

---

## 7. Performance Analysis

### 7.1 PostgreSQL Column Encryption

| Operation | Overhead | Notes |
|-----------|----------|-------|
| Encryption | ~1-5ms per field | AES-256-GCM is fast |
| Decryption | ~1-5ms per field | Hardware acceleration available |
| Batch read (100 rows) | +8% latency | Acceptable for UI operations |
| Full table scan | Not possible | Must decrypt to search |

**Mitigation:**
- Index unencrypted fields (userId, timestamps, types)
- Cache decrypted data in memory for session
- Use deterministic encryption for equality searches

### 7.2 Weaviate Vector Encryption (Cloaked AI)

| Operation | Overhead | Notes |
|-----------|----------|-------|
| Vector encryption | ~5-10ms | Per vector |
| Vector decryption | ~5-10ms | Per vector |
| kNN search accuracy | ~95-99% | Slight accuracy loss |
| Search latency | +10-15% | Additional vector transformation |

**Benchmarks from IronCore Labs:**
- 1000 vectors: <100ms batch encryption
- kNN@10 search: <5ms additional overhead
- Memory overhead: ~1.5x (encrypted vectors slightly larger)

### 7.3 Key Derivation

| Algorithm | Time | Security |
|-----------|------|----------|
| PBKDF2 (600K iterations) | ~500ms | NIST recommended |
| Argon2id | ~200-500ms | Memory-hard, preferred |
| scrypt (N=2^17) | ~300ms | CPU + memory hard |

**Recommendation:** Use Argon2id with:
- Time cost: 3 iterations
- Memory cost: 64MB
- Parallelism: 4

---

## 8. Comparison Matrix

| Approach | Data Leakage Protection | Server Compromise Protection | AI Processing | Key Recovery | Implementation Complexity | Performance Impact |
|----------|------------------------|-----------------------------|--------------:|--------------|--------------------------|-------------------|
| **Server-side per-user** | Full | None | Works | Easy | Low | Low |
| **Client-side E2EE** | Full | Full | Broken | Hard | High | N/A |
| **Hybrid (passphrase)** | Full | Partial | Works | Medium | Medium | Low |
| **Hybrid (WebAuthn)** | Full | Partial | Works | Hard | High | Low |
| **Hybrid (Google Drive key)** | Full | Partial | Works | Auto | Medium | Low |

### Decision Matrix by Priority

**If security is top priority:**
- Hybrid with passphrase + hardware key option
- Accept UX friction

**If usability is top priority:**
- Server-side per-user encryption
- Key stored in Google Drive for recovery
- Accept trusted server model

**Balanced approach (RECOMMENDED):**
- Hybrid with passphrase derivation
- Google Drive key backup
- Hardware key as optional upgrade

---

## 9. Recommended Implementation

### Phase 1: Foundation (2-3 weeks)

1. **Add encryption service**
   ```
   src/lib/encryption/
   ├── service.ts       # Main encryption/decryption functions
   ├── keys.ts          # Key derivation and management
   ├── types.ts         # TypeScript types
   └── constants.ts     # Algorithm configurations
   ```

2. **Database schema updates**
   - Add `user_encryption_keys` table
   - Add encrypted column types to entity tables

3. **Key derivation on login**
   - Prompt for passphrase after OAuth
   - Derive KEK, decrypt DEK
   - Store DEK in session (memory only)

### Phase 2: PostgreSQL Encryption (1-2 weeks)

1. Encrypt on write:
   - Entity names, relationships, context
   - Chat messages
   - Email content (if cached)

2. Decrypt on read:
   - Middleware in API routes
   - Cache decrypted data per session

### Phase 3: Weaviate Encryption (2-3 weeks)

1. Integrate IronCore Labs Cloaked AI
2. Encrypt vectors before storage
3. Update search queries to use encrypted vectors
4. Migrate existing data (re-encrypt with user keys)

### Phase 4: Key Recovery (1 week)

1. Implement Google Drive key backup
2. Add recovery flow in UI
3. Optional: Add hardware key support

### Migration Strategy

```typescript
// Gradual migration
async function migrateUserData(userId: string, userKey: Buffer) {
  // 1. Check if user has encryption key
  const hasKey = await checkUserEncryptionKey(userId);
  if (!hasKey) {
    return; // User hasn't set up encryption yet
  }

  // 2. Migrate PostgreSQL data
  const entities = await db.select().from(entityRelationships)
    .where(eq(entityRelationships.userId, userId));

  for (const entity of entities) {
    if (!isEncrypted(entity.sourceEntity)) {
      const encrypted = await encrypt(entity.sourceEntity, userKey);
      await db.update(entityRelationships)
        .set({ sourceEntity: encrypted })
        .where(eq(entityRelationships.id, entity.id));
    }
  }

  // 3. Migrate Weaviate data (more complex - requires re-embedding)
  // This is best done as a background job
}
```

---

## 10. Key Recovery Options

### 10.1 Lost Passphrase Recovery

**Option A: Server-Escrowed Key**
- Server stores encrypted copy of DEK
- Recovery requires identity verification
- Breaks zero-knowledge model

**Option B: Social Recovery (Shamir's Secret Sharing)**
- Split recovery key among N trusted contacts
- Need K of N shares to recover
- Complex UX

**Option C: Google Drive Backup (RECOMMENDED)**
- Automatic backup during setup
- User controls their backup
- Recovery = re-link Google account

**Option D: Recovery Codes**
- Show once during setup
- User must store securely
- Common pattern (like 2FA backup codes)

### 10.2 Handling Unrecoverable Keys

```typescript
// If all recovery fails
async function handleUnrecoverableKey(userId: string) {
  // Option 1: Delete all encrypted data (clean slate)
  await deleteAllUserData(userId);

  // Option 2: Keep encrypted data (in case key found later)
  await markDataAsInaccessible(userId);

  // Option 3: Generate new key, start fresh
  const newKey = await generateNewUserKey(userId);
  // Old data remains inaccessible
}
```

---

## 11. References

### Encryption and Key Management

- [AWS KMS Multi-Tenant Strategy](https://aws.amazon.com/blogs/architecture/simplify-multi-tenant-encryption-with-a-cost-conscious-aws-kms-key-strategy/)
- [IronCore Labs CMK Documentation](https://ironcorelabs.com/cmk/)
- [Application-Layer Encryption Best Practices](https://www.ve3.global/the-multi-tenancy-manifesto-why-a-database-per-tenant-model-is-the-new-standard-for-saas/)

### Vector Database Encryption

- [IronCore Labs Cloaked AI](https://ironcorelabs.com/products/cloaked-ai/)
- [Cloaked AI How It Works](https://ironcorelabs.com/docs/cloaked-ai/how-it-works/)
- [Approximate Distance-Comparison-Preserving Encryption (Academic Paper)](https://ironcorelabs.com/docs/cloaked-ai/)
- [Weaviate Security Features](https://weaviate.io/security)

### AI and Encryption

- [Fully Homomorphic Encryption and LLMs](https://www.zama.org/post/chatgpt-privacy-with-homomorphic-encryption)
- [Stanford Hazy Research: Private LLM Chat](https://hazyresearch.stanford.edu/blog/2025-05-12-security)
- [E2EE and AI: Training, Processing, Disclosure](https://arxiv.org/html/2412.20231v2)
- [Hugging Face: Encrypted LLMs with FHE](https://huggingface.co/blog/encrypted-llm)

### PostgreSQL Encryption

- [PostgreSQL TDE Performance](https://www.cybertec-postgresql.com/en/postgresql-tde-performance/)
- [Crunchy Data Encryption Guide](https://www.crunchydata.com/blog/data-encryption-in-postgres-a-guidebook)
- [Column-Level Encryption on Cloud SQL](https://medium.com/@alessandro.marrandino/field-and-column-level-encryption-on-google-cloud-sql-postgresql-and-mysql-81c8d565783c)

### Node.js Encryption

- [Node.js AES-256-GCM with PBKDF2](https://gist.github.com/AndiDittrich/4629e7db04819244e843)
- [NIST PBKDF2 Recommendations](https://asecuritysite.com/node/node_encrypt2)
- [Browser AES-GCM with PBKDF2](https://medium.com/@thomas_40553/how-to-secure-encrypt-and-decrypt-data-within-the-browser-with-aes-gcm-and-pbkdf2-057b839c96b6)

### Better Auth

- [Better Auth Passkey Plugin](https://www.better-auth.com/docs/plugins/passkey)
- [Better Auth JWT Plugin](https://www.better-auth.com/docs/plugins/jwt)
- [Better Auth Utils Library](https://github.com/better-auth/utils)

---

## Summary: Key Decisions

| Question | Answer |
|----------|--------|
| Can we encrypt AND still do semantic search? | **Yes**, using IronCore Labs Cloaked AI property-preserving encryption |
| How do we handle key recovery? | **Google Drive backup** (automatic) + **recovery codes** (manual backup) |
| Performance impact? | **8-15% overhead** for read operations, acceptable for typical usage |
| Implementation complexity? | **Medium** - 6-8 weeks for full implementation |
| Best approach? | **Hybrid** - passphrase-derived key combined with server secret |

---

**Next Steps:**
1. Decide on key management approach (passphrase vs. automatic with Google Drive)
2. Evaluate IronCore Labs commercial license for Cloaked AI
3. Create detailed implementation plan with milestones
4. Prototype encryption service with test data
