/**
 * Google Sheets Service
 * Handles structured spreadsheet reading with sheets, headers, and cell data
 */

import { google, Auth } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import type { GoogleSheetStructured, SheetTab, SheetMetadata } from './types';

const LOG_PREFIX = '[Sheets Service]';

export class SheetsService {
  private sheets: sheets_v4.Sheets;
  private auth: Auth.GoogleAuth | Auth.OAuth2Client;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.auth = auth;
    this.sheets = google.sheets({ version: 'v4', auth: auth as Auth.OAuth2Client });
  }

  /**
   * Get spreadsheet metadata (sheets list and properties)
   */
  async getSpreadsheetMetadata(spreadsheetId: string): Promise<SheetMetadata> {
    try {
      console.log(`${LOG_PREFIX} Fetching spreadsheet metadata: ${spreadsheetId}`);

      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
      });

      const spreadsheet = response.data;

      console.log(`${LOG_PREFIX} Retrieved spreadsheet: ${spreadsheet.properties?.title}`);

      return {
        spreadsheetId: spreadsheet.spreadsheetId || '',
        title: spreadsheet.properties?.title || 'Untitled Spreadsheet',
        locale: spreadsheet.properties?.locale || 'en_US',
        timeZone: spreadsheet.properties?.timeZone || 'UTC',
        sheets:
          spreadsheet.sheets?.map((sheet) => ({
            sheetId: sheet.properties?.sheetId || 0,
            title: sheet.properties?.title || 'Untitled Sheet',
            index: sheet.properties?.index || 0,
            gridProperties: {
              rowCount: sheet.properties?.gridProperties?.rowCount || 0,
              columnCount: sheet.properties?.gridProperties?.columnCount || 0,
            },
          })) || [],
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to get spreadsheet metadata ${spreadsheetId}:`, error);
      throw new Error(`Failed to get spreadsheet metadata ${spreadsheetId}: ${error}`);
    }
  }

  /**
   * Get structured spreadsheet content (all sheets with data)
   */
  async getSpreadsheet(spreadsheetId: string): Promise<GoogleSheetStructured> {
    try {
      const metadata = await this.getSpreadsheetMetadata(spreadsheetId);

      // Fetch data for each sheet
      const sheets: SheetTab[] = [];

      for (const sheetInfo of metadata.sheets) {
        const sheetData = await this.getSheetData(spreadsheetId, sheetInfo.title);
        sheets.push(sheetData);
      }

      return {
        spreadsheetId: metadata.spreadsheetId,
        title: metadata.title,
        sheets,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to get spreadsheet ${spreadsheetId}:`, error);
      throw new Error(`Failed to get spreadsheet ${spreadsheetId}: ${error}`);
    }
  }

  /**
   * Get data from a specific sheet/tab with automatic header detection
   */
  async getSheetData(spreadsheetId: string, sheetName: string): Promise<SheetTab> {
    try {
      console.log(`${LOG_PREFIX} Fetching sheet data: ${sheetName}`);

      // Fetch all data from the sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: sheetName,
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });

      const values = response.data.values || [];

      // Parse headers (first row) and data rows
      const headers: string[] = values.length > 0 ? (values[0] as string[]) : [];
      const rows: string[][] =
        values.length > 1 ? (values.slice(1) as string[][]) : [];

      // Get sheet metadata for row/column counts
      const metadata = await this.sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [sheetName],
        includeGridData: false,
      });

      const sheetProperties = metadata.data.sheets?.[0]?.properties;
      const rowCount = sheetProperties?.gridProperties?.rowCount || values.length;
      const columnCount = sheetProperties?.gridProperties?.columnCount || headers.length;

      console.log(
        `${LOG_PREFIX} Retrieved ${rows.length} data rows from sheet: ${sheetName}`
      );

      return {
        name: sheetName,
        headers,
        rows,
        metadata: {
          rowCount,
          columnCount,
        },
      };
    } catch (error) {
      console.error(
        `${LOG_PREFIX} Failed to get sheet data ${spreadsheetId}/${sheetName}:`,
        error
      );
      throw new Error(`Failed to get sheet data ${spreadsheetId}/${sheetName}: ${error}`);
    }
  }

  /**
   * Get data from a specific range (e.g., "Sheet1!A1:C10")
   */
  async getRangeData(spreadsheetId: string, range: string): Promise<string[][]> {
    try {
      console.log(`${LOG_PREFIX} Fetching range data: ${range}`);

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });

      const values = response.data.values || [];

      console.log(`${LOG_PREFIX} Retrieved ${values.length} rows from range: ${range}`);

      return values as string[][];
    } catch (error) {
      console.error(
        `${LOG_PREFIX} Failed to get range data ${spreadsheetId}/${range}:`,
        error
      );
      throw new Error(`Failed to get range data ${spreadsheetId}/${range}: ${error}`);
    }
  }
}

/**
 * Factory function with singleton support
 */
let sheetsServiceInstance: SheetsService | null = null;

export async function getSheetsService(
  auth: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<SheetsService> {
  if (!sheetsServiceInstance || auth) {
    sheetsServiceInstance = new SheetsService(auth);
  }
  return sheetsServiceInstance;
}
