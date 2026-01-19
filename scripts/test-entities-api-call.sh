#!/bin/bash

# Test the entities API endpoint directly
# This simulates what the frontend does

echo "Testing /api/entities endpoint..."
echo ""

# Try to get entities (should fail if not authenticated)
curl -v http://localhost:3300/api/entities?type=person&limit=10 \
  -H "Accept: application/json" \
  2>&1 | grep -E "(HTTP|{|error|entities|total)"

echo ""
echo ""
echo "If you see 'Unauthorized' or 401, the session cookie is not being sent."
echo "The frontend should include credentials which sends the session cookie."
