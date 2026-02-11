/**
 * Gmail API Type Definitions
 */

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface Email {
  id: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: string; // Plain text
  htmlBody?: string; // HTML if available
  date: Date;
  labels: string[];
  isSent: boolean; // True if in sent folder
  hasAttachments: boolean;
  snippet?: string; // Short preview text
  internalDate: number; // Unix timestamp in milliseconds
  headers?: Record<string, string>; // Raw headers for classification (e.g., List-Unsubscribe)
}

export interface EmailBatch {
  emails: Email[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface EmailThread {
  id: string;
  emails: Email[];
  snippet: string;
  historyId: string;
}

export interface FetchEmailOptions {
  folder: 'inbox' | 'sent' | 'all';
  maxResults?: number;
  pageToken?: string;
  since?: Date;
  labelIds?: string[];
  excludePromotions?: boolean; // Exclude promotional emails (default: false)
  excludeSocial?: boolean; // Exclude social emails (default: false)
  keywords?: string[]; // Keywords for Gmail API search (OR combined)
}

export interface SyncStatus {
  isRunning: boolean;
  lastSync?: Date;
  emailsProcessed: number;
  error?: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: string | null;
  labelListVisibility?: string | null;
}

// Gmail API rate limiting
export interface RateLimitInfo {
  remaining: number;
  resetAt: Date;
  limit: number;
}

/**
 * Gmail Filter Types
 */
export interface GmailFilterCriteria {
  from?: string;
  to?: string;
  subject?: string;
  query?: string;
  negatedQuery?: string;
  hasAttachment?: boolean;
  excludeChats?: boolean;
  size?: number;
  sizeComparison?: 'larger' | 'smaller';
}

export interface GmailFilterAction {
  addLabelIds?: string[];
  removeLabelIds?: string[];
  forward?: string;
}

export interface GmailFilter {
  id: string;
  criteria: GmailFilterCriteria;
  action: GmailFilterAction;
}

/**
 * Google Drive API Type Definitions
 */

export interface DriveUser {
  displayName: string;
  emailAddress: string;
  photoLink?: string;
  permissionId?: string;
}

export interface DrivePermission {
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
  displayName?: string;
  deleted?: boolean;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime: Date;
  modifiedTime: Date;
  owners: DriveUser[];
  permissions?: DrivePermission[];
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  description?: string;
  starred?: boolean;
  trashed?: boolean;
  shared?: boolean;
  capabilities?: {
    canEdit?: boolean;
    canComment?: boolean;
    canShare?: boolean;
    canCopy?: boolean;
    canDownload?: boolean;
  };
}

export interface DriveListOptions {
  query?: string; // Drive query syntax (e.g., "name contains 'report'")
  maxResults?: number;
  pageToken?: string;
  orderBy?: string; // e.g., "modifiedTime desc", "name"
  spaces?: 'drive' | 'appDataFolder' | 'photos';
  fields?: string; // Specific fields to return
  includeItemsFromAllDrives?: boolean;
  supportsAllDrives?: boolean;
}

export interface DriveSearchOptions {
  query: string;
  maxResults?: number;
  orderBy?: string;
  includeSharedDrives?: boolean;
}

export interface DriveFileBatch {
  files: DriveFile[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
}

export interface DriveFileContent {
  file: DriveFile;
  content: Buffer | string;
  mimeType: string;
  encoding?: string;
}

export interface DriveChangeToken {
  token: string;
  expiration?: Date;
}

export interface DriveChange {
  changeType: 'file' | 'drive';
  time: Date;
  removed?: boolean;
  file?: DriveFile;
  fileId: string;
  changeId?: string;
}

/**
 * Google Calendar API Type Definitions
 */

export interface CalendarAttendee {
  email: string;
  displayName: string;
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer?: boolean;
  self?: boolean;
}

export interface CalendarOrganizer {
  email: string;
  displayName: string;
  self?: boolean;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  attendees: CalendarAttendee[];
  organizer?: CalendarOrganizer;
  recurringEventId?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    conferenceId?: string;
    conferenceSolution?: {
      name?: string;
      iconUri?: string;
    };
    entryPoints?: Array<{
      entryPointType: 'video' | 'phone' | 'sip' | 'more';
      uri: string;
      label?: string;
      password?: string;
    }>;
  };
}

export interface CalendarEventBatch {
  events: CalendarEvent[];
  nextPageToken?: string;
}

/**
 * Google Tasks API Type Definitions
 */

export interface TaskList {
  id: string;
  title: string;
  updated?: string;
  selfLink?: string;
}

export interface Task {
  id: string;
  title: string;
  updated: string;
  selfLink?: string;
  parent?: string;
  position?: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string; // RFC 3339 timestamp
  completed?: string; // RFC 3339 timestamp
  deleted?: boolean;
  hidden?: boolean;
  links?: Array<{
    type: string;
    description?: string;
    link: string;
  }>;
}

export interface TaskListBatch {
  taskLists: TaskList[];
  nextPageToken?: string;
}

export interface TaskBatch {
  tasks: Task[];
  nextPageToken?: string;
}

/**
 * Google People API (Contacts) Type Definitions
 */

export interface ContactEmail {
  value: string;
  type: string; // 'home', 'work', 'other'
  primary: boolean;
}

export interface ContactPhone {
  value: string;
  type: string; // 'home', 'work', 'mobile', 'other'
  primary: boolean;
}

export interface ContactOrganization {
  name: string;
  title?: string;
  department?: string;
}

export interface ContactAddress {
  formattedValue: string;
  type: string; // 'home', 'work', 'other'
  city?: string;
  region?: string;
  country?: string;
}

export interface ContactBirthday {
  date?: {
    year?: number;
    month?: number;
    day?: number;
  };
}

export interface Contact {
  resourceName: string; // Unique identifier (e.g., "people/c1234567890")
  displayName: string; // Full display name
  givenName?: string; // First name
  familyName?: string; // Last name
  emails: ContactEmail[];
  phoneNumbers: ContactPhone[];
  organizations: ContactOrganization[];
  photoUrl?: string;
  biography?: string;
  addresses: ContactAddress[];
  birthdays: ContactBirthday[];
}

export interface ContactsBatch {
  contacts: Contact[];
  nextPageToken?: string;
  totalContacts: number;
}
