/**
 * Check Neo4j database for extracted entities
 *
 * Usage: tsx scripts/check-neo4j-entities.ts
 */

import neo4j from 'neo4j-driver';

async function checkNeo4j() {
  console.log('🔍 Checking Neo4j database for entities...\n');

  // Check environment variables
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD;

  console.log('📋 Configuration:');
  console.log(`  URI: ${uri || '❌ NOT SET'}`);
  console.log(`  User: ${user}`);
  console.log(`  Password: ${password ? '✅ SET' : '❌ NOT SET'}\n`);

  if (!uri || !password) {
    console.error('❌ Neo4j credentials not configured in .env.local');
    console.error('\nPlease add:');
    console.error('  NEO4J_URI=bolt://localhost:7687 (or your Neo4j server)');
    console.error('  NEO4J_USER=neo4j');
    console.error('  NEO4J_PASSWORD=<your-password>');
    console.error('\nIf you don\'t have Neo4j running:');
    console.error('  docker run -d -p 7687:7687 -p 7474:7474 \\');
    console.error('    -e NEO4J_AUTH=neo4j/password \\');
    console.error('    --name neo4j \\');
    console.error('    neo4j:latest');
    process.exit(1);
  }

  // Try to connect
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

  try {
    console.log('🔌 Attempting to connect to Neo4j...');
    await driver.verifyConnectivity();
    console.log('✅ Connected successfully!\n');

    const session = driver.session();

    try {
      // Get total node count
      console.log('📊 Database Statistics:\n');
      const totalNodesResult = await session.run('MATCH (n) RETURN count(n) as count');
      const totalNodes = totalNodesResult.records[0]?.get('count').toNumber() || 0;
      console.log(`  Total Nodes: ${totalNodes}`);

      // Get total relationship count
      const totalRelsResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
      const totalRels = totalRelsResult.records[0]?.get('count').toNumber() || 0;
      console.log(`  Total Relationships: ${totalRels}\n`);

      if (totalNodes === 0) {
        console.log('ℹ️  Database is empty - no entities have been extracted yet.\n');
        console.log('To populate the database:');
        console.log('  1. Run entity extraction on your emails');
        console.log('  2. Use the /api/graph/build endpoint to build the graph');
        console.log('  3. Or visit http://localhost:3300/api/graph/test to test with sample data');
        await session.close();
        await driver.close();
        return;
      }

      // Get counts by node type
      console.log('📦 Entities by Type:\n');
      const nodeTypesResult = await session.run(`
        MATCH (n)
        RETURN labels(n)[0] as label, count(n) as count
        ORDER BY count DESC
      `);

      for (const record of nodeTypesResult.records) {
        const label = record.get('label');
        const count = record.get('count').toNumber();
        console.log(`  ${label}: ${count}`);
      }

      // Get relationship counts
      console.log('\n🔗 Relationships by Type:\n');
      const relTypesResult = await session.run(`
        MATCH ()-[r]->()
        RETURN type(r) as type, count(r) as count
        ORDER BY count DESC
      `);

      for (const record of relTypesResult.records) {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        console.log(`  ${type}: ${count}`);
      }

      // Get sample entities
      console.log('\n👥 Sample Entities (Top 10):\n');
      const samplesResult = await session.run(`
        MATCH (n)
        WHERE labels(n)[0] IN ['Person', 'Company', 'Project', 'Location', 'Topic']
        RETURN labels(n)[0] as type, n.value as value, n.frequency as frequency
        ORDER BY n.frequency DESC
        LIMIT 10
      `);

      if (samplesResult.records.length > 0) {
        for (const record of samplesResult.records) {
          const type = record.get('type');
          const value = record.get('value');
          const frequency = record.get('frequency') || 0;
          console.log(`  [${type}] ${value} (frequency: ${frequency})`);
        }
      } else {
        console.log('  No entity nodes found (only Email nodes exist)');
      }

      // Get sample emails
      console.log('\n📧 Sample Emails (Last 5):\n');
      const emailsResult = await session.run(`
        MATCH (e:Email)
        RETURN e.id as id, e.subject as subject, e.timestamp as timestamp
        ORDER BY e.timestamp DESC
        LIMIT 5
      `);

      if (emailsResult.records.length > 0) {
        for (const record of emailsResult.records) {
          const id = record.get('id');
          const subject = record.get('subject') || 'No subject';
          const timestamp = record.get('timestamp');
          console.log(`  ${id}: ${subject}`);
          if (timestamp) {
            console.log(`    Date: ${new Date(timestamp).toISOString()}`);
          }
        }
      } else {
        console.log('  No email nodes found');
      }

    } finally {
      await session.close();
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);

    if (error.code === 'ServiceUnavailable') {
      console.error('\n💡 Neo4j server is not running or not accessible at', uri);
      console.error('\nTo start Neo4j with Docker:');
      console.error('  docker run -d -p 7687:7687 -p 7474:7474 \\');
      console.error('    -e NEO4J_AUTH=neo4j/password \\');
      console.error('    --name neo4j \\');
      console.error('    neo4j:latest');
    } else if (error.code === 'Neo.ClientError.Security.Unauthorized') {
      console.error('\n💡 Authentication failed - check your NEO4J_USER and NEO4J_PASSWORD');
    }

    process.exit(1);
  } finally {
    await driver.close();
  }
}

checkNeo4j().catch(console.error);
