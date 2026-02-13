# Google Workspace Integration Inventory - Izzie2 Codebase

**Date:** 2025-02-12
**Objective:** Comprehensive inventory of Google Workspace API integrations
**Status:** ✅ Complete

---

## Executive Summary

### Current State
- **Gmail:** ✅ **COMPREHENSIVE** - Full control with send, read, search, labels, archive, delete, filters, drafts
- **Calendar:** ✅ **READ-ONLY** - Event fetching with attendee/conference details
- **Drive:** ✅ **READ-ONLY** - File listing, search, content extraction, change tracking
- **Contacts:** ✅ **FULL CRUD** - Complete management with search, create, update
- **Google Tasks:** ✅ **FULL CRUD** - Task/TaskList management with multi-account support
- **Document Reading:** ❌ **MISSING** - No Google Docs, Sheets, Slides reading capabilities

### Overall Coverage
- **5/6 services implemented** (83% coverage)
- **Missing:** Document content extraction (Docs/Sheets/Slides)
- **Quality:** Well-structured, modular, production-ready

---

## 1. Gmail Integration 

### Implementation Status: ✅ **COMPREHENSIVE**

### Capabilities

#### Core Operations
- **Read:** ✅ Full email fetching with pagination
- **Search:** ✅ Gmail search query support
- **Send:** ✅ Email sending with CC/BCC
- **Delete:** ✅ Move to trash
- **Archive:** ✅ Remove from inbox
- **Draft:** ✅ Create email drafts
- **Batch:** ✅ Bulk operations (archive, trash)

#### Label Management
- **List:** ✅ Get all labels (system + user)
- **Apply:** ✅ Add labels to emails
- **Remove:** ✅ Remove labels from emails
- **Move:** ✅ Move between folders/labels
- **Find:** ✅ Find label by name

#### Advanced Features
- **Filters:** ✅ Create, list, delete Gmail filters
- **Threads:** ✅ Thread-based email grouping
- **Sync:** ✅ Incremental sync support
- **Multi-account:** ✅ Multi-account support

### Architecture
```
src/lib/google/gmail/
├── gmail-service.ts      # Facade pattern (main interface)
├── message-service.ts    # Email CRUD operations
├── label-service.ts      # Label/folder management
├── sync-service.ts       # Batch operations + sync
├── compose-service.ts    # Send/draft functionality
├── filter-service.ts     # Gmail filter management
└── interfaces.ts         # TypeScript interfaces
```

### OAuth Scopes
```
✅ gmail.readonly       # Read access
✅ gmail.modify         # Archive, label, delete
✅ gmail.send           # Send email
✅ gmail.settings.basic # Filter management
```

### MCP/Chat Tools Exposed
- `archive_email` - Archive emails by search query
- `send_email` - Send emails (with confirmation)
- `create_draft` - Create email drafts
- `list_labels` - List Gmail labels
- `bulk_archive` - Bulk archive operations
- `delete_email` - Move to trash (with confirmation)
- `apply_label` - Apply labels to emails
- `move_email` - Move to specific folder
- `create_email_filter` - Create Gmail filters
- `list_email_filters` - List configured filters
- `delete_email_filter` - Delete filters

### Missing Functionality
- ❌ **Attachments:** No attachment download/upload
- ❌ **Gmail API push notifications:** No webhook support
- ❌ **Advanced search operators:** Limited search query building helpers
- ❌ **Email templates:** No template system

### Recommendations
**Priority: LOW** - Gmail integration is feature-complete for core use cases

---

## 2. Google Calendar Integration

### Implementation Status: ✅ **READ-ONLY**

### Capabilities

#### Core Operations
- **Fetch Events:** ✅ Time-based event retrieval
- **Get Event:** ✅ Fetch single event by ID
- **Pagination:** ✅ NextPageToken support
- **Expand Recurring:** ✅ Automatic recurring event expansion

#### Event Details
- **Attendees:** ✅ Full attendee list with response status
- **Organizer:** ✅ Organizer information
- **Conference:** ✅ Google Meet/hangout links
- **Location:** ✅ Event location
- **Time Zones:** ✅ Time zone handling

### Architecture
```
src/lib/google/calendar.ts    # CalendarService class
src/lib/google/types.ts        # CalendarEvent interfaces
```

### OAuth Scopes
```
✅ calendar               # Read/write calendar
✅ calendar.events        # Manage events
```

### MCP/Chat Tools Exposed
**None** - Calendar functionality is NOT exposed via MCP tools or chat interface

### Missing Functionality
- ❌ **Create Events:** No event creation
- ❌ **Update Events:** No event modification
- ❌ **Delete Events:** No event deletion
- ❌ **List Calendars:** Only primary calendar supported
- ❌ **Calendar Settings:** No calendar preferences
- ❌ **Free/Busy:** No availability checking
- ❌ **Event Reminders:** No reminder management
- ❌ **Event Attachments:** No attachment support

### Recommendations
**Priority: MEDIUM** - Add write operations and multi-calendar support

1. **Immediate (P1):** Create MCP tools for calendar access
   - `list_calendar_events` - List upcoming events
   - `get_calendar_event` - Get event details
   
2. **Short-term (P2):** Implement write operations
   - `create_calendar_event` - Create new events
   - `update_calendar_event` - Modify events
   - `delete_calendar_event` - Remove events
   
3. **Medium-term (P3):** Advanced features
   - Multi-calendar support
   - Free/busy checking
   - Recurring event management

---

## 3. Google Drive Integration

### Implementation Status: ✅ **READ-ONLY**

### Capabilities

#### Core Operations
- **List Files:** ✅ Pagination with filtering
- **Search Files:** ✅ Name/content search
- **Get File:** ✅ Metadata by ID
- **Get Content:** ✅ File content extraction
- **Batch Fetch:** ✅ Multiple files efficiently

#### File Handling
- **Google Workspace Files:** ✅ Export Docs/Sheets/Presentations
- **Binary Files:** ✅ Download as Buffer
- **Text Files:** ✅ UTF-8 conversion
- **Permissions:** ✅ Read permission details

#### Advanced Features
- **Change Tracking:** ✅ Incremental sync with page tokens
- **Shared Drives:** ✅ Shared drive support
- **Query Language:** ✅ Drive query syntax support

### Architecture
```
src/lib/google/drive.ts      # DriveService class
src/lib/google/types.ts       # DriveFile interfaces
```

### Export MIME Types
```typescript
Google Docs       → text/plain
Google Sheets     → text/csv
Google Slides     → text/plain
```

### OAuth Scopes
```
✅ drive.readonly   # Read-only access
❌ drive            # Full access NOT REQUESTED
❌ drive.file       # Per-file access NOT REQUESTED
```

### MCP/Chat Tools Exposed
**None** - Drive functionality is NOT exposed via MCP tools or chat interface

### Missing Functionality
- ❌ **Upload Files:** No file creation
- ❌ **Update Files:** No file modification
- ❌ **Delete Files:** No file deletion
- ❌ **Share/Permissions:** No permission management
- ❌ **Folder Operations:** No folder creation/management
- ❌ **File Comments:** No comment access
- ❌ **Revision History:** No version management

### Recommendations
**Priority: HIGH** - Add MCP tools and document reading

1. **Immediate (P1):** Expose via MCP tools
   - `search_drive_files` - Search for files
   - `get_drive_file_content` - Read file content
   - `list_drive_files` - List files in folder
   
2. **Short-term (P2):** Enhanced document reading
   - Structured Google Docs parsing (preserve formatting)
   - Google Sheets data extraction (as CSV/JSON)
   - Google Slides content extraction
   
3. **Medium-term (P3):** Write operations
   - Upload files
   - Create folders
   - Update file content
   - Manage permissions

---

## 4. Google Contacts Integration

### Implementation Status: ✅ **FULL CRUD**

### Capabilities

#### Core Operations
- **Fetch Contacts:** ✅ Paginated contact retrieval
- **Get Contact:** ✅ By resource name
- **Create Contact:** ✅ New contact creation
- **Update Contact:** ✅ Contact modification
- **Search:** ✅ Find by email address
- **Fetch All:** ✅ Bulk retrieval with pagination

#### Contact Details
- **Basic Info:** ✅ Name, email, phone
- **Organizations:** ✅ Company, title, department
- **Addresses:** ✅ Physical addresses
- **Photos:** ✅ Contact photos
- **Birthdays:** ✅ Birthday information
- **Biographies:** ✅ Notes/biography

### Architecture
```
src/lib/google/contacts.ts     # ContactsService class
src/lib/google/types.ts         # Contact interfaces
```

### OAuth Scopes
```
✅ contacts           # Full contacts access
✅ contacts.readonly  # Read-only access (fallback)
```

### MCP/Chat Tools Exposed
**Via `contacts.ts`:** 
- Not directly exposed in MCP tools registry yet
- Implementation exists but not wired to MCP server

### Missing Functionality
- ❌ **Delete Contacts:** No contact deletion
- ❌ **Contact Groups:** No group management
- ❌ **Merge Contacts:** No duplicate detection/merge
- ❌ **Bulk Operations:** No bulk create/update

### Recommendations
**Priority: LOW** - Integration is complete, needs exposure

1. **Immediate (P1):** Expose via MCP tools
   - `search_contacts` - Find contacts by email/name
   - `get_contact_details` - Get full contact info
   - `create_contact` - Add new contact
   - `update_contact` - Modify contact

---

## 5. Google Tasks Integration

### Implementation Status: ✅ **FULL CRUD**

### Capabilities

#### Task Operations
- **List Tasks:** ✅ Per task list with filtering
- **Get Task:** ✅ By ID
- **Create Task:** ✅ With notes, due date, parent
- **Update Task:** ✅ Modify fields
- **Complete Task:** ✅ Mark as completed
- **Delete Task:** ✅ Remove tasks

#### Task List Operations
- **List Task Lists:** ✅ All user task lists
- **Get Task List:** ✅ By ID
- **Create Task List:** ✅ New lists
- **Delete Task List:** ✅ Remove lists
- **Update Task List:** ✅ Rename lists

#### Advanced Features
- **Fetch All Tasks:** ✅ Cross-list aggregation
- **Multi-account:** ✅ Multi-account support
- **Filtering:** ✅ Completed, deleted, hidden, date ranges

### Architecture
```
src/lib/google/tasks.ts        # Task functions
src/lib/google/types.ts         # Task interfaces
```

### OAuth Scopes
```
✅ tasks           # Full task access
✅ tasks.readonly  # Read-only access (fallback)
```

### MCP/Chat Tools Exposed
- `create_task` - Create new task
- `complete_task` - Mark task completed
- `list_tasks` - List tasks in task list
- `create_task_list` - Create new task list
- `list_task_lists` - List all task lists

### Missing Functionality
- ❌ **Task Subtasks:** Limited subtask hierarchy support
- ❌ **Task Reordering:** No manual position management
- ❌ **Task Search:** No search functionality
- ❌ **Task Notes with Links:** Limited link handling

### Recommendations
**Priority: LOW** - Integration is feature-complete

---

## 6. Document Reading (Google Docs/Sheets/Slides)

### Implementation Status: ❌ **MISSING**

### Current Situation
- Drive service exports Google Workspace files as plain text/CSV
- **No structured document parsing**
- **No formatting preservation**
- **No cell/sheet access for Sheets**
- **No slide content extraction**

### Missing Functionality

#### Google Docs
- ❌ Structured content parsing
- ❌ Formatting (bold, italic, headings)
- ❌ Tables extraction
- ❌ Images/drawing extraction
- ❌ Comments/suggestions
- ❌ Named ranges

#### Google Sheets
- ❌ Sheet-by-sheet access
- ❌ Cell-level data extraction
- ❌ Formula access
- ❌ Charts/graphs extraction
- ❌ Conditional formatting info
- ❌ Named ranges/data validation

#### Google Slides
- ❌ Slide-by-slide content
- ❌ Speaker notes
- ❌ Images/shapes extraction
- ❌ Animations/transitions
- ❌ Master slide info

### OAuth Scopes Required
```
❌ documents          # Google Docs API (NOT REQUESTED)
❌ spreadsheets       # Google Sheets API (NOT REQUESTED)
❌ presentations      # Google Slides API (NOT REQUESTED)
```

**Note:** Scopes ARE in the OAuth configuration but APIs are not integrated

### Recommendations
**Priority: HIGH** - Critical for document-centric workflows

#### Phase 1: Basic Reading (P1)
1. **Google Docs Reading**
   - Install `@googleapis/docs` SDK
   - Implement document content extraction
   - Preserve basic formatting (headings, paragraphs)
   - Extract tables as structured data
   
2. **Google Sheets Reading**
   - Install `@googleapis/sheets` SDK
   - Implement sheet data extraction
   - Support named ranges
   - Return data as JSON/CSV
   
3. **MCP Tools**
   - `read_google_doc` - Extract document content
   - `read_google_sheet` - Get spreadsheet data
   - `list_google_sheets` - List sheets in workbook

#### Phase 2: Advanced Reading (P2)
- Google Slides content extraction
- Image/drawing extraction from all document types
- Comments and suggestions access
- Formula parsing in Sheets

#### Phase 3: Write Operations (P3)
- Create/update documents
- Modify spreadsheet data
- Create presentations

### Implementation Guide

**1. Install Dependencies**
```bash
npm install @googleapis/docs @googleapis/sheets @googleapis/slides
```

**2. Create Document Services**
```
src/lib/google/docs.ts        # Google Docs service
src/lib/google/sheets.ts      # Google Sheets service  
src/lib/google/slides.ts      # Google Slides service (later)
```

**3. Add MCP Tools**
```
src/lib/chat/tools/documents.ts   # Document reading tools
```

**4. Update Types**
```typescript
// src/lib/google/types.ts
export interface GoogleDoc {
  id: string;
  title: string;
  content: DocumentContent[];
  // ...
}

export interface GoogleSheet {
  id: string;
  title: string;
  sheets: Sheet[];
  // ...
}
```

---

## OAuth Scope Summary

### Currently Requested Scopes
```typescript
// src/onboarding/routes/oauth.ts
const scopes = [
  // Gmail
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  
  // Calendar
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  
  // Contacts
  'https://www.googleapis.com/auth/contacts',
  
  // Drive
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  
  // Documents (NOT IMPLEMENTED YET)
  'https://www.googleapis.com/auth/documents',
  
  // Spreadsheets (NOT IMPLEMENTED YET)
  'https://www.googleapis.com/auth/spreadsheets',
  
  // Tasks
  'https://www.googleapis.com/auth/tasks',
];
```

### Scope Gaps
- ✅ **No gaps** - All necessary scopes are already requested
- ⚠️ **Documents/Spreadsheets scopes requested but unused**
- ℹ️ **Slides API not in scopes** - Would need to add `presentations`

---

## MCP Tools Coverage

### Exposed Services
- **Gmail:** ✅ 11 tools (comprehensive)
- **Tasks:** ✅ 5 tools (complete)
- **Calendar:** ❌ 0 tools (MISSING)
- **Drive:** ❌ 0 tools (MISSING)
- **Contacts:** ❌ 0 tools (MISSING)
- **Documents:** ❌ 0 tools (MISSING)

### Unexposed Capabilities
Many implemented services lack MCP tool exposure:
- Calendar read operations
- Drive file access
- Contacts management
- Document reading (not implemented)

---

## Priority Recommendations

### P1 (Critical - Do First)
1. **Implement Google Docs/Sheets reading**
   - Add `@googleapis/docs` and `@googleapis/sheets`
   - Create DocsService and SheetsService
   - Extract structured content
   
2. **Expose Drive via MCP tools**
   - `search_drive_files`
   - `get_drive_file_content`
   - `list_drive_files`
   
3. **Expose Calendar via MCP tools**
   - `list_calendar_events`
   - `get_calendar_event`

### P2 (Important - Do Soon)
1. **Calendar write operations**
   - Create/update/delete events
   - Multi-calendar support
   
2. **Gmail attachments**
   - Download attachments
   - Send with attachments
   
3. **Expose Contacts via MCP tools**
   - Search, get, create, update

### P3 (Nice to Have - Do Later)
1. **Drive write operations**
   - Upload files
   - Create folders
   - Manage permissions
   
2. **Advanced document features**
   - Comments/suggestions
   - Revision history
   - Collaborative editing
   
3. **Google Slides support**
   - Content extraction
   - Slide-by-slide access

---

## Architecture Quality Assessment

### Strengths
- ✅ **Modular design** - Separated concerns (message, label, sync services)
- ✅ **Type safety** - Comprehensive TypeScript interfaces
- ✅ **Error handling** - Proper try-catch with logging
- ✅ **Multi-account support** - Tasks and auth support multiple accounts
- ✅ **OAuth refresh** - Automatic token refresh
- ✅ **Singleton pattern** - Service reuse with factory functions

### Areas for Improvement
- ⚠️ **Inconsistent patterns** - Some services use classes, others functions
- ⚠️ **MCP coverage gaps** - Many services not exposed via MCP
- ⚠️ **Limited documentation** - Minimal inline documentation
- ⚠️ **Test coverage unknown** - No visible test files

---

## Code Examples

### Adding Google Docs Reading

```typescript
// src/lib/google/docs.ts
import { google, docs_v1, Auth } from 'googleapis';

export class DocsService {
  private docs: docs_v1.Docs;
  
  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.docs = google.docs({ version: 'v1', auth });
  }
  
  async getDocument(documentId: string): Promise<GoogleDoc> {
    const response = await this.docs.documents.get({
      documentId,
    });
    
    return this.parseDocument(response.data);
  }
  
  private parseDocument(doc: docs_v1.Schema$Document): GoogleDoc {
    // Extract structured content from doc.body.content
    // Preserve headings, paragraphs, tables, etc.
    return {
      id: doc.documentId!,
      title: doc.title!,
      content: this.extractContent(doc.body!),
    };
  }
}
```

### Adding MCP Tool for Drive

```typescript
// src/lib/chat/tools/drive.ts
export const getDriveFileContentTool = {
  name: 'get_drive_file_content',
  description: 'Read content from a Google Drive file (supports Docs, Sheets, PDFs, text files)',
  parameters: z.object({
    fileId: z.string().describe('Google Drive file ID'),
  }),
  
  async execute(params, userId) {
    const driveService = await getDriveService(auth);
    const content = await driveService.getFileContent(params.fileId);
    
    return {
      message: `File: ${content.file.name}\n\n${content.content}`,
    };
  },
};
```

---

## Conclusion

### Summary
- **Strong foundation:** Gmail, Tasks, and Contacts are production-ready
- **Read-only services:** Calendar and Drive need write operations
- **Critical gap:** Document reading (Docs/Sheets) is missing
- **Exposure gap:** Many services lack MCP tools

### Next Steps
1. Implement Google Docs/Sheets reading (1-2 days)
2. Create MCP tools for Drive and Calendar (1 day)
3. Add Calendar write operations (1-2 days)
4. Expose Contacts via MCP tools (0.5 days)

### Estimated Effort
- **P1 tasks:** 3-4 days
- **P2 tasks:** 2-3 days
- **P3 tasks:** 3-5 days
- **Total:** 8-12 days for complete Google Workspace coverage

