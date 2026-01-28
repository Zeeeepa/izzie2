#!/usr/bin/env tsx
/**
 * vCard Export Script
 *
 * Exports deduplicated contacts to vCard 3.0 format for macOS Contacts import.
 *
 * Usage:
 *   tsx scripts/contacts/export-vcard.ts
 */

import * as fs from 'fs';

// Paths
const INPUT_PATH = '/Users/masa/Projects/izzie2/data/contacts-deduped.json';
const OUTPUT_PATH = '/Users/masa/Projects/izzie2/data/contacts-deduped.vcf';

// Types (matching dedup-contacts.ts)
interface Email {
  address: string;
  label: string | null;
}

interface Phone {
  number: string;
  label: string | null;
}

interface MergedContact {
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  organization: string | null;
  nickname: string | null;
  title: string | null;
  suffix: string | null;
  department: string | null;
  jobTitle: string | null;
  emails: Email[];
  phones: Phone[];
  displayName: string;
}

interface DeduplicationResult {
  mergedContacts: MergedContact[];
}

// vCard special character escaping
// In vCard 3.0: backslash, semicolon, comma must be escaped
// Newlines become \n (literal backslash-n in the value)
function escapeVCardValue(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/;/g, '\\;') // Escape semicolons
    .replace(/,/g, '\\,') // Escape commas
    .replace(/\n/g, '\\n'); // Escape newlines
}

// Map contact labels to vCard types
function mapEmailLabelToType(label: string | null): string {
  if (!label) return 'INTERNET';

  const normalized = label.toLowerCase().replace(/_\$!<|>!\$_/g, '');

  switch (normalized) {
    case 'work':
      return 'WORK';
    case 'home':
      return 'HOME';
    case 'personal':
      return 'HOME';
    case 'other':
      return 'INTERNET';
    default:
      return 'INTERNET';
  }
}

function mapPhoneLabelToType(label: string | null): string {
  if (!label) return 'VOICE';

  const normalized = label.toLowerCase().replace(/_\$!<|>!\$_/g, '');

  switch (normalized) {
    case 'work':
      return 'WORK';
    case 'home':
      return 'HOME';
    case 'mobile':
    case 'cell':
      return 'CELL';
    case 'main':
      return 'MAIN';
    case 'fax':
    case 'work fax':
    case 'workfax':
      return 'FAX';
    case 'home fax':
    case 'homefax':
      return 'HOME,FAX';
    case 'pager':
      return 'PAGER';
    case 'other':
      return 'VOICE';
    default:
      return 'VOICE';
  }
}

// Convert a single contact to vCard 3.0 format
function contactToVCard(contact: MergedContact): string {
  const lines: string[] = [];

  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');

  // N: LastName;FirstName;MiddleName;Prefix;Suffix
  const lastName = escapeVCardValue(contact.lastName);
  const firstName = escapeVCardValue(contact.firstName);
  const middleName = escapeVCardValue(contact.middleName);
  const prefix = escapeVCardValue(contact.title);
  const suffix = escapeVCardValue(contact.suffix);
  lines.push(`N:${lastName};${firstName};${middleName};${prefix};${suffix}`);

  // FN: Full Name (required in vCard 3.0)
  lines.push(`FN:${escapeVCardValue(contact.displayName)}`);

  // ORG: Organization
  if (contact.organization) {
    lines.push(`ORG:${escapeVCardValue(contact.organization)}`);
  }

  // TITLE: Job Title
  if (contact.jobTitle) {
    lines.push(`TITLE:${escapeVCardValue(contact.jobTitle)}`);
  }

  // NICKNAME
  if (contact.nickname) {
    lines.push(`NICKNAME:${escapeVCardValue(contact.nickname)}`);
  }

  // EMAIL entries
  for (const email of contact.emails) {
    if (email.address) {
      const type = mapEmailLabelToType(email.label);
      lines.push(`EMAIL;type=${type}:${escapeVCardValue(email.address)}`);
    }
  }

  // TEL entries
  for (const phone of contact.phones) {
    if (phone.number) {
      const type = mapPhoneLabelToType(phone.label);
      lines.push(`TEL;type=${type}:${escapeVCardValue(phone.number)}`);
    }
  }

  lines.push('END:VCARD');

  return lines.join('\r\n');
}

// Main function
function main(): void {
  console.log('===========================================');
  console.log('     vCard Export for macOS Contacts      ');
  console.log('===========================================\n');

  // Check input file exists
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`Error: Input file not found at ${INPUT_PATH}`);
    console.error('Run dedup-contacts.ts first to create the deduplicated contacts file.');
    process.exit(1);
  }

  // Read input
  console.log(`Reading contacts from ${INPUT_PATH}...`);
  const rawData = fs.readFileSync(INPUT_PATH, 'utf-8');
  const data: DeduplicationResult = JSON.parse(rawData);

  const contacts = data.mergedContacts;
  console.log(`Found ${contacts.length} contacts to export`);

  // Convert to vCards
  console.log('Converting to vCard 3.0 format...');
  const vcards = contacts.map(contactToVCard);

  // Join with blank line between vCards (per vCard spec)
  const output = vcards.join('\r\n');

  // Write output
  console.log(`Writing to ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');

  console.log('\n===========================================');
  console.log('                  Summary                 ');
  console.log('===========================================');
  console.log(`Contacts exported: ${contacts.length}`);
  console.log(`Output file: ${OUTPUT_PATH}`);
  console.log('\nTo import into macOS Contacts:');
  console.log('  1. Open Contacts app');
  console.log('  2. File > Import...');
  console.log('  3. Select the .vcf file');
  console.log('\nDone!');
}

main();
