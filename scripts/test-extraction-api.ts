/**
 * Test script for extraction API endpoints
 * Run with: npx tsx scripts/test-extraction-api.ts
 */

const BASE_URL = 'http://localhost:3300';

interface ApiResponse {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

async function testEndpoint(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<ApiResponse> {
  const url = `${BASE_URL}${path}`;
  console.log(`\n${method} ${path}`);

  if (body) {
    console.log('Body:', JSON.stringify(body, null, 2));
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    console.error('Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function main() {
  console.log('Testing Extraction API Endpoints');
  console.log('=================================\n');

  console.log('Note: All endpoints require authentication.');
  console.log('Expected: 401 Unauthorized responses\n');

  // Test 1: GET /api/extraction/status
  await testEndpoint('GET', '/api/extraction/status');

  // Test 2: POST /api/extraction/start (valid source)
  await testEndpoint('POST', '/api/extraction/start', {
    source: 'email',
    dateRange: '7d',
  });

  // Test 3: POST /api/extraction/start (invalid source)
  await testEndpoint('POST', '/api/extraction/start', {
    source: 'invalid',
    dateRange: '7d',
  });

  // Test 4: POST /api/extraction/start (invalid dateRange)
  await testEndpoint('POST', '/api/extraction/start', {
    source: 'email',
    dateRange: 'invalid',
  });

  // Test 5: POST /api/extraction/pause
  await testEndpoint('POST', '/api/extraction/pause', {
    source: 'email',
  });

  // Test 6: POST /api/extraction/pause (invalid source)
  await testEndpoint('POST', '/api/extraction/pause', {
    source: 'invalid',
  });

  // Test 7: POST /api/extraction/reset
  await testEndpoint('POST', '/api/extraction/reset', {
    source: 'email',
    clearEntities: false,
  });

  // Test 8: POST /api/extraction/reset (with clearEntities)
  await testEndpoint('POST', '/api/extraction/reset', {
    source: 'calendar',
    clearEntities: true,
  });

  console.log('\n=================================');
  console.log('Tests completed!');
  console.log('\nTo test with authentication:');
  console.log('1. Start the dev server: npm run dev');
  console.log('2. Login at http://localhost:3300');
  console.log('3. Get session token from browser cookies');
  console.log('4. Add Cookie header to fetch requests');
}

main().catch(console.error);
