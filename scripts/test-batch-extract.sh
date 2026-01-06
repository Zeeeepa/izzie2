#!/bin/bash
# Test script for batch email extraction endpoint

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "Testing batch extraction endpoint..."
echo "Endpoint: $BASE_URL/api/test/batch-extract"
echo ""

# Send test request
curl -X POST "$BASE_URL/api/test/batch-extract" \
  -H "Content-Type: application/json" \
  -d '{
    "maxEmails": 5,
    "userId": "bob@matsuoka.com",
    "daysSince": 30,
    "excludePromotions": true
  }' \
  | jq '.'

echo ""
echo "Test complete!"
