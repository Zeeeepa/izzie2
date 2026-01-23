# User Proxy Agents Research

**Date:** 2025-01-23
**Objective:** Research existing services and solutions for "User Proxy Agents" - systems that can act on behalf of a user on websites they belong to (LinkedIn, Yelp, etc.)

---

## Executive Summary

The "User Proxy Agent" space is fragmented across several categories:

1. **Browser Automation Services** - Hosted headless browsers with AI control (Browserbase, Anchor)
2. **AI Web Agents** - Natural language driven browser automation (MultiOn, Browser Use, Stagehand)
3. **No-Code Automation Platforms** - Visual workflow builders with browser capabilities (Bardeen, Axiom, Gumloop)
4. **RPA Platforms** - Enterprise robotic process automation (UiPath, Automation Anywhere)
5. **API Aggregators** - Unified APIs for multi-platform access (Composio, Late, Unipile)
6. **Platform-Specific Tools** - Specialized automation for specific platforms (PhantomBuster, Clay)

**Key Finding:** No single service perfectly handles authenticated user actions across arbitrary platforms. The best approach is likely a combination of:
- **Composio** for managed OAuth and 250+ pre-built integrations
- **Anchor Browser** or **Browserbase** for custom browser automation with session persistence
- **Platform-specific tools** (PhantomBuster, Clay) for LinkedIn/social media

---

## Category 1: Browser Automation Services (Hosted)

### Browserbase
**Website:** [browserbase.com](https://www.browserbase.com)

| Attribute | Details |
|-----------|---------|
| **Description** | Cloud-based headless browser infrastructure for AI agents |
| **Authentication** | Session management, managed captcha solving, proxy rotation |
| **SDK/API** | Stagehand (TypeScript/Python), Playwright/Puppeteer compatible |
| **Key Features** | Fingerprint generation, residential proxies, Contexts API for persistent cookies |
| **Integration Complexity** | Medium - requires Playwright/Puppeteer knowledge |
| **Pricing** | Not publicly listed (contact sales) |
| **Best For** | Custom browser automation at scale, developers with Playwright experience |

**Pros:**
- Enterprise-grade with live observability
- Works with existing Playwright/Puppeteer code
- Stagehand framework adds AI layer with natural language

**Cons:**
- No built-in platform integrations
- Must handle authentication flows yourself

---

### Anchor Browser
**Website:** [anchorbrowser.io](https://anchorbrowser.io/)

| Attribute | Details |
|-----------|---------|
| **Description** | Persistent browser sessions for AI agents with authentication management |
| **Authentication** | Profile-based session persistence, cookies, local storage, auth tokens |
| **SDK/API** | CDP, Playwright, REST API |
| **Key Features** | Captcha resolution, anti-bot bypass, VPN integration, Okta/Azure AD support |
| **Integration Complexity** | Medium - profile management required |
| **Pricing** | Simple transparent pricing (visit docs.anchorbrowser.io/pricing) |
| **Best For** | Long-running authenticated workflows on any website |

**Pros:**
- Persistent authenticated sessions across agent runs
- Works with ANY website (not limited to pre-configured services)
- Built-in anti-detection and captcha solving

**Cons:**
- You manage profile lifecycle and expiration
- More engineering work than managed integrations

---

## Category 2: AI Web Agents

### MultiOn
**Website:** [multion.ai](https://docs.multion.ai/welcome)

| Attribute | Details |
|-----------|---------|
| **Description** | "Motor Cortex layer for AI" - autonomous web agents via natural language |
| **Authentication** | Secure remote sessions with native proxy support |
| **SDK/API** | Agent API for developers |
| **Key Features** | Chrome extension, LLM data scraping, parallel agents |
| **Integration Complexity** | Low - natural language instructions |
| **Pricing** | Free tier available, Pro plan for power users (specific pricing not disclosed) |
| **Best For** | Developers wanting quick autonomous agent setup |

**Pros:**
- Natural language task execution
- Built for millions of concurrent agents
- Chrome extension for local interaction

**Cons:**
- Pricing details unclear
- Less control than code-based solutions

---

### Browser Use
**Website:** [browser-use.com](https://browser-use.com/) | [GitHub](https://github.com/browser-use/browser-use)

| Attribute | Details |
|-----------|---------|
| **Description** | Open-source Python framework for AI browser automation |
| **Authentication** | Through Playwright session management |
| **SDK/API** | Python native, TypeScript support |
| **Key Features** | Visual understanding + HTML extraction, multiple LLM provider support |
| **Integration Complexity** | Low-Medium - Python knowledge required |
| **Pricing** | Free (open source), LLM costs only |
| **Best For** | Developers wanting open-source, customizable solution |

**Pros:**
- Completely free and open source
- Works with any LLM (OpenAI, Anthropic, Google, etc.)
- Active community

**Cons:**
- Self-hosted (or use cloud service)
- DIY authentication management

---

### AgentGPT
**Website:** [agentgpt.reworkd.ai](https://agentgpt.reworkd.ai/) | [GitHub](https://github.com/reworkd/AgentGPT)

| Attribute | Details |
|-----------|---------|
| **Description** | Browser-based autonomous AI agents with no-code creation |
| **Authentication** | API/plugin-based |
| **SDK/API** | REST API available |
| **Key Features** | Browser-based deployment, connects to third-party apps |
| **Integration Complexity** | Low - no code for basic use |
| **Pricing** | Free trial (5 agents/day), Pro $40/month (30 agents/day, GPT-4), Enterprise custom |
| **Best For** | Non-technical users wanting autonomous agents |

**Pros:**
- 31,000+ GitHub stars
- No coding required
- Self-hostable via Docker

**Cons:**
- Limited web automation vs dedicated browser agents
- Agent daily limits

---

## Category 3: No-Code Automation Platforms

### Bardeen AI
**Website:** [bardeen.ai](https://www.bardeen.ai/)

| Attribute | Details |
|-----------|---------|
| **Description** | No-code browser automation via Chrome extension |
| **Authentication** | SOC 2 Type II, GDPR, CASA certified |
| **SDK/API** | Chrome extension, ChatGPT-style AI builder |
| **Key Features** | 200+ integrations, AI-generated workflows, specialized copilots |
| **Integration Complexity** | Low - point and click |
| **Pricing** | Free (200 credits/month), Starter $99-129/month, Teams $500/month |
| **Best For** | Sales/marketing teams automating lead gen and data entry |

**Pros:**
- ChatGPT-style natural language workflow creation
- Data never leaves browser (privacy-focused)
- Pre-built playbooks

**Cons:**
- Credit-based pricing can get expensive
- Limited for complex custom workflows

---

### Axiom.ai
**Website:** [axiom.ai](https://axiom.ai/)

| Attribute | Details |
|-----------|---------|
| **Description** | No-code browser automation and web scraping |
| **Authentication** | Cloud or local execution |
| **SDK/API** | Puppeteer, Playwright, Python API access |
| **Key Features** | Zapier/Make integrations, cloud execution |
| **Integration Complexity** | Low (no-code) to Medium (API) |
| **Pricing** | Starter $15/month, Pro $50/month, Business $150/month, Platinum $250/month |
| **Best For** | Small teams needing affordable browser automation |

**Pros:**
- Very affordable entry point
- Both no-code and pro-code options
- Runs unlimited bots with desktop concurrency

**Cons:**
- Pricing based on runtime hours
- May need custom plan for high volume

---

### Gumloop
**Website:** [gumloop.com](https://www.gumloop.com/)

| Attribute | Details |
|-----------|---------|
| **Description** | No-code platform for AI-powered business automations |
| **Authentication** | SOC 2 Type 2, GDPR, HIPAA compliant |
| **SDK/API** | Chrome extension, API |
| **Key Features** | Browser automation, competitive monitoring, auto-prospecting |
| **Integration Complexity** | Low - visual workflow builder |
| **Pricing** | Free (10K credits), Solo $37/month (10K credits), Business/Enterprise custom |
| **Best For** | SMBs needing AI-centric automation with compliance |

**Pros:**
- AI-first design (not retrofitted)
- Chrome extension for recording actions
- HIPAA compliant for sensitive data

**Cons:**
- Credit-based pricing
- Relatively new platform

---

### Lindy AI
**Website:** [lindy.ai](https://www.lindy.ai/)

| Attribute | Details |
|-----------|---------|
| **Description** | AI employee platform with computer use capabilities |
| **Authentication** | SOC 2, HIPAA, GDPR compliant |
| **SDK/API** | HTTP API, Python/JavaScript in workflows |
| **Key Features** | 5,000+ integrations, voice agents, Autopilot web automation |
| **Integration Complexity** | Low - natural language agent creation |
| **Pricing** | Free (400 tasks), $49/month (up to 1,500 tasks), $299/month (5,000 tasks) |
| **Best For** | Teams wanting "AI employees" for calendar, email, sales |

**Pros:**
- Autopilot feature for web automation beyond APIs
- Voice agent capabilities (Gaia)
- Claude Sonnet 4.5 integration

**Cons:**
- Task-based pricing can be limiting
- Computer use is newer feature

---

## Category 4: RPA Platforms (Enterprise)

### UiPath
**Website:** [uipath.com](https://www.uipath.com/)

| Attribute | Details |
|-----------|---------|
| **Description** | Enterprise RPA with AI agents |
| **Authentication** | Enterprise SSO, MFA support |
| **SDK/API** | Full API, Automation Hub |
| **Key Features** | AI Agents, attended/unattended bots, process mining |
| **Integration Complexity** | High - enterprise deployment |
| **Pricing** | Free (Community), Pro $420/month (1 unattended + 1 attended), Enterprise custom |
| **Best For** | Large enterprises with complex automation needs |

**Pros:**
- Industry leader in RPA
- Comprehensive enterprise features
- AI Agent consumption model

**Cons:**
- Complex pricing (PUs, RUs, AI Units)
- Overkill for small projects
- Requires significant setup

---

### Automation Anywhere
**Website:** [automationanywhere.com](https://www.automationanywhere.com/)

| Attribute | Details |
|-----------|---------|
| **Description** | Cloud-native RPA with AI/ML integration |
| **Authentication** | Enterprise-grade security |
| **SDK/API** | Full API, IQ Bot for intelligent processing |
| **Key Features** | Cloud-first, drag-and-drop interface, Python/AWS integration |
| **Integration Complexity** | High - enterprise deployment |
| **Pricing** | Cloud Starter $750/month (1 bot), additional unattended $500/month, attended $125/month |
| **Best For** | Enterprises wanting cloud-native RPA |

**Pros:**
- True cloud-native architecture
- Free Community Edition available
- Strong document processing (IQ Bot)

**Cons:**
- Pricing adds up quickly at scale
- Learning curve for complex automations

---

## Category 5: API Aggregators & Integration Platforms

### Composio
**Website:** [composio.dev](https://composio.dev/)

| Attribute | Details |
|-----------|---------|
| **Description** | Agent-native integration platform with managed OAuth |
| **Authentication** | Fully managed OAuth for 250+ integrations |
| **SDK/API** | Python SDK, works with LangChain, CrewAI, Autogen |
| **Key Features** | Brokered credentials (tokens never touch LLM), 5-min integration setup |
| **Integration Complexity** | Low - handles auth complexity |
| **Pricing** | API calls + active connections based (specific pricing not disclosed) |
| **Best For** | AI agent developers needing quick, secure integrations |

**Pros:**
- Handles OAuth flows, token storage, rotation automatically
- SOC2 and ISO compliant
- Open-source core
- 90% reduction in integration time (customer reported)

**Cons:**
- Pricing not publicly listed
- Limited to pre-built integrations (no arbitrary website automation)

---

### Late (Unified Social Media API)
**Website:** [getlate.dev](https://getlate.dev/)

| Attribute | Details |
|-----------|---------|
| **Description** | Unified API for publishing across 10+ social platforms |
| **Authentication** | OAuth handled per-platform |
| **SDK/API** | Single REST API for all platforms |
| **Key Features** | 99.97% uptime SLA, <50ms response, intelligent rate limiting |
| **Integration Complexity** | Low - single API call |
| **Pricing** | Not disclosed in search results |
| **Best For** | Social media management applications |

**Pros:**
- One API for Twitter, LinkedIn, Instagram, TikTok, etc.
- Enterprise-grade reliability
- Automatic retry and rate limit handling

**Cons:**
- Publishing-focused (may not cover all actions)
- Limited to supported platforms

---

### Unipile
**Website:** [unipile.com](https://www.unipile.com/)

| Attribute | Details |
|-----------|---------|
| **Description** | Unified messaging and social media API |
| **Authentication** | OAuth 2.0 unified across platforms |
| **SDK/API** | REST API |
| **Key Features** | LinkedIn, Instagram, WhatsApp, Messenger, Telegram |
| **Integration Complexity** | Low-Medium |
| **Pricing** | Not disclosed in search results |
| **Best For** | Messaging automation across platforms |

**Pros:**
- Covers messaging apps (WhatsApp, Messenger)
- Unified data model

**Cons:**
- Limited platform coverage
- Pricing not transparent

---

## Category 6: Platform-Specific Tools

### PhantomBuster
**Website:** [phantombuster.com](https://phantombuster.com/)

| Attribute | Details |
|-----------|---------|
| **Description** | Cloud-based automation for LinkedIn, Twitter, Instagram, etc. |
| **Authentication** | Supports up to 100 LinkedIn accounts per workspace |
| **SDK/API** | Yes, API available |
| **Key Features** | LinkedIn scraping, email finding, AI personalization |
| **Integration Complexity** | Low - pre-built "Phantoms" |
| **Pricing** | Trial (14 days free), Starter $69/month (5 slots, 20h), Pro $159/month (15 slots, 80h), Team $439/month |
| **Best For** | Sales teams doing LinkedIn outreach |

**Pros:**
- Purpose-built for social media automation
- Pre-built automations (Phantoms)
- Email finding included

**Cons:**
- Complex pricing (slots + hours + credits)
- No rollover of unused credits
- Can get expensive at scale

---

### Clay
**Website:** [clay.com](https://www.clay.com/)

| Attribute | Details |
|-----------|---------|
| **Description** | Data enrichment and GTM automation platform |
| **Authentication** | Through 100+ data provider integrations |
| **SDK/API** | Webhooks, HTTP API, CRM integrations |
| **Key Features** | Waterfall enrichment, 100+ data sources, AI enrichment |
| **Integration Complexity** | Medium - workflow building required |
| **Pricing** | Free (100 credits), Starter $149/month (2K credits), Explorer $349/month (10K), Pro $800/month (50K), Enterprise ~$30K/year |
| **Best For** | Sales/marketing teams doing enrichment and outreach |

**Pros:**
- Massive data provider network
- Waterfall enrichment maximizes match rates
- Replaces multiple data subscriptions

**Cons:**
- Credit system can be confusing
- Gets expensive at high volume
- More enrichment than automation

---

### Apify
**Website:** [apify.com](https://apify.com/)

| Attribute | Details |
|-----------|---------|
| **Description** | Web scraping and automation platform |
| **Authentication** | Cloud infrastructure handles sessions |
| **SDK/API** | REST API, 10,000+ pre-built Actors |
| **Key Features** | Proxy rotation, CAPTCHA bypass, JavaScript rendering |
| **Integration Complexity** | Low (pre-built) to Medium (custom) |
| **Pricing** | Free tier ($5 prepaid), pay-as-you-go for compute/storage/proxy |
| **Best For** | Web scraping at scale, data extraction |

**Pros:**
- Massive marketplace of pre-built scrapers
- SOC 2 Type II, GDPR, CCPA compliant
- 99.95% uptime

**Cons:**
- Pricing can be confusing
- More focused on scraping than authenticated actions

---

## Comparison Matrix

| Service | Auth Handling | API Available | Actions (Post/Review) | Pricing Entry | Integration Complexity |
|---------|--------------|---------------|----------------------|---------------|------------------------|
| **Browserbase** | DIY (sessions) | Yes (Playwright) | Custom build | Contact sales | Medium-High |
| **Anchor** | Persistent profiles | Yes (CDP/API) | Custom build | Visit pricing page | Medium |
| **MultiOn** | Managed | Yes | Yes (natural language) | Free tier | Low |
| **Browser Use** | DIY | Yes (Python) | Custom build | Free (OSS) | Medium |
| **Composio** | Managed OAuth | Yes | 250+ integrations | API-based | Low |
| **Bardeen** | Chrome extension | Limited | Limited | $99/month | Low |
| **Gumloop** | Chrome extension | Yes | Yes | $37/month | Low |
| **Lindy AI** | Managed | Yes | 5,000+ integrations | $49/month | Low |
| **PhantomBuster** | Managed | Yes | LinkedIn/Social | $69/month | Low |
| **Clay** | Data providers | Yes | Enrichment focus | $149/month | Medium |
| **UiPath** | Enterprise | Yes | Custom build | $420/month | High |
| **Axiom** | Cloud/local | Yes | Custom build | $15/month | Low-Medium |

---

## Recommendations by Use Case

### For Quick LinkedIn/Social Media Automation
**Recommendation:** PhantomBuster or Clay
- Pre-built automations
- Managed authentication
- Good for sales teams

### For Custom Authenticated Actions on Any Website
**Recommendation:** Anchor Browser + Browser Use
- Persistent session management
- Works with any website
- Maximum flexibility

### For AI Agent Development with Multiple Integrations
**Recommendation:** Composio
- Managed OAuth for 250+ services
- Works with LangChain/CrewAI
- Security-first design

### For Enterprise RPA
**Recommendation:** UiPath or Automation Anywhere
- Proven enterprise solutions
- Governance and compliance
- Large support ecosystem

### For Budget-Conscious Teams
**Recommendation:** Browser Use (free) + Axiom ($15/month)
- Open-source foundation
- Affordable cloud option
- Can scale later

### For No-Code Teams
**Recommendation:** Lindy AI or Gumloop
- Natural language workflows
- Pre-built integrations
- Compliance certifications

---

## Key Considerations

### Authentication Challenges
1. **OAuth flows** - Managed services (Composio) handle this best
2. **Session persistence** - Anchor Browser specializes in this
3. **Anti-bot detection** - Browserbase, Anchor include bypass solutions
4. **MFA/2FA** - Still a challenge; may require user intervention

### Integration Approaches
1. **Pre-built integrations** - Fastest but limited to supported platforms
2. **Browser automation** - Works anywhere but requires more development
3. **Hybrid** - Use APIs where available, browser automation for gaps

### Cost Considerations
- **Credit-based** (Bardeen, Gumloop, Clay) - predictable but can limit usage
- **Usage-based** (UiPath, Automation Anywhere) - scales with consumption
- **Seat-based** - predictable but doesn't scale well
- **Open-source** (Browser Use) - free software, pay for infrastructure

---

## Sources

### Browser Automation Services
- [Browserbase](https://www.browserbase.com)
- [Anchor Browser](https://anchorbrowser.io/)
- [Stagehand Framework](https://www.stagehand.dev/)

### AI Web Agents
- [MultiOn Documentation](https://docs.multion.ai/)
- [Browser Use GitHub](https://github.com/browser-use/browser-use)
- [AgentGPT](https://agentgpt.reworkd.ai/)

### No-Code Automation
- [Bardeen AI Pricing](https://www.bardeen.ai/pricing)
- [Axiom.ai](https://axiom.ai/)
- [Gumloop](https://www.gumloop.com/)
- [Lindy AI](https://www.lindy.ai/)

### RPA Platforms
- [UiPath Pricing](https://www.uipath.com/pricing)
- [Automation Anywhere](https://www.automationanywhere.com/)

### API Aggregators
- [Composio](https://composio.dev/)
- [Late - Unified Social API](https://getlate.dev/)
- [Unipile](https://www.unipile.com/)

### Platform-Specific Tools
- [PhantomBuster](https://phantombuster.com/)
- [Clay](https://www.clay.com/)
- [Apify](https://apify.com/)

### Research Articles
- [Top 10 Browser Use Agents 2026](https://o-mega.ai/articles/top-10-browser-use-agents-full-review-2026)
- [Best Unified Social Media APIs 2026](https://www.outstand.so/blog/best-unified-social-media-apis-for-devs)
- [AI Agent Authentication Platforms Guide](https://composio.dev/blog/ai-agent-authentication-platforms)
- [Authentication for Agentic Workflows](https://anchorbrowser.io/blog/authentication-for-agentic-workflows)
