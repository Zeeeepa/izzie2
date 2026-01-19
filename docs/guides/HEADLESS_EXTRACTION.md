# Headless Gmail Entity Extraction

This document describes how to run Gmail entity extraction without the dashboard UI using the CLI script.

## Quick Start

```bash
# Extract from all users with Gmail OAuth
npx tsx scripts/extract-gmail-entities.ts

# Extract from specific user
npx tsx scripts/extract-gmail-entities.ts --user john@example.com

# Limit number of emails
npx tsx scripts/extract-gmail-entities.ts --limit 50

# Fetch emails from last 14 days
npx tsx scripts/extract-gmail-entities.ts --since 14

# Combine options
npx tsx scripts/extract-gmail-entities.ts --user john@example.com --limit 20 --since 30
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--user <email>` | Target specific user by email | All users with Gmail |
| `--limit <number>` | Maximum number of emails to process | 100 |
| `--since <days>` | Fetch emails from the last N days | 7 |
| `--help`, `-h` | Show help message | - |

## How It Works

The script performs the following steps:

1. **Find Users**: Queries the database for users with Gmail OAuth tokens
2. **Filter Users**: If `--user` is specified, filters to that user only
3. **Fetch Emails**: Uses Gmail API to fetch emails based on date range
4. **Extract Entities**: Uses EntityExtractor to extract structured entities (people, companies, topics, etc.)
5. **Save to Graph**: Stores entities in Neo4j knowledge graph with relationships
6. **Track Progress**: Updates extraction progress in database

## Progress Tracking

The script integrates with the existing extraction progress system:

- Creates/updates `extraction_progress` table records
- Tracks processed items, entities extracted, and costs
- Supports pause functionality (check database status)
- Updates watermarks for incremental extraction

## Output Format

### Real-time Progress

```
[ExtractGmail] [5/100] Email: "Meeting notes from Q4 planning..." → 12 entities
[ExtractGmail] [6/100] Email: "Lunch next week?" → No entities
[ExtractGmail] [7/100] Email: "Project update: Dashboard redesign" → 8 entities
```

### Final Summary

```
================================================================================
[ExtractGmail] ✅ Extraction complete for john@example.com
================================================================================
  📧 Emails processed: 50
  🏷️  Entities extracted: 234
  💰 Total cost: $0.002340
  ⏱️  Processing time: 45.23s
  📊 Avg: 904ms per email
================================================================================
```

## Requirements

### Environment Variables

Ensure these are set in your `.env` file:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_APP_URL=http://localhost:3300

# Database (Neon Postgres)
DATABASE_URL=postgresql://...

# Neo4j (for graph storage)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password

# OpenRouter (for entity extraction)
OPENROUTER_API_KEY=your_api_key
```

### Prerequisites

1. Users must have connected their Gmail account via OAuth
2. Neo4j must be running and accessible
3. Database must have proper schema (run migrations)

## Checking Prerequisites

```bash
# Check users with Gmail OAuth
npx tsx scripts/test-inngest-gmail.ts

# Check extraction status
npx tsx scripts/check-extraction-status.ts

# Check database connectivity
npx tsx scripts/check-db.ts
```

## Integration with Dashboard

The headless script uses the same:

- **EntityExtractor**: Same extraction logic as dashboard
- **Graph Builder**: Same Neo4j storage as dashboard
- **Progress Tracking**: Same database tables as dashboard
- **OAuth Tokens**: Same user tokens as dashboard

This means:

- ✅ Results appear in dashboard immediately
- ✅ Progress bars update in real-time
- ✅ Can pause/resume from dashboard
- ✅ Entity visualizations work
- ✅ Cost tracking is unified

## Common Use Cases

### 1. Automated Extraction (Cron Job)

```bash
# Extract new emails daily at 2 AM
0 2 * * * cd /path/to/izzie2 && npx tsx scripts/extract-gmail-entities.ts --since 1 >> /var/log/extraction.log 2>&1
```

### 2. Backfill Historical Data

```bash
# Process last 90 days, 500 emails at a time
npx tsx scripts/extract-gmail-entities.ts --since 90 --limit 500
```

### 3. User-Specific Extraction

```bash
# Extract for new user immediately after OAuth
npx tsx scripts/extract-gmail-entities.ts --user newuser@example.com --limit 100
```

### 4. Development Testing

```bash
# Test extraction with small sample
npx tsx scripts/extract-gmail-entities.ts --limit 10 --since 1
```

## Error Handling

The script handles common errors:

- **No OAuth tokens**: Shows clear error message
- **Rate limiting**: Includes 100ms delay between emails
- **API errors**: Logs error and continues with next email
- **Extraction failures**: Tracks failed items in progress
- **Pause support**: Checks for pause status between batches

## Performance

Typical performance metrics:

- **Throughput**: ~1-2 emails per second (with rate limiting)
- **Cost**: ~$0.00004 per email (using Mistral Small)
- **Memory**: ~100-200MB for 100 emails
- **Graph writes**: ~50-100ms per email

### Optimization Tips

1. **Batch Processing**: Process in chunks of 100-500 emails
2. **Off-Peak Hours**: Run during low-traffic hours
3. **Incremental**: Use `--since` to avoid reprocessing
4. **Monitor Costs**: Check dashboard for running totals

## Troubleshooting

### No users found

```bash
# Check if users have Gmail connected
npx tsx scripts/test-inngest-gmail.ts
```

### OAuth token expired

Tokens are automatically refreshed by the Google OAuth client. If refresh fails:

1. User needs to reconnect Gmail in dashboard
2. Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### Neo4j connection error

```bash
# Check Neo4j is running
docker ps | grep neo4j

# Test connection
npx tsx scripts/check-db.ts
```

### Extraction stuck

Check extraction status:

```bash
npx tsx scripts/check-extraction-status.ts
```

If stuck in "running" state, reset:

```bash
npx tsx scripts/reset-extraction-status.ts
```

## Related Scripts

- `scripts/test-inngest-gmail.ts` - Check users with Gmail OAuth
- `scripts/check-extraction-status.ts` - View extraction progress
- `scripts/reset-extraction-status.ts` - Reset stuck extractions
- `scripts/query-extraction-results.ts` - Query extracted entities
- `scripts/show-chat-entities.ts` - View entities in graph

## Architecture

```
extract-gmail-entities.ts
    ↓
getUsersWithGmail()
    ↓ (for each user)
extractForUser()
    ↓
GmailService → Fetch emails
    ↓
EntityExtractor → Extract entities
    ↓
GraphBuilder → Save to Neo4j
    ↓
ProgressTracker → Update database
```

## Next Steps

After running extraction:

1. **View Results**: Open dashboard at `/dashboard`
2. **Explore Graph**: Query Neo4j Browser at `http://localhost:7474`
3. **Check Costs**: Review total costs in extraction progress
4. **Set Up Automation**: Add to cron for scheduled extraction

## Support

For issues or questions:

1. Check logs in console output
2. Review extraction status in database
3. Test individual components with debug scripts
4. Check Neo4j and database connectivity
