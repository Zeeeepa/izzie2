#!/bin/bash
# Test Weaviate Integration
# Run a small extraction test to verify entities are saved to Weaviate

echo "========================================"
echo "Weaviate Integration Test"
echo "========================================"
echo ""

# Check if Weaviate is running
echo "1. Checking Weaviate connection..."
if curl -s http://localhost:8080/v1/meta | grep -q "contextionaryWordCount"; then
  echo "✅ Weaviate is running"
else
  echo "❌ Weaviate is not running. Start it with: docker-compose up -d weaviate"
  exit 1
fi

echo ""
echo "2. Running extraction with --limit 3..."
npx tsx scripts/extract-gmail-entities.ts --limit 3

echo ""
echo "3. Test complete!"
echo "Check logs above for '💾 Saved X entities to Weaviate' messages"
