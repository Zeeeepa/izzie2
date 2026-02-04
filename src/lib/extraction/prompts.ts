/**
 * Entity Extraction Prompts
 *
 * Prompts for Mistral to extract structured entities from emails and calendar events.
 * Uses JSON output format for reliable parsing.
 */

import type { Email, CalendarEvent } from '../google/types';
import type { ExtractionConfig } from './types';
import type { UserIdentity } from './user-identity';

/**
 * Build extraction prompt for Mistral with user identity context
 */
export function buildExtractionPrompt(
  email: Email,
  config: ExtractionConfig,
  userIdentity?: UserIdentity
): string {
  const sources: string[] = [];

  if (config.extractFromMetadata) {
    sources.push(`**From:** ${email.from.name || email.from.email}`);
    sources.push(`**To:** ${email.to.map((t) => t.name || t.email).join(', ')}`);
    if (email.cc && email.cc.length > 0) {
      sources.push(`**CC:** ${email.cc.map((c) => c.name || c.email).join(', ')}`);
    }
  }

  if (config.extractFromSubject) {
    sources.push(`**Subject:** ${email.subject}`);
  }

  if (config.extractFromBody) {
    sources.push(`**Body:**\n${email.body}`);
  }

  // User identity context (if available)
  const userContext = userIdentity
    ? `
**USER IDENTITY CONTEXT:**
- Current user name: ${userIdentity.primaryName}
- Current user email: ${userIdentity.primaryEmail}
- User aliases: ${userIdentity.aliases.slice(0, 5).join(', ')}${userIdentity.aliases.length > 5 ? '...' : ''}

**IMPORTANT:**
- If you see "${userIdentity.primaryName}" in From/To/CC, this is the CURRENT USER (mark with high confidence)
- DO NOT extract the current user's name from emails they sent (From field when isSent=true)
- DO extract recipients of sent emails (To/CC) - these are people the user communicates with
`
    : '';

  // Context-aware person extraction: restrict to metadata only
  const personExtractionRule = email.isSent
    ? '1. **person** - People\'s names (ONLY from To/CC recipient lists - people you sent this email to)'
    : '1. **person** - People\'s names (ONLY from From/To/CC metadata - NOT from email body text)';

  return `Extract structured entities and classify spam from this email.

**CRITICAL: PERSONAL RELEVANCE FILTER**
Focus ONLY on entities that are PERSONALLY relevant to the user - people they interact with,
companies they work for/with, projects they're involved in. SKIP entities that are merely
mentioned in news, newsletters, or forwarded content.

**Newsletter/News Detection:**
If this email appears to be a newsletter, news digest, marketing email, or forwarded content:
- From addresses like "newsletter@", "digest@", "noreply@", "news@", "updates@"
- Subject lines with "Weekly", "Daily", "Digest", "Newsletter", "Update:", "News:"
- Bulk sender indicators (unsubscribe links, mass distribution patterns)
- Forwarded content patterns ("FW:", "Fwd:", forwarded headers in body)

For newsletter/news content: ONLY extract entities if the user has a DIRECT personal connection
(e.g., they are mentioned by name, invited to something, assigned a task).
${userContext}
${sources.join('\n')}

**Entity Types to Extract (PERSONAL RELEVANCE REQUIRED):**
${personExtractionRule}
   - EXTRACT: People who directly emailed the user, recipients of user's emails, meeting attendees
   - SKIP: Famous people mentioned in news articles (Elon Musk, Sam Altman, unless they emailed directly)
   - SKIP: Authors/journalists of forwarded articles
   - SKIP: People mentioned in newsletters the user didn't write
2. **company** - Organizations the user PERSONALLY interacts with
   - EXTRACT: User's employer, clients, vendors, partners they work with directly
   - EXTRACT: Companies where contacts work (from direct correspondence)
   - SKIP: Companies mentioned in news/newsletters (Microsoft, Google, OpenAI - unless user works there/with them)
   - SKIP: Companies in forwarded articles, tech news, industry updates
   - NOT software tools/platforms (those are "tool" type)
3. **project** - Projects the user is PERSONALLY involved in
   - EXTRACT: User's work projects, initiatives they're assigned to, repos they contribute to
   - EXTRACT: Specific named projects from direct work emails ("Project Phoenix", "Q4 Migration", "Issue #24")
   - SKIP: Projects mentioned in newsletters (product launches, open source projects they don't contribute to)
   - SKIP: Generic features or products announced in tech news
   - DO NOT extract: Invoice numbers (INV-xxx, Invoice #xxx)
4. **tool** - Tools the user ACTUALLY uses
   - EXTRACT: Tools mentioned in direct work context (Slack channels, GitHub repos, Jira tickets)
   - SKIP: Tools mentioned in product announcements, tech news, comparisons
   - Examples of personal tools: Slack, GitHub, HiBob, Notion, Figma, Jira
5. **topic** - Topics relevant to user's ACTUAL work/life
   - EXTRACT: Topics from direct conversations, meeting invites, project discussions
   - SKIP: General tech trends, news topics, industry buzzwords from newsletters
6. **location** - Places the user ACTUALLY goes or works
   - EXTRACT: User's office, meeting locations, event venues they're invited to
   - EXTRACT: Cities/addresses from direct correspondence about meetings, travel
   - SKIP: Locations mentioned in news (company headquarters, event locations user isn't attending)
   - DO NOT extract: Countries, states, or generic regions
7. **action_item** - Tasks ASSIGNED TO or BY the user
   - EXTRACT: Tasks from direct emails where user is assignee or assigner
   - SKIP: Tasks mentioned in forwarded content, newsletters, or status updates not involving user

**WHAT TO EXTRACT vs WHAT TO SKIP - EXAMPLES:**
EXTRACT (personal):
- "Hi John, can we meet Tuesday?" -> person: John (direct communication)
- "Please review the Acme proposal" -> company: Acme (user's client/work)
- "Join our standup on Zoom" -> tool: Zoom (user's meeting)

SKIP (newsletter/news):
- "Microsoft announced..." -> SKIP Microsoft (news mention)
- "Elon Musk said..." -> SKIP Elon Musk (celebrity, not direct contact)
- "OpenAI released GPT-5..." -> SKIP OpenAI, GPT-5 (tech news)
- "California passes new law..." -> SKIP California (news about location)
- "MIT Technology Review reports..." -> SKIP MIT Technology Review (newsletter source)

**Spam/Newsletter Classification:**
Classify if this email is spam/promotional/newsletter/low-value based on:
- Marketing/promotional content
- Mass-distributed newsletters (tech digests, news roundups, industry updates)
- Automated notifications with no actionable content
- Phishing attempts or suspicious patterns
- Low relevance to recipient
- Forwarded content from others (FW:, Fwd:)

Newsletter indicators (set higher spamScore 0.6-0.8 for these):
- From addresses: newsletter@, digest@, noreply@, news@, updates@, weekly@
- Subject patterns: "Weekly", "Daily", "Digest", "Newsletter", "Roundup", "Top Stories"
- Content patterns: Multiple unrelated topics, "Unsubscribe" links, bulk formatting
- Known newsletter senders: MIT Technology Review, TechCrunch, The Verge, Hacker News, etc.

**Relationship Extraction:**
Also identify meaningful relationships between the entities you extract:
RELATIONSHIP TYPES (use exactly these):
- WORKS_WITH: Two people who work together/collaborate (professional)
  * REQUIRES: Explicit evidence of formal collaboration (same project, same team, same company)
  * NOT just two people mentioned in the same email
  * Evidence must show: "working together on X", "teammates", "colleagues at Y"
- REPORTS_TO: Person reports to another person (hierarchy)
- WORKS_FOR: Person works for a company
  * If company name is ambiguous/unknown (short acronyms like "HFNA"), use LOWER confidence (0.5-0.6)
  * Only high confidence (0.8+) if company is well-known or clearly stated
- LEADS: Person leads/manages a project
- WORKS_ON: Person works on a project
- EXPERT_IN: Person has expertise in a topic
- LOCATED_IN: Person or company is located in a SPECIFIC place
  * ONLY use for specific cities/addresses, NOT countries/states/regions
  * Prefer user-provided context over email content for user's own location
  * If user context says "Hastings on Hudson NY", use that, not other locations mentioned
- FRIEND_OF: Person is a friend of another person (personal, non-work relationship)
- FAMILY_OF: Person is a family member of another (parent, child, grandparent, cousin, etc.)
- MARRIED_TO: Person is married to/spouse of another person
- SIBLING_OF: Person is brother or sister of another person
- PARTNERS_WITH: Two companies partner together
- COMPETES_WITH: Two companies compete
- OWNS: Company owns/runs a project
- RELATED_TO: Projects or topics are related
- DEPENDS_ON: Project depends on another project
- PART_OF: Project is part of a larger project
- SUBTOPIC_OF: Topic is a subtopic of another
- ASSOCIATED_WITH: Topics are associated

RELATIONSHIP RULES:
1. Only infer relationships with CLEAR, EXPLICIT evidence in the content
2. Confidence should reflect how explicitly stated (0.5-1.0)
3. Include a brief quote as evidence supporting each relationship
4. Focus on meaningful relationships, not every possible connection
5. Maximum 5 relationships per email
6. For WORKS_WITH: require explicit collaboration evidence, not just co-occurrence
7. For unknown/ambiguous company names: cap confidence at 0.6

**Instructions:**
- Extract all entities with confidence scores (0.0 to 1.0)
- Normalize names (e.g., "Bob" might be "Robert")
- Include source (metadata, subject, or body)
- Link email addresses to person entities when possible
- Minimum confidence threshold: ${config.minConfidence}
- For action_item: extract assignee, deadline, and priority if mentioned
- Classify spam with score 0-1 (0=definitely not spam, 1=definitely spam)

**PERSON EXTRACTION (STRICT RULES):**
1. ONLY extract from To/CC/From headers - NEVER from email body
2. ONLY extract HUMAN NAMES in "Firstname Lastname" format (e.g., "John Doe", "Sarah Smith")
3. DO NOT extract the current user's own name from emails they sent (check isSent flag and user context)
4. DO NOT extract:
   - Email addresses (e.g., "bob@company.com")
   - Company/brand names (e.g., "Reddit Notifications", "Apple Support", "Hastings-on-Hudson Safety Posts")
   - Group names (e.g., "Safety Posts", "Team Updates", "Trending Posts")
   - Names with indicators: "from X", "X Team", "X Support", "X Notifications", "X Posts"
5. If From field contains BOTH a person AND company (e.g., "John Doe from Acme Corp"):
   - Extract person: "John Doe" (unless it's the current user)
   - Extract company: "Acme Corp"
6. When in doubt between person/company, choose COMPANY

**COMPANY EXTRACTION (STRICT RULES):**
1. Extract from metadata, subject, and body
2. Company indicators (extract as COMPANY, not person):
   - Pattern: "[Company] Notifications", "[Company] Support", "[Company] Team", "[Company] Posts"
   - Pattern: "Support from [Company]", "Team at [Company]"
   - Well-known companies: Reddit, Apple, Google, Microsoft, Meta, GitHub, LinkedIn, Facebook
   - From field with brand/service name (e.g., "notifications@reddit.com" → company: Reddit)
   - Group/page names: "[Name] Safety Posts", "[Name] Trending Posts" → company
3. When in doubt between person/company, choose COMPANY

**Examples:**
- "Support from Flume" → company: Flume
- "Reddit Notifications" → company: Reddit
- "Apple Support" → company: Apple
- "john@company.com" → NO person entity (email is not a name)
- "John Doe <john@company.com>" → person: John Doe

**Response Format (JSON only):**
{
  "spam": {
    "isSpam": false,
    "spamScore": 0.1,
    "spamReason": "Personal email with actionable content"
  },
  "entities": [
    {
      "type": "person",
      "value": "John Doe",
      "normalized": "john_doe",
      "confidence": 0.95,
      "source": "metadata",
      "context": "From: John Doe <john@example.com>"
    },
    {
      "type": "company",
      "value": "Acme Corp",
      "normalized": "acme_corp",
      "confidence": 0.9,
      "source": "body",
      "context": "John from Acme Corp"
    },
    {
      "type": "action_item",
      "value": "Review the proposal by Friday",
      "normalized": "review_proposal",
      "confidence": 0.9,
      "source": "body",
      "context": "Can you review the proposal by Friday?",
      "assignee": "you",
      "deadline": "2025-01-10",
      "priority": "high"
    }
  ],
  "relationships": [
    {
      "fromType": "person",
      "fromValue": "John Doe",
      "toType": "company",
      "toValue": "Acme Corp",
      "relationshipType": "WORKS_FOR",
      "confidence": 0.85,
      "evidence": "John from Acme Corp mentioned..."
    }
  ]
}

Respond with JSON only. No additional text or explanation.`;
}

/**
 * Build batch extraction prompt (optimized for multiple emails)
 */
export function buildBatchExtractionPrompt(emails: Email[], config: ExtractionConfig): string {
  const emailSummaries = emails
    .map((email, index) => {
      const parts: string[] = [`Email ${index + 1} (ID: ${email.id})`];

      if (config.extractFromMetadata) {
        parts.push(`From: ${email.from.name || email.from.email}`);
        parts.push(`To: ${email.to.map((t) => t.name || t.email).join(', ')}`);
      }

      if (config.extractFromSubject) {
        parts.push(`Subject: ${email.subject}`);
      }

      if (config.extractFromBody) {
        // Truncate long bodies for batch processing
        const bodyPreview = email.body.length > 500 ? email.body.slice(0, 500) + '...' : email.body;
        parts.push(`Body: ${bodyPreview}`);
      }

      return parts.join('\n');
    })
    .join('\n\n---\n\n');

  return `Extract structured entities from these ${emails.length} emails.

${emailSummaries}

**Entity Types to Extract:**
1. person - People's names
2. company - Organizations
3. project - Project names
4. topic - Subject areas
5. location - Geographic locations
6. action_item - Tasks and todos

**Instructions:**
- Extract all entities with confidence scores (0.0 to 1.0)
- Normalize names consistently across emails
- Minimum confidence: ${config.minConfidence}
- Group entities by email ID

**Response Format (JSON only):**
{
  "results": [
    {
      "emailId": "email-id-1",
      "entities": [
        {
          "type": "person",
          "value": "John Doe",
          "normalized": "john_doe",
          "confidence": 0.95,
          "source": "metadata"
        }
      ]
    }
  ]
}

Respond with JSON only.`;
}

/**
 * Build extraction prompt for calendar events
 * NOTE: Calendar events only extract entities, NOT relationships.
 * Calendar events have limited context (attendees, title, description) so
 * relationships aren't meaningful - we only want entities (people, topics, locations).
 */
export function buildCalendarExtractionPrompt(
  event: CalendarEvent,
  config: ExtractionConfig
): string {
  const sources: string[] = [];

  sources.push(`**Summary:** ${event.summary}`);

  if (event.description) {
    sources.push(`**Description:**\n${event.description}`);
  }

  if (event.location) {
    sources.push(`**Location:** ${event.location}`);
  }

  sources.push(`**Start:** ${event.start.dateTime}`);
  sources.push(`**End:** ${event.end.dateTime}`);

  if (event.attendees && event.attendees.length > 0) {
    sources.push(
      `**Attendees:** ${event.attendees.map((a) => `${a.displayName} (${a.email})`).join(', ')}`
    );
  }

  if (event.organizer) {
    sources.push(`**Organizer:** ${event.organizer.displayName} (${event.organizer.email})`);
  }

  return `Extract structured entities from this calendar event.

${sources.join('\n')}

**Entity Types to Extract:**
1. **person** - People's names (from attendees, organizer, and description)
2. **company** - Organizations and companies mentioned (NOT software tools/platforms)
3. **project** - Project names and references (NOT invoice numbers like INV-xxx)
4. **tool** - Software tools, platforms, APIs, and services (Slack, GitHub, HiBob, Notion, Zoom, etc.)
5. **topic** - Subject areas and themes (meeting topics, discussion areas)
6. **location** - SPECIFIC geographic locations only (cities, specific addresses, meeting rooms)
   - DO NOT extract: Countries, states, or regions
7. **action_item** - Tasks, todos, and action items mentioned in description

**IMPORTANT: DO NOT extract relationships.**
Calendar events have limited context, so relationship extraction is skipped.
Only return the "relationships" array as empty: []

**Instructions:**
- Extract all entities with confidence scores (0.0 to 1.0)
- Normalize names (e.g., "Bob" might be "Robert")
- Include source (metadata, description)
- Link email addresses to person entities when possible
- Minimum confidence threshold: ${config.minConfidence}
- For action_item: extract assignee, deadline, and priority if mentioned
- The event itself is NOT spam, so always set isSpam: false

**Response Format (JSON only):**
{
  "spam": {
    "isSpam": false,
    "spamScore": 0,
    "spamReason": "Calendar event"
  },
  "entities": [
    {
      "type": "person",
      "value": "John Doe",
      "normalized": "john_doe",
      "confidence": 0.95,
      "source": "metadata",
      "context": "Attendee: John Doe <john@example.com>"
    },
    {
      "type": "company",
      "value": "Acme Corp",
      "normalized": "acme_corp",
      "confidence": 0.9,
      "source": "metadata",
      "context": "Meeting with Acme Corp team"
    },
    {
      "type": "location",
      "value": "Conference Room A",
      "normalized": "conference_room_a",
      "confidence": 0.9,
      "source": "metadata",
      "context": "Location: Conference Room A"
    },
    {
      "type": "topic",
      "value": "Q1 Planning",
      "normalized": "q1_planning",
      "confidence": 0.9,
      "source": "metadata",
      "context": "Summary: Q1 Planning Meeting"
    },
    {
      "type": "action_item",
      "value": "Prepare budget forecast",
      "normalized": "prepare_budget_forecast",
      "confidence": 0.85,
      "source": "description",
      "context": "Please prepare budget forecast before the meeting",
      "assignee": "team",
      "priority": "medium"
    }
  ],
  "relationships": []
}

Respond with JSON only. No additional text or explanation.`;
}
