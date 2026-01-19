#!/bin/bash
# Relationship API Testing Examples
# Make sure to replace <AUTH_TOKEN> with actual session token

API_BASE="http://localhost:3000/api"
AUTH_TOKEN="<AUTH_TOKEN>"

echo "=== Relationship API Testing Examples ==="
echo ""

# 1. Get all relationships
echo "1. GET /api/relationships - List all relationships"
echo "curl -X GET \"$API_BASE/relationships?limit=10\" \\"
echo "  -H \"Authorization: Bearer $AUTH_TOKEN\""
echo ""

# 2. Get relationships for specific entity
echo "2. GET /api/relationships - Get relationships for specific entity"
echo "curl -X GET \"$API_BASE/relationships?entityType=person&entityValue=john%20smith\" \\"
echo "  -H \"Authorization: Bearer $AUTH_TOKEN\""
echo ""

# 3. Filter by relationship type
echo "3. GET /api/relationships - Filter by relationship type"
echo "curl -X GET \"$API_BASE/relationships?relationshipType=WORKS_FOR&limit=50\" \\"
echo "  -H \"Authorization: Bearer $AUTH_TOKEN\""
echo ""

# 4. Infer and save relationships
echo "4. POST /api/relationships - Infer and save relationships"
echo "curl -X POST \"$API_BASE/relationships\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -H \"Authorization: Bearer $AUTH_TOKEN\" \\"
echo "  -d '{"
echo "    \"sourceId\": \"email-123\","
echo "    \"content\": \"John Smith joined Acme Corp as VP of Engineering. He will lead Project Phoenix.\","
echo "    \"entities\": ["
echo "      {\"type\": \"person\", \"value\": \"John Smith\", \"normalized\": \"john smith\"},"
echo "      {\"type\": \"company\", \"value\": \"Acme Corp\", \"normalized\": \"acme corp\"},"
echo "      {\"type\": \"project\", \"value\": \"Project Phoenix\", \"normalized\": \"project phoenix\"}"
echo "    ]"
echo "  }'"
echo ""

# 5. Preview inference (no save)
echo "5. POST /api/relationships/infer - Preview inference without saving"
echo "curl -X POST \"$API_BASE/relationships/infer\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -H \"Authorization: Bearer $AUTH_TOKEN\" \\"
echo "  -d '{"
echo "    \"sourceId\": \"test-123\","
echo "    \"content\": \"Sarah Johnson works with John Smith at Acme Corp.\","
echo "    \"entities\": ["
echo "      {\"type\": \"person\", \"value\": \"Sarah Johnson\", \"normalized\": \"sarah johnson\"},"
echo "      {\"type\": \"person\", \"value\": \"John Smith\", \"normalized\": \"john smith\"},"
echo "      {\"type\": \"company\", \"value\": \"Acme Corp\", \"normalized\": \"acme corp\"}"
echo "    ]"
echo "  }'"
echo ""

# 6. Get relationship graph
echo "6. GET /api/relationships/graph - Build graph visualization"
echo "curl -X GET \"$API_BASE/relationships/graph?limit=50&minConfidence=0.7\" \\"
echo "  -H \"Authorization: Bearer $AUTH_TOKEN\""
echo ""

# 7. Get graph centered on entity
echo "7. GET /api/relationships/graph - Graph centered on specific entity"
echo "curl -X GET \"$API_BASE/relationships/graph?entityType=person&entityValue=john%20smith&depth=2\" \\"
echo "  -H \"Authorization: Bearer $AUTH_TOKEN\""
echo ""

# 8. Get relationship statistics
echo "8. GET /api/relationships/stats - Get relationship statistics"
echo "curl -X GET \"$API_BASE/relationships/stats\" \\"
echo "  -H \"Authorization: Bearer $AUTH_TOKEN\""
echo ""

echo "=== End of Examples ==="
echo ""
echo "To run these examples:"
echo "1. Replace <AUTH_TOKEN> with your actual session token"
echo "2. Ensure the server is running (npm run dev)"
echo "3. Copy and paste the curl commands into your terminal"
