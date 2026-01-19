/**
 * Test Entities API via HTTP
 *
 * Simulates an authenticated request to /api/entities
 */

import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

async function main() {
  console.log('=== Testing /api/entities Endpoint ===\n');

  const baseUrl = 'http://localhost:3300';

  try {
    // Test 1: Without authentication (should fail)
    console.log('Test 1: Without authentication');
    console.log('Request: GET /api/entities?limit=5');

    const response1 = await fetch(`${baseUrl}/api/entities?limit=5`);
    console.log(`Status: ${response1.status} ${response1.statusText}`);

    if (!response1.ok) {
      const error1 = await response1.json();
      console.log('Error:', JSON.stringify(error1, null, 2));
    } else {
      const data1 = await response1.json();
      console.log('Success:', JSON.stringify(data1, null, 2));
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: Check if we can get session info
    console.log('Test 2: Check session endpoint');
    console.log('Request: GET /api/auth/session');

    const response2 = await fetch(`${baseUrl}/api/auth/session`);
    console.log(`Status: ${response2.status} ${response2.statusText}`);

    if (response2.ok) {
      const session = await response2.json();
      console.log('Session:', JSON.stringify(session, null, 2));
    } else {
      console.log('No session endpoint or not authenticated');
    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('\nMake sure the dev server is running: npm run dev');
  }
}

main();
